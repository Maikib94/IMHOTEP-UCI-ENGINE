// src/core/CardiovascularEngine.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  CardiovascularEngine — hemodinamia acoplada a SV800Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
//  REGLA DE ARQUITECTURA:
//    Este engine SOLO lee PDSystemicEffects — NUNCA plasmaConcentrations.
//    Los efectos droga-específicos se modelan en DrugPDProfile (usePharmacologyStore).
//
//  CAMBIOS vs. versión anterior:
//    • Sección 2-3 (mecánica resp → SV) usa computeHemodynamicCoupling() del
//      motor SV800 para incorporar TPP → PVR y Ppl → retorno venoso.
//    • Sinergia nueva hemorragia × PEEP (Berger 2016, Berlin 2019).
//    • Amplificador sepsis × Pplat > 25 (Vallabhajosyula Chest 2021).
//    • Lanspa 2020: RV dysfunction silente en sepsis severity > 0.5.
//    • Flag `acpHighRisk` publicado a vitals.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';
import { computeHemodynamicCoupling } from './VentilatorSV800Engine';

// ─── CONSTANTES HEMODINÁMICAS ─────────────────────────────────────────────
const HR_HOMEO = 0.05;
const HR_MIN = 30;
const HR_MAX = 220;
const HR_COMP = 40;
const HR_BASE = 75;

const BV_BASE = 5000;
const CVP_BASE = 8;
const CVP_FACTOR = 150;

const SV_BASE = 70;
const SV_MIN = 10;
const NOISE_INT = 1.0;

// ─── CONSTANTES RESPIRATORIAS (fallback, si vitals aún no publicados) ─────
const LUNG_COMPLIANCE_DEFAULT = 50;
const PAW_ITT_RATIO = 0.33;

// ─── CONSTANTES HIPOVOLEMIA ─────────────────────────────────────────────
const HYPO_AMPLIFIER_FLOOR = 4000;
const HYPO_AMPLIFIER_SCALE = 2000;

// ─── PLETISMOGRAFÍA ─────────────────────────────────────────────────────
const PAW_PLETH_THRESHOLD = 10;
const PAW_PLETH_PENALTY = 0.03;

// ─── SINERGIA HEMO × PEEP (Berger 2016 AJP-HCP; Berlin 2019 ICM Exp) ────
const HEMO_PEEP_SYNERGY_COEFF = 0.08;
const HEMO_PEEP_SYNERGY_MAX   = 0.50;

// ─── ACP / RV dysfunction (Lanspa Chest 2020; Vallabhajosyula Chest 2021) ─
const ACP_SV_PENALTY           = 0.15;   // 15% adicional si ACP confirmado
const ACP_HR_BONUS             = 18;     // bpm compensación taquicárdica
const SEPSIS_RVD_SV_PENALTY    = 0.08;   // RV silent dysfunction sepsis
const SEPSIS_RVD_HR_BONUS      = 8;
const SEPSIS_PPLAT_AMPLIFIER   = 0.0040; // por cmH₂O Pplat > 25 × severidad
const SEPSIS_PPLAT_THR         = 25;

// ─── RECUPERACIÓN ANTIMICROBIANA LOGÍSTICA (Kumar CCM 2006; Rhodes SSC 2016) ─
const RECOVERY_TAU_EMPIRIC = 28800;   // ~8h
const RECOVERY_TAU_TARGETED = 14400;  // ~4h
const RECOVERY_MAP_BONUS_MAX = 12;    // mmHg max
const RECOVERY_MIN_ELAPSED = 21600;   // 6h mínimas para ver beneficio

export class CardiovascularEngine {
  private static instance: CardiovascularEngine | null = null;

  private noiseTimer: number = 0;
  private pendingNoise: number = 0;

  private treatmentRecovery: number = 0;
  private recoveryElapsed: number = 0;

  private constructor() { }

  public static getInstance(): CardiovascularEngine {
    if (CardiovascularEngine.instance === null) {
      CardiovascularEngine.instance = new CardiovascularEngine();
    }
    return CardiovascularEngine.instance;
  }

