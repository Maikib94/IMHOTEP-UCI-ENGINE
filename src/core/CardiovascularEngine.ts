// src/core/CardiovascularEngine.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  CardiovascularEngine — hemodinamia acoplada al motor ventilatorio
// ═══════════════════════════════════════════════════════════════════════════════
//
//  REGLA DE ARQUITECTURA:
//    Este engine SOLO lee PDSystemicEffects — NUNCA plasmaConcentrations.
//    Los efectos droga-específicos se modelan en DrugPDProfile (usePharmacologyStore).
//
//  CAMBIOS vs. versión anterior:
//    • Sección 2-3 (mecánica resp → SV) usa computeHemodynamicCoupling() del
//      VentilatorSM100Engine para incorporar TPP → PVR y Ppl → retorno venoso.
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
import { InfectoEngine } from './InfectoEngine';
import { computeHemodynamicCoupling } from './VentilatorSM100Engine';

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
//   Amplificado vs. versión anterior — hipovolemia grave + PEEP alto → colapso
const HEMO_PEEP_SYNERGY_COEFF = 0.12;   // 0.08 → 0.12
const HEMO_PEEP_SYNERGY_MAX = 0.60;   // 0.50 → 0.60

// ─── INTERACCIÓN DIRECTA PEEP → RETORNO VENOSO ───────────────────────────
//   Cada 1 cmH₂O de PEEP sobre 5 reduce el retorno venoso ~2 mL latido
//   (Jardin ICM 1992; Schmitt AJRCCM 2001)
const PEEP_VR_REDUCTION_PER_CMH2O = 0.025;   // fracción de SV por cmH₂O exceso
const PEEP_VR_THRESHOLD = 5;        // cmH₂O — por debajo sin efecto

// ─── PMEAN SOSTENIDA → GRADIENTE VENOSO (Berger AJP 2016; Vieillard-Baron ICM 2016) ─
//   Paw media > 12 cmH₂O reduce el gradiente de presión al atrio derecho
//   independientemente del PEEP (ventilación inversa, I:E alto, alta frecuencia).
//   En sepsis: vasoplejía → tono venoso ↓ → el mismo Pmean produce mayor caída SV.
const PMEAN_VR_THR  = 12;    // cmH₂O umbral fisiológico (Berger 2016)
const PMEAN_VR_K    = 0.012; // fracción SV / cmH₂O exceso
const PMEAN_VR_MAX  = 0.35;  // techo del término (35% caída SV máx)
const PMEAN_SEPSIS_AMP = 1.6;// multiplicador en sepsis activa (vasoplejía)

// ─── ACIDOSIS — penalizaciones pH continuas (Marino ICU Book 4th ed) ────────
// Función CONTINUA del pH actual → sin sticky conditionals.
// pH 7.35-7.45: sin efecto.
// pH 7.20-7.35: efecto creciente lineal.
// pH < 7.20: efecto severo escalado.
// Se resetea automáticamente cuando pH vuelve a la normalidad.
function acidosisPenalty(pH: number): { hr: number; map: number; svFactor: number } {
  if (pH >= 7.35) return { hr: 0, map: 0, svFactor: 1.0 };
  if (pH >= 7.20) {
    const f = (7.35 - pH) / 0.15;  // 0..1
    return { hr: -10 * f, map: -8 * f, svFactor: 1 - 0.15 * f };
  }
  // pH < 7.20: efecto severo
  const f = Math.min(2, (7.20 - pH) / 0.15);
  return { hr: -25 * f, map: -22 * f, svFactor: 1 - 0.40 * Math.min(1, f) };
}

