// src/store/useDilutionStore.ts
//
// Gestión de diluciones activas por droga.
// Base: DILUTION_STANDARDS (dilutionTable.ts) + override personalizado por usuario.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DrugId } from './usePharmacologyStore';
import { DILUTION_STANDARDS, type DilutionStandard, type DrugUnit, doseToCcH } from '../utils/dilutionTable';

export type DiluentType = 'SF09' | 'D5W' | 'Plasmalyte' | 'LR';

export interface DilutionPreset {
  drugId:               DrugId;
  drugAmountMg:         number;
  diluentVolumeMl:      number;
  diluentType:          DiluentType;
  /** mg de droga por mL de solución */
  concentration_mg_mL:  number;
  /** Unidad para mostrar en UI */
  unit:                 'mg/mL' | 'mcg/mL' | 'UI/mL';
  source:               'standard' | 'custom';
  notes?:               string;
}

function stdToPreset(std: DilutionStandard): DilutionPreset {
  const conc = std.concentration_mg_mL;
  const unit: DilutionPreset['unit'] = conc < 0.01
    ? 'mcg/mL'
    : conc >= 1 ? 'mg/mL' : 'mg/mL';

  return {
    drugId:              std.drug,
    drugAmountMg:        std.concentration_mg_mL * std.defaultDiluentVol_mL,
    diluentVolumeMl:     std.defaultDiluentVol_mL,
    diluentType:         'SF09',
    concentration_mg_mL: std.concentration_mg_mL,
    unit,
    source: 'standard',
    notes:  std.notes,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface DilutionState {
  /** Active preset per drug — overrides standard if source==='custom' */
  active: Partial<Record<DrugId, DilutionPreset>>;

  setActive:       (drug: DrugId, preset: DilutionPreset) => void;
  resetToStandard: (drug: DrugId) => void;
  getPreset:       (drug: DrugId) => DilutionPreset | null;
  computeCcH:      (drug: DrugId, dose: number, unit: DrugUnit, weightKg: number) => number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDilutionStore = create<DilutionState>()(
  persist(
    (set, get) => ({
      active: {},

      setActive: (drug, preset) =>
        set(s => ({ active: { ...s.active, [drug]: { ...preset, source: 'custom' } } })),

      resetToStandard: (drug) => {
        const std = DILUTION_STANDARDS[drug];
        set(s => ({
          active: {
            ...s.active,
            [drug]: std ? stdToPreset(std) : undefined,
          },
        }));
      },

      getPreset: (drug) => {
        const override = get().active[drug];
        if (override) return override;
        const std = DILUTION_STANDARDS[drug];
        return std ? stdToPreset(std) : null;
      },

      computeCcH: (drug, dose, unit, weightKg) => {
        const preset = get().getPreset(drug);
        if (!preset || !isFinite(dose) || dose <= 0) return 0;

        // Convert dose to mg/h
        let mg_h: number;
        switch (unit) {
          case 'mcg/kg/min': mg_h = dose * weightKg * 60 / 1000; break;
          case 'mcg/min':    mg_h = dose * 60 / 1000;            break;
          case 'mcg/kg/h':   mg_h = dose * weightKg / 1000;      break;
          case 'mg/h':       mg_h = dose;                         break;
          case 'mg/kg/h':    mg_h = dose * weightKg;              break;
          case 'mg/kg/min':  mg_h = dose * weightKg * 60;         break;
          case 'UI/h':
          case 'U/h':        mg_h = dose * 0.001;                 break;
          default:           return 0;
        }

        return mg_h / preset.concentration_mg_mL;
      },
    }),
    {
      name: 'imhotep:dilutions',
      partialize: (s) => ({ active: s.active }),
    }
  )
);

// ─── Helper: compute cc/h with a custom preset (for preview) ─────────────────

export function computeCcHWithPreset(
  drug:      DrugId,
  dose:      number,
  unit:      DrugUnit,
  weightKg:  number,
  preset:    DilutionPreset,
): number {
  if (!isFinite(dose) || dose <= 0) return 0;
  let mg_h: number;
  switch (unit) {
    case 'mcg/kg/min': mg_h = dose * weightKg * 60 / 1000; break;
    case 'mcg/min':    mg_h = dose * 60 / 1000;            break;
    case 'mcg/kg/h':   mg_h = dose * weightKg / 1000;      break;
    case 'mg/h':       mg_h = dose;                         break;
    case 'mg/kg/h':    mg_h = dose * weightKg;              break;
    case 'mg/kg/min':  mg_h = dose * weightKg * 60;         break;
    case 'UI/h':
    case 'U/h':        mg_h = dose * 0.001;                 break;
    default:           return 0;
  }
  return mg_h / preset.concentration_mg_mL;
}
