// src/core/PathologyEngine.ts
//
// Puente entre estado de patología y modificadores fisiológicos.
// Ejecutado cada tick ANTES de RespiratoryEngine y CardiovascularEngine.
//
// FASE ARDS 1.C — ODE de Balance Dinámico para lungInjury:
//   d(lungInjury)/dt = stress × hostSensitivity − repair / hostSensitivity
//
//   STRESS (VILI = Ventilator-Induced Lung Injury):
//     W_PPLAT     — Villar CCM 2017    (Pplat ≥ 28, cutoff 29 ajustado −1)
//     W_DRIVE     — Amato NEJM 2015    (ΔP ≥ 14, HR 1.41/7cmH₂O)
//     W_MECHPOWER — Costa AJRCCM 2021  (MP ≥ 17 J/min)
//     W_HYPOXIA   — Goligher 2021      (SpO₂ < 88% sostenida)
//     W_HIGH_FIO2 — Slutsky 1999       (FiO₂ > 0.6: O₂ tóxico)
//
//   REPAIR/BENEFICIO (intervenciones protectoras):
//     REPAIR_BASE        — Matthay 2019  (τ recuperación pasiva ~55h)
//     PRONE_BENEFIT      — Guérin 2013   (PROSEVA: P/F < 150, −35% shunt)
//     LOW_VT_BENEFIT     — ARDSNet 2000  (VT ≤ 6 mL/kg PBW)
//     LOW_DRIVING_BENEFIT— Amato 2015    (ΔP < 14: efecto más fuerte)
//     OPTIMAL_PEEP_BONUS — Mercat 2008   (ExPress: PEEP 8–18 rango óptimo)
//     NMBA_EARLY_BENEFIT — Papazian 2010 (ACURASYS: BNM < 48h SDRA grave)

import { usePathologyStore, NEUTRAL_MODIFIERS } from '../store/usePathologyStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';
import { usePatientStore, computeDevicePEEP } from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

// ─── Constantes shunt/compliance del SDRA ────────────────────────────────────
const ARDS_SHUNT_MIN     = 0.05;  // Shunt fisiológico normal (5%)
const ARDS_SHUNT_MAX     = 0.60;  // Shunt en SDRA severo (60%)
const ARDS_COMPLIANCE_MIN = 0.3;  // 30% de compliance normal en SDRA severo

// ─── Constantes sepsis ────────────────────────────────────────────────────────
const SEPSIS_SVR_MIN          = 0.4;
const SEPSIS_LEAK_MAX         = 10;
const SEPSIS_HYPERDYNAMIC_MAX = 1.4;

// ─── ODE VILI — pesos de STRESS (por segundo de simulación) ──────────────────
const W_PPLAT      = 1.4e-5;  // s⁻¹/cmH₂O sobre umbral 28 (Villar CCM 2017)
const W_DRIVE      = 2.2e-5;  // s⁻¹/cmH₂O sobre umbral 14 (Amato NEJM 2015)
const W_MECHPOWER  = 0.8e-5;  // s⁻¹/(J/min) sobre umbral 17 (Costa AJRCCM 2021)
const W_HYPOXIA    = 1.0e-5;  // s⁻¹ activo cuando SpO₂ < 88% (Goligher 2021)
const W_HIGH_FIO2  = 0.4e-5;  // s⁻¹ activo cuando FiO₂ > 0.6  (Slutsky 1999)

// ─── ODE VILI — constantes de repair/beneficio ───────────────────────────────
const REPAIR_BASE           = 5.0e-6;  // s⁻¹ — τ = ~55h recuperación pasiva (Matthay 2019)
const REPAIR_INH_BY_INJURY  = 0.8;     // 80% inhibición a injury=1 (lesión severa inhibe regeneración)
const PRONE_BENEFIT         = 1.5e-5;  // s⁻¹ — PROSEVA: pronación 16h/día (Guérin NEJM 2013)
const LOW_VT_BENEFIT        = 0.8e-5;  // s⁻¹ — VT ≤ 6 mL/kg PBW (ARDSNet NEJM 2000)
const LOW_DRIVING_BENEFIT   = 1.2e-5;  // s⁻¹ — ΔP < 14, el predictor más fuerte (Amato 2015)
const OPTIMAL_PEEP_BONUS    = 0.6e-5;  // s⁻¹ — PEEP 8–18 cmH₂O (ExPress, Mercat NEJM 2008)
const NMBA_EARLY_BENEFIT    = 0.4e-5;  // s⁻¹ — BNM primeras 48h SDRA grave (Papazian NEJM 2010)

