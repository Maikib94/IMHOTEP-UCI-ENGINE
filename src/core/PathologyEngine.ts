// src/core/PathologyEngine.ts
// v6 — Fix 1 (dt Euler), Fix 2 (SVR compensatorio), RBC mass loss
//
// FIX 1 — INTEGRACIÓN EULER CORRECTA (Lamke 1977; ATLS 11ª Ed.):
//   mlLost = hemorrhageRate(mL/min) × dt(s) / 60
//   PathologyEngine aplica la pérdida directamente y pone hemorrhageRate=0
//   en el store para evitar que CardiovascularEngine duplique el sangrado.
//
// FIX 2 — SVR COMPENSATORIO (Guyton & Hall Cap.21; ATLS 11ª Ed. pág.62):
//   Clase I  (0-15%):  SVR 1.0 → 1.18 (simpático moderado)
//   Clase II (15-30%): SVR 1.18 → 1.40 (vasoconstricción máxima)
//   Clase III(30-40%): SVR 1.40 → 1.0  (compensación fallando)
//   Clase IV (>40%):   SVR 1.0 → 0.55  (colapso + acidosis)
//   PUNTO CLAVE PEDAGÓGICO: en Clase II la PAM se MANTIENE a pesar del
//   sangrado — el fellow que no mira la FC se equivoca.
//
// RBC MASS LOSS: al sangrar se pierde masa eritrocitaria proporcional al Hto
//   actual. LabEngine calcula Hb real = MCHC × (RBC_mass / BV_actual)

import { usePathologyStore, NEUTRAL_MODIFIERS } from '../store/usePathologyStore';
import type { PathologyModifiers }               from '../store/usePathologyStore';
import { RespiratoryEngine }                     from './RespiratoryEngine';
import { usePatientStore }                       from '../store/usePatientStore';
import { usePharmacologyStore }                  from '../store/usePharmacologyStore';
import { useMicrobiologyStore }                  from '../store/useMicrobiologyStore';

// ─── Constantes fisiológicas ──────────────────────────────────────────────────

// Sepsis
const COMPLIANCE_BASE           = 50.0;
const SHUNT_HEALTHY             = 0.05;
const SHUNT_MAX_SEPSIS          = 0.30;
const SHUNT_MAX_ARDS            = 0.35;
const LUNG_INJURY_THR_SEPSIS    = 0.50;
const LEAK_MAX_ML_MIN           = 5.0;
const LEAK_NORA_MAX_REDUCTION   = 0.35;
const LEAK_NORA_DOSE_SATURATION = 2.3;
const LEAK_MOF_PLATEAU          = 0.65;

// SDRA
const PEEP_RECRUIT_CENTER       = 12;
const PEEP_RECRUIT_SCALE        = 2.5;
const PEEP_RECRUIT_MAX          = 0.20;
const PRONE_SHUNT_REDUCTION     = 0.35;
const PRONE_COMPLIANCE_BOOST    = 1.15;

// Shock Hemorrágico
const BV_NORMAL                 = 5000;

// ─── Helpers — Shock Hemorrágico ──────────────────────────────────────────────

// SVR compensatorio CORREGIDO — Guyton & Hall; ATLS 11ª Ed.
// Pico de compensación en ~25% de pérdida, luego colapso progresivo
function computeHemorrhagicSVRBoost(pctLoss: number): number {
  if (pctLoss <= 0)    return 1.0;
  if (pctLoss < 0.15) {
    // Clase I: simpático moderado 1.0→1.18
    return 1.0 + (pctLoss / 0.15) * 0.18;
  }
  if (pctLoss < 0.30) {
    // Clase II: vasoconstricción máxima 1.18→1.40
    return 1.18 + ((pctLoss - 0.15) / 0.15) * 0.22;
  }
  if (pctLoss < 0.40) {
    // Clase III: agotamiento catecolaminas 1.40→1.0
    return 1.40 - ((pctLoss - 0.30) / 0.10) * 0.40;
  }
  // Clase IV: colapso + vasodilatación paradójica + acidosis
  const t = Math.min(1.0, (pctLoss - 0.40) / 0.25);
  return Math.max(0.50, 1.0 - t * 0.50);
}

// Taquicardia + Bezold-Jarisch — Sander-Jensen BMJ 1986; ATLS 11ª Ed.
function computeHemorrhagicHRFactor(pctLoss: number): number {
  if (pctLoss <= 0)    return 1.0;
  if (pctLoss < 0.15) {
    // Clase I: taquicardia leve 1.0→1.15
    return 1.0 + (pctLoss / 0.15) * 0.15;
  }
  if (pctLoss < 0.40) {
    // Clase II-III: taquicardia compensatoria progresiva 1.15→1.42
    return 1.15 + ((pctLoss - 0.15) / 0.25) * 0.27;
  }
  // Clase IV: reflejo Bezold-Jarisch (preload crítico → tono vagal)
  const bj = Math.min(1.0, (pctLoss - 0.40) / 0.30);
  return Math.max(0.55, 1.42 - bj * 0.87);
}

