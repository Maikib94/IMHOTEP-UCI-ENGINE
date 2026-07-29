// src/scenarios/PatientFactory.ts
//
// Generador procedimental de pacientes con realismo biométrico y multi-comorbilidad.
//
// Literatura base:
//   Bruno Ann Intensive Care 2023 (CFS HR 1.34/punto en >65a)
//   Wozniak Ann Intensive Care 2024 (CFS ≥5 HR mortalidad 6m = 2.9)
//   Fronczek Crit Care 2021 (fragilidad continua > CFS categórico)
//   Devine B (1974) fórmula PBW; Mosteller R (1987) BSA
//   GOLD 2024 (EPOC); GINA 2024 (asma); KDIGO 2023 (ERC)

import type {
  ComorbidityId, CFSScore, HomeMed, GeneratedPatient, Vitals,
} from '../store/usePatientStore';

// ─── Mulberry32 PRNG — seeded, determinístico ────────────────────────────────

function makePRNG(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function boxMuller(rng: () => number): number {
  const u = Math.max(1e-10, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function normalClamped(rng: () => number, mu: number, sigma: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, mu + sigma * boxMuller(rng)));
}

// ─── Tipos de la Factoría ────────────────────────────────────────────────────

export interface ComorbidityModifiers {
  svrBaseline?: number;
  crsBaseline?: number;
  rawBaseline?: number;
  crClBaseline?: number;
  chronicHypoxemiaPaO2?: number;
  insulinResistance?: number;
  qtcSusceptibility?: number;
}

export interface ComorbidityDefinition {
  id: ComorbidityId;
  label: string;
  category: 'cv' | 'resp' | 'endocrine' | 'renal' | 'hepatic' | 'other';
  frailtyDelta: number;
  modifiers: ComorbidityModifiers;
  homeMeds: Array<Omit<HomeMed, 'id'>>;
  prevalencePerDecade: Partial<Record<20|30|40|50|60|70|80|90, number>>;
}

export const COMORBIDITY_CATALOG: Record<ComorbidityId, ComorbidityDefinition> = {
  // ── Cardiovascular ────────────────────────────────────────────────────────
  hta: {
    id: 'hta', label: 'Hipertensión arterial', category: 'cv',
    frailtyDelta: 0.04, modifiers: { svrBaseline: 1.15 },
    homeMeds: [{ drug: 'enalapril', dose: 10, unit: 'mg', freq: 'q12h', indication: 'HTA' }],
    prevalencePerDecade: { 30: 0.08, 40: 0.22, 50: 0.38, 60: 0.52, 70: 0.64, 80: 0.72, 90: 0.74 },
  },
  stents_cor: {
    id: 'stents_cor', label: 'Enfermedad coronaria (stents)', category: 'cv',
    frailtyDelta: 0.09, modifiers: {},
    homeMeds: [
      { drug: 'asa', dose: 100, unit: 'mg', freq: 'q24h', indication: 'Antiagregación CAD' },
      { drug: 'atorvastatina', dose: 40, unit: 'mg', freq: 'q24h', indication: 'Estatina CAD' },
    ],
    prevalencePerDecade: { 40: 0.04, 50: 0.10, 60: 0.18, 70: 0.26, 80: 0.30, 90: 0.28 },
  },
  hf_pef: {
    id: 'hf_pef', label: 'ICC con FE preservada (HFpEF)', category: 'cv',
    frailtyDelta: 0.12, modifiers: { svrBaseline: 1.10 },
    homeMeds: [{ drug: 'furosemida', dose: 40, unit: 'mg', freq: 'q24h', indication: 'HFpEF' }],
    prevalencePerDecade: { 50: 0.03, 60: 0.07, 70: 0.13, 80: 0.20, 90: 0.22 },
  },
  hf_ref: {
    id: 'hf_ref', label: 'ICC con FE reducida (HFrEF)', category: 'cv',
    frailtyDelta: 0.16, modifiers: { svrBaseline: 0.90 },
    homeMeds: [
      { drug: 'carvedilol', dose: 12.5, unit: 'mg', freq: 'q12h', indication: 'HFrEF' },
      { drug: 'enalapril', dose: 10, unit: 'mg', freq: 'q12h', indication: 'HFrEF' },
      { drug: 'furosemida', dose: 80, unit: 'mg', freq: 'q24h', indication: 'HFrEF' },
    ],
    prevalencePerDecade: { 50: 0.02, 60: 0.05, 70: 0.10, 80: 0.14, 90: 0.14 },
  },
  af_cronica: {
    id: 'af_cronica', label: 'Fibrilación auricular crónica', category: 'cv',
    frailtyDelta: 0.08, modifiers: {},
    homeMeds: [
      { drug: 'amiodarone', dose: 200, unit: 'mg', freq: 'q24h', indication: 'FA crónica' },
      { drug: 'rivaroxaban', dose: 20, unit: 'mg', freq: 'q24h', indication: 'Anticoagulación FA' },
    ],
    prevalencePerDecade: { 40: 0.01, 50: 0.03, 60: 0.07, 70: 0.13, 80: 0.19, 90: 0.22 },
  },
  val_aortica: {
    id: 'val_aortica', label: 'Estenosis/insuf. valvular aórtica', category: 'cv',
    frailtyDelta: 0.10, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 50: 0.02, 60: 0.05, 70: 0.10, 80: 0.18, 90: 0.22 },
  },
  val_mitral: {
    id: 'val_mitral', label: 'Valvulopatía mitral', category: 'cv',
    frailtyDelta: 0.08, modifiers: {},
    homeMeds: [{ drug: 'furosemida', dose: 40, unit: 'mg', freq: 'q24h', indication: 'Valvulopatía' }],
    prevalencePerDecade: { 40: 0.02, 50: 0.04, 60: 0.07, 70: 0.11, 80: 0.14, 90: 0.13 },
  },

  // ── Respiratorio ──────────────────────────────────────────────────────────
  epoc_gold1: {
    id: 'epoc_gold1', label: 'EPOC GOLD I', category: 'resp',
    frailtyDelta: 0.04, modifiers: { rawBaseline: 1.3 },
    homeMeds: [{ drug: 'tiotropio', dose: 18, unit: 'mcg', freq: 'q24h', indication: 'EPOC GOLD I' }],
    prevalencePerDecade: { 40: 0.03, 50: 0.08, 60: 0.14, 70: 0.18, 80: 0.16, 90: 0.12 },
  },
  epoc_gold2: {
    id: 'epoc_gold2', label: 'EPOC GOLD II', category: 'resp',
    frailtyDelta: 0.09, modifiers: { rawBaseline: 1.7, crsBaseline: 1.25 },
    homeMeds: [
      { drug: 'tiotropio', dose: 18, unit: 'mcg', freq: 'q24h', indication: 'EPOC GOLD II' },
      { drug: 'salmeterol', dose: 50, unit: 'mcg', freq: 'q12h', indication: 'EPOC GOLD II' },
    ],
    prevalencePerDecade: { 40: 0.02, 50: 0.06, 60: 0.11, 70: 0.15, 80: 0.14, 90: 0.10 },
  },
  epoc_gold3: {
    id: 'epoc_gold3', label: 'EPOC GOLD III/IV', category: 'resp',
    frailtyDelta: 0.14, modifiers: { rawBaseline: 2.0, crsBaseline: 1.30, chronicHypoxemiaPaO2: 65 },
    homeMeds: [
      { drug: 'tiotropio', dose: 18, unit: 'mcg', freq: 'q24h', indication: 'EPOC grave' },
      { drug: 'salmeterol', dose: 50, unit: 'mcg', freq: 'q12h', indication: 'EPOC grave' },
      { drug: 'beclometasona_inh', dose: 400, unit: 'mcg', freq: 'q12h', indication: 'EPOC grave' },
    ],
    prevalencePerDecade: { 50: 0.02, 60: 0.05, 70: 0.08, 80: 0.08, 90: 0.05 },
  },
  asma_persistente: {
    id: 'asma_persistente', label: 'Asma persistente moderada/grave', category: 'resp',
    frailtyDelta: 0.04, modifiers: { rawBaseline: 1.6 },
    homeMeds: [
      { drug: 'salbutamol_inh', dose: 200, unit: 'mcg', freq: 'prn', indication: 'Asma' },
      { drug: 'fluticasona_inh', dose: 250, unit: 'mcg', freq: 'q12h', indication: 'Asma persistente' },
    ],
    prevalencePerDecade: { 20: 0.08, 30: 0.07, 40: 0.06, 50: 0.05, 60: 0.04, 70: 0.04, 80: 0.04, 90: 0.03 },
  },
  tabaquismo_activo: {
    id: 'tabaquismo_activo', label: 'Tabaquismo activo', category: 'resp',
    frailtyDelta: 0.06, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.25, 30: 0.28, 40: 0.25, 50: 0.20, 60: 0.14, 70: 0.08, 80: 0.04, 90: 0.02 },
  },
  tabaquismo_ex: {
    id: 'tabaquismo_ex', label: 'Ex-fumador (> 10 paquetes-año)', category: 'resp',
    frailtyDelta: 0.03, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 30: 0.10, 40: 0.22, 50: 0.30, 60: 0.35, 70: 0.38, 80: 0.36, 90: 0.32 },
  },
  sahos: {
    id: 'sahos', label: 'SAHOS moderado/grave', category: 'resp',
    frailtyDelta: 0.05, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 30: 0.04, 40: 0.08, 50: 0.12, 60: 0.15, 70: 0.14, 80: 0.10, 90: 0.07 },
  },

  // ── Metabólico/endocrino ──────────────────────────────────────────────────
  dm1: {
    id: 'dm1', label: 'Diabetes mellitus tipo 1', category: 'endocrine',
    frailtyDelta: 0.09, modifiers: { insulinResistance: 1.6 },
    homeMeds: [{ drug: 'insulina_bolo', dose: 8, unit: 'UI', freq: 'q8h', indication: 'DM1' }],
    prevalencePerDecade: { 20: 0.01, 30: 0.01, 40: 0.01, 50: 0.01, 60: 0.01, 70: 0.01, 80: 0.01, 90: 0.01 },
  },
  dm2_no_insulin: {
    id: 'dm2_no_insulin', label: 'DM2 sin insulina', category: 'endocrine',
    frailtyDelta: 0.05, modifiers: { insulinResistance: 1.8 },
    homeMeds: [{ drug: 'metformina', dose: 850, unit: 'mg', freq: 'q12h', indication: 'DM2' }],
    prevalencePerDecade: { 30: 0.03, 40: 0.08, 50: 0.14, 60: 0.20, 70: 0.24, 80: 0.22, 90: 0.18 },
  },
  dm2_insulin: {
    id: 'dm2_insulin', label: 'DM2 insulinorrequiriente', category: 'endocrine',
    frailtyDelta: 0.09, modifiers: { insulinResistance: 2.5 },
    homeMeds: [
      { drug: 'insulina_bolo', dose: 10, unit: 'UI', freq: 'q8h', indication: 'DM2 insulina' },
      { drug: 'insulina_basal', dose: 20, unit: 'UI', freq: 'q24h', indication: 'DM2 insulina' },
    ],
    prevalencePerDecade: { 40: 0.02, 50: 0.05, 60: 0.10, 70: 0.14, 80: 0.14, 90: 0.10 },
  },
  hipotiroidismo: {
    id: 'hipotiroidismo', label: 'Hipotiroidismo', category: 'endocrine',
    frailtyDelta: 0.03, modifiers: {},
    homeMeds: [{ drug: 'levotiroxina', dose: 100, unit: 'mcg', freq: 'q24h', indication: 'Hipotiroidismo' }],
    prevalencePerDecade: { 30: 0.02, 40: 0.04, 50: 0.07, 60: 0.10, 70: 0.13, 80: 0.15, 90: 0.14 },
  },
  obesidad_g1: {
    id: 'obesidad_g1', label: 'Obesidad G1 (IMC 30–35)', category: 'endocrine',
    frailtyDelta: 0.04, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.12, 30: 0.18, 40: 0.22, 50: 0.24, 60: 0.22, 70: 0.18, 80: 0.14, 90: 0.10 },
  },
  obesidad_g2: {
    id: 'obesidad_g2', label: 'Obesidad G2 (IMC 35–40)', category: 'endocrine',
    frailtyDelta: 0.09, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.06, 30: 0.09, 40: 0.11, 50: 0.12, 60: 0.10, 70: 0.08, 80: 0.06, 90: 0.04 },
  },
  obesidad_g3: {
    id: 'obesidad_g3', label: 'Obesidad G3 (IMC > 40)', category: 'endocrine',
    frailtyDelta: 0.15, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.03, 30: 0.05, 40: 0.06, 50: 0.06, 60: 0.05, 70: 0.03, 80: 0.02, 90: 0.01 },
  },

  // ── Renal ──────────────────────────────────────────────────────────────────
  erc_g1: {
    id: 'erc_g1', label: 'ERC G1 (TFG ≥90)', category: 'renal',
    frailtyDelta: 0.02, modifiers: { crClBaseline: 0.90 },
    homeMeds: [],
    prevalencePerDecade: { 30: 0.04, 40: 0.06, 50: 0.08, 60: 0.10, 70: 0.12, 80: 0.12, 90: 0.11 },
  },
  erc_g2: {
    id: 'erc_g2', label: 'ERC G2 (TFG 60–89)', category: 'renal',
    frailtyDelta: 0.04, modifiers: { crClBaseline: 0.72 },
    homeMeds: [],
    prevalencePerDecade: { 30: 0.03, 40: 0.06, 50: 0.10, 60: 0.15, 70: 0.20, 80: 0.22, 90: 0.20 },
  },
  erc_g3a: {
    id: 'erc_g3a', label: 'ERC G3a (TFG 45–59)', category: 'renal',
    frailtyDelta: 0.07, modifiers: { crClBaseline: 0.52 },
    homeMeds: [],
    prevalencePerDecade: { 40: 0.02, 50: 0.05, 60: 0.09, 70: 0.14, 80: 0.18, 90: 0.18 },
  },
  erc_g3b: {
    id: 'erc_g3b', label: 'ERC G3b (TFG 30–44)', category: 'renal',
    frailtyDelta: 0.10, modifiers: { crClBaseline: 0.37 },
    homeMeds: [],
    prevalencePerDecade: { 50: 0.02, 60: 0.05, 70: 0.09, 80: 0.14, 90: 0.14 },
  },
  erc_g4: {
    id: 'erc_g4', label: 'ERC G4 (TFG 15–29)', category: 'renal',
    frailtyDelta: 0.14, modifiers: { crClBaseline: 0.22 },
    homeMeds: [{ drug: 'eritropoyetina', dose: 2000, unit: 'UI', freq: 'q24h', indication: 'Anemia ERC G4' }],
    prevalencePerDecade: { 50: 0.01, 60: 0.02, 70: 0.04, 80: 0.07, 90: 0.07 },
  },
  erc_g5: {
    id: 'erc_g5', label: 'ERC G5 (TFG <15, prediálisis)', category: 'renal',
    frailtyDelta: 0.19, modifiers: { crClBaseline: 0.10 },
    homeMeds: [],
    prevalencePerDecade: { 50: 0.003, 60: 0.007, 70: 0.015, 80: 0.025, 90: 0.025 },
  },
  dialisis_hd: {
    id: 'dialisis_hd', label: 'Diálisis hemodiálisis crónica', category: 'renal',
    frailtyDelta: 0.21, modifiers: { crClBaseline: 0.05 },
    homeMeds: [],
    prevalencePerDecade: { 40: 0.003, 50: 0.007, 60: 0.014, 70: 0.022, 80: 0.025, 90: 0.018 },
  },
  dialisis_pd: {
    id: 'dialisis_pd', label: 'Diálisis peritoneal', category: 'renal',
    frailtyDelta: 0.19, modifiers: { crClBaseline: 0.08 },
    homeMeds: [],
    prevalencePerDecade: { 40: 0.001, 50: 0.003, 60: 0.006, 70: 0.009, 80: 0.009, 90: 0.006 },
  },

  // ── Hepático ───────────────────────────────────────────────────────────────
  cirrosis_a: {
    id: 'cirrosis_a', label: 'Cirrosis Child A', category: 'hepatic',
    frailtyDelta: 0.10, modifiers: { svrBaseline: 0.82, crClBaseline: 0.75 },
    homeMeds: [{ drug: 'propranolol', dose: 40, unit: 'mg', freq: 'q12h', indication: 'Profilaxis variceal' }],
    prevalencePerDecade: { 30: 0.01, 40: 0.02, 50: 0.03, 60: 0.03, 70: 0.03, 80: 0.02, 90: 0.01 },
  },
  cirrosis_b: {
    id: 'cirrosis_b', label: 'Cirrosis Child B', category: 'hepatic',
    frailtyDelta: 0.16, modifiers: { svrBaseline: 0.72, crClBaseline: 0.55, insulinResistance: 1.4 },
    homeMeds: [
      { drug: 'propranolol', dose: 40, unit: 'mg', freq: 'q12h', indication: 'Profilaxis variceal' },
      { drug: 'espironolactona', dose: 100, unit: 'mg', freq: 'q24h', indication: 'Ascitis' },
    ],
    prevalencePerDecade: { 30: 0.005, 40: 0.01, 50: 0.015, 60: 0.016, 70: 0.014, 80: 0.01, 90: 0.006 },
  },
  cirrosis_c: {
    id: 'cirrosis_c', label: 'Cirrosis Child C (descompensada)', category: 'hepatic',
    frailtyDelta: 0.24, modifiers: { svrBaseline: 0.60, crClBaseline: 0.35, insulinResistance: 1.4 },
    homeMeds: [],
    prevalencePerDecade: { 30: 0.002, 40: 0.005, 50: 0.008, 60: 0.008, 70: 0.006, 80: 0.004, 90: 0.002 },
  },

  // ── Otros ──────────────────────────────────────────────────────────────────
  acv_secuela: {
    id: 'acv_secuela', label: 'ACV con secuela funcional', category: 'other',
    frailtyDelta: 0.13, modifiers: {},
    homeMeds: [
      { drug: 'asa', dose: 100, unit: 'mg', freq: 'q24h', indication: 'Prevención ACV isquémico' },
      { drug: 'atorvastatina', dose: 40, unit: 'mg', freq: 'q24h', indication: 'Estatina poste-ACV' },
    ],
    prevalencePerDecade: { 50: 0.01, 60: 0.03, 70: 0.07, 80: 0.12, 90: 0.16 },
  },
  drogas_estimulantes: {
    id: 'drogas_estimulantes', label: 'Consumo activo cocaína/anfetaminas', category: 'other',
    frailtyDelta: 0.09, modifiers: { svrBaseline: 1.25, qtcSusceptibility: 1.5 },
    homeMeds: [],
    prevalencePerDecade: { 20: 0.05, 30: 0.06, 40: 0.04, 50: 0.02, 60: 0.01, 70: 0.005, 80: 0.002, 90: 0.001 },
  },
  drogas_depresores: {
    id: 'drogas_depresores', label: 'Consumo activo opioides (ilícitos o crónico)', category: 'other',
    frailtyDelta: 0.12, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.04, 30: 0.05, 40: 0.04, 50: 0.03, 60: 0.02, 70: 0.01, 80: 0.005, 90: 0.002 },
  },
  inmunosupresion_qt: {
    id: 'inmunosupresion_qt', label: 'Inmunosupresión por quimioterapia', category: 'other',
    frailtyDelta: 0.22, modifiers: { crClBaseline: 0.75 },
    homeMeds: [],
    prevalencePerDecade: { 20: 0.01, 30: 0.01, 40: 0.02, 50: 0.03, 60: 0.04, 70: 0.04, 80: 0.03, 90: 0.02 },
  },
  inmunosupresion_hiv: {
    id: 'inmunosupresion_hiv', label: 'VIH con inmunosupresión activa', category: 'other',
    frailtyDelta: 0.14, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.005, 30: 0.008, 40: 0.009, 50: 0.008, 60: 0.005, 70: 0.002, 80: 0.001, 90: 0.001 },
  },
  inmunosupresion_trasplante: {
    id: 'inmunosupresion_trasplante', label: 'Trasplante de órgano sólido', category: 'other',
    frailtyDelta: 0.16, modifiers: { crClBaseline: 0.65 },
    homeMeds: [{ drug: 'tacrolimus', dose: 2, unit: 'mg', freq: 'q12h', indication: 'Inmunosupresión trasplante' }],
    prevalencePerDecade: { 20: 0.002, 30: 0.003, 40: 0.004, 50: 0.005, 60: 0.005, 70: 0.004, 80: 0.003, 90: 0.002 },
  },
  qx_mayor_reciente: {
    id: 'qx_mayor_reciente', label: 'Cirugía mayor reciente (< 3 meses)', category: 'other',
    frailtyDelta: 0.07, modifiers: {},
    homeMeds: [],
    prevalencePerDecade: { 20: 0.02, 30: 0.03, 40: 0.04, 50: 0.05, 60: 0.07, 70: 0.09, 80: 0.11, 90: 0.09 },
  },
  qx_cardiaca_previa: {
    id: 'qx_cardiaca_previa', label: 'Cirugía cardíaca previa (CABG/válvula)', category: 'other',
    frailtyDelta: 0.11, modifiers: {},
    homeMeds: [
      { drug: 'asa', dose: 100, unit: 'mg', freq: 'q24h', indication: 'Post-CABG' },
      { drug: 'atorvastatina', dose: 40, unit: 'mg', freq: 'q24h', indication: 'Post-CX cardíaca' },
    ],
    prevalencePerDecade: { 50: 0.01, 60: 0.03, 70: 0.06, 80: 0.09, 90: 0.08 },
  },
};

