// src/core/CardiovascularEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Este engine SOLO lee PDSystemicEffects — NUNCA plasmaConcentrations.
//   Los efectos droga-específicos se modelan en DrugPDProfile (usePharmacologyStore).
//   Esto garantiza que añadir nuevas drogas no requiera tocar este archivo.
//
import { usePatientStore }      from '../store/usePatientStore';
import { usePathologyStore }    from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';

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

// Constantes de recuperación logística por tratamiento antimicrobiano eficaz.
// La recuperación hemodinámica (MAP) tarda mínimo 6h simuladas, máximo 24h.
// Modelo: progresión logística con τ dependiente de la eficacia del tratamiento.
// Ref: Rhodes A (Surviving Sepsis 2016) — vasopressor weaning after source control.
const RECOVERY_TAU_EMPIRIC = 28800;  // τ empírico: ~8h (21600–43200 s rango clínico)
const RECOVERY_TAU_TARGETED = 14400; // τ dirigido: ~4h (más rápido con antibiograma)
const RECOVERY_MAP_BONUS_MAX = 12;   // mmHg de recuperación MAP máxima vs sepsis severa
const RECOVERY_MIN_ELAPSED   = 21600; // 6h simuladas mínimas antes de beneficio visible

export class CardiovascularEngine {
  private static instance: CardiovascularEngine | null = null;
  private noiseTimer:          number = 0;
  private pendingNoise:        number = 0;
  // Progreso logístico de recuperación por ATB eficaz (0–1)
  private treatmentRecovery:   number = 0;
  private recoveryElapsed:     number = 0;

  private constructor() {}

  public static getInstance(): CardiovascularEngine {
    if (CardiovascularEngine.instance === null)
      CardiovascularEngine.instance = new CardiovascularEngine();
    return CardiovascularEngine.instance;
  }