// ─── PathologyEngine Singleton ────────────────────────────────────────────────

export class PathologyEngine {
  private static instance: PathologyEngine | null = null;
  private constructor() {}

  public static getInstance(): PathologyEngine {
    if (!PathologyEngine.instance)
      PathologyEngine.instance = new PathologyEngine();
    return PathologyEngine.instance;
  }

  public update(dt: number): void {
    const store  = usePathologyStore.getState();
    const sepsis = store.sepsis;
    const ards   = store.ards;
    const hShock = store.hemorrhagicShock;

    const anyActive = sepsis.isActive || ards.isActive || hShock.isActive;

    if (!anyActive) {
      if (store.modifiers.svrMultiplier !== 1.0 ||
          store.modifiers.complianceMultiplier !== 1.0 ||
          store.modifiers.hyperdynamicFactor !== 1.0) {
        store.updateModifiers({ ...NEUTRAL_MODIFIERS });
        RespiratoryEngine.getInstance().reset();
        usePatientStore.getState().setHemorrhageRate(0);
      }
      return;
    }

    // ─── BLOQUE SEPSIS ─────────────────────────────────────────────────────
    let svrFromSepsis      = 1.0;
    let capillaryLeakRate  = 0;
    let hyperdynamicSepsis = 1.0;
    let sepsisShunt        = SHUNT_HEALTHY;

    if (sepsis.isActive) {
      // sepsisProgressionModifier: +1.0 normal, +1.2 mismatch, -0.5 ATB dirigido eficaz
      const sepsisModifier = useMicrobiologyStore.getState().sepsisProgressionModifier;
      const effectiveRate  = sepsis.progressionRate * sepsisModifier;
      const newSev = Math.max(0, Math.min(1.0, sepsis.severity + effectiveRate * dt));
      store.setSepsisSeverity(newSev);
      const s = newSev;

      svrFromSepsis = Math.max(0.40, 1.0 - s * 0.60);

      let leak = s * LEAK_MAX_ML_MIN;
      // Inyectar Estado Farmacodinámico (Vasopresores reducen leak aparente/estabilizan)
      const { systemicEffects: pd } = usePharmacologyStore.getState();
      
      const vasaEffect = Math.min(1.0, pd.alpha1); 
      leak = leak * (1.0 - vasaEffect * LEAK_NORA_MAX_REDUCTION);
      if (s > 0.80) leak = leak * LEAK_MOF_PLATEAU;
      capillaryLeakRate = Math.max(0, leak);

      if (s <= 0.60) {
        hyperdynamicSepsis = 1.0 + (s / 0.60) * 0.30;
      } else {
        hyperdynamicSepsis = 1.30 - ((s - 0.60) / 0.40) * 0.60;
      }
      hyperdynamicSepsis = Math.max(0.60, Math.min(1.40, hyperdynamicSepsis));

      if (s > LUNG_INJURY_THR_SEPSIS) {
        const t = (s - LUNG_INJURY_THR_SEPSIS) / (1.0 - LUNG_INJURY_THR_SEPSIS);
        sepsisShunt = SHUNT_HEALTHY + t * (SHUNT_MAX_SEPSIS - SHUNT_HEALTHY);
      }
    }

    // ─── BLOQUE SHOCK HEMORRÁGICO ──────────────────────────────────────────
    let hemorrhagicSVRBoost = 1.0;
    let hemorrhagicHRFactor = 1.0;

    if (hShock.isActive) {
      const pat = usePatientStore.getState();

      // FIX 1: Integración Euler correcta — dt en segundos, rate en mL/min
      // Aseguramos que el motor controla el sangrado directamente
      if (!hShock.tourniquetApplied && hShock.hemorrhageRate > 0) {
        const mlLost    = hShock.hemorrhageRate * (dt / 60);
        const currentBV = pat.bloodVolume;
        const currentRBC = pat.redBloodCellMass ?? (currentBV * 0.45);
        // Hto actual (clamped para evitar valores extremos)
        const hto = currentBV > 100
          ? Math.min(0.65, Math.max(0.05, currentRBC / currentBV))
          : 0.45;

        const newBV  = Math.max(80, currentBV - mlLost);
        // Pérdida de masa eritrocitaria proporcional al Hto actual
        const newRBC = Math.max(0, currentRBC - mlLost * hto);

        pat.setBloodVolume(newBV);
        pat.setRedBloodCellMass(newRBC);
      }

      // Anular hemorrhageRate en el store para que CardiovascularEngine
      // no duplique el sangrado — PathologyEngine es el único gestor
      pat.setHemorrhageRate(0);

      // Calcular % pérdida sobre BV actualizado
      const currentBV = pat.bloodVolume;
      const pctLoss   = Math.max(0, Math.min(0.99, (BV_NORMAL - currentBV) / BV_NORMAL));

      // FIX 2: SVR compensatorio corregido
      hemorrhagicSVRBoost = computeHemorrhagicSVRBoost(pctLoss);
      hemorrhagicHRFactor = computeHemorrhagicHRFactor(pctLoss);
    } else {
      if (!sepsis.isActive) {
        usePatientStore.getState().setHemorrhageRate(0);
      }
    }

    // ─── BLOQUE SDRA ───────────────────────────────────────────────────────
    let complianceMultiplier = 1.0;
    let ardsShunt            = SHUNT_HEALTHY;

    if (ards.isActive) {
      const newSev = Math.min(1.0, ards.severity + ards.progressionRate * dt);
      store.setArdsSeverity(newSev);
      const a = newSev;
      complianceMultiplier = Math.max(0.30, 1.0 - a * 0.70);
      ardsShunt = Math.min(SHUNT_MAX_ARDS, SHUNT_HEALTHY + a * 0.30);
    }

    // ─── RECLUTAMIENTO SIGMOIDE PEEP ───────────────────────────────────────
    let effectiveArdsShunt = ardsShunt;
    if (ards.isActive) {
      const peep  = usePatientStore.getState().ventilator.peep;
      const sigma = 1.0 / (1.0 + Math.exp(-(peep - PEEP_RECRUIT_CENTER) / PEEP_RECRUIT_SCALE));
      effectiveArdsShunt = Math.max(SHUNT_HEALTHY, ardsShunt - sigma * PEEP_RECRUIT_MAX * ards.severity);
    }

    // ─── COMBINACIÓN SEPSIS + SDRA ─────────────────────────────────────────
    let combinedShunt = Math.max(sepsisShunt, effectiveArdsShunt);
    if (sepsis.isActive && ards.isActive) {
      combinedShunt = Math.min(0.85, combinedShunt + 0.05);
    }
    if (ards.isActive && ards.proneActive) {
      combinedShunt        = Math.max(SHUNT_HEALTHY + 0.02, combinedShunt * (1.0 - PRONE_SHUNT_REDUCTION));
      complianceMultiplier = Math.min(1.0, complianceMultiplier * PRONE_COMPLIANCE_BOOST);
    }

    // ─── COMBINACIÓN FINAL ─────────────────────────────────────────────────
    // SVR: sepsis ↓ × hemorragia ↑/↓ (multiplicativo — atenúan o amplifican)
    // En sepsis+hemorragia: SVR séptico bajo pero vasoconstricción hemorrágica
    // puede parcialmente compensar → peor escenario clínico
    const finalSVR          = svrFromSepsis * hemorrhagicSVRBoost;
    const finalHyperdynamic = hyperdynamicSepsis * hemorrhagicHRFactor;

    const newModifiers: PathologyModifiers = {
      svrMultiplier:        Math.max(0.40, Math.min(1.65, finalSVR)),
      capillaryLeakRate,
      hyperdynamicFactor:   Math.max(0.45, Math.min(2.00, finalHyperdynamic)),
      lungShuntFraction:    combinedShunt,
      complianceMultiplier,
    };
    store.updateModifiers(newModifiers);

    RespiratoryEngine.getInstance().setShunt(combinedShunt);
    RespiratoryEngine.getInstance().setCompliance(COMPLIANCE_BASE * complianceMultiplier);

    // ─── TEMPERATURA: fiebre séptica ─────────────────────────────────────────
    // CardiovascularEngine ya aplica hipotermia por shock/propofol.
    // Aquí sumamos el delta térmico por sepsis, que se sobreescribe encima.
    //
    // Modelo bifásico (Guyton & Hall 15ª Ed. Cap. 73; SATI-Cárdenas):
    //   s < 0.50 → fase hiperdiámica (warm): fiebre hasta +3.5°C
    //   s 0.50-0.80 → transición: fiebre se aplana
    //   s > 0.80 → fase fría (cold shock / MOF): temperatura cae
    //
    // Nota: si sepsis NO está activa pero CardiovascularEngine ya actualizó
    // la temperatura, no tocamos este campo (el clamp de 37.0 ocurre en CVE).
    if (sepsis.isActive) {
      const s    = sepsis.severity;
      const pat  = usePatientStore.getState();
      const base = pat.vitals.temperature;  // ya incluye hipotermia hemódinámica

      let feverDelta: number;
      if (s <= 0.50) {
        // Warm phase: ascenso lineal 0 → +3.5°C
        feverDelta = (s / 0.50) * 3.5;
      } else if (s <= 0.80) {
        // Transición: fever plateau en +3.5°C
        feverDelta = 3.5;
      } else {
        // Cold shock / MOF: temperatura cae progresivamente (hasta -2°C)
        const t = (s - 0.80) / 0.20;
        feverDelta = 3.5 - t * 5.5;  // puede bajar a -2°C en s=1.0
      }

      const targetT  = 37.0 + feverDelta;
      const tau      = 300;  // fiebre sube/baja más rápido que hipotermia (tau 5 min)
      const newTemp  = base + (targetT - base) * (1 - Math.exp(-dt / tau));
      const clampedT = Math.max(28.0, Math.min(41.5, newTemp));

      pat.updateVitals({ temperature: Math.round(clampedT * 10) / 10 });
    }
  }
}