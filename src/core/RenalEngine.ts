// src/core/RenalEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Solo lee PDSystemicEffects.adhSuppression — nunca plasmaConcentrations.
//   Efectos droga-específicos modelados en DrugPDProfile.adhSuppression.
//
import { usePatientStore }      from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

const MAP_PLATEAU_MIN         = 80;
const MAP_OLIGO_TOP           = 65;
const MAP_FAILURE             = 45;
const UO_NORMAL               = 1.0;   // ml/kg/h
const UO_PLATEAU_LOW          = 0.5;
const UO_FAILURE              = 0.0;
const PRESSURE_DIURESIS_THR   = 80;
const PRESSURE_DIURESIS_COEFF = 0.008;
const K_TUBULAR               = 0.02;
const UO_MIN                  = 0.0;
const UO_MAX                  = 5.0;

// Modulación farmacológica de ADH / función tubular renal
// adhSuppression > 0 → inhibe ADH → diuresis ↑ (propofol, dex, dopamina)
// adhSuppression < 0 → libera ADH/histamina → antidiuresis (morfina, vasopresina)
// Amplitud máxima: ±0.6 ml/kg/h a magnitude 1.0
const ADH_MODULATION_AMP = 0.6;

export class RenalEngine {
  private static instance: RenalEngine | null = null;
  private constructor() {}

  public static getInstance(): RenalEngine {
    if (RenalEngine.instance === null)
      RenalEngine.instance = new RenalEngine();
    return RenalEngine.instance;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;
    const map   = v.meanArterialPressure;

    // ─── 1. UO target hemodinámico (presión-dependiente) ──────────────────────
    let uoTarget: number;

    if (map >= MAP_PLATEAU_MIN) {
      const bonus = Math.max(0, (map - PRESSURE_DIURESIS_THR) * PRESSURE_DIURESIS_COEFF);
      uoTarget = UO_NORMAL + bonus;

    } else if (map >= MAP_OLIGO_TOP) {
      const t  = (map - MAP_OLIGO_TOP) / (MAP_PLATEAU_MIN - MAP_OLIGO_TOP);
      uoTarget = UO_PLATEAU_LOW + t * (UO_NORMAL - UO_PLATEAU_LOW);

    } else if (map >= MAP_FAILURE) {
      const t      = (map - MAP_FAILURE) / (MAP_OLIGO_TOP - MAP_FAILURE);
      const smooth = t * t * (3 - 2 * t);
      uoTarget = UO_FAILURE + smooth * (UO_PLATEAU_LOW - UO_FAILURE);

    } else {
      uoTarget = UO_FAILURE;
    }

    // ─── 2. Modulación farmacológica ADH/tubular ───────────────────────────────
    // Ref: Nishina K et al. — Propofol-induced diuresis. Acta Anaesthesiol Scand 1999.
    //      Bhatt DL et al. — Dexmedetomidine renal protection. J Am Coll Cardiol 2018.
    //      Pappas MG — Morphine-induced antidiuresis via ADH release. Crit Care Med 1994.
    const { systemicEffects: pd } = usePharmacologyStore.getState();
    const adhDelta = pd.adhSuppression * ADH_MODULATION_AMP;
    // Solo aplica si hay perfusión renal mínima (no modula oliguria por shock severo)
    const mapisFused = map > MAP_FAILURE;
    if (mapisFused) {
      uoTarget = Math.max(UO_FAILURE, uoTarget + adhDelta);
    }

    // ─── 3. Nefrotoxicidad ATB → AKI → reducción GFR → oliguria ──────────────
    // Lee creatinina actual (elevada por MicrobiologyEngine.applyNephrotoxicity)
    // y aplica penalización proporcional al estadio KDIGO (2012).
    //
    // Estadios KDIGO (baseline asumido = 1.0 mg/dL):
    //   Estadio 1 (Cr ×1.5-1.9): oliguria leve (UO −15%)
    //   Estadio 2 (Cr ×2-2.9):   oliguria moderada (UO −40%)
    //   Estadio 3 (Cr ≥3 o ≥4):  oliguria severa (UO −70%)
    //
    // Ref: KDIGO Clinical Practice Guideline for AKI, Kidney Int 2012; 2 (Suppl 1).
    //      Palevsky PM: ClinicalMI-NEJM 2008 — ATB nephrotox → oliguria link.
    const creatinine    = v.creatinine ?? 1.0;
    const baselineCr    = 1.0; // mg/dL (asumido para el modelo de simulación)
    const crRatio       = creatinine / baselineCr;
    let   akiPenalty    = 0;
    if (crRatio >= 3.0) {
      akiPenalty = 0.70;              // AKI Estadio 3
    } else if (crRatio >= 2.0) {
      akiPenalty = 0.20 + (crRatio - 2.0) * 0.50; // Estadio 2: 20-70%
    } else if (crRatio >= 1.5) {
      akiPenalty = (crRatio - 1.5) * 0.40;         // Estadio 1: 0-20%
    }
    // Creatinina muy alta (≥8) → anuria casi total
    if (creatinine >= 8.0) {
      akiPenalty = 0.90;
    }
    uoTarget *= Math.max(0, 1.0 - akiPenalty);

    // ─── 4. Suavizado tubular (τ ≈ 50 s simulados) ────────────────────────────
    const newUO = Math.max(UO_MIN, Math.min(UO_MAX,
      v.urineOutput + (uoTarget - v.urineOutput) * K_TUBULAR * dt
    ));

    upd({ urineOutput: parseFloat(newUO.toFixed(2)) });
  }
}