// ─── Constraints ──────────────────────────────────────────────────────────────

export interface GenerationConstraints {
  ageMin?: number;
  ageMax?: number;
  weightMin?: number;
  weightMax?: number;
  heightMin?: number;
  heightMax?: number;
  forcedComorbidities?: ComorbidityId[];
  forbiddenComorbidities?: ComorbidityId[];
  minComorbidities?: number;
  maxComorbidities?: number;
  scenarioCategory?: 'neuro' | 'sepsis' | 'trauma' | 'burns' | 'respiratory' | 'cardio' | 'surgical' | 'metabolic' | 'general' | 'pneumo' | 'infecto' | 'cirugia' | 'quemados' | 'endocrino' | 'hemato' | 'obstetricia';
  /** Fuerza el sexo del paciente generado (obstetricia siempre usa 'F'). */
  forcedSex?: 'M' | 'F';
}

// ─── Funciones auxiliares ─────────────────────────────────────────────────────

function baseAgeFragility(age: number): number {
  // Calibrado con HR 1.34/punto CFS en >65a (Bruno Ann Intensive Care 2023)
  if (age < 50) return 0.02 * Math.max(0, age - 30) / 20;
  if (age < 65) return 0.02 + 0.06 * (age - 50) / 15;
  if (age < 80) return 0.08 + 0.20 * (age - 65) / 15;
  return 0.28 + 0.40 * Math.min(1, (age - 80) / 19);
}