  public updateHemodynamics(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;
    const setBV = store.setBloodVolume;

    // Solo leer PDSystemicEffects — nunca plasmaConcentrations aquí.
    // Los efectos droga-específicos están encapsulados en DrugPDProfile.
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
    sv += pd.beta1 * 8;   // inotropismo β₁
    sv  = Math.min(130, sv);

    // ─── CVP ─────────────────────────────────────────────────────────────
    const newCVP = Math.max(0, Math.round(
      CVP_BASE + (vol - BV_BASE) / CVP_FACTOR + peepExcess * PEEP_CVP_TRANSMISSION
    ));

    // ─── FC target (barorreflejo + farmacología) ──────────────────────────
    // pd.hrDirectDelta: efecto cronotrópico neto acumulado de todos los fármacos
    //   Incluye: bradicardia por dex/opioides, taquicardia por ketamina/pancuronio, etc.
    // pd.vagolytic: efecto vagolítico (pancuronio) o vagotónico (opioides) neto.
    //   Positivo → ↑FC (pancuronio), negativo ya absorbido en hrDirectDelta.
    const hrBaseSeptic = HR_BASE * hyperdynamicFactor;
    const svDeficit    = Math.max(0, SV_BASE - sv);
    const targetHR =
      hrBaseSeptic
      + (BV_BASE - vol) / HR_COMP
      + pd.beta1 * 15
      + svDeficit * 0.4
      + pd.hrDirectDelta          // ← todos los efectos cronotropos del catálogo
      + pd.vagolytic * 8;         // ← vagólisis (pancuronio) extra si positivo

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
    const DynSvrAlpha = pd.alpha1 * 800;       // vasoconstrictores α₁
    const DynSvrVaso  = pd.vasoplegiaRev * 600; // vasopresina/azul metileno
    const dynSvr  = v.baseSvr * svrMultiplier + DynSvrAlpha + DynSvrVaso;

    const co      = Number(((newHR * sv) / 1000).toFixed(1));
    const baseMap = Math.round((co * dynSvr) / 80 + newCVP);

    // ─── Recuperación hemodinámica logística por antimicrobianos eficaces ───
    // Cuando el tratamiento ATB tiene eficacia 'empiric_match' o 'targeted',
    // se modela la resolución progresiva de la vasoplegia séptica con curva
    // logística. El beneficio no aparece antes de las 6h simuladas (RECOVERY_MIN_ELAPSED)
    // y alcanza el máximo alrededor de 12-24h.
    // Ref: Kumar A (Crit Care Med 2006) — hour-1 ATB improves survival.
    //      Morales IJ (ICM 2013) — time to MAP recovery correlates with ATB timing.
    const { treatmentEfficacy } = useMicrobiologyStore.getState();
    const isEffective = treatmentEfficacy === 'targeted' || treatmentEfficacy === 'empiric_match';

    if (isEffective) {
      this.recoveryElapsed += dt;
      const tau = treatmentEfficacy === 'targeted' ? RECOVERY_TAU_TARGETED : RECOVERY_TAU_EMPIRIC;
      // Curva logística: progresión lenta inicial, aceleración media, meseta tardía
      const x = (this.recoveryElapsed - RECOVERY_MIN_ELAPSED) / tau;
      this.treatmentRecovery = Math.max(0, Math.min(1, 1 / (1 + Math.exp(-x))));
    } else {
      // Sin cobertura eficaz → revertir recuperación exponencialmente
      this.treatmentRecovery = Math.max(0, this.treatmentRecovery - 0.0001 * dt);
      if (treatmentEfficacy === 'none' || treatmentEfficacy === 'mismatch') {
        this.recoveryElapsed = 0;
      }
    }

    const mapRecoveryBonus = Math.round(this.treatmentRecovery * RECOVERY_MAP_BONUS_MAX);

    // ─── PAM: delta directo acumulado del catálogo ───────────────────────
    // pd.mapDirectDelta: suma de todos los efectos vasodilatadores/vasoconstrictores
    // directos declarados en DrugPDProfile.mapDirect de cada fármaco activo.
    // Ya incluye: propofol, midazolam, dex, morfina, ketamina, tiopental, etc.
    const map = Math.max(0, Math.round(
      baseMap
      + pd.beta1 * 2
      + pd.mapDirectDelta    // ← todos los efectos directos de PAM del catálogo
      + mapRecoveryBonus     // ← recuperación logística por ATB eficaz (0–12 mmHg)
    ));
    const dbp = Math.round(map - 40 / 3);
    const sbp = Math.round(dbp + 40);

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
      ...this.computeTemperature(store.vitals.temperature, vol, pd.thermoDepression, dt),
    });
  }

  // ─── Temperatura ──────────────────────────────────────────────────────────
  // Modelo mejorado con thermoDepression del catálogo PD:
  //   • Propofol 4mg/kg/h (Cp=1) → thermoDepr ≈ 0.6 → objetivo −1.2°C
  //   • Midazolam → thermoDepr ≈ 0.3 → objetivo −0.6°C
  //   • Ketamina → thermoDepr negativo ≈ −0.15 → conserva calor
  //   • Fentanilo → thermoDepr ≈ 0.2 → objetivo −0.4°C
  // Ref: Sessler DI — Mild Perioperative Hypothermia. NEJM 1997.
  //      Matsukawa T et al. — Propofol linearly reduces threshold and gain.
  //      Anesthesiology 1995;83(5):1169-79.
  private computeTemperature(
    currentTemp:     number,
    bv:              number,
    thermoDepression: number,  // neto del catálogo: 0–1 hipotermia, negativo = ketamina
    dt:              number,
  ): { temperature: number } {
    // Hipotermia por hemorragia (pérdida de calor + disminución perfusión periférica)
    const pctLoss = Math.max(0, (BV_BASE - bv) / BV_BASE);
    const hemorrHypothermia =
      pctLoss > 0.15
        ? Math.min(3.0, ((pctLoss - 0.15) / 0.35) * 3.0)
        : 0;

    // Hipotermia farmacológica: thermoDepression 0–1 → hasta −2.0°C
    // Valores negativos (ketamina) → preservan temperatura (offset positivo leve)
    const pharmOffset = thermoDepression * -2.0;  // +1 = −2°C, −0.15 = +0.3°C

    const targetTemp = 37.0 - hemorrHypothermia + pharmOffset;

    // τ = 600s simulados → suavizado lento (cambio de temperatura es gradual)
    const tau  = 600;
    const newT = currentTemp + (targetTemp - currentTemp) * (1 - Math.exp(-dt / tau));
    return { temperature: Math.round(Math.max(28.0, Math.min(41.5, newT)) * 10) / 10 };
  }
}