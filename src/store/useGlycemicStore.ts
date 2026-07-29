// src/store/useGlycemicStore.ts
//
// Estado del modelo glucémico ICING-adaptado (Bergman extendido).
// Separa la glucemia CONTINUA (interna, cada tick) del HGT DISCRETO
// (snapshot con ruido de glucómetro, σ=5 mg/dL).
//
// Ref: Lin J et al. Comput Methods Programs Biomed 2011 (ICING model);
//      ADA 2024 (umbrales hipoglicemia); NICE-SUGAR NEJM 2009 (target 140-180 mg/dL).

import { create } from 'zustand';

export type HGTFrequency = '1h' | '2h' | '4h' | '6h' | '12h' | 'off';

export interface HGTRecord {
  id:        string;             // uuid simple (timestamp + counter)
  tickAt:    number;             // sim-time en segundos
  simTimeS:  number;             // alias de tickAt para legibilidad
  glucoseMg: number;             // mg/dL medido (con ruido)
  source:    'scheduled' | 'manual' | 'critical_alert';
}

// Box-Muller para ruido glucómetro σ=5 mg/dL
function gaussNoise(sigma = 5): number {
  const u = Math.max(1e-10, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

let _hgtCounter = 0;

interface GlycemicState {
  // ── Modelo interno (actualizado cada tick por GlycemicEngine) ────────────
  bgContinuous:  number;    // mg/dL — Bergman G
  remoteInsulinX: number;   // 1/min — Bergman X (efecto remoto insulina)
  plasmaInsulin:  number;   // mU/L  — Bergman I

  // ── Display discreto (HGT) ────────────────────────────────────────────────
  bgDisplayed:   number;    // mg/dL — último HGT registrado
  hgtFrequency:  HGTFrequency;
  nextHgtTick:   number | null;  // sim-seconds del próximo HGT programado
  hgtHistory:    HGTRecord[];    // máx 24 registros (rolling)

  // ── Alertas ────────────────────────────────────────────────────────────────
  hypoAlert:       boolean;   // bgDisplayed < 70
  hyperAlert:      boolean;   // bgDisplayed > 180
  severHypoAlert:  boolean;   // bgDisplayed < 54  (ADA cutoff severo)
  severHyperAlert: boolean;   // bgDisplayed > 250

  // ── Sugerencia de frecuencia por corticoides ──────────────────────────────
  corticoidHGTSuggestion: boolean;  // true cuando se inicia un corticoide

  // ── Acciones ───────────────────────────────────────────────────────────────
  setHgtFrequency:       (f: HGTFrequency) => void;
  triggerManualHgt:      (source?: HGTRecord['source']) => HGTRecord;
  recordContinuous:      (bg: number, X: number, I: number) => void;
  setCorticoidSuggestion:(v: boolean) => void;
  reset:                 () => void;
}

const INITIAL_STATE = {
  bgContinuous:  99,
  remoteInsulinX: 0,
  plasmaInsulin:  5,
  bgDisplayed:   99,
  hgtFrequency:  '4h' as HGTFrequency,
  nextHgtTick:   null,
  hgtHistory:    [] as HGTRecord[],
  hypoAlert:       false,
  hyperAlert:      false,
  severHypoAlert:  false,
  severHyperAlert: false,
  corticoidHGTSuggestion: false,
};

function computeAlerts(bg: number) {
  return {
    hypoAlert:       bg < 70,
    hyperAlert:      bg > 180,
    severHypoAlert:  bg < 54,
    severHyperAlert: bg > 250,
  };
}

export const useGlycemicStore = create<GlycemicState>((set, get) => ({
  ...INITIAL_STATE,

  setHgtFrequency: (f) => {
    const { bgContinuous } = get();
    const nextTick = f === 'off' ? null
      : (null as number | null); // nextHgtTick set by CronosEngine on first schedule
    set({ hgtFrequency: f, nextHgtTick: nextTick });
    // If turning on, schedule first HGT from current tick
    // (CronosEngine will set nextHgtTick on its first check)
  },

  triggerManualHgt: (source = 'manual') => {
    const { bgContinuous, hgtHistory } = get();
    const noisy = Math.round(bgContinuous + gaussNoise(5));
    const clamped = Math.max(30, Math.min(600, noisy));
    const id = `hgt-${++_hgtCounter}-${Date.now()}`;
    const simTimeS = bgContinuous; // placeholder; caller should pass ticks
    const record: HGTRecord = {
      id, tickAt: 0, simTimeS: 0, glucoseMg: clamped, source,
    };
    const alerts = computeAlerts(clamped);
    set({
      bgDisplayed: clamped,
      hgtHistory: [...hgtHistory.slice(-23), record],
      ...alerts,
    });
    return record;
  },

  recordContinuous: (bg, X, I) => {
    const clamped = Math.max(30, Math.min(600, bg));
    set({ bgContinuous: clamped, remoteInsulinX: X, plasmaInsulin: I });
  },

  setCorticoidSuggestion: (v) => set({ corticoidHGTSuggestion: v }),

  reset: () => {
    _hgtCounter = 0;
    set({ ...INITIAL_STATE });
  },
}));
