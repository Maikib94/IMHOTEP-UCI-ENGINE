// src/core/CardiovascularEngine.ts
import { usePatientStore }    from '../store/usePatientStore';
import { usePathologyStore }  from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

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
    const upd     = store.updateVitals;
    const setBV   = store.setBloodVolume;

    // Efectos PD sistémicos (NUEVO)
    const { systemicEffects: pd } = usePharmacologyStore.getState();

    // Modificadores patológicos
    const { modifiers } = usePathologyStore.getState();
    const { svrMultiplier, hyperdynamicFactor, capillaryLeakRate } = modifiers;

    // ─── Volemia: hemorragia + fuga capilar séptica ───────────────────────
    let vol = store.bloodVolume;
    if (store.hemorrhageRate > 0) {
      vol -= store.hemorrhageRate * dt;
    }
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
    
    // Inotropismo beta-1
    sv += pd.beta1 * 8;
    sv = Math.min(130, sv);

    // ─── CVP ─────────────────────────────────────────────────────────────
    const newCVP = Math.max(0, Math.round(
      CVP_BASE + (vol - BV_BASE) / CVP_FACTOR + peepExcess * PEEP_CVP_TRANSMISSION
    ));

    // ─── Barorreflejo + taquicardia séptica ──────────────────────────────
    const hrBaseSeptic = HR_BASE * hyperdynamicFactor;
    const svDeficit    = Math.max(0, SV_BASE - sv);
    // Cronotropismo beta-1
    const targetHR     =
      hrBaseSeptic
      + (BV_BASE - vol) / HR_COMP
      + pd.beta1 * 15
      + svDeficit * 0.4;

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

    // ─── SVR dinámica ────────────────────────────────────────────────────
    const DynSvrAlpha = pd.alpha1 * 800; // Vasoconstrictores puros (Nora/Adre)
    const DynSvrVaso  = pd.vasoplegiaRev * 600; // Vasopresina/AzulMetileno
    const dynSvr  = v.baseSvr * svrMultiplier + DynSvrAlpha + DynSvrVaso;
    
    const co      = Number(((newHR * sv) / 1000).toFixed(1));
    const baseMap = Math.round((co * dynSvr) / 80 + newCVP);
    const map     = Math.round(baseMap + pd.beta1 * 2);
    const dbp     = Math.round(map - 40 / 3);
    const sbp     = Math.round(dbp + 40);

    // ─── Pleth Amplitude ─────────────────────────────────────────────────
    let pleth = 1.0;
    if (pd.alpha1 > 0)
      pleth *= Math.max(0.05, 1.0 - pd.alpha1 * 0.4);
    if (pd.sedation > 0)
      pleth *= Math.min(1.3, 1.0 + pd.sedation * 0.1);
      
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
      ...this.computeTemperature(store.vitals.temperature, vol, pd.sedation, dt),
    });
  }

  private computeTemperature(
    currentTemp: number,
    bv:          number,
    sedationLevel: number,
    dt:          number,
  ): { temperature: number } {
    const pctLoss = Math.max(0, (BV_BASE - bv) / BV_BASE);
    const hypothermiaTarget =
      pctLoss > 0.15
        ? 37.0 - Math.min(3.0, ((pctLoss - 0.15) / 0.35) * 3.0)
        : 37.0;

    // Sedación disminuye termogénesis
    const sedationOffset = -Math.min(0.5, sedationLevel * 0.2);

    const targetTemp = hypothermiaTarget + sedationOffset;
    const tau  = 600;
    const newT = currentTemp + (targetTemp - currentTemp) * (1 - Math.exp(-dt / tau));
    const clamped = Math.max(28.0, Math.min(41.5, newT));
    return { temperature: Math.round(clamped * 10) / 10 };
  }
}