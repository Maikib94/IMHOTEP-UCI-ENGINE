// src/data/DrugConcentrations.ts
//
// Catálogo de diluciones estándar UCI para IMHOTEP.
// Fuentes:
//   Forshay CM et al. AJHP 2020 — VERB: concentraciones estandarizadas
//   para noradrenalina, vasopresina, cisatracurio y otros.
//   Estándar UCI Latinoamérica (consenso regional).

import type { DrugId } from '../store/usePharmacologyStore';
import type { ConcentrationUnit } from '../utils/DrugCalculator';

export interface DrugConcentrationEntry {
  default:      number;           // concentración por defecto
  alternatives: number[];         // opciones alternativas
  unit:         ConcentrationUnit; // unidad de la concentración
  vialNote:     string;           // descripción de preparación
}

export const DRUG_CONCENTRATIONS: Partial<Record<DrugId, DrugConcentrationEntry>> = {
  // ── VASOPRESORES ──────────────────────────────────────────────────────────
  noradrenaline: {
    default: 64, alternatives: [40, 32, 16], unit: 'mcg/mL',
    vialNote: '16 mg / 250 mL SF → 64 mcg/mL · Alt: 4mg/100mL=40 · 8mg/250mL=32',
  },
  adrenaline: {
    default: 40, alternatives: [20, 64], unit: 'mcg/mL',
    vialNote: '4 mg / 100 mL SF → 40 mcg/mL · Alt: 2mg/100mL=20 · 16mg/250mL=64',
  },
  vasopressin: {
    default: 0.2, alternatives: [0.4], unit: 'U/mL',
    vialNote: '20 UI / 100 mL SF → 0.2 U/mL · Alt: 40UI/100mL=0.4',
  },
  methylene_blue: {
    default: 1, alternatives: [2], unit: 'mg/mL',
    vialNote: '100 mg / 100 mL SF → 1 mg/mL',
  },

  // ── INOTRÓPICOS ───────────────────────────────────────────────────────────
  dobutamine: {
    default: 1, alternatives: [2, 4], unit: 'mg/mL',
    vialNote: '250 mg / 250 mL Dx5% → 1 mg/mL · Alt: 500mg=2 · 1g=4',
  },
  dopamine: {
    default: 1.6, alternatives: [3.2], unit: 'mg/mL',
    vialNote: '400 mg / 250 mL → 1.6 mg/mL · Alt: 800mg=3.2',
  },
  milrinone: {
    default: 0.2, alternatives: [0.4], unit: 'mg/mL',
    vialNote: '50 mg / 250 mL Dx5% → 0.2 mg/mL · Alt: 100mg=0.4',
  },
  levosimendan: {
    default: 0.05, alternatives: [0.025], unit: 'mg/mL',
    vialNote: '12.5 mg / 250 mL Dx5% → 0.05 mg/mL (perfusión 24h estándar)',
  },

  // ── SEDANTES ──────────────────────────────────────────────────────────────
  propofol: {
    default: 10, alternatives: [20], unit: 'mg/mL',
    vialNote: 'Emulsión 1% = 10 mg/mL (usar directo) · 2% = 20 mg/mL',
  },
  midazolam: {
    default: 1, alternatives: [2, 5], unit: 'mg/mL',
    vialNote: '50 mg / 50 mL SF → 1 mg/mL · Alt: 100mg/50mL=2 · 250mg/50mL=5',
  },
  ketamine: {
    default: 5, alternatives: [10, 1], unit: 'mg/mL',
    vialNote: '500 mg / 100 mL SF → 5 mg/mL · Alt: 10mg/mL · 1mg/mL (pediátrico)',
  },
  dexmedetomidine: {
    default: 4, alternatives: [8], unit: 'mcg/mL',
    vialNote: '200 mcg / 50 mL SF → 4 mcg/mL · Alt: 400mcg/50mL=8',
  },
  thiopental: {
    default: 5, alternatives: [25], unit: 'mg/mL',
    vialNote: '500 mg / 100 mL SF → 5 mg/mL · Alt: 25mg/mL (inductora)',
  },

  // ── ANALGÉSICOS ───────────────────────────────────────────────────────────
  morphine: {
    default: 1, alternatives: [2], unit: 'mg/mL',
    vialNote: '50 mg / 50 mL SF → 1 mg/mL · Alt: 100mg/50mL=2',
  },
  fentanyl: {
    default: 50, alternatives: [25, 10], unit: 'mcg/mL',
    vialNote: '2500 mcg / 50 mL SF → 50 mcg/mL · Alt: 1250mcg=25 · 500mcg=10',
  },
  remifentanil: {
    default: 50, alternatives: [20, 25], unit: 'mcg/mL',
    vialNote: '5 mg / 100 mL SF → 50 mcg/mL · Alt: 2mg/100mL=20',
  },

  // ── BLOQUEADORES NEUROMUSCULARES ──────────────────────────────────────────
  atracurium: {
    default: 1, alternatives: [2, 5], unit: 'mg/mL',
    vialNote: '250 mg / 250 mL SF → 1 mg/mL · Alt: 500mg=2 · 1g=5',
  },
  cisatracurium: {
    default: 2, alternatives: [5], unit: 'mg/mL',
    vialNote: '200 mg / 100 mL SF → 2 mg/mL (VERB 2020 estándar)',
  },
  rocuronium: {
    default: 10, alternatives: [5], unit: 'mg/mL',
    vialNote: 'Vial directo 10 mg/mL · Alt: diluir al 50%=5 mg/mL',
  },
  pancuronium: {
    default: 2, alternatives: [1], unit: 'mg/mL',
    vialNote: '20 mg / 10 mL → 2 mg/mL · Alt: diluir 1:1→1 mg/mL',
  },

  // ── ANTIARRÍTMICOS IV ─────────────────────────────────────────────────────
  amiodarone: {
    default: 1.8, alternatives: [3.6], unit: 'mg/mL',
    vialNote: '900 mg / 500 mL Dx5% → 1.8 mg/mL (NO SF — precipita)',
  },

  // ── DIURÉTICOS IV ────────────────────────────────────────────────────────
  furosemide_iv: {
    default: 1, alternatives: [2, 4], unit: 'mg/mL',
    vialNote: '250 mg / 250 mL SF → 1 mg/mL · Alt: 500mg=2 · 1g=4',
  },

  // ── INSULINA IV ───────────────────────────────────────────────────────────
  insulin_regular_iv: {
    default: 1, alternatives: [0.5], unit: 'U/mL',
    vialNote: '100 UI / 100 mL SF → 1 U/mL',
  },
};

// ── Grupos para PharmacyStorePanel ────────────────────────────────────────────

export type PharmacyGroup = 'vasopressors' | 'inotropes' | 'sedatives' | 'analgesics' | 'nmba';

export const PHARMACY_GROUPS: Record<PharmacyGroup, DrugId[]> = {
  vasopressors: ['noradrenaline', 'adrenaline', 'vasopressin', 'methylene_blue'],
  inotropes:    ['dobutamine', 'dopamine', 'milrinone', 'levosimendan'],
  sedatives:    ['propofol', 'midazolam', 'ketamine', 'dexmedetomidine', 'thiopental'],
  analgesics:   ['morphine', 'fentanyl', 'remifentanil'],
  nmba:         ['atracurium', 'cisatracurium', 'rocuronium', 'pancuronium'],
};

export const PHARMACY_GROUP_LABELS: Record<PharmacyGroup, string> = {
  vasopressors: 'Vasopresores',
  inotropes:    'Inotrópicos',
  sedatives:    'Sedantes',
  analgesics:   'Analgésicos',
  nmba:         'Bloqueo NM',
};
