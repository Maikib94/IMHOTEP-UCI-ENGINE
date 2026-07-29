// src/store/useCRRTStore.ts
//
// Estado de la terapia de reemplazo renal continuo (CRRT).
//
// Refs:
//   KDIGO AKI 2012 — indicaciones CRRT.
//   Hoff BM Ann Pharmacother 2020 — PK durante CRRT.
//   Roberts JA ICM 2025 — meropenem y pip-tazo en CRRT.
//   Wieringa A CMI 2025 — scoping review drogas en CRRT.
//   ADQI 2021 — citrato anticoagulación.

import { create } from 'zustand';

export type CRRTMode =
  | 'CVVH'    // convección pura (hemofiltración)
  | 'CVVHD'   // difusión pura (hemodiálisis)
  | 'CVVHDF'; // convección + difusión (hemodiafiltración)

export type CRRTAnticoagulation = 'heparin' | 'citrate' | 'none';
export type CRRTDilution = 'pre' | 'post' | 'mixed';

export interface CRRTState {
  active:               boolean;
  mode:                 CRRTMode;
  /** Dosis efluente total mL/kg/h (20-35 ml/kg/h estándar — KDIGO) */
  dose_mLkgh:           number;
  anticoagulation:      CRRTAnticoagulation;
  dilution:             CRRTDilution;
  // ── Composición del efluente / reposición ────────────────────────────────
  effluentNa_mEqL:      number;   // 140
  effluentK_mEqL:       number;   // 0-4 (0 = máxima extracción K)
  effluentBicarb_mmolL: number;   // 30-35 (bicarbonato de reposición)
  effluentCa_mEqL:      number;   // 2.5-3.5
  /** Flujo de sangre QB (mL/min) */
  bloodFlowMlMin:       number;
  /** Citrato: concentración de reposición (mmol/L) */
  citrateConc_mmolL:    number;
  /** Alerta ATB: droga con dializabilidad > 0.5 activa sin ajuste indicado */
  atbAdjustAlert:       boolean;
  /** Nombres de drogas que disparan alerta */
  atbAlertDrugs:        string[];

  setActive:    (v: boolean) => void;
  configure:    (partial: Partial<CRRTState>) => void;
  setAtbAlert:  (drugs: string[]) => void;
  resetCRRT:    () => void;
}

const DEFAULTS: Omit<CRRTState, 'active' | 'setActive' | 'configure' | 'setAtbAlert' | 'resetCRRT'> = {
  mode:                 'CVVHDF',
  dose_mLkgh:           25,
  anticoagulation:      'citrate',
  dilution:             'post',
  effluentNa_mEqL:      140,
  effluentK_mEqL:       2,
  effluentBicarb_mmolL: 32,
  effluentCa_mEqL:      3.0,
  bloodFlowMlMin:       200,
  citrateConc_mmolL:    3.0,
  atbAdjustAlert:       false,
  atbAlertDrugs:        [],
};

export const useCRRTStore = create<CRRTState>((set) => ({
  active: false,
  ...DEFAULTS,

  setActive: (v) => set((s) => ({
    active: v,
    ...(v ? {} : { ...DEFAULTS, atbAdjustAlert: false, atbAlertDrugs: [] }),
  })),

  configure: (partial) => set((s) => ({ ...s, ...partial })),

  setAtbAlert: (drugs) => set({ atbAdjustAlert: drugs.length > 0, atbAlertDrugs: drugs }),

  resetCRRT: () => set({ active: false, ...DEFAULTS }),
}));