// ─── ANTIARRÍTMICOS — constantes PD cronotropas (Fase 4 / v0.19) ─────────────
// Amiodarona (Vaughan-Williams III + efectos I,II,IV):
//   - Reducción máxima HR: 20% (bloqueo β + Ca²⁺ nodo AV)
//   - Hill n=2.0 → efecto gradual, sin bradicardia brusca a dosis bajas
//   - Ref: Goodman & Gilman 13ª cap. 30; Kowey JACC 2009
// Digoxina (inhibidor Na⁺/K⁺-ATPasa, potenciación vagal):
//   - Reducción máxima HR: 15% (conducción AV enlentecida)
//   - Hill n=1.5 → onset más suave, ventana terapéutica estrecha
//   - Ref: Goodman & Gilman 13ª cap. 28; Gheorghiade EHJ 2010
// Esmolol (β₁-bloqueante cardioselectivo ultrarrápido):
//   - Reducción máxima HR: 30% (β₁ selectivo, onset <5 min, offset <10 min)
//   - Hill n=1.8 → respuesta lineal-sigmoide en rango terapéutico
//   - Ref: Schwartz Am J Cardiol 1985; Reves Anesth 1984
const AMIO_MAX_HR_REDUCTION = 0.20;
const AMIO_HILL_N = 2.0;
const DIG_MAX_HR_REDUCTION = 0.15;
const DIG_HILL_N = 1.5;
const ESMOLOL_MAX_HR_REDUCTION = 0.30;
const ESMOLOL_HILL_N = 1.8;
// Sinergia amio→dig: amio inhibe P-glicoproteína → ↑ niveles digoxina ~79% AUC
//   PD: digPotentiation = 1 + 0.5×min(amioRel,1) modela sinergia nodo AV (adicional al PK)
//   Ref: Nademanee K et al., J Am Coll Cardiol 1984;4(1):111-6 (historia interacción)
//        Chen Y et al., Pharmacotherapy 2025;45(2) — PBPK validado +79% digoxin AUC
//   Nota: PK (+72% cpRatio) ya modelado via P-gp inhibition en PharmacologyEngine;
//         este 0.50 es ADICIONAL (sinergia PD nodo AV, no duplica el PK).
const AMIO_DIG_POTENTIATION = 0.50;  // digPotentiation = 1 + 0.5×min(amioRel,1)
// Techo de reducción total (amio + dig potenciada + esmolol) — seguridad clínica
const CHRONO_REDUCTION_CAP = 0.50;  // 50% cap (esmolol puede llegar más alto que v0.18)

// ─── ACP / RV dysfunction (Lanspa Chest 2020; Vallabhajosyula Chest 2021) ─
const ACP_SV_PENALTY = 0.15;   // 15% adicional si ACP confirmado
const ACP_HR_BONUS = 18;     // bpm compensación taquicárdica
const SEPSIS_RVD_SV_PENALTY = 0.08;   // RV silent dysfunction sepsis
const SEPSIS_RVD_HR_BONUS = 8;
const SEPSIS_PPLAT_AMPLIFIER = 0.0040; // por cmH₂O Pplat > 25 × severidad
const SEPSIS_PPLAT_THR = 25;

// ─── RECUPERACIÓN ANTIMICROBIANA LOGÍSTICA (Kumar CCM 2006; Rhodes SSC 2016) ─
const RECOVERY_TAU_EMPIRIC = 28800;   // ~8h
const RECOVERY_TAU_TARGETED = 14400;  // ~4h
const RECOVERY_MAP_BONUS_MAX = 12;    // mmHg max
const RECOVERY_MIN_ELAPSED = 21600;   // 6h mínimas para ver beneficio

