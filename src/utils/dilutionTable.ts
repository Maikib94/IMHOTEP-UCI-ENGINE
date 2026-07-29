// src/utils/dilutionTable.ts
//
// Diluciones estándar UCI y conversión dosis médica → cc/h.
//
// Fuentes: Manual de Diluciones SADI 2020; Marino's ICU Book 4th ed;
//          Sanford Guide 2024; Goodman & Gilman 13ª ed.

import type { DrugId } from '../store/usePharmacologyStore';

export type DrugUnit =
  | 'mcg/kg/min' | 'mcg/min' | 'mg/h' | 'mg/kg/h'
  | 'mcg/kg/h'   | 'UI/h'    | 'U/h'  | 'mg/kg/min';

export interface DilutionStandard {
  drug:                    DrugId;
  concentration_mg_mL:     number;  // mg droga / mL solución final
  defaultDiluentVol_mL:    number;
  notes:                   string;
}

// concentration_mg_mL = dosis_total_mg / volumen_final_mL
export const DILUTION_STANDARDS: Partial<Record<DrugId, DilutionStandard>> = {
  // ── VASOPRESORES ──────────────────────────────────────────────────────────
  noradrenaline: {
    drug: 'noradrenaline',
    concentration_mg_mL: 0.064,      // 16 mg / 250 mL SF → 64 mcg/mL
    defaultDiluentVol_mL: 250,
    notes: '16 mg en 250 mL SF 0.9% → 64 mcg/mL',
  },
  adrenaline: {
    drug: 'adrenaline',
    concentration_mg_mL: 0.040,      // 10 mg / 250 mL → 40 mcg/mL
    defaultDiluentVol_mL: 250,
    notes: '10 mg en 250 mL SF 0.9% → 40 mcg/mL',
  },
  vasopressin: {
    drug: 'vasopressin',
    concentration_mg_mL: 0.0002,     // 20 UI / 100 mL → 0.2 UI/mL (trat como mg virtual)
    defaultDiluentVol_mL: 100,
    notes: '20 UI en 100 mL SF → 0.2 UI/mL',
  },
  dopamine: {
    drug: 'dopamine',
    concentration_mg_mL: 1.6,        // 400 mg / 250 mL
    defaultDiluentVol_mL: 250,
    notes: '400 mg en 250 mL → 1.6 mg/mL',
  },
  // ── INOTRÓPICOS ──────────────────────────────────────────────────────────
  dobutamine: {
    drug: 'dobutamine',
    concentration_mg_mL: 1.0,        // 250 mg / 250 mL
    defaultDiluentVol_mL: 250,
    notes: '250 mg en 250 mL → 1 mg/mL',
  },
  milrinone: {
    drug: 'milrinone',
    concentration_mg_mL: 0.2,        // 50 mg / 250 mL → 0.2 mg/mL
    defaultDiluentVol_mL: 250,
    notes: '50 mg en 250 mL Dx5% → 0.2 mg/mL',
  },
  levosimendan: {
    drug: 'levosimendan',
    concentration_mg_mL: 0.025,      // 12.5 mg / 500 mL → 0.025 mg/mL
    defaultDiluentVol_mL: 500,
    notes: '12.5 mg en 500 mL Dx5% → 0.025 mg/mL',
  },
  // ── SEDANTES ─────────────────────────────────────────────────────────────
  propofol: {
    drug: 'propofol',
    concentration_mg_mL: 10.0,       // emulsión 1% (premezclado)
    defaultDiluentVol_mL: 50,
    notes: 'Emulsión 1% = 10 mg/mL · no diluir',
  },
  midazolam: {
    drug: 'midazolam',
    concentration_mg_mL: 1.0,        // 50 mg / 50 mL SF → 1 mg/mL
    defaultDiluentVol_mL: 50,
    notes: '50 mg en 50 mL SF → 1 mg/mL',
  },
  dexmedetomidine: {
    drug: 'dexmedetomidine',
    concentration_mg_mL: 0.004,      // 400 mcg / 100 mL → 4 mcg/mL
    defaultDiluentVol_mL: 100,
    notes: '400 mcg en 100 mL SF → 4 mcg/mL',
  },
  // ── ANALGÉSICOS ──────────────────────────────────────────────────────────
  morphine: {
    drug: 'morphine',
    concentration_mg_mL: 1.0,        // 50 mg / 50 mL SF
    defaultDiluentVol_mL: 50,
    notes: '50 mg en 50 mL SF → 1 mg/mL',
  },
  fentanyl: {
    drug: 'fentanyl',
    concentration_mg_mL: 0.01,       // 2.5 mg (50 amp 50 mcg) / 250 mL → 10 mcg/mL
    defaultDiluentVol_mL: 250,
    notes: '2.5 mg en 250 mL SF → 10 mcg/mL',
  },
  remifentanil: {
    drug: 'remifentanil',
    concentration_mg_mL: 0.05,       // 5 mg / 100 mL SF → 50 mcg/mL
    defaultDiluentVol_mL: 100,
    notes: '5 mg en 100 mL SF → 50 mcg/mL',
  },
  // ── ANTIARRÍTMICOS IV ────────────────────────────────────────────────────
  amiodarone: {
    drug: 'amiodarone',
    concentration_mg_mL: 1.8,        // 900 mg / 500 mL Dx5%
    defaultDiluentVol_mL: 500,
    notes: '900 mg en 500 mL Dx5% → 1.8 mg/mL (no SF)',
  },
  // ── DIURÉTICOS ───────────────────────────────────────────────────────────
  furosemide_iv: {
    drug: 'furosemide_iv',
    concentration_mg_mL: 1.0,        // 250 mg / 250 mL SF
    defaultDiluentVol_mL: 250,
    notes: '250 mg en 250 mL SF → 1 mg/mL',
  },
  // ── INSULINA ─────────────────────────────────────────────────────────────
  insulin_regular_iv: {
    drug: 'insulin_regular_iv',
    concentration_mg_mL: 0.001,      // 100 UI / 100 mL SF → 1 UI/mL (mg virtual)
    defaultDiluentVol_mL: 100,
    notes: '100 UI en 100 mL SF → 1 UI/mL',
  },
  // ── BNM (Bloqueantes neuromusculares) ────────────────────────────────────
  rocuronium: {
    drug: 'rocuronium',
    concentration_mg_mL: 10.0,       // 200 mg / 20 mL → 10 mg/mL (estándar UCI)
    defaultDiluentVol_mL: 20,
    notes: '200 mg en 20 mL → 10 mg/mL',
  },
  atracurium: {
    drug: 'atracurium',
    concentration_mg_mL: 1.0,        // 25 mg / 25 mL SF → 1 mg/mL
    defaultDiluentVol_mL: 25,
    notes: '25 mg en 25 mL SF → 1 mg/mL',
  },
  cisatracurium: {
    drug: 'cisatracurium',
    concentration_mg_mL: 2.0,        // 20 mg / 10 mL → 2 mg/mL (standard premix)
    defaultDiluentVol_mL: 10,
    notes: '20 mg en 10 mL → 2 mg/mL',
  },
  pancuronium: {
    drug: 'pancuronium',
    concentration_mg_mL: 0.2,        // 10 mg / 50 mL SF → 0.2 mg/mL
    defaultDiluentVol_mL: 50,
    notes: '10 mg en 50 mL SF → 0.2 mg/mL',
  },
  // ── HIPEROSMOLAR ─────────────────────────────────────────────────────────
  // Manitol: se administra como bolus (g/kg); cc/h relevante durante la infusión de 15 min
  mannitol: {
    drug: 'mannitol',
    concentration_mg_mL: 150.0,      // Manitol 15% = 150 mg/mL
    defaultDiluentVol_mL: 0,          // no se diluye, se usa puro
    notes: 'Manitol 15% = 150 mg/mL. Bolus IV en 15-20 min. No diluir.',
  },
};

