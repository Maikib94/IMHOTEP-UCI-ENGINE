// src/store/useUIStore.ts
// Estado global de UI: control panel, display units, settings globales.

import { create } from 'zustand';

export type ControlPanelSection =
  | 'antiarritmicos'
  | 'analgesia'
  | 'sedacion'
  | 'paralisis_bnm'
  | 'monitoreo_neuro'
  | 'hemodinamia'
  | 'resp_support'
  | 'neuro_support'
  | 'infecto'
  | 'farmacos_especiales';

export const SECTION_TO_ACCORDION_ID: Record<ControlPanelSection, string> = {
  antiarritmicos:   'drugs-antiarrhythmics',
  analgesia:        'drugs-analgesia',
  sedacion:         'drugs-sedation',
  paralisis_bnm:    'drugs-bnm',
  monitoreo_neuro:  'clinical-neuro',
  hemodinamia:      'hemodynamics',
  resp_support:     'resp-support',
  neuro_support:    'neuro-support',
  infecto:          'infecto-lab',
  farmacos_especiales: 'farmacos-especiales',
};

export type UnitDisplay   = 'medical' | 'cc_h';
export type DripUnitMode  = 'medical' | 'cc_h' | 'dual';

interface UIStoreState {
  // ── Control panel ──────────────────────────────────────────────────────────
  controlPanelOpen:    boolean;
  controlPanelSection: ControlPanelSection | null;

  // ── Unidades de goteo ──────────────────────────────────────────────────────
  /** Modo de visualización:
   *  'medical' = mcg/kg/min etc (primario)
   *  'cc_h'    = cc/h (primario)
   *  'dual'    = ambos visibles (recomendado para enseñanza)
   */
  dripUnitMode: DripUnitMode;
  /** Alias backward-compat para componentes que aún leen unitDisplay */
  unitDisplay:  UnitDisplay;

  // ── Settings de visualización ──────────────────────────────────────────────
  showSofa:       boolean;
  picoPhotoreal:  boolean;
  waveAntialias:  boolean;

  // ── Audio ──────────────────────────────────────────────────────────────────
  audioAlarms:  boolean;
  alarmVolume:  number;   // 0.0–1.0

  // ── PiCCO Quick panel — parámetros visibles ────────────────────────────────
  piccoQuickParams: string[];

  // ── PiCCO VolumeView — visibilidad del panel flotante ─────────────────────
  piccoPanelVisible: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  openControlPanel:   (opts: { section: ControlPanelSection }) => void;
  closeControlPanel:  () => void;
  toggleUnitDisplay:  () => void;
  setDripUnitMode:    (m: DripUnitMode) => void;
  setShowSofa:        (v: boolean) => void;
  setPicoPhotoreal:   (v: boolean) => void;
  setWaveAntialias:   (v: boolean) => void;
  setAudioAlarms:     (v: boolean) => void;
  setAlarmVolume:     (v: number)  => void;
  togglePiccoQuickParam: (id: string) => void;
  setPiccoQuickParams:   (ids: string[]) => void;
  setPiccoPanelVisible:      (v: boolean) => void;
  togglePiccoPanelVisible:   () => void;
}

// Persist piccoQuickParams + piccoPanelVisible via localStorage
const PICCO_LS_KEY         = 'imhotep:piccoQuickParams';
const PICCO_VISIBLE_LS_KEY = 'imhotep:piccoPanelVisible';

function loadPiccoPanelVisible(): boolean {
  try {
    const raw = localStorage.getItem(PICCO_VISIBLE_LS_KEY);
    if (raw !== null) return raw !== 'false';
  } catch { /* ignore */ }
  return true;
}
const DEFAULT_PICCO_PARAMS = ['ci', 'gedi', 'evlwi', 'svv'];

function loadPiccoParams(): string[] {
  try {
    const raw = localStorage.getItem(PICCO_LS_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return DEFAULT_PICCO_PARAMS;
}

export const useUIStore = create<UIStoreState>((set) => ({
  controlPanelOpen:    false,
  controlPanelSection: null,
  dripUnitMode:        'medical',
  unitDisplay:         'medical',
  showSofa:            true,
  picoPhotoreal:       true,
  waveAntialias:       true,
  audioAlarms:         true,
  alarmVolume:         0.5,
  piccoQuickParams:    loadPiccoParams(),
  piccoPanelVisible:   loadPiccoPanelVisible(),

  openControlPanel: ({ section }) => set({ controlPanelOpen: true, controlPanelSection: section }),
  closeControlPanel: () => set({ controlPanelOpen: false, controlPanelSection: null }),

  toggleUnitDisplay: () => set(s => {
    const next: DripUnitMode = s.dripUnitMode === 'medical' ? 'cc_h'
                             : s.dripUnitMode === 'cc_h'    ? 'dual'
                             : 'medical';
    return {
      dripUnitMode: next,
      unitDisplay:  next === 'cc_h' ? 'cc_h' : 'medical',
    };
  }),

  setDripUnitMode: (m) => set({
    dripUnitMode: m,
    unitDisplay:  m === 'cc_h' ? 'cc_h' : 'medical',
  }),

  setShowSofa:      (v) => set({ showSofa:      v }),
  setPicoPhotoreal: (v) => set({ picoPhotoreal: v }),
  setWaveAntialias: (v) => set({ waveAntialias: v }),
  setAudioAlarms:   (v) => set({ audioAlarms:   v }),
  setAlarmVolume:   (v) => set({ alarmVolume:   Math.max(0, Math.min(1, v)) }),

  togglePiccoQuickParam: (id) => set(s => {
    const next = s.piccoQuickParams.includes(id)
      ? s.piccoQuickParams.filter(x => x !== id)
      : [...s.piccoQuickParams, id];
    try { localStorage.setItem(PICCO_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { piccoQuickParams: next };
  }),

  setPiccoQuickParams: (ids) => {
    try { localStorage.setItem(PICCO_LS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    set({ piccoQuickParams: ids });
  },

  setPiccoPanelVisible: (v) => {
    try { localStorage.setItem(PICCO_VISIBLE_LS_KEY, String(v)); } catch { /* ignore */ }
    set({ piccoPanelVisible: v });
  },

  togglePiccoPanelVisible: () => set(s => {
    const next = !s.piccoPanelVisible;
    try { localStorage.setItem(PICCO_VISIBLE_LS_KEY, String(next)); } catch { /* ignore */ }
    return { piccoPanelVisible: next };
  }),
}));
