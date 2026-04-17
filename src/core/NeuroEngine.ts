// src/core/NeuroEngine.ts
//
// Modelo neurológico integrado: GCS, pupilas e ICP (Doctrina de Monroe-Kelly).
// REGLA DE ARQUITECTURA: Solo lee PDSystemicEffects — nunca plasmaConcentrations.
//
import { usePatientStore }      from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import type { PupilState }      from '../store/usePatientStore';

// ─── GCS: umbrales MAP ────────────────────────────────────────────────────────
const MAP_MILD    = 65;
const MAP_MOD     = 50;
const MAP_SEVERE  = 40;

// ─── GCS: umbrales SpO2 ───────────────────────────────────────────────────────
const SPO2_MILD   = 90;  const SPO2_D_MILD   = 2;
const SPO2_MOD    = 80;  const SPO2_D_MOD    = 4;
const SPO2_SEVERE = 70;  const SPO2_D_SEVERE = 6;

// ─── GCS: umbrales sedación ───────────────────────────────────────────────────
const SED_MILD    = 0.3;
const SED_MOD     = 0.7;
const SED_COMA    = 1.1;

const GCS_MAX  = 15;
const GCS_MIN  = 3;
const K_GCS    = 0.08;

// ─── ICP: Doctrina de Monroe-Kelly ───────────────────────────────────────────
// V_craneal = V_cerebro + V_sangre + V_LCR = constante
// ICP resultante = f(PaCO₂, CPP, CMRO₂, temperatura, edema)
//
// Referencias:
//   Monroe-Kelly doctrine: Kellie G. (1824), Monroe A. (1783)
//   CO₂ reactivity: Powers JD et al., Neurosurgery 2020
//   CMRO₂/sedation: Coles JP et al., BJA 2006 (propofol); Drummond JC, Anesthesiology 2019
//   Temperature: Clifton GL et al., NEJM 2001; Rango-Castillo, Neurosurg Clin 2008
//   CPP autorregulación: Steiner LA et al., Stroke 2002; SSC CPP target ≥60 mmHg
//
const ICP_NORMAL      = 12;    // mmHg — valor de referencia adulto sano
const ICP_MIN         = 3;     // mmHg — límite fisiológico inferior
const ICP_MAX         = 60;    // mmHg — herniation territory
const K_ICP           = 0.015; // τ ≈ 67s simulados — cambios graduales de PIC

// CO₂ reactivity (reactividad cerebrovascular)
// Hiperventilación terapéutica: PaCO₂ < 35 → vasoconstricción → ↓ VCC → ↓ PIC
// Hipercapnia: PaCO₂ > 45 → vasodilatación → ↑ VCC → ↑ PIC
const PACO2_LOW_THR   = 35;    // mmHg umbral vasoconstricción
const PACO2_HIGH_THR  = 45;    // mmHg umbral vasodilatación
const CO2_DILAT_COEFF = 1.8;   // mmHg ICP por mmHg PaCO₂ sobre 45 (Powers 2020)
const CO2_CONST_COEFF = 0.5;   // mmHg ICP por mmHg PaCO₂ bajo 35 (techo: no más de −5 mmHg)
const CO2_CONST_MAX   = 5;     // reducción máxima por hiperventilación
const CO2_DILAT_MAX   = 18;    // aumento máximo por hipercapnia

// CMRO₂: efecto de sedación (propofol, barbitúricos, benzodiazepinas)
// Propofol CMRO₂ ↓40% → PIC ↓4-6 mmHg (Coles JP, BJA 2006)
// pd.sedation [0-2] → reducción 0-6 mmHg; saturado a pd=1 da máximo beneficio
const SEDATION_ICP_MAX_REDUCTION = 7.0; // mmHg máx reducción a sedación plena

// Temperatura (hipotermia terapéutica)
// Cada 1°C ↓ debajo de 37 → CMRO₂ ↓7% → CBF ↓ → PIC ↓ ~0.8 mmHg
// Ref: Clifton GL NEJM 2001; Polderman KH, Crit Care Med 2004
const TEMP_ICP_COEFF  = 0.8;

