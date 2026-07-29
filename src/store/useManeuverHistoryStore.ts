// src/store/useManeuverHistoryStore.ts
//
// Historial de maniobras de pausa (Fase 4).
// Persiste los resultados medidos por RespiratoryEngine tras cada pausa.
//
// Interpretación clínica (Amato NEJM 2015; Villar CCM 2017; Pepe NEJM 1982):
//   InspPause  OK         ΔP ≤ 14 cmH₂O
//   InspPause  PRECAUCION ΔP 15–18
//   InspPause  RIESGO_VILI ΔP > 18
//   ExpPause   OK          Auto-PEEP ≤ 1 cmH₂O
//   ExpPause   AUTOPEEP_SIGNIF 2–5
//   ExpPause   ATRAPAMIENTO > 5

import { create } from 'zustand';
import type { VentilatorMode } from './usePatientStore';

// ─── Unified ManeuverRecord (Fase 5 — SM100 historial) ───────────────────────

export type ManeuverVentMode = 'VCV' | 'PCV' | 'PRVC' | 'PSV' | 'AMV';

export interface ManeuverRecord {
  id: string;
  type: 'insp_pause' | 'exp_pause';
  simulatedTick: number;      // ticks (s) del time store
  clockTime: string;          // HH:MM:SS formateado
  values: {
    pPlat?:    number;        // cmH₂O (insp pause)
    cStat?:    number;        // mL/cmH₂O (insp pause)
    drivingP?: number;        // cmH₂O (insp pause)
    autoPEEP?: number;        // cmH₂O (exp pause)
    totalPEEP?: number;       // cmH₂O (exp pause)
  };
  interpretation: string;     // "ΔP 12 — PROTECTIVE" / "auto-PEEP 4 — ATRAPAMIENTO LEVE"
  context: {
    mode:         ManeuverVentMode | string;
    vt:           number;     // mL
    peepSet:      number;     // cmH₂O
    rr:           number;     // rpm
    fio2:         number;     // 0.21–1.0
    ardsSeverity: number;     // 0–1
  };
}

export function maneuverInterpInsp(drivingP: number, value: number): string {
  if (drivingP <= 14) return `ΔP ${value.toFixed(1)} — PROTECTIVE`;
  if (drivingP <= 18) return `ΔP ${value.toFixed(1)} — PRECAUCIÓN`;
  return `ΔP ${value.toFixed(1)} — RIESGO VILI ALTO`;
}

export function maneuverInterpExp(autoPEEP: number, value: number): string {
  if (autoPEEP < 2) return `auto-PEEP ${value.toFixed(1)} — SIN ATRAPAMIENTO`;
  if (autoPEEP <= 4) return `auto-PEEP ${value.toFixed(1)} — ATRAPAMIENTO LEVE`;
  return `auto-PEEP ${value.toFixed(1)} — ATRAPAMIENTO SIGNIFICATIVO`;
}

export function maneuverInterpColor(interp: string): string {
  if (interp.includes('PROTECTIVE') || interp.includes('SIN ATRAPAMIENTO')) return '#34d399';
  if (interp.includes('PRECAUCIÓN') || interp.includes('LEVE')) return '#fbbf24';
  return '#ef4444';
}

// ─── Record types ──────────────────────────────────────────────────────────────

export interface InspPauseRecord {
  id: string;
  tickAt: number;          // tick de useTimeStore al momento
  simTimeS: number;        // tiempo simulado (s)
  pPlat: number;           // cmH₂O
  cStat: number;           // mL/cmH₂O (VT / (Pplat − PEEP))
  drivingPressure: number; // cmH₂O (Pplat − PEEP)
  mode: VentilatorMode;
  vtSet: number;           // mL
  peepSet: number;         // cmH₂O
  interpretation: 'OK' | 'PRECAUCION' | 'RIESGO_VILI';
}

export interface ExpPauseRecord {
  id: string;
  tickAt: number;
  simTimeS: number;
  autoPEEP: number;    // cmH₂O medido
  totalPEEP: number;   // PEEP extrínseco + auto-PEEP
  mode: VentilatorMode;
  rrSet: number;       // /min
  ieRatio: number;     // decimal
  interpretation: 'OK' | 'AUTOPEEP_SIGNIF' | 'ATRAPAMIENTO';
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ManeuverHistoryState {
  // Unified records (SM100 historial — Fase 5)
  records: ManeuverRecord[];
  addRecord:    (r: Omit<ManeuverRecord, 'id'>) => void;

  // Legacy separate arrays (VentilatorPanel / QuickARMPanel backward compat)
  inspPauses: InspPauseRecord[];
  expPauses:  ExpPauseRecord[];
  recordInspPause: (rec: Omit<InspPauseRecord, 'id'>) => void;
  recordExpPause:  (rec: Omit<ExpPauseRecord,  'id'>) => void;

  clearHistory: () => void;
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export const useManeuverHistoryStore = create<ManeuverHistoryState>((set) => ({
  records:    [],
  inspPauses: [],
  expPauses:  [],

  addRecord: (rec) =>
    set((s) => ({
      records: [{ ...rec, id: makeId() }, ...s.records].slice(0, 20),
    })),

  recordInspPause: (rec) =>
    set((s) => ({
      inspPauses: [{ ...rec, id: makeId() }, ...s.inspPauses].slice(0, 50),
    })),

  recordExpPause: (rec) =>
    set((s) => ({
      expPauses: [{ ...rec, id: makeId() }, ...s.expPauses].slice(0, 50),
    })),

  clearHistory: () => set({ inspPauses: [], expPauses: [], records: [] }),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function fmtSimTime(simTimeS: number): string {
  const h = Math.floor(simTimeS / 3600);
  const m = Math.floor((simTimeS % 3600) / 60);
  const s = Math.floor(simTimeS % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function inspInterpretation(dP: number): InspPauseRecord['interpretation'] {
  if (dP <= 14) return 'OK';
  if (dP <= 18) return 'PRECAUCION';
  return 'RIESGO_VILI';
}

export function expInterpretation(autoPEEP: number): ExpPauseRecord['interpretation'] {
  if (autoPEEP <= 1) return 'OK';
  if (autoPEEP <= 5) return 'AUTOPEEP_SIGNIF';
  return 'ATRAPAMIENTO';
}

export const INSP_COLORS: Record<InspPauseRecord['interpretation'], string> = {
  OK:          '#34d399',
  PRECAUCION:  '#fbbf24',
  RIESGO_VILI: '#ef4444',
};

export const EXP_COLORS: Record<ExpPauseRecord['interpretation'], string> = {
  OK:               '#34d399',
  AUTOPEEP_SIGNIF:  '#fbbf24',
  ATRAPAMIENTO:     '#ef4444',
};
