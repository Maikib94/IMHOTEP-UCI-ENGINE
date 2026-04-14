// src/core/CardiovascularEngine.ts
// CAMBIOS vs versión anterior:
//   - Lee usePathologyStore para svrMultiplier, hyperdynamicFactor, capillaryLeakRate
//   - svrMultiplier modifica baseSvr (vasoplejía séptica)
//   - hyperdynamicFactor escala HR_BASE (respuesta bifásica séptica)
//   - capillaryLeakRate suma a la pérdida de volumen (3er espacio)

import { usePatientStore }    from '../store/usePatientStore';
import { usePathologyStore }  from '../store/usePathologyStore';

const NORA_SVR_COEFF          = 1500;
const HR_HOMEO                = 0.05;
const HR_MIN                  = 30;
const HR_MAX                  = 220;
const BV_BASE                 = 5000;
const CVP_BASE                = 8;
const CVP_FACTOR              = 150;
const SV_BASE                 = 70;
const SV_MIN                  = 10;
const HR_COMP                 = 40;
const HR_BASE                 = 75;
const NOISE_INT               = 1.0;
const DOBU_HR                 = 3;
const DOBU_SV                 = 5;
const DOBU_MAP                = 0.8;
const LUNG_COMPLIANCE_DEFAULT = 50;
const PAW_ITT_RATIO           = 0.33;
const PEEP_THRESHOLD          = 5;
const SV_PEEP_PENALTY         = 0.025;
const PEEP_CVP_TRANSMISSION   = 0.5;
const HYPO_AMPLIFIER_FLOOR    = 4000;
const HYPO_AMPLIFIER_SCALE    = 2000;
const PAW_PLETH_THRESHOLD     = 10;
const PAW_PLETH_PENALTY       = 0.03;

export class CardiovascularEngine {
  private static instance: CardiovascularEngine | null = null;
  private noiseTimer:   number = 0;
  private pendingNoise: number = 0;

  private constructor() {}

  public static getInstance(): CardiovascularEngine {
    if (CardiovascularEngine.instance === null)
      CardiovascularEngine.instance = new CardiovascularEngine();
    return CardiovascularEngine.instance;
  }