// CPP / autorregulación (Steiner 2002, SSC target CPP ≥60 mmHg)
// Bajo límite inferior de autorregulación (≈50 mmHg) → CBF = f(MAP) pasivo
// → MAP↓ → CBF↓ → hipoxia → vasorelajación → ↑ PIC (edema vasogénico)
const CPP_AUTOREG_THR = 50;    // mmHg umbral inferior
const CPP_BREAK_COEFF = 0.35;  // PIC↑ por cada mmHg de CPP bajo umbral

// Reflejo de Cushing (ICP > 30 mmHg → PAM↑ + FC↓ + alt. resp)
// Modeled here as ICP contribution — CV response modeled in CardiovascularEngine
const CUSHING_ICP_THR = 30;    // mmHg umbral activación reflejo

export class NeuroEngine {
  private static instance: NeuroEngine | null = null;
  private gcsFloat: number = GCS_MAX;
  private icpFloat: number = ICP_NORMAL;

  private constructor() {}

  public static getInstance(): NeuroEngine {
    if (NeuroEngine.instance === null)
      NeuroEngine.instance = new NeuroEngine();
    return NeuroEngine.instance;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;

    const { systemicEffects: pd } = usePharmacologyStore.getState();

    // ─── GCS ──────────────────────────────────────────────────────────────────
    // Sedación profunda: efecto inmediato (coma farmacológico)
    if (pd.sedation >= SED_COMA) {
      this.gcsFloat = GCS_MIN;
      const newIcp  = this.computeICP(v, pd, dt); // ICP sigue calculando aunque esté en coma
      upd({ gcs: GCS_MIN, pupilState: 'miotic' as PupilState, icp: newIcp });
      return;
    }

    // 1. MAP → GCS directo (hipoperfusión cerebral — Guyton §62)
    const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
    let gcsFromMAP = GCS_MAX;
    if (map < MAP_SEVERE) {
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((MAP_SEVERE - map) / 2) - 8);
    } else if (map < MAP_MOD) {
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((50 - map) / 2));
    } else if (map < MAP_MILD) {
      gcsFromMAP = GCS_MAX - 2;
    }

    // 2. SpO₂ → penalización
    const spo2 = isFinite(v.spo2) ? v.spo2 : 98;
    let spo2Pen = 0;
    if      (spo2 < SPO2_SEVERE) spo2Pen = SPO2_D_SEVERE;
    else if (spo2 < SPO2_MOD)    spo2Pen = SPO2_D_MOD;
    else if (spo2 < SPO2_MILD)   spo2Pen = SPO2_D_MILD;

    // 3. Sedación → penalización
    let sedPen = 0;
    if      (pd.sedation >= SED_MOD)  sedPen = 7;
    else if (pd.sedation >= SED_MILD) sedPen = 3;

    // 4. ICP elevada → penalización GCS (herniación)
    const currentICP = isFinite(v.icp) ? v.icp : ICP_NORMAL;
    let icpPen = 0;
    if      (currentICP > 40) icpPen = 8;
    else if (currentICP > 30) icpPen = 5;
    else if (currentICP > 20) icpPen = 2;

    const gcsTgt = Math.max(GCS_MIN, gcsFromMAP - spo2Pen - sedPen - icpPen);

    if (Math.abs(this.gcsFloat - v.gcs) > 3) this.gcsFloat = v.gcs;
    this.gcsFloat = Math.max(GCS_MIN, Math.min(GCS_MAX,
      this.gcsFloat + (gcsTgt - this.gcsFloat) * K_GCS * dt
    ));
    const newGCS = Math.round(this.gcsFloat);

    // 5. Pupilas
    let pupilState: PupilState;
    if      (pd.sedation >= SED_MILD) pupilState = 'miotic';
    else if (currentICP > 30)         pupilState = 'unreactive'; // herniación
    else if (newGCS <= 8)             pupilState = 'unreactive';
    else if (newGCS <= 12)            pupilState = 'sluggish';
    else                              pupilState = 'reactive';

    // ─── ICP (Monroe-Kelly) ────────────────────────────────────────────────────
    const newIcp = this.computeICP(v, pd, dt);

    upd({ gcs: newGCS, pupilState, icp: newIcp });
  }

  // ─── Modelo ICP Monroe-Kelly ────────────────────────────────────────────────
  //
  // El volumen intracraneal es fijo (adulto, cráneo cerrado).
  // Cualquier incremento de uno de los tres compartimentos (cerebro, sangre, LCR)
  // debe ser compensado por reducción de otro → si se agota el LCR compensador,
  // la PIC sube exponencialmente (curva presión-volumen de Ryder / Lundberg).
  //
  private computeICP(
    v:  ReturnType<typeof usePatientStore.getState>['vitals'],
    pd: ReturnType<typeof usePharmacologyStore.getState>['systemicEffects'],
    dt: number
  ): number {
    const map     = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
    const paCO2   = isFinite(v.paCO2)   ? v.paCO2   : 40;
    const temp    = isFinite(v.temperature) ? v.temperature : 37;
    const currIcp = isFinite(v.icp) ? v.icp : ICP_NORMAL;

    // ── 1. Reactividad CO₂ (vasoreactividad cerebrovascular) ─────────────────
    // PaCO₂ modula el tono arteriolar cerebral → cambia el volumen sanguíneo
    // intracraneal (VSC) → afecta directamente la PIC.
    let co2Effect = 0;
    if (paCO2 > PACO2_HIGH_THR) {
      // Hipercapnia: vasodilatación → ↑ VSC → ↑ PIC
      co2Effect = Math.min(CO2_DILAT_MAX, (paCO2 - PACO2_HIGH_THR) * CO2_DILAT_COEFF);
    } else if (paCO2 < PACO2_LOW_THR) {
      // Hiperventilación terapéutica: vasoconstricción → ↓ VSC → ↓ PIC
      // Nota clínica: efecto transitorio (≤3h, pH normaliza); no usar de rutina (SSC 2022)
      co2Effect = -Math.min(CO2_CONST_MAX, (PACO2_LOW_THR - paCO2) * CO2_CONST_COEFF);
    }

    // ── 2. CMRO₂ por sedación → ↓ CBF → ↓ VSC → ↓ PIC ──────────────────────
    // Propofol/barbitúricos: reducen CMRO₂ → acoplamiento NVU → CBF↓ → PIC ↓
    // pd.sedation [0-2] → beneficio saturado: pd≥1 da la máxima reducción
    const sedEffect = -Math.min(SEDATION_ICP_MAX_REDUCTION, pd.sedation * 3.5);

    // ── 3. Temperatura — hipotermia ↓ CMRO₂ → ↓ PIC ──────────────────────────
    // Cada 1°C ↓ bajo 37°C reduce CMRO₂ ~7% → CBF↓ → PIC ↓ ~0.8 mmHg
    // Efecto inverso en hipertermia: cada 1°C ↑ sobre 38 → PIC ↑
    const tempEffect = (temp <= 37 ? -1 : +1) * Math.abs(37 - temp) * TEMP_ICP_COEFF;

    // ── 4. CPP y fallo de autorregulación ─────────────────────────────────────
    // CPP = PAM − PIC. Si CPP < 50 mmHg (Steiner 2002):
    // → Vasodilatación pasiva (intento de mantener CBF) → ↑ VSC → ↑ PIC
    // → Círculo vicioso: PIC↑ → CPP↓ → PIC↑↑ (herniation cascade)
    const cpp = map - currIcp;
    let cppEffect = 0;
    if (cpp < CPP_AUTOREG_THR) {
      cppEffect = Math.min(8, (CPP_AUTOREG_THR - cpp) * CPP_BREAK_COEFF);
    }

    // ── 5. ICP target (Monroe-Kelly resultante) ────────────────────────────────
    const icpTarget = Math.max(ICP_MIN, Math.min(ICP_MAX,
      ICP_NORMAL + co2Effect + sedEffect + tempEffect + cppEffect
    ));

    // ── 6. Suavizado exponencial (τ = 67s simulados → cambio progresivo) ──────
    this.icpFloat = Math.max(ICP_MIN, Math.min(ICP_MAX,
      this.icpFloat + (icpTarget - this.icpFloat) * K_ICP * dt
    ));

    return Math.round(this.icpFloat * 10) / 10;
  }
}