// src/core/CardiovascularEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Este engine SOLO lee PDSystemicEffects — NUNCA plasmaConcentrations.
//   Los efectos droga-específicos se modelan en DrugPDProfile (usePharmacologyStore).
//   Esto garantiza que añadir nuevas drogas no requiera tocar este archivo.
//

import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';

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

// ─── CONSTANTES RESPIRATORIAS ─────────────────────────────────────────────
const LUNG_COMPLIANCE_DEFAULT = 50;
const PAW_ITT_RATIO = 0.33;
const PEEP_THRESHOLD = 10;
const PPLAT_THRESHOLD = 25;

const SV_PEEP_PENALTY = 0.02;
const SV_PPLAT_PENALTY = 0.01;
const PEEP_CVP_TRANSMISSION = 0.5;

const HYPO_AMPLIFIER_FLOOR = 4000;
const HYPO_AMPLIFIER_SCALE = 2000;

const PAW_PLETH_THRESHOLD = 10;
const PAW_PLETH_PENALTY = 0.03;

// ─── CONSTANTES RECUPERACIÓN ANTIMICROBIANA (LOGÍSTICA) ───────────────────
// Ref: Rhodes A (Surviving Sepsis 2016) / Kumar A (Crit Care Med 2006)
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
    const { modifiers, ards } = usePathologyStore.getState();
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

    // ─── 2. MECÁNICA RESPIRATORIA Y PRESIONES ──────────────────────────────
    const peep = v.peep ?? vent.peep;
    const pmean = v.meanAirwayPressure ?? peep;
    const pplat = v.pplat || (peep + (vent.vt / LUNG_COMPLIANCE_DEFAULT) * PAW_ITT_RATIO);

    const peepExcessForCvp = Math.max(0, peep - PEEP_THRESHOLD);
    const pmeanExcessForSv = Math.max(0, pmean - PEEP_THRESHOLD);
    const pplatExcess = Math.max(0, pplat - PPLAT_THRESHOLD);

    // ─── 3. VOLUMEN SISTÓLICO (SV) Y COR PULMONALE ─────────────────────────
    let sv = Math.max(SV_MIN, SV_BASE * (vol / BV_BASE));
    const hypoAmplifier = vol < HYPO_AMPLIFIER_FLOOR
      ? 1.0 + (HYPO_AMPLIFIER_FLOOR - vol) / HYPO_AMPLIFIER_SCALE
      : 1.0;

    // Penalización combinada por Pmean (precarga) y Pplat (postcarga VD)
    const totalSvPenaltyFactor = (pmeanExcessForSv * SV_PEEP_PENALTY) + (pplatExcess * SV_PPLAT_PENALTY);
    const svPenalty = Math.min(0.85, totalSvPenaltyFactor * hypoAmplifier);

    sv = Math.max(SV_MIN, sv * (1.0 - svPenalty));
    sv += pd.beta1 * 8; // inotropismo β₁

    let corPulmonaleSvrFactor = 1.0;
    let corPulmonaleHrBonus = 0;

    if (ards?.isActive && ards.severity >= 0.6) {
      sv *= 0.80; // Caída del VS por fallo del VD
      corPulmonaleSvrFactor = 0.85; // Vasodilatación refractaria
      corPulmonaleHrBonus = 15; // Taquicardia reactiva
    }

    sv = Math.min(130, sv);

    // ─── 4. PRESIÓN VENOSA CENTRAL (CVP) ───────────────────────────────────
    const newCVP = Math.max(0, Math.round(
      CVP_BASE + (vol - BV_BASE) / CVP_FACTOR + peepExcessForCvp * PEEP_CVP_TRANSMISSION
    ));

    // ─── 5. FRECUENCIA CARDÍACA (HR) ───────────────────────────────────────
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

    // ─── 6. RESISTENCIA VASCULAR, GASTO CARDÍACO Y PAM ─────────────────────
    const DynSvrAlpha = pd.alpha1 * 800;
    const DynSvrVaso = pd.vasoplegiaRev * 600;
    const dynSvr = v.baseSvr * svrMultiplier * corPulmonaleSvrFactor + DynSvrAlpha + DynSvrVaso;

    const co = Number(((newHR * sv) / 1000).toFixed(1));
    const baseMap = Math.round((co * dynSvr) / 80 + newCVP);

    // ─── 7. RECUPERACIÓN LOGÍSTICA ANTIMICROBIANA ──────────────────────────
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

    // ─── 8. ONDA DE PLETISMOGRAFÍA (Pleth Amplitude) ───────────────────────
    const pmeanExcessForPleth = Math.max(0, pmean - PAW_PLETH_THRESHOLD);
    const plethPenalty = pmeanExcessForPleth * PAW_PLETH_PENALTY;

    let pleth = 1.0;
    if (pd.alpha1 > 0) pleth *= Math.max(0.05, 1.0 - pd.alpha1 * 0.4);
    if (pd.sedation > 0) pleth *= Math.min(1.3, 1.0 + pd.sedation * 0.1);

    const svRatio = sv / SV_BASE;
    if (svRatio < 1.0) pleth *= Math.max(0.1, svRatio);

    pleth *= (1.0 - Math.min(0.7, plethPenalty));
    pleth = Math.max(0.03, Math.min(1.5, pleth));

    // ─── 9. ACTUALIZACIÓN DEL STORE ────────────────────────────────────────
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
    const hemorrHypothermia = pctLoss > 0.15 ? Math.min(3.0, ((pctLoss - 0.15) / 0.35) * 3.0) : 0;

    const pharmOffset = thermoDepression * -2.0;
    const targetTemp = 37.0 - hemorrHypothermia + pharmOffset;

    const tau = 600;
    const newT = currentTemp + (targetTemp - currentTemp) * (1 - Math.exp(-dt / tau));

    return { temperature: Math.round(Math.max(28.0, Math.min(41.5, newT)) * 10) / 10 };
  }
}