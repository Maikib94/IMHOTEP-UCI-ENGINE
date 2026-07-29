// src/utils/DrugCalculator.ts
//
// Calculador universal de velocidad de infusión (cc/h = mL/h).
// Utilidad PURA — sin React, sin Zustand, sin side-effects.
//
// Refs:
//   Forshay CM et al. AJHP 2020 — VERB concentraciones estandarizadas UCI.
//   Nery J et al. AJHP 2025 — 347 170 infusiones: 1% errores 10× evitados.
//   Hanidziar D et al. Anesth Analg 2020 — rangos de infusión sedante UCI.

export type DrugInputUnit =
  | 'mcg/kg/min'
  | 'mcg/kg/h'
  | 'mg/kg/h'
  | 'mg/kg/min'
  | 'mg/h'
  | 'mcg/h'
  | 'mcg/min'
  | 'U/h'
  | 'UI/h';

export type ConcentrationUnit = 'mg/mL' | 'mcg/mL' | 'U/mL';

export interface InfusionRateParams {
  dose:               number;           // dosis en unidad nativa del fármaco
  inputUnit:          DrugInputUnit;    // unidad de la dosis
  weightKg:           number;           // peso paciente (kg)
  concentration:      number;           // concentración de la solución
  concentrationUnit:  ConcentrationUnit; // unidad de la concentración
}

/**
 * Calcula velocidad de infusión en mL/h (cc/h).
 *
 * CRITERIOS DE ACEPTACIÓN:
 *   0.1 mcg/kg/min × 70 kg ÷ 64 mcg/mL  → 6.6 cc/h
 *   2 mcg/kg/h × 70 kg ÷ 50 mcg/mL      → 2.8 cc/h
 *   2 mg/kg/h × 70 kg ÷ 10 mg/mL        → 14.0 cc/h
 *   2.4 U/h ÷ 0.2 U/mL                   → 12.0 cc/h
 *   4 mg/h ÷ 1 mg/mL                     → 4.0 cc/h
 */
export function computeInfusionRate(p: InfusionRateParams): number {
  const { dose, inputUnit, weightKg, concentration, concentrationUnit } = p;

  // Defensas
  if (!isFinite(dose) || dose <= 0) return 0;
  if (!isFinite(weightKg) || weightKg <= 0) return 0;
  if (!isFinite(concentration) || concentration <= 0) return 0;

  // PASO 1 — Convertir dosis a "cantidad de droga por hora"
  // Resultado en una de tres unidades: mcg/h, mg/h, U/h
  let drugPerHour_mcg = 0;
  let drugPerHour_mg  = 0;
  let drugPerHour_U   = 0;
  let doseType: 'mcg' | 'mg' | 'U' = 'mg';

  switch (inputUnit) {
    case 'mcg/kg/min':
      drugPerHour_mcg = dose * weightKg * 60;
      doseType = 'mcg';
      break;
    case 'mcg/kg/h':
      drugPerHour_mcg = dose * weightKg;
      doseType = 'mcg';
      break;
    case 'mcg/min':
      drugPerHour_mcg = dose * 60;
      doseType = 'mcg';
      break;
    case 'mcg/h':
      drugPerHour_mcg = dose;
      doseType = 'mcg';
      break;
    case 'mg/kg/min':
      drugPerHour_mg = dose * weightKg * 60;
      doseType = 'mg';
      break;
    case 'mg/kg/h':
      drugPerHour_mg = dose * weightKg;
      doseType = 'mg';
      break;
    case 'mg/h':
      drugPerHour_mg = dose;
      doseType = 'mg';
      break;
    case 'U/h':
    case 'UI/h':
      drugPerHour_U = dose;
      doseType = 'U';
      break;
    default:
      return 0;
  }

  // PASO 2 — Normalizar concentración a mismas unidades que la dosis
  let concNormalized = 0; // en mismas unidades que drugPerHour / mL

  if (doseType === 'mcg') {
    if (concentrationUnit === 'mcg/mL') {
      concNormalized = concentration;                  // mcg/mL — directo
    } else if (concentrationUnit === 'mg/mL') {
      concNormalized = concentration * 1000;           // mg/mL → mcg/mL
    } else {
      return 0; // U/mL no compatible con mcg
    }
  } else if (doseType === 'mg') {
    if (concentrationUnit === 'mg/mL') {
      concNormalized = concentration;                  // mg/mL — directo
    } else if (concentrationUnit === 'mcg/mL') {
      concNormalized = concentration / 1000;           // mcg/mL → mg/mL
    } else {
      return 0; // U/mL no compatible con mg
    }
  } else {
    // doseType === 'U'
    if (concentrationUnit === 'U/mL') {
      concNormalized = concentration;                  // U/mL — directo
    } else {
      return 0;
    }
  }

  if (concNormalized <= 0) return 0;

  // PASO 3 — Rate (mL/h) = drugPerHour / concentración_normalizada
  let drugPerHour = 0;
  if (doseType === 'mcg') drugPerHour = drugPerHour_mcg;
  else if (doseType === 'mg') drugPerHour = drugPerHour_mg;
  else drugPerHour = drugPerHour_U;

  const rateMlH = drugPerHour / concNormalized;

  // PASO 4 — Redondear a 0.1 mL/h y validar
  if (!isFinite(rateMlH) || isNaN(rateMlH)) return 0;
  return Math.round(rateMlH * 10) / 10;
}

/**
 * Cálculo inverso: dado un rate cc/h, retorna la dosis en la unidad nativa.
 * Útil para verificación y futuro panel de bomba.
 */
export function computeDoseFromRate(p: {
  rateMlH:           number;
  inputUnit:          DrugInputUnit;
  weightKg:           number;
  concentration:      number;
  concentrationUnit:  ConcentrationUnit;
}): number {
  const { rateMlH, inputUnit, weightKg, concentration, concentrationUnit } = p;
  if (!isFinite(rateMlH) || rateMlH <= 0) return 0;
  if (!isFinite(weightKg) || weightKg <= 0) return 0;
  if (!isFinite(concentration) || concentration <= 0) return 0;

  // Convertir rate → drug per hour según concentrationUnit
  let drugPerHourBase = 0;
  if (concentrationUnit === 'mcg/mL') {
    drugPerHourBase = rateMlH * concentration;           // mcg/h
  } else if (concentrationUnit === 'mg/mL') {
    drugPerHourBase = rateMlH * concentration;           // mg/h
  } else {
    drugPerHourBase = rateMlH * concentration;           // U/h
  }

  switch (inputUnit) {
    case 'mcg/kg/min': return Math.round((drugPerHourBase / (weightKg * 60)) * 1000) / 1000;
    case 'mcg/kg/h':   return Math.round((drugPerHourBase / weightKg) * 100) / 100;
    case 'mcg/min':    return Math.round((drugPerHourBase / 60) * 100) / 100;
    case 'mcg/h':      return Math.round(drugPerHourBase * 10) / 10;
    case 'mg/kg/h':    return Math.round((drugPerHourBase / weightKg) * 100) / 100;
    case 'mg/kg/min':  return Math.round((drugPerHourBase / (weightKg * 60)) * 1000) / 1000;
    case 'mg/h':       return Math.round(drugPerHourBase * 10) / 10;
    case 'U/h':
    case 'UI/h':       return Math.round(drugPerHourBase * 10) / 10;
    default:           return 0;
  }
}