/**
 * Convierte dosis médica → cc/h según peso del paciente y dilución estándar.
 *
 * Retorna 0 si la droga no tiene dilución definida.
 *
 * @param drug    Identificador del fármaco
 * @param dose    Valor numérico en la unidad médica especificada
 * @param unit    Unidad de la dosis
 * @param weight  Peso del paciente en kg
 */
export function doseToCcH(
  drug: DrugId,
  dose: number,
  unit: DrugUnit,
  weightKg: number,
): number {
  const dil = DILUTION_STANDARDS[drug];
  if (!dil || !isFinite(dose) || dose <= 0) return 0;

  // Convertir todo a mg/h
  let mg_h: number;
  switch (unit) {
    case 'mcg/kg/min': mg_h = dose * weightKg * 60 / 1000; break;
    case 'mcg/min':    mg_h = dose * 60 / 1000;            break;
    case 'mcg/kg/h':   mg_h = dose * weightKg / 1000;      break;
    case 'mg/h':       mg_h = dose;                         break;
    case 'mg/kg/h':    mg_h = dose * weightKg;              break;
    case 'mg/kg/min':  mg_h = dose * weightKg * 60;         break;
    case 'UI/h':
    case 'U/h':
      // Para vasopresina/insulina: usamos la concentración declarada como mg virtual.
      // 1 UI/h vasopresina con 0.0002 mg/mL → cc/h = 0.001 / 0.0002 = 5 cc/h
      mg_h = dose * 0.001;
      break;
    default: return 0;
  }

  return mg_h / dil.concentration_mg_mL;
}