function bmiPenalty(bmi: number): number {
  if (bmi < 18.5) return 0.05;
  if (bmi < 25)   return 0;
  if (bmi < 30)   return 0.02;
  if (bmi < 35)   return 0.05;
  if (bmi < 40)   return 0.10;
  return 0.16;
}

// CFS breakpoints (Rockwood 1999; calibrado con Fronczek Crit Care 2021)
const CFS_BREAKPOINTS = [0.00, 0.05, 0.10, 0.18, 0.30, 0.42, 0.55, 0.70, 0.85];

function toCFS(frailtyContinuous: number): CFSScore {
  for (let i = 8; i >= 0; i--) {
    if (frailtyContinuous >= CFS_BREAKPOINTS[i]) return (i + 1) as CFSScore;
  }
  return 1;
}

function pickPrevalence(comorb: ComorbidityDefinition, age: number, rng: () => number): boolean {
  const decade = Math.floor(age / 10) * 10 as 20|30|40|50|60|70|80|90;
  const p = comorb.prevalencePerDecade[decade] ?? 0;
  return rng() < p;
}

function generateClinicalSummary(
  age: number, sex: 'M' | 'F', cfsScore: CFSScore,
  comorbidities: ComorbidityId[], frailtyContinuous: number,
): string {
  const genderStr = sex === 'M' ? 'Hombre' : 'Mujer';
  const cfsStr =
    cfsScore <= 2 ? 'sin fragilidad significativa' :
    cfsScore <= 4 ? 'pre-frágil con dependencia leve' :
    cfsScore <= 6 ? 'frágil (dependencia moderada)' :
    'severamente frágil (alta dependencia)';

  const topMorbids = comorbidities.slice(0, 3)
    .map(c => COMORBIDITY_CATALOG[c]?.label ?? c)
    .join(', ');
  const morbLine = comorbidities.length > 0
    ? `Antecedentes relevantes: ${topMorbids}${comorbidities.length > 3 ? ` y ${comorbidities.length - 3} más` : ''}.`
    : 'Sin antecedentes de relevancia registrados.';

  const reservaStr = `Reserva fisiológica ${Math.round((1 - frailtyContinuous) * 100)}% (CFS ${cfsScore}/9).`;

  return `${genderStr} de ${age} años, ${cfsStr}. ${morbLine} ${reservaStr}`;
}