  public updateHemodynamics(dt: number): void {
    const store   = usePatientStore.getState();
    const v       = store.vitals;
    const ad      = store.activeDrugs;
    const upd     = store.updateVitals;
    const setBV   = store.setBloodVolume;

    // ─── Modificadores patológicos ────────────────────────────────────────
    const { modifiers } = usePathologyStore.getState();
    const { svrMultiplier, hyperdynamicFactor, capillaryLeakRate } = modifiers;

    // ─── Volemia: hemorragia + fuga capilar séptica ───────────────────────
    let vol = store.bloodVolume;
    if (store.hemorrhageRate > 0) {
      vol -= store.hemorrhageRate * dt;
    }
    // Fuga capilar: capillaryLeakRate en mL/min → mL/s
    if (capillaryLeakRate > 0) {
      vol -= (capillaryLeakRate / 60) * dt;
    }
    vol = Math.max(0, vol);
    setBV(vol);

    // ─── Presión media vía aérea y PEEP ──────────────────────────────────
    const peep       = store.ventilator.peep;
    const vt         = store.ventilator.vt;
    const paw        = peep + (vt / LUNG_COMPLIANCE_DEFAULT) * PAW_ITT_RATIO;
    const peepExcess = Math.max(0, paw - PEEP_THRESHOLD);

    // ─── Volumen Sistólico ────────────────────────────────────────────────
    let sv = Math.max(SV_MIN, SV_BASE * (vol / BV_BASE));

    const hypoAmplifier = vol < HYPO_AMPLIFIER_FLOOR
      ? 1.0 + (HYPO_AMPLIFIER_FLOOR - vol) / HYPO_AMPLIFIER_SCALE
      : 1.0;
    const svPenalty = Math.min(0.85, peepExcess * SV_PEEP_PENALTY * hypoAmplifier);
    sv = Math.max(SV_MIN, sv * (1.0 - svPenalty));
    sv += ad.dobutamine * DOBU_SV;

    // ─── CVP ─────────────────────────────────────────────────────────────
    const newCVP = Math.max(0, Math.round(
      CVP_BASE + (vol - BV_BASE) / CVP_FACTOR + peepExcess * PEEP_CVP_TRANSMISSION
    ));

    // ─── Barorreflejo + taquicardia séptica ──────────────────────────────
    // hyperdynamicFactor escala HR_BASE: warm shock → ↑HR, cold shock → ↓HR
    // Fisiológicamente: citoquinas (TNF-α, IL-1β) activan el sistema nervioso
    // simpático directamente — independiente de la volemia.
    // Ref: Goldstein B, Pediatr Crit Care Med 2005
    const hrBaseSeptic = HR_BASE * hyperdynamicFactor;
    const svDeficit    = Math.max(0, SV_BASE - sv);
    const targetHR     =
      hrBaseSeptic
      + (BV_BASE - vol) / HR_COMP
      + ad.dobutamine   * DOBU_HR
      + svDeficit       * 0.4;

    this.noiseTimer += dt;
    let newHR = v.heartRate;
    if (this.noiseTimer >= NOISE_INT) {
      this.noiseTimer   = 0;
      this.pendingNoise = Math.random() * 2 - 1;
      const drift = (targetHR - v.heartRate) * HR_HOMEO;
      newHR = Math.round(
        Math.max(HR_MIN, Math.min(HR_MAX, v.heartRate + this.pendingNoise + drift))
      );
    }

    // ─── SVR dinámica con modificador séptico ────────────────────────────
    // svrMultiplier reduce la SVR basal (vasoplejía por vasodilatadores
    // endógenos: NO, prostanoides, bradicinina).
    // La noradrenalina sigue sumando en valor absoluto (vasopresión activa).
    // Ref: Levy MM, Crit Care Med 2003
    const dynSvr  = v.baseSvr * svrMultiplier + ad.noradrenaline * NORA_SVR_COEFF;
    const co      = Number(((newHR * sv) / 1000).toFixed(1));
    const baseMap = Math.round((co * dynSvr) / 80 + newCVP);
    const map     = Math.round(baseMap + ad.dobutamine * DOBU_MAP);
    const dbp     = Math.round(map - 40 / 3);
    const sbp     = Math.round(dbp + 40);

    // ─── Pleth Amplitude ─────────────────────────────────────────────────
    let pleth = 1.0;
    if (ad.noradrenaline > 0)
      pleth *= Math.max(0.05, 1.0 - ad.noradrenaline * 1.2);
    if (ad.propofol > 0)
      pleth *= Math.min(1.3, 1.0 + ad.propofol * 0.05);
    const svRatio = sv / SV_BASE;
    if (svRatio < 1.0)
      pleth *= Math.max(0.1, svRatio);
    if (paw > PAW_PLETH_THRESHOLD)
      pleth *= (1.0 - Math.min(0.7, (paw - PAW_PLETH_THRESHOLD) * PAW_PLETH_PENALTY));
    pleth = Math.max(0.03, Math.min(1.5, pleth));

    upd({
      cardiacOutput:        co,
      svr:                  Math.round(dynSvr),
      cvp:                  newCVP,
      strokeVolume:         Math.round(sv),
      meanArterialPressure: map,
      systolicBP:           sbp,
      diastolicBP:          dbp,
      heartRate:            newHR,
      plethAmplitude:       Math.round(pleth * 100) / 100,
      ...this.computeTemperature(store.vitals.temperature, vol, ad.propofol, dt),
    });
  }

  /**
   * Temperatura corporal — modelo hemódinamico puro (sin fiebre séptica).
   * La fiebre la maneja PathologyEngine.
   *
   * Referencia:
   *   - Hipotermia en trauma: ATLS 11ª Ed. pág. 66 ("death triad")
   *   - Loss >30%BV (≈ Clase III) → T puede caer a 34°C o menos
   *   - Propofol: inhibición termogénesis hipótalam. (Apfel 2004, Br J Anaesth)
   *   - Recuperación termorregulatoria: constante tau ~600s (10 min)
   */
  private computeTemperature(
    currentTemp: number,
    bv:          number,
    propofol:    number,
    dt:          number,
  ): { temperature: number } {
    const pctLoss = Math.max(0, (BV_BASE - bv) / BV_BASE);

    // Hipotermia hemórragica: Clase I sin efecto, Clase III-IV hasta -3°C
    // Curva suave: sin efecto hasta 15% de pérdida, máximo en ≥50%
    const hypothermiaTarget =
      pctLoss > 0.15
        ? 37.0 - Math.min(3.0, ((pctLoss - 0.15) / 0.35) * 3.0)
        : 37.0;

    // Propofol: leve hipotermia (-0.4°C máximo a dosis altas)
    const propofolOffset = -Math.min(0.4, propofol * 0.04);

    // Target combinado (solo hipotermia aquí; la fiebre la suma PathologyEngine)
    const targetTemp = hypothermiaTarget + propofolOffset;

    // Homeostasis lenta: tau ~600s. En cada tick: drift pequeño hacia target
    const tau  = 600;
    const newT = currentTemp + (targetTemp - currentTemp) * (1 - Math.exp(-dt / tau));

    // Clampar en rango fisiologico plausible (28-41.5°C)
    const clamped = Math.max(28.0, Math.min(41.5, newT));
    return { temperature: Math.round(clamped * 10) / 10 };
  }
}