export class PathologyEngine {
  private static instance: PathologyEngine | null = null;
  private constructor() { }

  public static getInstance(): PathologyEngine {
    if (!PathologyEngine.instance) PathologyEngine.instance = new PathologyEngine();
    return PathologyEngine.instance;
  }

  public update(dt: number): void {
    const store    = usePathologyStore.getState();
    const { sepsis, ards } = store;
    const { sepsisProgressionModifier } = useMicrobiologyStore.getState();

    // ── 1. Sepsis: progresión modulada por eficacia ATB + fragilidad ──────────
    //  Bellani LUNG SAFE 2016 + Bruno Ann ICU 2023:
    //  pacientes frágiles progresan a shock/disfunción orgánica más rápido
    //  (reserva metabólica reducida → depleción ATP, umbral apoptosis menor).
    //  Coeficiente +0.6×frailtyContinuous calibrado con HR 1.34/punto CFS (Bruno 2023).
    if (sepsis.isActive) {
      const sepsisProfile = usePatientStore.getState().profile;
      const frailtySepsis = sepsisProfile?.frailtyContinuous ?? 0;
      const sepsisProgEffective = sepsis.progressionRate
        * sepsisProgressionModifier
        * (1 + 0.6 * frailtySepsis);
      const newSev = sepsis.severity + sepsisProgEffective * dt;
      store.setSepsisSeverity(newSev);
      // Avanzar timer de fuga capilar (usada en CardiovascularEngine modelo gamma)
      store.advanceSepsisTime(dt);
    }

    // ── 2. SDRA: ODE de balance dinámico (VILI stress − repair) ─────────────
    if (ards.hasLungInjury) {
      const pat   = usePatientStore.getState();
      const pharm = usePharmacologyStore.getState();
      const vitals = pat.vitals;
      const vent   = pat.ventilator;

      // PBW para cálculo VT/kg (sensibilidad protección mecánica)
      const profile = pat.profile;
      const pbwKg   = profile?.pbwKg ?? (vitals.weight ?? 70);
      const vtPerKg = (vent.vt ?? 500) / Math.max(1, pbwKg);
      const peep    = vent.peep ?? 5;
      const pplat   = vitals.pplat ?? 15;
      const deltaP  = vitals.deltaP ?? 10;
      const mp      = vitals.mechanicalPower ?? 12;
      const spo2    = vitals.spo2 ?? 98;
      const fio2    = vent.fio2 ?? 0.21;

      // Sensibilidad individual del huésped (PatientProfile 1.D)
      const hostSens = profile?.hostSensitivity ?? 1.0;

      // STRESS INPUT — cada término activo solo cuando supera su umbral
      const stressRaw =
        Math.max(0, pplat  - 28) * W_PPLAT     +
        Math.max(0, deltaP - 14) * W_DRIVE      +
        Math.max(0, mp     - 17) * W_MECHPOWER  +
        (spo2 < 88  ? W_HYPOXIA   : 0) +
        (fio2 > 0.6 ? W_HIGH_FIO2 : 0);

      // Corticoides: reducen inflamación y biomarkers SDRA hasta 35% a dosis plena
      // Ref: Meduri GU CCM 2007 (methylpred −30-40% biomarcadores SDRA);
      //      RECOVERY Lancet 2021 (dexa: RR mortalidad 0.83 en SDRA grave)
      const antiInflammEffect = pharm.systemicEffects.antiInflammatoryEffect ?? 0;
      const stressModulated   = stressRaw * (1 - Math.min(0.35, antiInflammEffect * 0.35));
      const stress = stressModulated * hostSens;

      // REPAIR — base reducida por injuria severa (tejido lesionado se regenera peor)
      const repairBase  = REPAIR_BASE * (1 - REPAIR_INH_BY_INJURY * ards.lungInjury);

      // BNM precoz: activo si hay BNM y el insulto es < 48h (ACURASYS)
      const nmbaActive = pharm.systemicEffects.nmba > 0.1;
      const nmbaEarly  = nmbaActive && ards.timeSinceInsultS < 48 * 3600;

      // PEEP en rango óptimo: 8–18 cmH₂O (ExPress 2008 + análisis ARDS Network)
      const peepInOptimalRange = peep >= 8 && peep <= 18;

      const repairBonus =
        (ards.proneActive      ? PRONE_BENEFIT          : 0) +
        (vtPerKg <= 6          ? LOW_VT_BENEFIT          : 0) +
        (deltaP <= 14          ? LOW_DRIVING_BENEFIT     : 0) +
        (peepInOptimalRange    ? OPTIMAL_PEEP_BONUS      : 0) +
        (nmbaEarly             ? NMBA_EARLY_BENEFIT      : 0);

      // hostSensitivity pacientes lábiles también responden menos a intervenciones
      const repair = (repairBase + repairBonus) / hostSens;

      const dLungInjury = (stress - repair) * dt;
      const rawInjury   = ards.lungInjury + dLungInjury;
      const newInjury   = isFinite(rawInjury) ? Math.max(0, Math.min(1, rawInjury)) : ards.lungInjury;
      const newTime     = ards.timeSinceInsultS + dt;

      store.updateLungInjuryFromEngine(newInjury, newTime);
    }

    // ── 3. Modificadores fisiológicos desde la injuria pulmonar actual ───────
    const newModifiers = { ...NEUTRAL_MODIFIERS };

    if (sepsis.isActive) {
      newModifiers.svrMultiplier     = 1.0 - (1.0 - SEPSIS_SVR_MIN)          * sepsis.severity;
      newModifiers.capillaryLeakRate = SEPSIS_LEAK_MAX                        * sepsis.severity;
      newModifiers.hyperdynamicFactor= 1.0 + (SEPSIS_HYPERDYNAMIC_MAX - 1.0) * sepsis.severity;
    }

    // Leer ARDS state actualizado (después del ODE step)
    const ardsNow = usePathologyStore.getState().ards;
    if (ardsNow.hasLungInjury && ardsNow.lungInjury > 0) {
      const inj = ardsNow.lungInjury;

      // Shunt base desde injuria pulmonar
      let baseShunt = ARDS_SHUNT_MIN + (ARDS_SHUNT_MAX - ARDS_SHUNT_MIN) * inj;
      newModifiers.complianceMultiplier = 1.0 - (1.0 - ARDS_COMPLIANCE_MIN) * inj;

      // ── 2.C: Reclutamiento alveolar por PEEP (sigmoideo) ─────────────────
      //   Curva logística k=0.18, x0=4 en espacio de ΔP = peep − 5
      //   Ganancia mayor entre PEEP 5→15 que 15→25 (saturación logística)
      //   Reducción máxima del shunt ≈ 55% (evidencia meta-análisis ARDSNet)
      //   Sobredistensión: PEEP > 18 → shunt aumenta 4%/cmH₂O (West 2008)
      //   Refs: Crotti Am J Respir 2001; Gattinoni 2006; Mercat NEJM 2008
      const pat2       = usePatientStore.getState();
      const isArm      = pat2.isVentilatorConnected;
      const peepEff    = isArm ? pat2.ventilator.peep : computeDevicePEEP(pat2.respiratoryDevice);
      const peepDelta  = Math.max(0, peepEff - 5);
      const recruitFactor = 1 / (1 + Math.exp(-0.18 * (peepDelta - 4)));
      const shuntReduction = recruitFactor * 0.55;
      baseShunt *= (1 - shuntReduction);

      // Sobredistensión a PEEP > 18 cmH₂O: ↑ zona 1 alveolar → ↑ shunt (West 2008)
      if (peepEff > 18) {
        baseShunt *= 1 + (peepEff - 18) * 0.04;
      }

      // Pronación mejora V/Q matching (Guérin NEJM 2013 PROSEVA: −35% shunt)
      if (ardsNow.proneActive) {
        baseShunt *= 0.65;
      }

      newModifiers.lungShuntFraction = Math.max(ARDS_SHUNT_MIN, Math.min(ARDS_SHUNT_MAX, baseShunt));
    }

    store.updateModifiers(newModifiers);
  }
}