// ─── CONSTANTES SHOCK SÉPTICO INFECTO-INDUCIDO (InfectoEngine → CardioEngine) ─
// Modelo: cobertura insuficiente por >24h → ↓inotropismo + ↑fuga capilar
// Ref: Kumar CCM 2006: mortalidad +7.6% por hora sin ATB adecuado en shock séptico
// Coeficiente de debuff inotrópico máximo aplicable al SV base
const INFECTO_INOTROPY_DEBUFF_MAX = 0.55;  // -55% SV máximo por sepsis sin cobertura
// Coeficiente de multiplicación fuga capilar sobre BV (mL → fracción BV por minuto)
const INFECTO_LEAK_SCALE = 60;             // mL/min → mL/s (dividir por 60 ya ocurre en uso)

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

    // ─── 1. VOLEMIA (Hemorragia + Fuga Capilar con curva temporal gamma) ────────
    //
    //  Fuga capilar estática anterior: lineal e indefinida → vol → 0 mL (bug).
    //
    //  Nuevo modelo gamma rise-fall (Saravi B et al., Intensive Care Med Exp 2023;11:96;
    //    Seldén D et al., Critical Care 2025; Dargent A et al., J Intensive Care 2023;11:44):
    //    - Pico de fuga a las 6h sim desde el inicio del insulto séptico.
    //    - Decae a ~30% del pico a 24h, ~10% a 48h con tratamiento óptimo.
    //    - Curva: g(t) = (x/k)^k × exp(k−x), x = t/tau, normalizada pico=1.
    //
    //  Tratamiento reduce la fuga (Hernández G, ANDROMEDA-SHOCK-2, JAMA 2025):
    //    - Control de foco: −40% de la fuga efectiva
    //    - Antibióticos adecuados: −25%
    //    - Corticoides (HC): −20%
    //    (cap combinado: −70%)
    let vol = store.bloodVolume;
    if (store.hemorrhageRate > 0) {
      vol -= store.hemorrhageRate * dt;
    }

    if (capillaryLeakRate > 0 && sepsis.isActive) {
      const LEAK_PEAK_S = 6 * 3600;   // pico a 6h sim (Saravi 2023)
      const LEAK_TAU_S  = 18 * 3600;  // tau de decaimiento 18h sim
      const elapsed     = sepsis.timeSinceOnsetS;
      const k           = LEAK_PEAK_S / LEAK_TAU_S;  // = 0.333...
      const x           = Math.max(0, elapsed) / LEAK_TAU_S;
      // Curva gamma normalizada: pico=1 en t=LEAK_PEAK_S
      const leakShape   = x > 0
        ? Math.pow(x / k, k) * Math.exp(k - x)
        : 0;

      // Bonificaciones de tratamiento
      const { systemicEffects: cp } = usePharmacologyStore.getState();
      const corticoidBonus = (cp.vasoplegiaRev > 0.05) ? 0.20 : 0;  // HC detectado
      const treatmentDecay = 1 - Math.min(0.70,
        (sepsis.sourceControlAchieved ? 0.40 : 0) +
        (sepsis.adequateAntibiotics   ? 0.25 : 0) +
        corticoidBonus,
      );

      const effectiveLeak_mLh = capillaryLeakRate * leakShape * treatmentDecay;
      if (effectiveLeak_mLh > 0) {
        vol -= (effectiveLeak_mLh / 3600) * dt;
      }
    } else if (capillaryLeakRate > 0) {
      // Fuga no-séptica (quemados, etc.): modelo lineal original
      vol -= (capillaryLeakRate / 60) * dt;
    }

    vol = Math.max(0, vol);
    setBV(vol);

    // ─── 2. MECÁNICA RESPIRATORIA ────────────────────────────────────────────
    // Fase 5: usar ventilator.pMean (escrito por RespiratoryEngine en el mismo
    // tick, después del reorder Resp → Cardio en CronosEngine).
    // Fórmula: SV_adj = SV_base × (1 − k × max(0, pMean − 5))
    //          k = 0.025  (Jardin ICM 1992; Schmitt AJRCCM 2001)
    const peep = vent.peep;
    const pmean = vent.pMean > 0 ? vent.pMean : (v.meanAirwayPressure ?? peep);
    const pplat = v.pplat || (peep + (vent.vt / LUNG_COMPLIANCE_DEFAULT) * PAW_ITT_RATIO);

    // Ppl promedio (estimación por fracción E_cw/E_tot)
    //   Paciente paralizado sin SDRA: ratio ≈ 0.7
    //   SDRA severo: pared torácica más "rígida" relativa → ratio ≈ 0.5
    //   (Talmor NEJM 2008, Vieillard-Baron ICM 2016)
    const ardsActive2  = ards.diagnosis !== 'none';
    const ardsSev2     = ards.lungInjury;
    const ratioEcw = ardsActive2 ? 0.5 - ardsSev2 * 0.15 : 0.7;
    const pplMean = Math.max(-10, ratioEcw * Math.max(0, pmean - peep) - 5);

    // ─── 3. ACOPLAMIENTO VENTILACIÓN → HEMODINAMIA (VentilatorSM100Engine) ──
    //   Vieillard-Baron ICM 2016: TPP → PVR; Ppl → retorno venoso.
    //   Berger AJP-HCP 2016: PEEP transmite ~0.5 cmH₂O/cmH₂O a CVP.
    //   Lanspa Chest 2020: ACP flag si Pplat > 27 + substrato severo.
    const coupling = computeHemodynamicCoupling({
      pMean: pmean,
      pPlat: pplat,
      pplMean,
      pplSwing: Math.max(0, pplat - pplMean),
      peep,
      ardsActive:   ardsActive2,
      ardsSeverity: ardsSev2,
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
    const sepsisAmp = (sepsis.isActive && pplat > SEPSIS_PPLAT_THR)
      ? sepsis.severity * (pplat - SEPSIS_PPLAT_THR) * SEPSIS_PPLAT_AMPLIFIER
      : 0;
    void ardsSev2; // used above

    // 4b². Reducción directa de retorno venoso por PEEP (Jardin ICM 1992)
    //   Efecto mayor en hipovolemia: paciente con BV < 4500 mL tiene poco buffer
    //   venoso para tolerar la caída del gradiente de presión venosa.
    const peepExcessVR = Math.max(0, peep - PEEP_VR_THRESHOLD);
    const peepVRPenalty = Math.min(
      0.40,
      peepExcessVR * PEEP_VR_REDUCTION_PER_CMH2O * hypoAmplifier,
    );

    // 4b³. Pmean sostenida > 12 cmH₂O → ↓ gradiente de presión venosa → ↓ VR
    //   Distinto al PEEP: aplica también en ventilación inversa (IRV), alta FR
    //   o HFNC de alta presión. Amplificado en sepsis por vasoplejía.
    //   Refs: Berger AJP-HCP 2016; Vieillard-Baron ICM 2016
    const pmeanExcess = Math.max(0, pmean - PMEAN_VR_THR);
    let pmeanVRPenalty = pmeanExcess * PMEAN_VR_K * hypoAmplifier;
    if (sepsis.isActive) pmeanVRPenalty *= PMEAN_SEPSIS_AMP;
    pmeanVRPenalty = Math.min(PMEAN_VR_MAX, pmeanVRPenalty);

    // 4b⁴. Sepsis amplifica Pmean → retorno venoso (Vieillard-Baron ICM 2016)
    //   ACP es más frecuente en sepsis con Pmean alta por vasoplejía + mayor
    //   transmisión de presión pleural con tono venoso reducido.
    const sepsisPmeanAmp = (sepsis.isActive && pmean > PMEAN_VR_THR)
      ? sepsis.severity * (pmean - PMEAN_VR_THR) * 0.012
      : 0;

    // 4c. Penalización total aplicada a SV
    // Incluye factor de contractilidad por acidosis (pH continuo — Marino ICU Book 4th ed)
    const acid = acidosisPenalty(v.pH);
    const totalSvPenalty = Math.min(
      0.85,
      (coupling.svPenalty + hemoSynergy + sepsisAmp + peepVRPenalty + pmeanVRPenalty + sepsisPmeanAmp) * hypoAmplifier,
    );
    sv = Math.max(SV_MIN, sv * (1.0 - totalSvPenalty) * acid.svFactor);
    sv += pd.beta1 * 8;  // inotropismo β₁

    // 4d. Cor Pulmonale agudo (Pplat>27 + SDRA sev o sepsis+SDRA)
    let corPulmonaleSvrFactor = 1.0;
    let corPulmonaleHrBonus = 0;
    if (coupling.acpHighRisk) {
      sv *= (1 - ACP_SV_PENALTY);
      corPulmonaleSvrFactor = 0.85;
      corPulmonaleHrBonus = ACP_HR_BONUS;
    } else if (ardsActive2 && ards.lungInjury >= 0.6) {
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

    // 4f. INFECTO — cobertura insuficiente >24hs → ↓inotropismo + ↑fuga capilar
    //     Motor InfectoEngine calcula debuffs basados en cobertura antibiótica empírica.
    //     Ref: Kumar CCM 2006; SSC Bundle 2025
    if (sepsis.isActive) {
      const infectoEngine = InfectoEngine.getInstance();
      const inotropyDebuff = infectoEngine.getInotropyDebuff();   // 0–0.6
      const capLeakDebuff = infectoEngine.getCapillaryLeakDebuff(); // 0–5 mL/min

      // Reducción directa del SV por colapso inotrópico séptico
      if (inotropyDebuff > 0) {
        const debuffFraction = Math.min(INFECTO_INOTROPY_DEBUFF_MAX, inotropyDebuff);
        sv = Math.max(SV_MIN, sv * (1 - debuffFraction));
        corPulmonaleHrBonus += Math.round(debuffFraction * 40); // taquicardia compensatoria
      }

      // Fuga capilar adicional → reduce BV → reduce precarga (ya se procesa en vol)
      if (capLeakDebuff > 0) {
        const extraLeakPerSec = capLeakDebuff / INFECTO_LEAK_SCALE; // mL/s
        vol = Math.max(0, vol - extraLeakPerSec * dt);
        setBV(vol);
      }
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

    // acid.hr is negative for low pH — continuous function, resets when pH normalizes
    const targetHR =
      hrBaseSeptic
      + (BV_BASE - vol) / HR_COMP
      + pd.beta1 * 15
      + svDeficit * 0.4
      + pd.hrDirectDelta
      + pd.vagolytic * 8
      + hypoxicDriveHR
      + corPulmonaleHrBonus
      + acid.hr;

    // Efecto cronotropo negativo de antiarrítmicos (Fase 4)
    // Aplicado multiplicativamente sobre targetHR (no sobre la acumulación de ruido)
    const chronoFactor = this.computeChronotropicEffect();
    const targetHRAdjusted = targetHR * chronoFactor;

    this.noiseTimer += dt;
    let newHR = v.heartRate;

    if (this.noiseTimer >= NOISE_INT) {
      this.noiseTimer = 0;
      this.pendingNoise = Math.random() * 2 - 1;
      const drift = (targetHRAdjusted - v.heartRate) * HR_HOMEO;
      newHR = Math.round(
        Math.max(HR_MIN, Math.min(HR_MAX, v.heartRate + this.pendingNoise + drift))
      );
    }

    // ─── 7. RESISTENCIA VASCULAR, GASTO CARDÍACO Y PAM ─────────────────────
    //
    //  Modulación por comorbilidades del perfil de paciente:
    //    HTA crónica: downregulation receptor α₁ → requiere ~25% más nora
    //      Ref: Russell ICM 2019 (vasopressor therapy in chronic hypertension)
    //    Enfermedad coronaria: vasospasmo coronario + rigidez → −10% α₁
    //    Edad: ↓ vasoconstricción α₁ 30-50% en >60a (−0.5%/año desde 50a, cap 25%)
    //      Ref: Dinenno FA et al., Circulation 2002;106:1349-54
    //      Ref: BIBLIOGRAPHY_DELTA.md §1.2 (implementado 2026-04-29)
    //
    const patProfile   = store.profile;
    const comorbIds    = patProfile?.comorbidityIds ?? [];
    const htaCronica   = comorbIds.includes('hta');
    const stentsCor    = comorbIds.includes('stents_cor');
    const age          = patProfile?.age ?? 55;
    // Age-based additive penalty: −0.5%/año >50a, capped at −25%
    // Replaces previous frailty-multiplicative term (frailtyContinuous already encodes age)
    const agePenalty   = Math.min(0.25, 0.005 * Math.max(0, age - 50));
    const alphaResponseGain = Math.max(0.20,
      1.0
      - (htaCronica ? 0.25 : 0)  // HTA crónica: rigidez + downreg α1
      - (stentsCor  ? 0.10 : 0)  // CAD: disfunción endotelial
      - agePenalty,               // −0.5%/año >50a, cap 25% (Dinenno 2002)
    );

    const DynSvrAlpha = pd.alpha1 * 800 * Math.max(0.30, alphaResponseGain);
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

    // acid.map is negative for low pH; recovers automatically when pH normalizes.
    const map = Math.max(0, Math.round(
      baseMap
      + pd.beta1 * 2
      + pd.mapDirectDelta
      + mapRecoveryBonus
      + acid.map
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

    // ─── 10. GEDI continua (Sakka SG ICM 2000; Reuter ICM 2010) ──────────────────
    //   GEDI normal 680-800 mL/m². Estimación continua desde bloodVolume y BSA.
    const profileCV    = store.profile;
    const bsaCV        = Math.max(1.0, profileCV?.bsaMosteller ?? 1.7);
    const volFracCV    = Math.max(0.4, Math.min(1.5, vol / 5000));
    const gediContinua = Math.round(740 * volFracCV / bsaCV * 1.7);

    // ─── 10b. EVLWI continua — descongestión pulmonar por furosemida ──────────
    // Schmidt GA et al. Crit Care 2018;22:113. DOI: 10.1186/s13054-018-2019-8
    // Furosemida activa + EVLWI > 7 mL/kg → descenso ~0.0008 mL/kg/h por segundo.
    const currentEvlwi = isFinite(v.evlwi) ? v.evlwi : 5.0;
    const furoActive   = pd.diureticEffect > 0;
    const newEvlwi = furoActive && currentEvlwi > 7
      ? Math.max(5.0, currentEvlwi - 0.0008 * dt)
      : currentEvlwi;

    // ─── 11. ACTUALIZACIÓN DEL STORE ───────────────────────────────────────
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
      gedi: gediContinua,
      evlwi: Math.round(newEvlwi * 100) / 100,
      ...this.computeTemperature(v.temperature, vol, pd.thermoDepression, dt),
    });
  }

  // ─── ANTIARRÍTMICOS — Respuesta cronotropa sigmoide (Fase 4) ─────────────────
  //
  //  hillResponse(cRel, eMax, n):
  //    cRel = 0 → efecto ≈ 0
  //    cRel = 1 → efecto ≈ 0.5 × eMax   (EC50 = concentración terapéutica)
  //    cRel >> 1 → efecto → eMax         (saturación)
  //
  private hillResponse(cRel: number, eMax: number, n: number): number {
    const c = Math.max(0, cRel);
    return eMax * (Math.pow(c, n) / (1 + Math.pow(c, n)));
  }

  //  computeChronotropicEffect():
  //    Lee plasmaConcentrations del store farmacológico (cpRatio normalizado).
  //    cpRatio = 1.0 ≡ concentración terapéutica de referencia por droga.
  //    Retorna factor multiplicador sobre targetHR (1.0 = sin cambio, <1.0 = ↓HR).
  //    Sinergia amio→dig: potenciación por inhibición P-glicoproteína (spec v0.19).
  //    Esmolol: efecto aditivo, sin multiplicación (mecanismo distinto, Reves 1984).
  //
  private computeChronotropicEffect(): number {
    const cp = usePharmacologyStore.getState().plasmaConcentrations;
    const amioRel = cp['amiodarone'] ?? 0;
    const digRel = cp['digoxin'] ?? 0;
    const esmolRel = cp['esmolol'] ?? 0;

    const amioEffect = this.hillResponse(amioRel, AMIO_MAX_HR_REDUCTION, AMIO_HILL_N);
    const digEffect = this.hillResponse(digRel, DIG_MAX_HR_REDUCTION, DIG_HILL_N);
    const esmolEffect = this.hillResponse(esmolRel, ESMOLOL_MAX_HR_REDUCTION, ESMOLOL_HILL_N);

    // Potenciación dig por amio: digPotentiation = 1 + 0.5×min(amioRel,1)
    // Ref: Nademanee AmHeartJ 1984; Hohnloser ClinPharmacol 1987
    const digPotentiation = 1 + AMIO_DIG_POTENTIATION * Math.min(1, amioRel);

    // Esmolol aditivo (no multiplicativo — mecanismo β-bloqueante vs. canal iónico)
    const totalReduction = Math.min(
      CHRONO_REDUCTION_CAP,
      amioEffect + digEffect * digPotentiation + esmolEffect,
    );
    return 1 - totalReduction;
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