  public updateHemodynamics(dt: number): void {
    const store = usePatientStore.getState();
    const v = store.vitals;
    const vent = store.ventilator;
    const upd = store.updateVitals;
    const setBV = store.setBloodVolume;

    // ─── ESTADOS EXTERNOS ──────────────────────────────────────────────────
    const { systemicEffects: pd } = usePharmacologyStore.getState();
    const path = usePathologyStore.getState();
    const { modifiers, ards, sepsis } = path;
    const { svrMultiplier, hyperdynamicFactor, capillaryLeakRate } = modifiers;

    // ─── 1. VOLEMIA (Hemorragia + Fuga Capilar) ────────────────────────────
    let vol = store.bloodVolume;
    if (store.hemorrhageRate > 0) {
      vol -= store.hemorrhageRate * dt;
    }
    if (capillaryLeakRate > 0) {
      vol -= (capillaryLeakRate / 60) * dt;
    }
    vol = Math.max(0, vol);
    setBV(vol);

    // ─── 2. MECÁNICA RESPIRATORIA (leída del SV800Engine vía vitals) ───────
    const peep = vent.peep;
    const pmean = v.meanAirwayPressure ?? peep;
    const pplat = v.pplat || (peep + (vent.vt / LUNG_COMPLIANCE_DEFAULT) * PAW_ITT_RATIO);

    // Ppl promedio (estimación por fracción E_cw/E_tot)
    //   Paciente paralizado sin SDRA: ratio ≈ 0.7
    //   SDRA severo: pared torácica más "rígida" relativa → ratio ≈ 0.5
    //   (Talmor NEJM 2008, Vieillard-Baron ICM 2016)
    const ratioEcw = ards.isActive ? 0.5 - ards.severity * 0.15 : 0.7;
    const pplMean = Math.max(-10, ratioEcw * Math.max(0, pmean - peep) - 5);

    // ─── 3. ACOPLAMIENTO VENTILACIÓN → HEMODINAMIA (SV800Engine) ───────────
    //   Vieillard-Baron ICM 2016: TPP → PVR; Ppl → retorno venoso.
    //   Berger AJP-HCP 2016: PEEP transmite ~0.5 cmH₂O/cmH₂O a CVP.
    //   Lanspa Chest 2020: ACP flag si Pplat > 27 + substrato severo.
    const coupling = computeHemodynamicCoupling({
      pMean: pmean,
      pPlat: pplat,
      pplMean,
      pplSwing: Math.max(0, pplat - pplMean),
      peep,
      ardsActive: ards.isActive,
      ardsSeverity: ards.severity,
      sepsisActive: sepsis.isActive,
      sepsisSeverity: sepsis.severity,
    });

    // ─── 4. VOLUMEN SISTÓLICO (SV) ─────────────────────────────────────────
    let sv = Math.max(SV_MIN, SV_BASE * (vol / BV_BASE));
    const hypoAmplifier = vol < HYPO_AMPLIFIER_FLOOR
      ? 1.0 + (HYPO_AMPLIFIER_FLOOR - vol) / HYPO_AMPLIFIER_SCALE
      : 1.0;

    // 4a. Sinergia hemorragia × PEEP (Berger 2016, Berlin 2019)
    //     Pacientes hipovolémicos tienen más pérdida de VR ante el mismo PEEP.
    const hypovolemiaFrac = Math.max(0, (BV_BASE - vol) / BV_BASE);
    const peepExcess5 = Math.max(0, peep - 5);
    const hemoSynergy = Math.min(
      HEMO_PEEP_SYNERGY_MAX,
      hypovolemiaFrac * peepExcess5 * HEMO_PEEP_SYNERGY_COEFF,
    );

    // 4b. Sepsis × Pplat > 25 (Vallabhajosyula 2021)
    //     RV dysfunction meta-OR 2.42; sensibilidad adicional a Pplat.
    const sepsisAmp = (sepsis.isActive && pplat > SEPSIS_PPLAT_THR)
      ? sepsis.severity * (pplat - SEPSIS_PPLAT_THR) * SEPSIS_PPLAT_AMPLIFIER
      : 0;

    // 4c. Penalización total aplicada a SV
    const totalSvPenalty = Math.min(
      0.85,
      (coupling.svPenalty + hemoSynergy + sepsisAmp) * hypoAmplifier,
    );
    sv = Math.max(SV_MIN, sv * (1.0 - totalSvPenalty));
    sv += pd.beta1 * 8;  // inotropismo β₁

    // 4d. Cor Pulmonale agudo (Pplat>27 + SDRA sev o sepsis+SDRA)
    let corPulmonaleSvrFactor = 1.0;
    let corPulmonaleHrBonus = 0;
    if (coupling.acpHighRisk) {
      sv *= (1 - ACP_SV_PENALTY);
      corPulmonaleSvrFactor = 0.85;
      corPulmonaleHrBonus = ACP_HR_BONUS;
    } else if (ards.isActive && ards.severity >= 0.6) {
      // Fallback legacy: SDRA sev sin cumplir ACP formal
      sv *= 0.80;
      corPulmonaleSvrFactor = 0.85;
      corPulmonaleHrBonus = 15;
    }

    // 4e. Lanspa: RV dysfunction silente en sepsis severa
    if (sepsis.isActive && sepsis.severity > 0.50) {
      sv *= (1 - SEPSIS_RVD_SV_PENALTY);
      corPulmonaleHrBonus += SEPSIS_RVD_HR_BONUS;
    }

    sv = Math.min(130, sv);

    // ─── 5. PRESIÓN VENOSA CENTRAL (CVP) ───────────────────────────────────
    const newCVP = Math.max(0, Math.round(
      CVP_BASE
      + (vol - BV_BASE) / CVP_FACTOR
      + coupling.cvpTransmission
    ));

    // ─── 6. FRECUENCIA CARDÍACA (HR) ───────────────────────────────────────
    const pao2 = v.paO2 || 95;
    const fio2 = vent.fio2 || 0.21;
    const pfRatio = pao2 / fio2;

    let hypoxicDriveHR = 0;
    if (pfRatio < 200) {
      hypoxicDriveHR = (1 - (Math.max(50, pfRatio) - 50) / 150) * 30;
    }

    const hrBaseSeptic = HR_BASE * hyperdynamicFactor;
    const svDeficit = Math.max(0, SV_BASE - sv);

    const targetHR =
      hrBaseSeptic
      + (BV_BASE - vol) / HR_COMP
      + pd.beta1 * 15
      + svDeficit * 0.4
      + pd.hrDirectDelta
      + pd.vagolytic * 8
      + hypoxicDriveHR
      + corPulmonaleHrBonus;

    this.noiseTimer += dt;
    let newHR = v.heartRate;

    if (this.noiseTimer >= NOISE_INT) {
      this.noiseTimer = 0;
      this.pendingNoise = Math.random() * 2 - 1;
      const drift = (targetHR - v.heartRate) * HR_HOMEO;
      newHR = Math.round(
        Math.max(HR_MIN, Math.min(HR_MAX, v.heartRate + this.pendingNoise + drift))
      );
    }

    // ─── 7. RESISTENCIA VASCULAR, GASTO CARDÍACO Y PAM ─────────────────────
    const DynSvrAlpha = pd.alpha1 * 800;
    const DynSvrVaso = pd.vasoplegiaRev * 600;
    const dynSvr = v.baseSvr * svrMultiplier * corPulmonaleSvrFactor + DynSvrAlpha + DynSvrVaso;

    const co = Number(((newHR * sv) / 1000).toFixed(1));
    const baseMap = Math.round((co * dynSvr) / 80 + newCVP);

    // ─── 8. RECUPERACIÓN LOGÍSTICA ANTIMICROBIANA ──────────────────────────
    const { treatmentEfficacy } = useMicrobiologyStore.getState();
    const isEffective = treatmentEfficacy === 'targeted' || treatmentEfficacy === 'empiric_match';

    if (isEffective) {
      this.recoveryElapsed += dt;
      const tau = treatmentEfficacy === 'targeted' ? RECOVERY_TAU_TARGETED : RECOVERY_TAU_EMPIRIC;
      const x = (this.recoveryElapsed - RECOVERY_MIN_ELAPSED) / tau;
      this.treatmentRecovery = Math.max(0, Math.min(1, 1 / (1 + Math.exp(-x))));
    } else {
      this.treatmentRecovery = Math.max(0, this.treatmentRecovery - 0.0001 * dt);
      if (treatmentEfficacy === 'none' || treatmentEfficacy === 'mismatch') {
        this.recoveryElapsed = 0;
      }
    }

    const mapRecoveryBonus = Math.round(this.treatmentRecovery * RECOVERY_MAP_BONUS_MAX);

    const map = Math.max(0, Math.round(
      baseMap
      + pd.beta1 * 2
      + pd.mapDirectDelta
      + mapRecoveryBonus
    ));

    const dbp = Math.round(map - 40 / 3);
    const sbp = Math.round(dbp + 40);

    // ─── 9. ONDA DE PLETISMOGRAFÍA (Pleth Amplitude) ───────────────────────
    const pmeanExcessForPleth = Math.max(0, pmean - PAW_PLETH_THRESHOLD);
    const plethPenalty = pmeanExcessForPleth * PAW_PLETH_PENALTY;

    let pleth = 1.0;
    if (pd.alpha1 > 0) pleth *= Math.max(0.05, 1.0 - pd.alpha1 * 0.4);
    if (pd.sedation > 0) pleth *= Math.min(1.3, 1.0 + pd.sedation * 0.1);

    const svRatio = sv / SV_BASE;
    if (svRatio < 1.0) pleth *= Math.max(0.1, svRatio);

    pleth *= (1.0 - Math.min(0.7, plethPenalty));
    pleth = Math.max(0.03, Math.min(1.5, pleth));

    // ─── 10. ACTUALIZACIÓN DEL STORE ───────────────────────────────────────
    upd({
      cardiacOutput: co,
      svr: Math.round(dynSvr),
      cvp: newCVP,
      strokeVolume: Math.round(sv),
      meanArterialPressure: map,
      systolicBP: sbp,
      diastolicBP: dbp,
      heartRate: newHR,
      plethAmplitude: Math.round(pleth * 100) / 100,
      ...this.computeTemperature(v.temperature, vol, pd.thermoDepression, dt),
    });
  }

  // ─── TEMPERATURA ─────────────────────────────────────────────────────────
  private computeTemperature(
    currentTemp: number,
    bv: number,
    thermoDepression: number,
    dt: number,
  ): { temperature: number } {
    const pctLoss = Math.max(0, (BV_BASE - bv) / BV_BASE);
    const hemorrHypothermia = pctLoss > 0.15
      ? -0.4 * (pctLoss - 0.15)
      : 0;
    const drugHypothermia = thermoDepression * -2.0;
    const targetT = 37.0 + hemorrHypothermia + drugHypothermia;
    const tau = 300; // s (respuesta lenta térmica)
    const newT = currentTemp + (targetT - currentTemp) * (dt / tau);
    return { temperature: Math.round(newT * 10) / 10 };
  }
}