// ─── Función principal ─────────────────────────────────────────────────────────

export function generatePatient(
  constraints: GenerationConstraints = {},
  seed?: number,
): GeneratedPatient {
  const rng = makePRNG(seed ?? (Date.now() & 0xFFFFFFFF));

  // Sesgo de edad por categoría
  let ageMin = constraints.ageMin ?? 17;
  let ageMax = constraints.ageMax ?? 95;
  if (constraints.scenarioCategory === 'trauma' || constraints.scenarioCategory === 'burns') {
    ageMin = constraints.ageMin ?? 18;
    ageMax = constraints.ageMax ?? 55;
  } else if (
    constraints.scenarioCategory === 'sepsis' ||
    constraints.scenarioCategory === 'respiratory' ||
    constraints.scenarioCategory === 'cardio' ||
    constraints.scenarioCategory === 'surgical'
  ) {
    ageMin = constraints.ageMin ?? 45;
    ageMax = constraints.ageMax ?? 88;
  } else if (constraints.scenarioCategory === 'obstetricia') {
    ageMin = constraints.ageMin ?? 18;
    ageMax = constraints.ageMax ?? 42;  // edad reproductiva
  } else if (constraints.scenarioCategory === 'endocrino') {
    ageMin = constraints.ageMin ?? 25;
    ageMax = constraints.ageMax ?? 75;
  } else if (constraints.scenarioCategory === 'hemato') {
    ageMin = constraints.ageMin ?? 25;
    ageMax = constraints.ageMax ?? 75;
  }

  // 1. Edad
  const age = Math.round(ageMin + rng() * (ageMax - ageMin));

  // 2. Sexo — con soporte para forcedSex y override implícito obstetricia
  let sex: 'M' | 'F';
  if (constraints.forcedSex) {
    sex = constraints.forcedSex;
  } else if (constraints.scenarioCategory === 'obstetricia') {
    sex = 'F';
  } else {
    sex = rng() < 0.50 ? 'M' : 'F';
  }

  // 3. Altura
  const heightMu   = sex === 'M' ? 173 : 160;
  const heightSigma = sex === 'M' ? 7   : 6.5;
  const heightCm = Math.round(normalClamped(rng, heightMu, heightSigma,
    constraints.heightMin ?? 150,
    constraints.heightMax ?? 210,
  ));

  // 4. Peso / IMC
  const bmiTarget = normalClamped(rng, 28, 5, 16, 48);
  const weightKg = Math.round(Math.max(
    constraints.weightMin ?? 40,
    Math.min(constraints.weightMax ?? 200, bmiTarget * (heightCm / 100) ** 2),
  ));
  const bmi = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;

  // 5. PBW (Devine)
  const pbwKg = Math.round((sex === 'M'
    ? 50 + 0.9 * (heightCm - 152.4)
    : 45.5 + 0.9 * (heightCm - 152.4)
  ) * 10) / 10;

  // 6. BSA Mosteller
  const bsaMosteller = Math.round(Math.sqrt(weightKg * heightCm / 3600) * 100) / 100;

  // 7. Comorbilidades
  const allIds = Object.keys(COMORBIDITY_CATALOG) as ComorbidityId[];
  const forbidden = new Set(constraints.forbiddenComorbidities ?? []);
  const forced     = constraints.forcedComorbidities ?? [];
  const maxMorbid  = constraints.maxComorbidities ?? 5;
  const minMorbid  = constraints.minComorbidities ?? 0;

  const selected = new Set<ComorbidityId>(forced.filter(id => !forbidden.has(id)));

  // Comorbilidades condicionales (coexistencia epidemiológica)
  const conditionals: Partial<Record<ComorbidityId, { dependsOn: ComorbidityId; extraProb: number }>> = {
    hta:           { dependsOn: 'dm2_no_insulin', extraProb: 0.30 },
    dm2_no_insulin:{ dependsOn: 'obesidad_g2',    extraProb: 0.25 },
    hf_ref:        { dependsOn: 'stents_cor',     extraProb: 0.20 },
    epoc_gold2:    { dependsOn: 'tabaquismo_activo', extraProb: 0.20 },
    af_cronica:    { dependsOn: 'hf_pef',         extraProb: 0.20 },
  };

  // Primer pase: prevalencia base
  for (const id of allIds) {
    if (selected.has(id) || forbidden.has(id)) continue;
    if (selected.size >= maxMorbid) break;
    const def = COMORBIDITY_CATALOG[id];
    if (pickPrevalence(def, age, rng)) selected.add(id);
  }

  // Segundo pase: condicionales
  for (const [id, cond] of Object.entries(conditionals) as [ComorbidityId, {dependsOn:ComorbidityId, extraProb:number}][]) {
    if (selected.has(id) || forbidden.has(id)) continue;
    if (selected.size >= maxMorbid) break;
    if (selected.has(cond.dependsOn) && rng() < cond.extraProb) {
      selected.add(id);
    }
  }

  // Asegurar mínimo
  if (selected.size < minMorbid) {
    for (const id of allIds) {
      if (selected.size >= minMorbid) break;
      if (!selected.has(id) && !forbidden.has(id)) selected.add(id);
    }
  }
  const comorbidityIds = Array.from(selected);

  // 8. Fragilidad continua
  const sumFrailtyDelta = comorbidityIds.reduce(
    (acc, id) => acc + (COMORBIDITY_CATALOG[id]?.frailtyDelta ?? 0), 0,
  );
  const sexBias = sex === 'F' ? 0.02 : 0;
  const frailtyContinuous = Math.min(1, Math.max(0,
    baseAgeFragility(age) + sumFrailtyDelta + bmiPenalty(bmi) + sexBias,
  ));

  // 9. CFS score
  const cfsScore = toCFS(frailtyContinuous);

  // 10. hostSensitivity — calibrado con HR 1.34/punto CFS (Bruno 2023)
  const hostSensitivity = 0.75 + frailtyContinuous * 1.95;

  // 11. noninvasiveResponsiveness — menor en pacientes frágiles con SAHOS/EPOC
  const hasSahos = comorbidityIds.includes('sahos');
  const hasEpocGr = comorbidityIds.includes('epoc_gold2') || comorbidityIds.includes('epoc_gold3');
  const noninvasiveResponsiveness = Math.max(0.25, 1.5 - frailtyContinuous * 1.2 - (hasSahos ? 0.15 : 0) - (hasEpocGr ? 0.20 : 0));

  // Modificadores fisiológicos base (compuesto de todas las comorbilidades)
  const compSvr = comorbidityIds.reduce((acc, id) => {
    const m = COMORBIDITY_CATALOG[id]?.modifiers.svrBaseline;
    return m != null ? acc * m : acc;
  }, 1.0);

  // 11. homeMeds (deduplicar por drug+freq)
  const rawMeds: HomeMed[] = [];
  for (const id of comorbidityIds) {
    for (const m of COMORBIDITY_CATALOG[id]?.homeMeds ?? []) {
      // Ajuste de dosis en ERC G4+
      const hasErcSevere = comorbidityIds.includes('erc_g4') || comorbidityIds.includes('erc_g5') || comorbidityIds.includes('dialisis_hd');
      let dose = m.dose;
      if (hasErcSevere && (m.drug === 'digoxin' || m.drug === 'digoxina')) dose = m.dose * 0.5;
      rawMeds.push({ ...m, dose });
    }
  }
  // Deduplicar por drug
  const seenDrugs = new Set<string>();
  const homeMeds: HomeMed[] = rawMeds.filter(m => {
    if (seenDrugs.has(m.drug)) return false;
    seenDrugs.add(m.drug);
    return true;
  });

  // 12. Vitales base
  const chronicPaO2 = comorbidityIds.reduce((acc, id) => {
    const p = COMORBIDITY_CATALOG[id]?.modifiers.chronicHypoxemiaPaO2;
    return p != null ? Math.min(acc, p) : acc;
  }, 97);

  const baseVitals: Partial<Vitals> = {
    weight: weightKg,
    heartRate: Math.round(normalClamped(rng, 60 + age * 0.2, 8, 50, 100)),
    systolicBP: Math.round(normalClamped(rng, 115 * compSvr, 12, 90, 180)),
    diastolicBP: Math.round(normalClamped(rng, 75 * compSvr, 8, 55, 110)),
    paO2: Math.round(chronicPaO2),
  };

  // 13. Nombre ficticio — pool diversificado (15M + 15F, apellidos multinacionales)
  const NAMES_M = [
    { first: 'Carlos',   last: 'Méndez'    }, { first: 'Roberto', last: 'Larrea'      },
    { first: 'Andrés',   last: 'Vázquez'   }, { first: 'Pedro',   last: 'Kowalski'    },
    { first: 'Luis',     last: 'Rivera'    }, { first: 'Felipe',  last: 'Domínguez'   },
    { first: 'Joaquín',  last: 'Serrano'   }, { first: 'Miguel',  last: 'Brennan'     },
    { first: 'Jorge',    last: 'Watanabe'  }, { first: 'Tomás',   last: "O'Connor"    },
    { first: 'Diego',    last: 'Acuña'     }, { first: 'Gonzalo', last: 'Schmidt'     },
    { first: 'Ernesto',  last: 'Castaño'   }, { first: 'Iván',    last: 'Petrov'      },
    { first: 'Javier',   last: 'Aguirre'   },
  ];
  const NAMES_F = [
    { first: 'Ana',      last: 'Ramírez'   }, { first: 'Elena',    last: 'Rossi'      },
    { first: 'Laura',    last: 'Villanueva'}, { first: 'Sofía',    last: 'Carrasco'   },
    { first: 'Marta',    last: 'Engström'  }, { first: 'Patricia', last: 'Hernández'  },
    { first: 'Rosa',     last: 'Calvo'     }, { first: 'Cecilia',  last: 'Drăgan'     },
    { first: 'Beatriz',  last: 'Almeida'   }, { first: 'Carolina', last: 'Yáñez'      },
    { first: 'Daniela',  last: 'Souza'     }, { first: 'Isabel',   last: 'Martín'     },
    { first: 'Gabriela', last: 'Espinoza'  }, { first: 'Valentina',last: 'Costa'      },
    { first: 'Mónica',   last: 'Tanaka'    },
  ];
  const namePool2  = sex === 'M' ? NAMES_M : NAMES_F;
  const nameEntry  = namePool2[Math.floor(rng() * namePool2.length)];
  const name = `${nameEntry.first} ${nameEntry.last}`;

  // 14. Resumen clínico
  const clinicalSummary = generateClinicalSummary(age, sex, cfsScore, comorbidityIds, frailtyContinuous);

  // ── Generar ID único
  const id = `gen_${Date.now().toString(36)}_${Math.floor(rng()*0xFFFF).toString(16)}`;

  return {
    id,
    name,
    age,
    sex,
    heightCm,
    weightKg,
    bmi,
    pbwKg,
    bsaMosteller,
    comorbidities: comorbidityIds.map(id2 => COMORBIDITY_CATALOG[id2]?.label ?? id2),
    comorbidityIds,
    hostSensitivity: Math.round(hostSensitivity * 100) / 100,
    noninvasiveResponsiveness: Math.round(noninvasiveResponsiveness * 100) / 100,
    baseVitals,
    frailtyContinuous: Math.round(frailtyContinuous * 1000) / 1000,
    cfsScore,
    homeMeds,
    clinicalSummary,
  };
}

