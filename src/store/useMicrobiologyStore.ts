// src/store/useMicrobiologyStore.ts
// Blueprint 021-B — Microbiología UCI: Vademécum Sanford 2025 + Panel Cultivos Completo
//
// Bibliografía:
//   - Sanford Guide to Antimicrobial Therapy 2025 (MIC/breakpoints CLSI M100-S35)
//   - IDSA/SCCM Sepsis Guidelines 2021-2025
//   - IDSA CAUTi, CLABSI, VAP guidelines 2022
//   - Surviving Sepsis Campaign Bundle 2025
//   - IDSA Meningitis/Encephalitis Guidelines 2017 (actualización 2023)
//   - BioFire FilmArray® ME Panel (GeneXpert® Meningitis/Encephalitis)
//   - IDSA Clinical Practice Guideline: Candidiasis 2016
//   - EUCAST/CLSI Breakpoints Antifungal 2024
//   - Estudio MERINO (Harris, NEJM 2018) — Pip/Tazo vs BLEE
//   - Estudio ASPECT-NP (Kollef, NEJM 2019) —Ceftolozano/Tazo en NAV
//   - Protokolo ROSE (Malbrain, Anaesthesiol Intensive Ther 2014)

import { create } from 'zustand';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS BASE
// ══════════════════════════════════════════════════════════════════════════════

export type GramStain = 'positive' | 'negative' | 'fungus' | 'mycobacteria' | 'virus';
export type Phenotype = 'wild' | 'esbl' | 'mrsa' | 'mdr' | 'xdr' | 'pan_r' | 'carbapenemase';
export type SensitivityClass = 'S' | 'I' | 'R' | 'INTRINSEC_R';
export type PKPDType = 'time' | 'auc' | 'conc';
export type ROSEPhase = 'R' | 'O' | 'S' | 'E';
export type TreatmentEfficacy =
  | 'none'
  | 'mismatch'
  | 'suboptimal'
  | 'empiric_match'
  | 'targeted';

// ─── Sitios de Cultivo ────────────────────────────────────────────────────────
// Todos los sitios posibles de toma de muestra en UCI
export type CultureSiteType =
  // ── 1. Hemocultivos (BACTERIEMIA / FUNGEMIA) ─────────────────────────────
  | 'blood_peripheral_1'     // Hemocultivo #1 — vena periférica (obligatorio x2 SSC)
  | 'blood_peripheral_2'     // Hemocultivo #2 — vena periférica diferente (SSC Bundle)
  // ── 2. Retrocultivos (CLABSI — sin retirar catéter) ──────────────────────
  | 'retroculture_cvc'       // Retrocultivo VVC: extracción por luz proximal
  | 'retroculture_arterial'  // Retrocultivo línea arterial
  | 'retroculture_hd'        // Retrocultivo catéter hemodiálisis
  // ── 3. Tips de catéter (requiere retirar catéter — Maki semicuantitativo) ─
  | 'tip_cvc'                // Punta CVC: cultivo rodillo Maki (≥15 UFC = positivo)
  | 'tip_arterial'           // Punta línea arterial
  | 'tip_hd'                 // Punta catéter HD
  | 'tip_picc'               // Punta PICC (catéter de inserción periférica central)
  // ── 4. LCR (Meningitis / Encefalitis) ────────────────────────────────────
  | 'csf'                    // LCR: Gram, cultivo, citoquímico, tinta china
  // ── 5. Líquidos Corporales ────────────────────────────────────────────────
  | 'fluid_abdominal'        // Líquido peritoneal (LAP/paracentesis): LDH, glucosa, proteínas, PMN, cultivo
  | 'fluid_pericardial'      // Líquido pericárdico: citoquímico + cultivo
  | 'fluid_pleural'          // Líquido pleural: Light criteria + pH + ADA + cultivo
  // ── 6. Vía Aérea ─────────────────────────────────────────────────────────
  | 'tracheal_secretion'     // Secreción traqueal (aspirado endotraqueal): Gram + cultivo cuantitativo
  | 'bal'                    // LBA/BAL: cultivo cuantitativo (≥10⁴ UFC/mL NAV)
  // ── 7. Diagnóstico Molecular ──────────────────────────────────────────────
  | 'genexpert_csf'          // GeneXpert® ME Panel: Bacteria/Virus/Hongos en LCR (2h)
  | 'genexpert_resp'         // GeneXpert® MTB+RIF en secreción traqueal (2h)
  // ── 8. Panel Viral (PCR Multiplex) ───────────────────────────────────────
  | 'viral_panel_blood'      // Panel viral sangre: CMV, EBV, HSV, VZV, Dengue, HIV
  | 'viral_panel_csf'        // Panel viral LCR: HSV-1/2, VZV, EV, EBV, CMV, Parechovirus, WNV
  | 'viral_panel_resp';      // Panel viral resp: Influenza A/B, RSV, SARS-CoV-2, Parainfluenza, hMPV, Adenovirus


// ─── Especificación de Sitio de Cultivo ──────────────────────────────────────
export interface CultureSiteSpec {
  id:              CultureSiteType;
  displayName:     string;
  category:        'hemoculture' | 'catheter_retro' | 'catheter_tip' | 'csf' | 'body_fluid' | 'respiratory' | 'molecular' | 'viral';
  turnaroundHours: number;       // Horas simuladas para resultado
  requiresCatheterRemoval: boolean;
  additionalTests: string[];     // Exámenes adicionales incluidos
  quantitative: boolean;         // Cultivo cuantitativo (UFC/mL)
  isBundleItem: boolean;         // ¿Cuenta para Bundle SSC?
  icon:          string;         // Emoji para UI
}

export const CULTURE_SITE_CATALOG: Record<CultureSiteType, CultureSiteSpec> = {
  // ── Hemocultivos ──────────────────────────────────────────────────────────
  blood_peripheral_1: {
    id: 'blood_peripheral_1', displayName: 'Hemocultivo #1 (Periférico)',
    category: 'hemoculture', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Aerobio', 'Anaerobio'], quantitative: false, isBundleItem: true, icon: '🩸',
  },
  blood_peripheral_2: {
    id: 'blood_peripheral_2', displayName: 'Hemocultivo #2 (Periférico)',
    category: 'hemoculture', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Aerobio', 'Anaerobio'], quantitative: false, isBundleItem: true, icon: '🩸',
  },
  // ── Retrocultivos ─────────────────────────────────────────────────────────
  retroculture_cvc: {
    id: 'retroculture_cvc', displayName: 'Retrocultivo VVC',
    category: 'catheter_retro', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Diferencial DTP >2h diagnóstico CLABSI'], quantitative: false, isBundleItem: false, icon: '🔴',
  },
  retroculture_arterial: {
    id: 'retroculture_arterial', displayName: 'Retrocultivo Línea Arterial',
    category: 'catheter_retro', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Diferencial DTP'], quantitative: false, isBundleItem: false, icon: '🔴',
  },
  retroculture_hd: {
    id: 'retroculture_hd', displayName: 'Retrocultivo Catéter HD',
    category: 'catheter_retro', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Diferencial DTP'], quantitative: false, isBundleItem: false, icon: '🔴',
  },
  // ── Tips de catéter ───────────────────────────────────────────────────────
  tip_cvc: {
    id: 'tip_cvc', displayName: 'Punta CVC (Maki)',
    category: 'catheter_tip', turnaroundHours: 72, requiresCatheterRemoval: true,
    additionalTests: ['Cultivo semicuantitativo Maki (≥15 UFC=+)', 'Tinción Gram punta'], quantitative: true, isBundleItem: false, icon: '🟠',
  },
  tip_arterial: {
    id: 'tip_arterial', displayName: 'Punta Línea Arterial (Maki)',
    category: 'catheter_tip', turnaroundHours: 72, requiresCatheterRemoval: true,
    additionalTests: ['Cultivo semicuantitativo Maki (≥15 UFC=+)'], quantitative: true, isBundleItem: false, icon: '🟠',
  },
  tip_hd: {
    id: 'tip_hd', displayName: 'Punta Catéter HD (Maki)',
    category: 'catheter_tip', turnaroundHours: 72, requiresCatheterRemoval: true,
    additionalTests: ['Cultivo semicuantitativo Maki (≥15 UFC=+)'], quantitative: true, isBundleItem: false, icon: '🟠',
  },
  tip_picc: {
    id: 'tip_picc', displayName: 'Punta PICC (Maki)',
    category: 'catheter_tip', turnaroundHours: 72, requiresCatheterRemoval: true,
    additionalTests: ['Cultivo semicuantitativo Maki (≥15 UFC=+)'], quantitative: true, isBundleItem: false, icon: '🟠',
  },
  // ── LCR ──────────────────────────────────────────────────────────────────
  csf: {
    id: 'csf', displayName: 'Cultivo LCR (Meningitis)',
    category: 'csf', turnaroundHours: 72, requiresCatheterRemoval: false,
    additionalTests: [
      'Gram + cultivo', 'Tinta china (Cryptococcus)', 'Citoquímico',
      'Glucosa/Proteínas LCR', 'ADA LCR (TBC)', 'Presión apertura'
    ], quantitative: false, isBundleItem: false, icon: '🧠',
  },
  // ── Líquidos corporales ───────────────────────────────────────────────────
  fluid_abdominal: {
    id: 'fluid_abdominal', displayName: 'Líquido Peritoneal (LAP)',
    category: 'body_fluid', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: [
      'Gram + cultivo', 'Citoquímico', 'PMN >250/mm³ (peritonitis)',
      'LDH', 'Proteínas', 'Glucosa', 'GASA (gradiente albumina)'
    ], quantitative: false, isBundleItem: false, icon: '🫁',
  },
  fluid_pericardial: {
    id: 'fluid_pericardial', displayName: 'Líquido Pericárdico',
    category: 'body_fluid', turnaroundHours: 72, requiresCatheterRemoval: false,
    additionalTests: ['Gram + cultivo', 'Citoquímico', 'ADA (TBC)', 'LDH', 'Proteínas'], quantitative: false, isBundleItem: false, icon: '❤️',
  },
  fluid_pleural: {
    id: 'fluid_pleural', displayName: 'Líquido Pleural (Toracocentesis)',
    category: 'body_fluid', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: [
      'Gram + cultivo', 'Citoquímico', 'Light criteria (exudado/trasudado)',
      'pH pleural (empiema si <7.2)', 'LDH', 'Glucosa', 'ADA (TBC)', 'Colesterol'
    ], quantitative: false, isBundleItem: false, icon: '🫀',
  },
  // ── Vía Aérea ─────────────────────────────────────────────────────────────
  tracheal_secretion: {
    id: 'tracheal_secretion', displayName: 'Secreción Traqueal (AET)',
    category: 'respiratory', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: ['Gram + cultivo cualitativo', 'Patrones de resistencia NAV', 'PMN > 25/campo'], quantitative: false, isBundleItem: false, icon: '🫁',
  },
  bal: {
    id: 'bal', displayName: 'LBA/BAL (Broncoalveolar)',
    category: 'respiratory', turnaroundHours: 48, requiresCatheterRemoval: false,
    additionalTests: [
      'Cultivo cuantitativo (≥10⁴ UFC/mL = NAV)',
      'Gram + cultivo', 'PMN/macrófagos', 'Galactomanano (Aspergillus)',
      'PCP (Pneumocystis jirovecii) — IF'
    ], quantitative: true, isBundleItem: false, icon: '🫁',
  },
  // ── Diagnóstico Molecular ──────────────────────────────────────────────────
  genexpert_csf: {
    id: 'genexpert_csf', displayName: 'GeneXpert ME Panel (LCR)',
    category: 'molecular', turnaroundHours: 2, requiresCatheterRemoval: false,
    additionalTests: [
      'S. pneumoniae', 'N. meningitidis A/B/C/W/Y', 'H. influenzae',
      'L. monocytogenes', 'E. coli K1', 'S. agalactiae',
      'HSV-1/HSV-2', 'CMV', 'EBV', 'Enterovirus', 'HHV-6', 'VZV', 'Parechovirus',
      'Cryptococcus neoformans/gattii'
    ], quantitative: false, isBundleItem: false, icon: '🧬',
  },
  genexpert_resp: {
    id: 'genexpert_resp', displayName: 'GeneXpert MTB/RIF (Secreción Traqueal)',
    category: 'molecular', turnaroundHours: 2, requiresCatheterRemoval: false,
    additionalTests: [
      'Mycobacterium tuberculosis (detección)', 'Resistencia Rifampicina (≈MDR-TB)',
      'Sensibilidad/resistencia RIF en 2h'
    ], quantitative: false, isBundleItem: false, icon: '🧬',
  },
  // ── Panel Viral ────────────────────────────────────────────────────────────
  viral_panel_blood: {
    id: 'viral_panel_blood', displayName: 'Panel Viral — Sangre',
    category: 'viral', turnaroundHours: 24, requiresCatheterRemoval: false,
    additionalTests: [
      'CMV (PCR cuantitativo — viremia)', 'EBV (PCR)', 'HSV-1/HSV-2 (PCR)',
      'VZV (PCR)', 'Dengue NS1 + IgM/IgG', 'HIV-1/2 (PCR ARN + Ag p24)',
      'Hepatitis B (HBsAg + HBV-DNA)', 'Hepatitis C (HCV-ARN)',
      'Parvovirus B19 (PCR)', 'HTLV-1/2'
    ], quantitative: true, isBundleItem: false, icon: '🦠',
  },
  viral_panel_csf: {
    id: 'viral_panel_csf', displayName: 'Panel Viral — LCR',
    category: 'viral', turnaroundHours: 24, requiresCatheterRemoval: false,
    additionalTests: [
      'HSV-1 (PCR — gold standard encefalitis)', 'HSV-2 (PCR)',
      'VZV (PCR)', 'EBV (PCR)', 'CMV (PCR)',
      'Enterovirus (PCR multiplex)', 'Parechovirus (PCR)',
      'WNV (West Nile Virus — IgM/PCR)', 'JC Virus (LMP — PCR)',
      'SARS-CoV-2 (PCR en LCR — neuro-COVID)'
    ], quantitative: false, isBundleItem: false, icon: '🦠',
  },
  viral_panel_resp: {
    id: 'viral_panel_resp', displayName: 'Panel Viral — Respiratorio',
    category: 'viral', turnaroundHours: 4, requiresCatheterRemoval: false,
    additionalTests: [
      'Influenza A (incl. H1N1 pandémico)', 'Influenza B',
      'RSV (Virus Sincicial Respiratorio A/B)',
      'SARS-CoV-2 (PCR cuantitativo)', 'Parainfluenza 1/2/3/4',
      'Metapneumovirus humano (hMPV)', 'Adenovirus',
      'Rinovirus/Enterovirus', 'Bocavirus', 'Coronavirus 229E/OC43/NL63/HKU1'
    ], quantitative: false, isBundleItem: false, icon: '🦠',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACES DE SENSIBILIDAD Y PATÓGENOS (igual que antes, expandida)
// ══════════════════════════════════════════════════════════════════════════════

export interface MICSensitivity {
  sensitivity:    SensitivityClass;
  mic:            number;        // μg/mL
  breakpointS:    number;        // CLSI M100-S35: ≤ = Sensible
  breakpointR:    number;        // CLSI M100-S35: ≥ = Resistente
  mechanism?:     string;
  clinicalNote?:  string;
}

export interface PathogenDef {
  id:              string;
  displayName:     string;
  gramStain:       GramStain;
  phenotype:       Phenotype;
  typicalSource:   string;
  resistanceMechs: string[];
  gramStainDesc:   string;
  sensitivities:   Record<string, MICSensitivity>;
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE PATÓGENOS (expandir en siguiente fase — estructura lista)
// ══════════════════════════════════════════════════════════════════════════════

export const PATHOGEN_CATALOG: Record<string, PathogenDef> = {

  spneumo: {
    id: 'spneumo', displayName: 'S. pneumoniae',
    gramStain: 'positive', phenotype: 'wild',
    typicalSource: 'Neumonía comunitaria / Meningitis / Bacteriemia',
    resistanceMechs: [],
    gramStainDesc: 'Diplococos Gram+ lanceolados (pares/cadenas)',
    sensitivities: {
      ceftriaxone:      { sensitivity: 'S', mic: 0.5,   breakpointS: 1,   breakpointR: 2   },
      cefotaxime:       { sensitivity: 'S', mic: 0.25,  breakpointS: 0.5, breakpointR: 2   },
      cefepime:         { sensitivity: 'S', mic: 0.5,   breakpointS: 1,   breakpointR: 4   },
      ampicillin:       { sensitivity: 'S', mic: 0.06,  breakpointS: 0.12,breakpointR: 1   },
      amp_sulbac:       { sensitivity: 'S', mic: 1,     breakpointS: 8,   breakpointR: 16  },
      pip_tazo:         { sensitivity: 'S', mic: 0.5,   breakpointS: 8,   breakpointR: 16  },
      meropenem:        { sensitivity: 'S', mic: 0.25,  breakpointS: 0.5, breakpointR: 1   },
      vancomycin:       { sensitivity: 'S', mic: 0.5,   breakpointS: 2,   breakpointR: 4   },
      levofloxacin:     { sensitivity: 'S', mic: 1,     breakpointS: 2,   breakpointR: 8   },
      linezolid:        { sensitivity: 'S', mic: 1,     breakpointS: 2,   breakpointR: 8   },
      colistin:         { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4, mechanism: 'Pared Gram+ impermeabilidad' },
      metronidazole:    { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 8, breakpointR: 32, mechanism: 'Anaerobio facultativo — no diana' },
    },
  },

  ecoli_wild: {
    id: 'ecoli_wild', displayName: 'E. coli (Salvaje)',
    gramStain: 'negative', phenotype: 'wild',
    typicalSource: 'ITU / Peritonitis / Bacteriemia',
    resistanceMechs: [],
    gramStainDesc: 'Bacilos Gram-negativos',
    sensitivities: {
      ceftriaxone:      { sensitivity: 'S', mic: 0.25,  breakpointS: 1,   breakpointR: 4   },
      cefotaxime:       { sensitivity: 'S', mic: 0.25,  breakpointS: 1,   breakpointR: 4   },
      cefazolin:        { sensitivity: 'S', mic: 1,     breakpointS: 2,   breakpointR: 8   },
      cefepime:         { sensitivity: 'S', mic: 0.25,  breakpointS: 2,   breakpointR: 16  },
      amp_sulbac:       { sensitivity: 'S', mic: 4,     breakpointS: 8,   breakpointR: 32  },
      amoxicillin_clav: { sensitivity: 'S', mic: 4,     breakpointS: 8,   breakpointR: 32  },
      pip_tazo:         { sensitivity: 'S', mic: 2,     breakpointS: 16,  breakpointR: 128 },
      meropenem:        { sensitivity: 'S', mic: 0.06,  breakpointS: 1,   breakpointR: 4   },
      ertapenem:        { sensitivity: 'S', mic: 0.015, breakpointS: 0.5, breakpointR: 1   },
      amikacin:         { sensitivity: 'S', mic: 2,     breakpointS: 16,  breakpointR: 64  },
      gentamicin:       { sensitivity: 'S', mic: 0.5,   breakpointS: 4,   breakpointR: 16  },
      ciprofloxacin:    { sensitivity: 'S', mic: 0.015, breakpointS: 0.25,breakpointR: 1   },
      levofloxacin:     { sensitivity: 'S', mic: 0.03,  breakpointS: 0.5, breakpointR: 2   },
      tmp_smx:          { sensitivity: 'S', mic: 0.25,  breakpointS: 2,   breakpointR: 4   },
      colistin:         { sensitivity: 'S', mic: 0.5,   breakpointS: 2,   breakpointR: 4   },
      vancomycin:       { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
      metronidazole:    { sensitivity: 'INTRINSEC_R', mic: 128, breakpointS: 8, breakpointR: 32, mechanism: 'E. coli es aerobio facultativo — limitada eficacia' },
    },
  },

  kpneumo_esbl: {
    id: 'kpneumo_esbl', displayName: 'K. pneumoniae (BLEE)',
    gramStain: 'negative', phenotype: 'esbl',
    typicalSource: 'ITU complicada / Peritonitis nosocomial / Bacteriemia',
    resistanceMechs: ['CTX-M-15 (BLEE)', 'Pérdida OmpK36'],
    gramStainDesc: 'Bacilos Gram-negativos capsulados',
    sensitivities: {
      ceftriaxone:      { sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4, mechanism: 'CTX-M-15 (BLEE)' },
      cefotaxime:       { sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4, mechanism: 'CTX-M-15 hidroliza cefalosporinas 3G' },
      cefazolin:        { sensitivity: 'R', mic: 64, breakpointS: 2, breakpointR: 8, mechanism: 'BLEE' },
      cefepime:         { sensitivity: 'R', mic: 16, breakpointS: 2, breakpointR: 16, mechanism: 'CTX-M-15 hidroliza cefepime a CIM altas' },
      amp_sulbac:       { sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 32, mechanism: 'BLEE + pérdida porina' },
      pip_tazo:         { sensitivity: 'I', mic: 32, breakpointS: 16, breakpointR: 128, mechanism: 'BLEE — efecto inóculo variable', clinicalNote: '⚠️ Estudio MERINO (NEJM 2018): mortalidad superior vs Meropenem en BLEE. No usar como definitivo.' },
      meropenem:        { sensitivity: 'S', mic: 0.06, breakpointS: 1, breakpointR: 4 },
      ertapenem:        { sensitivity: 'S', mic: 0.06, breakpointS: 0.5, breakpointR: 1 },
      imipenem:         { sensitivity: 'S', mic: 0.12, breakpointS: 1, breakpointR: 4 },
      amikacin:         { sensitivity: 'S', mic: 4, breakpointS: 16, breakpointR: 64 },
      colistin:         { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4 },
      tigecycline:      { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 8, clinicalNote: 'Bacteriostático — no usar en bacteriemia como monoterapia' },
      vancomycin:       { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
    },
  },

  paeru_mdr: {
    id: 'paeru_mdr', displayName: 'P. aeruginosa (MDR)',
    gramStain: 'negative', phenotype: 'mdr',
    typicalSource: 'NAV / Bacteriemia / Quemaduras / Catéter',
    resistanceMechs: ['AmpC cromosómica', 'Eflujo MexAB-OprM', 'Pérdida OprD'],
    gramStainDesc: 'Bacilos Gram-negativos no fermentadores',
    sensitivities: {
      ceftriaxone:      { sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4, mechanism: 'Resistencia intrínseca' },
      ceftazidime:      { sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 32, mechanism: 'AmpC + eflujo MexAB' },
      cefepime:         { sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 16, mechanism: 'AmpC + eflujo' },
      ceftazidime_avi:  { sensitivity: 'S', mic: 2, breakpointS: 8, breakpointR: 32, clinicalNote: '✅ Activo frente MDR SIN metalo-β-lactamasa (NDM). Ref: Estudio REPROVE' },
      ceftolozane_tazo: { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Activo frente MDR. ASPECT-NP (Kollef NEJM 2019): no inferior a Imipenem en NAV' },
      pip_tazo:         { sensitivity: 'R', mic: 128, breakpointS: 16, breakpointR: 128, mechanism: 'AmpC + eflujo MexAB' },
      meropenem:        { sensitivity: 'R', mic: 16, breakpointS: 2, breakpointR: 8, mechanism: 'Pérdida OprD + AmpC + eflujo' },
      imipenem:         { sensitivity: 'R', mic: 32, breakpointS: 2, breakpointR: 8, mechanism: 'Pérdida OprD' },
      amikacin:         { sensitivity: 'S', mic: 8, breakpointS: 16, breakpointR: 64, clinicalNote: 'Sinergismo con β-lactámicos activos' },
      ciprofloxacin:    { sensitivity: 'R', mic: 4, breakpointS: 0.5, breakpointR: 2 },
      colistin:         { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4 },
      fosfomycin:       { sensitivity: 'I', mic: 64, breakpointS: 64, breakpointR: 256, clinicalNote: 'Uso combinado solamente — resistencia rápida en monoterapia' },
      vancomycin:       { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
    },
  },

  saureus_mrsa: {
    id: 'saureus_mrsa', displayName: 'S. aureus (MRSA)',
    gramStain: 'positive', phenotype: 'mrsa',
    typicalSource: 'Catéter CLABSI / Pie diabético / Endocarditis / NAV',
    resistanceMechs: ['mecA — PBP2a'],
    gramStainDesc: 'Cocos Gram+ en racimos',
    sensitivities: {
      oxacillin:        { sensitivity: 'R', mic: 32, breakpointS: 2, breakpointR: 4, mechanism: 'mecA — PBP2a de baja afinidad' },
      cloxacillin:      { sensitivity: 'R', mic: 32, breakpointS: 2, breakpointR: 4, mechanism: 'mecA' },
      cefazolin:        { sensitivity: 'R', mic: 64, breakpointS: 2, breakpointR: 8, mechanism: 'mecA' },
      ceftriaxone:      { sensitivity: 'R', mic: 64, breakpointS: 8, breakpointR: 16, mechanism: 'mecA' },
      amp_sulbac:       { sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 32, mechanism: 'mecA' },
      pip_tazo:         { sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 16, mechanism: 'mecA' },
      meropenem:        { sensitivity: 'R', mic: 16, breakpointS: 4, breakpointR: 16, mechanism: 'mecA' },
      vancomycin:       { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 16, clinicalNote: 'Objetivo AUC/MIC ≥400 μg·h/mL (ASHP/IDSA 2020). VISA: MIC 4-8; VRSA: MIC ≥16' },
      daptomycin:       { sensitivity: 'S', mic: 0.5, breakpointS: 1, breakpointR: 2, clinicalNote: '⚠️ Contraindicado en neumonía (inactivado por surfactante). Primera línea bacteriemia.' },
      linezolid:        { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8 },
      tmp_smx:          { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 4, clinicalNote: 'MRSA comunitario — no hospitalario con alta resistencia' },
      teicoplanin:      { sensitivity: 'S', mic: 2, breakpointS: 4, breakpointR: 32 },
      colistin:         { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4, mechanism: 'Pared Gram+ — impermeabilidad' },
    },
  },

  saureus_mssa: {
    id: 'saureus_mssa', displayName: 'S. aureus (MSSA)',
    gramStain: 'positive', phenotype: 'wild',
    typicalSource: 'Catéter / Endocarditis / Piel y partes blandas',
    resistanceMechs: [],
    gramStainDesc: 'Cocos Gram+ en racimos',
    sensitivities: {
      oxacillin:        { sensitivity: 'S', mic: 0.25, breakpointS: 2, breakpointR: 4, clinicalNote: '✅ Primera línea en MSSA (superior a Vancomicina)' },
      cloxacillin:      { sensitivity: 'S', mic: 0.25, breakpointS: 2, breakpointR: 4 },
      cefazolin:        { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 8, clinicalNote: '✅ Alternativa en bacteriemia MSSA (no endocarditis)' },
      ceftriaxone:      { sensitivity: 'S', mic: 2, breakpointS: 8, breakpointR: 16 },
      meropenem:        { sensitivity: 'S', mic: 0.12, breakpointS: 4, breakpointR: 16 },
      vancomycin:       { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 16, clinicalNote: '⚠️ Inferior a Oxacilina en MSSA (mayor mortalidad, más nefrotoxicidad)' },
      daptomycin:       { sensitivity: 'S', mic: 0.25, breakpointS: 1, breakpointR: 2 },
      linezolid:        { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8 },
      tmp_smx:          { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 4 },
      colistin:         { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4, mechanism: 'Pared Gram+ impermeabilidad' },
    },
  },

  candida_albicans: {
    id: 'candida_albicans', displayName: 'Candida albicans',
    gramStain: 'fungus', phenotype: 'wild',
    typicalSource: 'Fungemia / Catéter / Candidiasis invasiva',
    resistanceMechs: [],
    gramStainDesc: 'Levaduras con pseudohifas (Gram+ en lab)',
    sensitivities: {
      fluconazole:      { sensitivity: 'S', mic: 0.25, breakpointS: 2,  breakpointR: 8,  clinicalNote: '✅ Primera línea en candidemia no grave (IDSA 2016)' },
      caspofungin:      { sensitivity: 'S', mic: 0.03, breakpointS: 0.25, breakpointR: 1, clinicalNote: '✅ Primera línea en candidemia grave/UCI. IDSA 2016.' },
      micafungin:       { sensitivity: 'S', mic: 0.03, breakpointS: 0.25, breakpointR: 1 },
      amphotericin_b:   { sensitivity: 'S', mic: 0.5,  breakpointS: 1,   breakpointR: 2,  clinicalNote: '⚠️ Alta nefrotoxicidad. Reservar para resistencia a equinocandinas.' },
      voriconazole:     { sensitivity: 'S', mic: 0.03, breakpointS: 0.5, breakpointR: 2 },
    },
  },

  candida_auris: {
    id: 'candida_auris', displayName: 'Candida auris (MDR)',
    gramStain: 'fungus', phenotype: 'mdr',
    typicalSource: 'Fungemia nosocomial MDR / UCI',
    resistanceMechs: ['FKS1/FKS2 mutación (equinocandinas)', 'ERG11 mutación (azoles)', 'ERG3 mutación (AmB)'],
    gramStainDesc: 'Levaduras pequeñas sin pseudohifas',
    sensitivities: {
      fluconazole:      { sensitivity: 'R', mic: 256, breakpointS: 2,  breakpointR: 8,  mechanism: 'ERG11 — resistencia intrínseca en mayoría de cepas' },
      caspofungin:      { sensitivity: 'S', mic: 0.25, breakpointS: 0.25, breakpointR: 1, clinicalNote: '✅ Equinocandinas son primera línea. Vigilar mutaciones FKS.' },
      micafungin:       { sensitivity: 'S', mic: 0.12, breakpointS: 0.25, breakpointR: 1 },
      amphotericin_b:   { sensitivity: 'I', mic: 2, breakpointS: 1, breakpointR: 2, clinicalNote: '⚠️ CIM variable. Preferir equinocandinas. CDC considera resistente en ciertas cepas.' },
      voriconazole:     { sensitivity: 'I', mic: 4, breakpointS: 0.5, breakpointR: 2, clinicalNote: 'Resistencia variable. No usar de primera línea.' },
    },
  },

  acinetobacter_xdr: {
    id: 'acinetobacter_xdr', displayName: 'A. baumannii (XDR)',
    gramStain: 'negative', phenotype: 'xdr',
    typicalSource: 'NAV / Bacteriemia nosocomial / UCIM de trauma',
    resistanceMechs: ['OXA-23 (carbapenemasa)', 'Eflujo AdeABC', 'Pérdida porinas', 'Aminoglucosídasa'],
    gramStainDesc: 'Cocobacillos Gram-negativos',
    sensitivities: {
      meropenem:        { sensitivity: 'R', mic: 32,  breakpointS: 2, breakpointR: 8, mechanism: 'OXA-23 + pérdida porinas' },
      imipenem:         { sensitivity: 'R', mic: 64,  breakpointS: 2, breakpointR: 8, mechanism: 'OXA-23' },
      ceftriaxone:      { sensitivity: 'R', mic: 256, breakpointS: 1, breakpointR: 4, mechanism: 'Múltiples mecanismos' },
      pip_tazo:         { sensitivity: 'R', mic: 256, breakpointS: 16,breakpointR: 128, mechanism: 'XDR' },
      amp_sulbac:       { sensitivity: 'I', mic: 8, breakpointS: 8, breakpointR: 32, clinicalNote: '⚠️ Sulbactam inhibe OXA-23. Posible usar dosis altas (12g/día) en combinación. IDSA 2022.' },
      amikacin:         { sensitivity: 'R', mic: 128, breakpointS: 16, breakpointR: 64 },
      ciprofloxacin:    { sensitivity: 'R', mic: 16, breakpointS: 0.5, breakpointR: 2 },
      colistin:         { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: '✅ Opción de rescate. Uso combinado con Rifampicina o Sulbactam. Nefrotóxico.' },
      tigecycline:      { sensitivity: 'S', mic: 2, breakpointS: 2, breakpointR: 8, clinicalNote: 'Bacteriostático. Uso combinado solamente. No usar en bacteriemia.' },
      cefiderocol:      { sensitivity: 'S', mic: 0.5, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Activo frente XDR incl. metalo-β-lactamasas. IDSA 2023 guías XDR-GNB.' },
      rifampicin:       { sensitivity: 'I', mic: 4, breakpointS: 1, breakpointR: 4, clinicalNote: 'Sólo en combinación (Colistina/Sulbactam). Monoterapia genera resistencia rápida.' },
      vancomycin:       { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
    },
  },

  kpneumo_kpc: {
    id: 'kpneumo_kpc', displayName: 'K. pneumoniae (KPC)',
    gramStain: 'negative', phenotype: 'carbapenemase',
    typicalSource: 'Bacteriemia nosocomial / NAV / ITU nosocomial',
    resistanceMechs: ['KPC-2 (carbapenemasa tipo A)', 'BLEE CTX-M', 'Pérdida OmpK35/36'],
    gramStainDesc: 'Bacilos Gram-negativos encapsulados',
    sensitivities: {
      meropenem:        { sensitivity: 'R', mic: 32, breakpointS: 1, breakpointR: 4, mechanism: 'KPC hidroliza carbapenems' },
      imipenem:         { sensitivity: 'R', mic: 32, breakpointS: 1, breakpointR: 4, mechanism: 'KPC' },
      ertapenem:        { sensitivity: 'R', mic: 16, breakpointS: 0.5,breakpointR: 1, mechanism: 'KPC' },
      ceftriaxone:      { sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4, mechanism: 'KPC + BLEE' },
      cefepime:         { sensitivity: 'R', mic: 32, breakpointS: 2, breakpointR: 16, mechanism: 'KPC + BLEE' },
      ceftazidime_avi:  { sensitivity: 'S', mic: 0.5, breakpointS: 8, breakpointR: 32, clinicalNote: '✅ Primera línea vs KPC. Avibactam inhibe KPC (clase A). NO activo vs NDM/VIM.' },
      meropenem_vaborbactam: { sensitivity: 'S', mic: 0.12, breakpointS: 4, breakpointR: 16, clinicalNote: '✅ Vaborbactam inhibe KPC. TANGO-II (Wunderink, CID 2018): superior a BAT en bacteriemia KPC.' },
      colistin:         { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: 'Opción de rescate. Dosis combinada con ATM o Fosfomicina.' },
      tigecycline:      { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 8, clinicalNote: 'Bacteriostático. No usar como monoterapia en bacteriemia.' },
      cefiderocol:      { sensitivity: 'S', mic: 0.5, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Activo frente KPC. CREDIBLE-CR: no inferior en carbapenemásas.' },
      amikacin:         { sensitivity: 'I', mic: 16, breakpointS: 16, breakpointR: 64 },
      vancomycin:       { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
    },
  },

  cryptococcus_neoformans: {
    id: 'cryptococcus_neoformans', displayName: 'Cryptococcus neoformans',
    gramStain: 'fungus', phenotype: 'wild',
    typicalSource: 'Meningitis fúngica (VIH, trasplante)',
    resistanceMechs: [],
    gramStainDesc: 'Levaduras capsuladas (tinta china +). Gram+ variable.',
    sensitivities: {
      fluconazole:      { sensitivity: 'S', mic: 4, breakpointS: 8, breakpointR: 64, clinicalNote: 'Mantenimiento/consolidación. IDSA 2010: semanas 3-10 (consolidación) = fluconazol 800mg/día.' },
      amphotericin_b:   { sensitivity: 'S', mic: 0.25, breakpointS: 1, breakpointR: 2, clinicalNote: '✅ Primera línea inducción: AmB-lipídica 3-4mg/kg/día × 2 semanas (IDSA 2010).' },
      flucytosine_5fc:  { sensitivity: 'S', mic: 4, breakpointS: 4, breakpointR: 32, clinicalNote: '✅ Sinergismo con AmB en fase de inducción. Vigilar toxicidad hematológica.' },
      voriconazole:     { sensitivity: 'S', mic: 0.12, breakpointS: 1, breakpointR: 4 },
      caspofungin:      { sensitivity: 'INTRINSEC_R', mic: 32, breakpointS: 0.25, breakpointR: 1, mechanism: 'Cryptococcus carece de β(1,3)-D-glucano sensible a equinocandinas' },
    },
  },

  listeria_monocytogenes: {
    id: 'listeria_monocytogenes', displayName: 'Listeria monocytogenes',
    gramStain: 'positive', phenotype: 'wild',
    typicalSource: 'Meningitis en inmunocompr./embarazadas/ancianos / Bacteriemia',
    resistanceMechs: [],
    gramStainDesc: 'Bacilos Gram+ cortos (cocobacilares)',
    sensitivities: {
      ampicillin:       { sensitivity: 'S', mic: 0.25, breakpointS: 2, breakpointR: 4, clinicalNote: '✅ Primera línea. Ampicilina 2g c/4h IV × 3 semanas (meningitis). IDSA 2017.' },
      amp_sulbac:       { sensitivity: 'S', mic: 0.5, breakpointS: 8, breakpointR: 16 },
      tmp_smx:          { sensitivity: 'S', mic: 0.25, breakpointS: 2, breakpointR: 4, clinicalNote: '✅ Alternativa en alérgicos a penicilina.' },
      meropenem:        { sensitivity: 'S', mic: 0.12, breakpointS: 1, breakpointR: 4 },
      linezolid:        { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8 },
      vancomycin:       { sensitivity: 'I', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: '⚠️ No recomendada como primera línea. CIM variable, poca penetración LCR' },
      cephalosporins:   { sensitivity: 'INTRINSEC_R', mic: 128, breakpointS: 1, breakpointR: 4, mechanism: 'Resistencia intrínseca a TODAS las cefalosporinas (recordatorio clínico crucial)' },
    },
  },

  // ── NUEVOS PATÓGENOS PDR/XDR ─────────────────────────────────────────────

  kpneumo_ndm: {
    id: 'kpneumo_ndm', displayName: 'K. pneumoniae (NDM — MBL)',
    gramStain: 'negative', phenotype: 'xdr',
    typicalSource: 'Bacteriemia/UTI nosocomial, UCI prolongada, trasplante',
    resistanceMechs: ['NDM-1/5 (metalo-β-lactamasa — zinc)', 'BLEE CTX-M-15', 'Pérdida OmpK35/36', 'Eflujo AcrAB-TolC'],
    gramStainDesc: 'Bacilos Gram-negativos capsulados fuertemente pigmentados',
    sensitivities: {
      meropenem:            { sensitivity: 'R', mic: 64,  breakpointS: 1, breakpointR: 4, mechanism: 'NDM-1 hidroliza todos los carbapenems vía zinc metaloproteasa' },
      imipenem:             { sensitivity: 'R', mic: 128, breakpointS: 1, breakpointR: 4, mechanism: 'NDM-1' },
      ertapenem:            { sensitivity: 'R', mic: 64,  breakpointS: 0.5,breakpointR: 1, mechanism: 'NDM-1' },
      ceftazidime_avi:      { sensitivity: 'R', mic: 64, breakpointS: 8, breakpointR: 32, mechanism: '⚠️ CRÍTICO: Avibactam NO inhibe MBL (NDM/VIM/IMP) — usar ATM-AVI en su lugar', clinicalNote: '⛔ CAZ-AVI INACTIVO vs NDM. Error clínico grave.' },
      meropenem_vaborbactam:{ sensitivity: 'R', mic: 32, breakpointS: 4, breakpointR: 16, mechanism: 'Vaborbactam tampoco inhibe MBL' },
      aztreonam_avi:        { sensitivity: 'S', mic: 2, breakpointS: 8, breakpointR: 32, clinicalNote: '✅ Único agente activo vs NDM. Avibactam protege aztreonam de MBL. Ref: IDSA XDR-GNB 2023' },
      cefiderocol:          { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Activo vs NDM (mecanismo sideróforo independiente de serinas). Segunda opción.' },
      colistin:             { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: 'Rescate — uso combinado obligatorio. Nefrotoxicidad prominente.' },
      polymyxin_b:          { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: 'Igual que colistina, mejor farmacocinética. Uso combinado.' },
      tigecycline:          { sensitivity: 'I', mic: 2, breakpointS: 2, breakpointR: 8, clinicalNote: 'Bacteriostático — no usar en bacteriemia como monoterapia' },
      fosfomycin:           { sensitivity: 'S', mic: 32, breakpointS: 64, breakpointR: 256, clinicalNote: 'Combinación solamente — resistencia rápida en monoterapia' },
      amikacin:             { sensitivity: 'R', mic: 128, breakpointS: 16, breakpointR: 64, mechanism: 'Aminoglucosídasa NDM co-transferida en plásmido' },
      vancomycin:           { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
      ceftriaxone:          { sensitivity: 'R', mic: 128, breakpointS: 1, breakpointR: 4, mechanism: 'NDM + BLEE' },
    },
  },

  paeru_pdr: {
    id: 'paeru_pdr', displayName: 'P. aeruginosa (PDR)',
    gramStain: 'negative', phenotype: 'xdr',
    typicalSource: 'NAV prolongada / FQ UCI / Bacteriemia hematooncológico',
    resistanceMechs: ['NDM-1 (MBL)', 'VIM-2 (MBL)', 'AmpC desreprimida', 'Eflujo MexAB/MexXY/MexCD triple', 'OprD perdida', 'OprM sobreexpresión'],
    gramStainDesc: 'Bacilos Gram-negativos no fermentadores (olor uvas)',
    sensitivities: {
      meropenem:            { sensitivity: 'R', mic: 128, breakpointS: 2, breakpointR: 8, mechanism: 'NDM + pérdida OprD + eflujo' },
      imipenem:             { sensitivity: 'R', mic: 256, breakpointS: 2, breakpointR: 8, mechanism: 'NDM + OprD + eflujo' },
      ceftazidime_avi:      { sensitivity: 'R', mic: 64,  breakpointS: 8, breakpointR: 32, mechanism: 'NDM/VIM neutralizan CAZ-AVI — avibactam no inhibe MBL' },
      ceftolozane_tazo:     { sensitivity: 'R', mic: 64,  breakpointS: 4, breakpointR: 8, mechanism: 'Eflujo triple + AmpC desreprimida', clinicalNote: '⚠️ PDR resistente también a ceftolozano — diferente de MDR' },
      aztreonam_avi:        { sensitivity: 'S', mic: 4, breakpointS: 8, breakpointR: 32, clinicalNote: '✅ Principal opción vs PDR con MBL. Monitorear CIM — pueden emergir resistencias.' },
      imipenem_relebactam:  { sensitivity: 'R', mic: 64, breakpointS: 4, breakpointR: 16, mechanism: 'Relebactam no inhibe MBL (NDM/VIM) — sólo AmpC/KPC' },
      cefiderocol:          { sensitivity: 'S', mic: 1, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Alta actividad vs PDR Pseudomonas. Mejor opción disponible vs PDR.' },
      colistin:             { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: 'Uso combinado obligatorio. Evitar monoterapia (heterorresistencia).' },
      polymyxin_b:          { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4, clinicalNote: 'Complementa cefiderocol en combinación.' },
      fosfomycin:           { sensitivity: 'I', mic: 128, breakpointS: 64, breakpointR: 256, clinicalNote: 'Uso combinado solamente. MIC alta en PDR.' },
      amikacin:             { sensitivity: 'R', mic: 256, breakpointS: 16, breakpointR: 64, mechanism: 'Aminoglucosidasa co-transferida con MBL' },
      ciprofloxacin:        { sensitivity: 'R', mic: 32,  breakpointS: 0.5, breakpointR: 2, mechanism: 'Punto mutación GyrA + eflujo MexCD' },
      vancomycin:           { sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4, mechanism: 'Membrana externa Gram-negativa' },
    },
  },

  efaecium_vre: {
    id: 'efaecium_vre', displayName: 'E. faecium (VRE)',
    gramStain: 'positive', phenotype: 'mdr',
    typicalSource: 'Bacteriemia nosocomial / UTI / Peritonitis / Trasplante',
    resistanceMechs: ['vanA (vancomicina + teicoplanina R)', 'PBP5 (β-lactámicos R)'],
    gramStainDesc: 'Cocos Gram+ en pares o cadenas cortas',
    sensitivities: {
      vancomycin:           { sensitivity: 'R', mic: 512, breakpointS: 4, breakpointR: 32, mechanism: 'VanA — reprogramación D-Ala-D-Lac (no reconoce glicopéptido)' },
      teicoplanin:          { sensitivity: 'R', mic: 256, breakpointS: 8, breakpointR: 32, mechanism: 'VanA (diferente de VanB que respeta teicoplanina)' },
      linezolid:            { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 8, clinicalNote: '✅ Primera línea VRE (IDSA). Bacteriostático — no usar en endocarditis grave.' },
      tedizolid:            { sensitivity: 'S', mic: 0.5, breakpointS: 0.5, breakpointR: 2, clinicalNote: '✅ Mayor potencia que linezolid — menor toxicidad hematológica.' },
      daptomycin:           { sensitivity: 'S', mic: 2, breakpointS: 4, breakpointR: 8, clinicalNote: '✅ Bactericida — preferido en bacteriemia grave/endocarditis VRE. Usar ≥8mg/kg.' },
      ampicillin:           { sensitivity: 'R', mic: 256, breakpointS: 8, breakpointR: 16, mechanism: 'PBP5 de alta satur. — E. faecium intrínsecamente resistente a ampicilina' },
      tigecycline:          { sensitivity: 'S', mic: 0.12, breakpointS: 0.25, breakpointR: 1, clinicalNote: 'Opción en infección intraabdominal — no usar en bacteriemia (FDA warning).' },
      omadacycline:         { sensitivity: 'S', mic: 0.12, breakpointS: 0.5, breakpointR: 2 },
      ciprofloxacin:        { sensitivity: 'R', mic: 64,  breakpointS: 1, breakpointR: 4, mechanism: 'Mutación punto GyrA — resistencia intrínseca alta' },
      cephalosporins:       { sensitivity: 'INTRINSEC_R', mic: 128, breakpointS: 1, breakpointR: 4, mechanism: 'Resistencia intrínseca a todas las cefalosporinas (recordar siempre)' },
    },
  },

  aspergillus_fumigatus: {
    id: 'aspergillus_fumigatus', displayName: 'Aspergillus fumigatus',
    gramStain: 'fungus', phenotype: 'wild',
    typicalSource: 'Neumonía invasiva (neutropenia <100/μL, trasplante, corticoides prolongados)',
    resistanceMechs: [],
    gramStainDesc: 'Hifas septadas con ramificación en 45° (PAS+/Gomori+ en biopsia)',
    sensitivities: {
      voriconazole:         { sensitivity: 'S', mic: 0.5, breakpointS: 1, breakpointR: 2, clinicalNote: '✅ Primera línea Aspergilosis Invasiva (IDSA 2016). Niveles 1-5.5 μg/mL.' },
      isavuconazole:        { sensitivity: 'S', mic: 1,   breakpointS: 2, breakpointR: 4, clinicalNote: '✅ No inferior a Voriconazol (SECURE trial 2016). Mejor tolerabilidad.' },
      caspofungin:          { sensitivity: 'S', mic: 0.5, breakpointS: 0.5, breakpointR: 2, clinicalNote: 'Segunda línea o terapia de rescate (IDSA 2016). Sinergia con azoles posible.' },
      micafungin:           { sensitivity: 'S', mic: 0.5, breakpointS: 0.5, breakpointR: 2 },
      amphotericin_b:       { sensitivity: 'S', mic: 0.5, breakpointS: 1, breakpointR: 2, clinicalNote: 'Alternativa. Forma liposomal preferida (5mg/kg/día). Evitar desoxicolato.' },
      fluconazole:          { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 8, mechanism: 'Aspergillus intrínsecamente resistente a fluconazol (target diferente ERG11)' },
    },
  },

  // ── Contaminante hemocultivo (simulación pedagógica — 1/2 botellas) ─────────
  s_epidermidis_contaminant: {
    id: 's_epidermidis_contaminant',
    displayName: 'S. epidermidis (Probable Contaminante)',
    gramStain: 'positive', phenotype: 'wild',
    typicalSource: 'Contaminante de piel — hemocultivo pseudo-positivo',
    resistanceMechs: [],
    gramStainDesc: 'Cocos Gram+ en pares/racimos — flora cutánea normal',
    sensitivities: {
      vancomycin:  { sensitivity: 'S', mic: 0.5,  breakpointS: 4,  breakpointR: 16 },
      oxacillin:   { sensitivity: 'S', mic: 0.25, breakpointS: 2,  breakpointR: 4  },
      linezolid:   { sensitivity: 'S', mic: 1.0,  breakpointS: 4,  breakpointR: 8  },
      daptomycin:  { sensitivity: 'S', mic: 0.25, breakpointS: 1,  breakpointR: 2  },
      colistin:    { sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4, mechanism: 'Pared Gram+ impermeabilidad' },
    },
  },

};

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE ANTIBIÓTICOS — Vademécum Sanford 2025 Ampliado
// ══════════════════════════════════════════════════════════════════════════════

export interface AntibioticDef {
  id:                   string;
  displayName:          string;
  shortName:            string;   // Monitor: CRO, MEM, VAN...
  class:                string;
  pkpdType:             PKPDType;
  peakConcentration:    number;   // μg/mL (Cmax tras dosis estándar)
  halfLifeHours:        number;
  doseIntervalHours:    number;
  doseStandard:         string;   // Descripción dosis (ej: "1g IV c/8h")
  canExtendedInfusion:  boolean;
  extendedBonus:        number;   // fracción de mejora T>MIC con inf. extendida
  nephrotoxic:          boolean;
  nephroStressorRate:   number;   // incremento Cr/h de uso
  cnsPermeability:      'good' | 'moderate' | 'poor' | 'none'; // penetración LCR
  spectrum:             'narrow' | 'broad' | 'anti_anaerobic' | 'anti_fungal' | 'anti_gram_pos' | 'anti_gram_neg';
  notes:                string[];  // notas clínicas clave
}

export const ANTIBIOTIC_CATALOG: Record<string, AntibioticDef> = {

  // ─── PENICILINAS ──────────────────────────────────────────────────────────
  ampicillin: {
    id: 'ampicillin', displayName: 'Ampicilina 2g IV c/4h',
    shortName: 'AMP', class: 'Aminopenicilina',
    pkpdType: 'time', peakConcentration: 125, halfLifeHours: 1, doseIntervalHours: 4,
    doseStandard: '2g IV c/4h (meningitis: 2g c/4h × 3 semanas)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'narrow',
    notes: ['Primera línea Listeria monocytogenes', 'Enterococcus (no VRE)'],
  },

  oxacillin: {
    id: 'oxacillin', displayName: 'Oxacilina 2g IV c/4h',
    shortName: 'OXA', class: 'Penicilina antiestafilocócica',
    pkpdType: 'time', peakConcentration: 45, halfLifeHours: 0.5, doseIntervalHours: 4,
    doseStandard: '2g IV c/4h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.001,
    cnsPermeability: 'poor', spectrum: 'anti_gram_pos',
    notes: ['Primera línea MSSA (bacteriemia/endocarditis)', 'Superior a Vancomicina en MSSA — IDSA 2011'],
  },

  cloxacillin: {
    id: 'cloxacillin', displayName: 'Cloxacilina 2g IV c/6h',
    shortName: 'CLO', class: 'Penicilina antiestafilocócica',
    pkpdType: 'time', peakConcentration: 40, halfLifeHours: 0.5, doseIntervalHours: 6,
    doseStandard: '2g IV c/6h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'anti_gram_pos',
    notes: ['Alternativa a Oxacilina en MSSA', 'Disponibilidad variable según región'],
  },

  amp_sulbac: {
    id: 'amp_sulbac', displayName: 'Ampicilina/Sulbactam 3g IV c/6h',
    shortName: 'AMS', class: 'Aminopenicilina + IBL',
    pkpdType: 'time', peakConcentration: 150, halfLifeHours: 1, doseIntervalHours: 6,
    doseStandard: '3g IV c/6h (A. baumannii XDR: 9g/día en inf. extendida)',
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'broad',
    notes: ['Sulbactam activo vs A. baumannii (inhibe OXA-23)', 'IDSA 2022 XDR: Sulbactam 9g/día en combinación'],
  },

  amoxicillin_clav: {
    id: 'amoxicillin_clav', displayName: 'Amoxicilina/Clavulánico 1.2g IV c/8h',
    shortName: 'AMC', class: 'Aminopenicilina + IBL',
    pkpdType: 'time', peakConcentration: 60, halfLifeHours: 1, doseIntervalHours: 8,
    doseStandard: '1.2g IV c/8h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: ['Uso principalmente oral (escalon IV→VO)', 'No cobertura Pseudomonas'],
  },

  pip_tazo: {
    id: 'pip_tazo', displayName: 'Piperacilina/Tazobactam 4.5g IV c/6h',
    shortName: 'PTZ', class: 'Ureidopenicilina + IBL',
    pkpdType: 'time', peakConcentration: 300, halfLifeHours: 1, doseIntervalHours: 6,
    doseStandard: '4.5g IV c/6h (extendida: 4.5g en 4h c/6h)',
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: ['⚠️ NO usar como definitivo en BLEE — Estudio MERINO NEJM 2018', 'Cobertura antianaeróbica + anti-Pseudomonas'],
  },

  // ─── CEFALOSPORINAS ───────────────────────────────────────────────────────
  cefazolin: {
    id: 'cefazolin', displayName: 'Cefazolina 2g IV c/8h',
    shortName: 'CFZ', class: 'Cefalosporina 1G',
    pkpdType: 'time', peakConcentration: 185, halfLifeHours: 1.8, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h (profilaxis quirúrgica: 2g previo a incisión)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'narrow',
    notes: ['Excelente para MSSA bacteriemia (no endocarditis)', 'Profilaxis quirúrgica de elección'],
  },

  ceftriaxone: {
    id: 'ceftriaxone', displayName: 'Ceftriaxona 2g IV c/24h',
    shortName: 'CRO', class: 'Cefalosporina 3G',
    pkpdType: 'time', peakConcentration: 250, halfLifeHours: 8, doseIntervalHours: 24,
    doseStandard: '2g IV c/24h (meningitis: 2g c/12h)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Excelente penetración LCR (meningitis bacteriana)', 'NO cobertura Pseudomonas', 'Empírico NAC grave + meningitis bacteriana'],
  },

  cefotaxime: {
    id: 'cefotaxime', displayName: 'Cefotaxime 2g IV c/8h',
    shortName: 'CTX', class: 'Cefalosporina 3G',
    pkpdType: 'time', peakConcentration: 100, halfLifeHours: 1, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h (meningitis: 2g c/4h)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Alternativa a Ceftriaxona en meningitis bacteriana', 'Penetración LCR adecuada'],
  },

  ceftazidime: {
    id: 'ceftazidime', displayName: 'Ceftazidima 2g IV c/8h',
    shortName: 'CAZ', class: 'Cefalosporina 3G anti-Pseudomonas',
    pkpdType: 'time', peakConcentration: 100, halfLifeHours: 1.6, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h',
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_gram_neg',
    notes: ['Actividad anti-Pseudomonas (sensible)', 'Combinación con aminoglucósidos en MDR grave'],
  },

  cefepime: {
    id: 'cefepime', displayName: 'Cefepime 2g IV c/8h',
    shortName: 'FEP', class: 'Cefalosporina 4G',
    pkpdType: 'time', peakConcentration: 160, halfLifeHours: 2, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h (NAV/pseudomónica: 2g c/8h en inf. extendida)',
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Actividad anti-Pseudomonas salvaje', '⚠️ Neurotoxicidad a dosis altas (encefalopatía)'],
  },

  ceftazidime_avi: {
    id: 'ceftazidime_avi', displayName: 'Ceftazidima/Avibactam 2.5g IV c/8h',
    shortName: 'CZA', class: 'Cefalosporina 3G + INBL nueva generación',
    pkpdType: 'time', peakConcentration: 60, halfLifeHours: 2, doseIntervalHours: 8,
    doseStandard: '2.5g IV c/8h (en 2h de infusión)',
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: ['✅ KPC, OXA-48 (NO NDM/VIM)', 'P. aeruginosa MDR (sin MBL)', '⚠️ Resistencia emerge si se usa en NDM', 'REPROVE trial: aprobado VAP/HAP'],
  },

  ceftolozane_tazo: {
    id: 'ceftolozane_tazo', displayName: 'Ceftolozano/Tazobactam 1.5g IV c/8h',
    shortName: 'CTO', class: 'Cefalosporina + IBL (anti-Pseudomonas)',
    pkpdType: 'time', peakConcentration: 70, halfLifeHours: 3, doseIntervalHours: 8,
    doseStandard: '1.5g IV c/8h (NAV: 3g c/8h en 1h)',
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: ['✅ P. aeruginosa MDR (AmpC, MexAB, sin MBL)', 'ASPECT-NP (Kollef NEJM 2019): no inferior a Imipenem en NAV por Pseudomonas', '⚠️ NO activo frente Acinetobacter'],
  },

  // ─── CARBAPENEMS ──────────────────────────────────────────────────────────
  meropenem: {
    id: 'meropenem', displayName: 'Meropenem 1g IV c/8h',
    shortName: 'MEM', class: 'Carbapenémico',
    pkpdType: 'time', peakConcentration: 50, halfLifeHours: 1, doseIntervalHours: 8,
    doseStandard: '1g IV c/8h (BLEE: 2g c/8h en 3h; meningitis: 2g c/8h)',
    canExtendedInfusion: true, extendedBonus: 0.25,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Gold standard BLEE (Estudio MERINO)', 'No cubre MRSA, Listeria, Enterococcus VRE', 'Preservar para resistencias'],
  },

  imipenem: {
    id: 'imipenem', displayName: 'Imipenem/Cilastatina 500mg IV c/6h',
    shortName: 'IMI', class: 'Carbapenémico',
    pkpdType: 'time', peakConcentration: 30, halfLifeHours: 1, doseIntervalHours: 6,
    doseStandard: '500mg IV c/6h (1g c/6h en infecciones graves)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.001,
    cnsPermeability: 'moderate', spectrum: 'broad',
    notes: ['⚠️ Mayor riesgo convulsiones vs Meropenem', 'Preferir Meropenem en SNC', 'Cubre anaerobios'],
  },

  ertapenem: {
    id: 'ertapenem', displayName: 'Ertapenem 1g IV c/24h',
    shortName: 'ERT', class: 'Carbapenémico (1× día)',
    pkpdType: 'time', peakConcentration: 155, halfLifeHours: 4, doseIntervalHours: 24,
    doseStandard: '1g IV c/24h (o IM en ambulatorio)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: ['✅ Escalón a domicilio (1×/día IV o IM)', '⚠️ NO cubre Pseudomonas ni Acinetobacter', 'Útil BLEE en tratamiento ambulatorio'],
  },

  meropenem_vaborbactam: {
    id: 'meropenem_vaborbactam', displayName: 'Meropenem/Vaborbactam 2g IV c/8h (3h)',
    shortName: 'MVB', class: 'Carbapenémico + INBL cicloboronato',
    pkpdType: 'time', peakConcentration: 50, halfLifeHours: 1.5, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h en 3h de infusión',
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: ['✅ KPC (vaborbactam inhibe KPC clasé A)', 'TANGO-II: superioridad vs BAT en KPC-Klebsiella', '⚠️ NO activo frente NDM o VIM'],
  },

  // ─── AMINOGLUCÓSIDOS ──────────────────────────────────────────────────────
  amikacin: {
    id: 'amikacin', displayName: 'Amikacina 15-20mg/kg IV c/24h',
    shortName: 'AMK', class: 'Aminoglucósido',
    pkpdType: 'conc', peakConcentration: 65, halfLifeHours: 2, doseIntervalHours: 24,
    doseStandard: '15-20 mg/kg IV c/24h (dosis única diaria)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.004,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: ['Cmax/MIC ≥8-10 (concentración-dependiente)', 'Terapia monodosis diaria (menor nefrotoxicidad)', '⚠️ Ototoxicidad/nefrotoxicidad — monitorear niveles', 'Sinergismo con β-lactámicos en Pseudomonas/Acinetobacter'],
  },

  gentamicin: {
    id: 'gentamicin', displayName: 'Gentamicina 5-7mg/kg IV c/24h',
    shortName: 'GEN', class: 'Aminoglucósido',
    pkpdType: 'conc', peakConcentration: 25, halfLifeHours: 2, doseIntervalHours: 24,
    doseStandard: '5-7 mg/kg IV c/24h (monodosis)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.005,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: ['⚠️ Mayor resistencia que Amikacina en MDR', 'Sinergismo clásico con Ampicilina vs Enterococcus', 'Monitorear función renal diariamente'],
  },

  tobramycin: {
    id: 'tobramycin', displayName: 'Tobramicina 7mg/kg IV c/24h',
    shortName: 'TOB', class: 'Aminoglucósido',
    pkpdType: 'conc', peakConcentration: 25, halfLifeHours: 2, doseIntervalHours: 24,
    doseStandard: '7mg/kg IV c/24h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.004,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: ['Actividad anti-Pseudomonas ligeramente superior a Gentamicina', 'Alternativa a Amikacina en Pseudomonas'],
  },

  // ─── GLUCOPÉPTIDOS ────────────────────────────────────────────────────────
  vancomycin: {
    id: 'vancomycin', displayName: 'Vancomicina IV (AUC-guiada)',
    shortName: 'VAN', class: 'Glucopéptido',
    pkpdType: 'auc', peakConcentration: 40, halfLifeHours: 6, doseIntervalHours: 12,
    doseStandard: '25-30 mg/kg/día en 2-3 dosis (objetivo AUC24/MIC 400-600)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.003,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_pos',
    notes: ['Objetivo AUC24/MIC 400-600 μg·h/mL (ASHP/IDSA/SIDP 2020)', 'MRSA primera línea', '⚠️ VISA (MIC 4-8): inferior — considerar Daptomicina', 'Monitorizar niveles: valle 15-20 mg/L en meningitis'],
  },

  teicoplanin: {
    id: 'teicoplanin', displayName: 'Teicoplanina 6mg/kg IV c/12h × 3 dosis, luego c/24h',
    shortName: 'TEI', class: 'Glucopéptido',
    pkpdType: 'auc', peakConcentration: 50, halfLifeHours: 70, doseIntervalHours: 24,
    doseStandard: '6mg/kg IV c/12h × 3 dosis de carga, luego 6mg/kg c/24h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.002,
    cnsPermeability: 'poor', spectrum: 'anti_gram_pos',
    notes: ['Alternativa a Vancomicina (menos nefrotóxico)', 'Dosis de carga esencial', '⚠️ Menor penetración LCR que Vancomicina'],
  },

  dalbavancin: {
    id: 'dalbavancin', displayName: 'Dalbavancina 1500mg IV (dosis única) o 1000mg + 500mg',
    shortName: 'DAL', class: 'Glucopéptido lipofílico (2G)',
    pkpdType: 'auc', peakConcentration: 280, halfLifeHours: 336, doseIntervalHours: 168,
    doseStandard: '1500mg IV dosis única (o 1000mg día 1 + 500mg día 8)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'anti_gram_pos',
    notes: ['t½ = 14 días — dosis única semanal para ambulatorio', 'Bacteriemia MRSA y MSSA — escalón ambulatorio', 'No aprobado meningitis ni endocarditis actualmente'],
  },

  // ─── OXAZOLIDINONAS ───────────────────────────────────────────────────────
  linezolid: {
    id: 'linezolid', displayName: 'Linezolid 600mg IV/VO c/12h',
    shortName: 'LZD', class: 'Oxazolidinona',
    pkpdType: 'auc', peakConcentration: 18, halfLifeHours: 5.5, doseIntervalHours: 12,
    doseStandard: '600mg IV o VO c/12h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_gram_pos',
    notes: ['Excelente biodisponibilidad oral (100%)', 'MRSA, VRE, Listeria meningitis', '⚠️ Bacteriostático (no bacteriemia MRSA)', '⚠️ > 2 semanas: trombocitopenia, neuropatía óptica', '⚠️ Interacción serotonérgica (IMAO, ISRS)'],
  },

  // ─── QUINOLONAS ───────────────────────────────────────────────────────────
  ciprofloxacin: {
    id: 'ciprofloxacin', displayName: 'Ciprofloxacina 400mg IV c/8h',
    shortName: 'CIP', class: 'Fluoroquinolona',
    pkpdType: 'auc', peakConcentration: 5, halfLifeHours: 4, doseIntervalHours: 8,
    doseStandard: '400mg IV c/8h (400mg c/12h en ITU)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_gram_neg',
    notes: ['Mejor actividad anti-Pseudomonas entre quinolonas', '⚠️ Alta resistencia Gram–/Pseudomonas MDR', 'Alargamiento QT — ECG basal', 'AUC/MIC ≥125 vs Gram-negativos'],
  },

  levofloxacin: {
    id: 'levofloxacin', displayName: 'Levofloxacina 750mg IV/VO c/24h',
    shortName: 'LEV', class: 'Fluoroquinolona',
    pkpdType: 'auc', peakConcentration: 12, halfLifeHours: 7, doseIntervalHours: 24,
    doseStandard: '750mg IV c/24h (NAC: 500-750mg c/24h)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Excelente actividad anti-neumocócica (quinolona respiratoria)', 'Buena biodisponibilidad oral (99%)', '⚠️ Alargamiento QT, tenditis aquiliana'],
  },

  // ─── OTROS ANTIBACTERIANOS ────────────────────────────────────────────────
  metronidazole: {
    id: 'metronidazole', displayName: 'Metronidazol 500mg IV c/8h',
    shortName: 'MTZ', class: 'Nitroimidazol (antianaeróbico)',
    pkpdType: 'auc', peakConcentration: 25, halfLifeHours: 8, doseIntervalHours: 8,
    doseStandard: '500mg IV c/8h (C. difficile: 500mg VO c/8h × 10 días)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_anaerobic',
    notes: ['Antianaeróbico fundamental (abscesos, peritonitis)', 'Combinación con β-lactámicos en infecciones mixtas', 'Penetración LCR: absceso cerebral (combinado)'],
  },

  tmp_smx: {
    id: 'tmp_smx', displayName: 'Trimetoprim/Sulfametoxazol 5mg/kg/TMP IV c/6-8h',
    shortName: 'TMP', class: 'Sulfamida + Antimetabolito folato',
    pkpdType: 'time', peakConcentration: 10, halfLifeHours: 10, doseIntervalHours: 8,
    doseStandard: '5mg/kg (de TMP) IV c/6-8h (PCP: 15-20mg/kg/día en 3-4 dosis)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.001,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Primera línea Pneumocystis jirovecii (PCP)', 'MRSA comunitario (VO)', 'Listeria (alternativa en alérgicos a penicilina)', '⚠️ Hiperpotasemia (inhibe secreción tubular K+)'],
  },

  tigecycline: {
    id: 'tigecycline', displayName: 'Tigeciclina 100mg IV (carga), luego 50mg c/12h',
    shortName: 'TIG', class: 'Glicilciclina',
    pkpdType: 'auc', peakConcentration: 0.87, halfLifeHours: 42, doseIntervalHours: 12,
    doseStandard: '100mg IV carga, luego 50mg c/12h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: ['Activo vs MDR/XDR Gram–, MRSA, anaerobios', '⚠️ BACTERIOSTÁTICO — no usar en bacteriemia como monoterapia (FDA metaanálisis: ↑mortalidad)', '⚠️ Niveles séricos muy bajos (IMA) — alto Vd', 'Uso en combinación ZAP/NAV/IAC compleja'],
  },

  colistin: {
    id: 'colistin', displayName: 'Colistina (CMS) 9M UI carga, luego 4.5M UI c/12h',
    shortName: 'COL', class: 'Polimixina B/E',
    pkpdType: 'conc', peakConcentration: 12, halfLifeHours: 5, doseIntervalHours: 12,
    doseStandard: '9M UI IV carga, luego 4.5M UI c/12h (ajustar a CrCl)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.008,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: ['Rescate XDR: A. baumannii, P. aeruginosa XDR, KPC', '⚠️ Nefrotoxicidad prominente (40-60%)', 'Dosis de carga OBLIGATORIA (farmacocinética)', 'Uso combinado — monoterapia ↑ mortalidad/resistencia'],
  },

  fosfomycin: {
    id: 'fosfomycin', displayName: 'Fosfomicina 8g IV c/8h',
    shortName: 'FOS', class: 'Antibacteriano (inhibidor pared, único mecanismo)',
    pkpdType: 'time', peakConcentration: 260, halfLifeHours: 4, doseIntervalHours: 8,
    doseStandard: '8g IV c/8h (uso combinado obligatorio)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Uso COMBINADO obligatorio (resistencia rápida en monoterapia)', 'Activo vs KPC, E. coli MDR, S. aureus (MRSA biofilm)', '⚠️ Sobrecarga sódica significativa (8g = 6.7g Na+)'],
  },

  daptomycin: {
    id: 'daptomycin', displayName: 'Daptomicina 6-10mg/kg IV c/24h',
    shortName: 'DAP', class: 'Lipopéptido cíclico',
    pkpdType: 'conc', peakConcentration: 100, halfLifeHours: 9, doseIntervalHours: 24,
    doseStandard: '6mg/kg/día (bacteriemia MRSA); 10mg/kg/día (endocarditis derecha)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.001,
    cnsPermeability: 'poor', spectrum: 'anti_gram_pos',
    notes: ['✅ Primera línea bacteriemia MRSA (superior a Vancomicina)', '⚠️ CONTRAINDICADO en neumonía (inactivado por surfactante)', '⚠️ CK semanal — miopatía dosis-dependiente', 'Bactericida (membrana celular)'],
  },

  // ─── ANTIFÚNGICOS ─────────────────────────────────────────────────────────
  fluconazole: {
    id: 'fluconazole', displayName: 'Fluconazol 400-800mg IV/VO c/24h',
    shortName: 'FLU', class: 'Antifúngico azólico',
    pkpdType: 'auc', peakConcentration: 12, halfLifeHours: 30, doseIntervalHours: 24,
    doseStandard: '400-800mg IV c/24h (carga: 800mg el día 1)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_fungal',
    notes: ['Primera línea candidemia leve-moderada (IDSA 2016)', 'Excelente penetración LCR (meningitis criptocócica: consolidación)', '⚠️ NO activo vs C. glabrata, C. krusei, C. auris', 'Interacción con warfarina, tacrolimus, sirolimus'],
  },

  caspofungin: {
    id: 'caspofungin', displayName: 'Caspofungina 70mg IV (carga), luego 50mg c/24h',
    shortName: 'CAS', class: 'Antifúngico equinocandina',
    pkpdType: 'auc', peakConcentration: 12, halfLifeHours: 10, doseIntervalHours: 24,
    doseStandard: '70mg IV carga, luego 50mg IV c/24h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'none', spectrum: 'anti_fungal',
    notes: ['✅ Primera línea candidemia grave/UCI (IDSA 2016)', 'Activo vs C. albicans, C. auris, C. glabrata', 'Dosis de carga OBLIGATORIA', '⚠️ No penetra LCR — no meningitis fúngica', '⚠️ No activo vs Cryptococcus (falta de diana)'],
  },

  micafungin: {
    id: 'micafungin', displayName: 'Micafungina 100mg IV c/24h',
    shortName: 'MFG', class: 'Antifúngico equinocandina',
    pkpdType: 'auc', peakConcentration: 10, halfLifeHours: 15, doseIntervalHours: 24,
    doseStandard: '100mg IV c/24h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'none', spectrum: 'anti_fungal',
    notes: ['Alternativa a Caspofungina en candidemia', 'Disponible sin dosis de carga', '⚠️ No penetra LCR'],
  },

  amphotericin_b: {
    id: 'amphotericin_b', displayName: 'Anfotericina B liposomal 3-5mg/kg IV c/24h',
    shortName: 'AMB', class: 'Antifúngico poliénico',
    pkpdType: 'conc', peakConcentration: 50, halfLifeHours: 24, doseIntervalHours: 24,
    doseStandard: '3-5mg/kg IV c/24h (liposomal — L-AmB)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.010,
    cnsPermeability: 'good', spectrum: 'anti_fungal',
    notes: ['✅ Meningitis criptocócica: inducción 3-4mg/kg/día × 2 semanas (IDSA 2010)', '✅ Aspergillosis invasiva (alternativa a Voriconazol)', '⚠️ NEFROTÓXICO (forma desoxicolato ampliada hoy evitada)', 'Premedicar: acetaminofén + difenhidramina'],
  },

  voriconazole: {
    id: 'voriconazole', displayName: 'Voriconazol 6mg/kg IV c/12h × 2 dosis, luego 4mg/kg c/12h',
    shortName: 'VOR', class: 'Antifúngico triazólico 2G',
    pkpdType: 'auc', peakConcentration: 4, halfLifeHours: 6, doseIntervalHours: 12,
    doseStandard: '6mg/kg IV c/12h × 2 dosis de carga, luego 4mg/kg c/12h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_fungal',
    notes: ['✅ Primera línea Aspergillus invasivo (IDSA 2016)', 'Monitorizar niveles séricos (metabolismo CYP2C19 variable)', '⚠️ Hepatotoxicidad, fototoxicidad, alucinaciones', 'Interacciones múltiples (CYP)'],
  },

  // ─── ANTIBIÓTICOS RESCATE / ÚLTIMA LÍNEA ──────────────────────────────────
  cefiderocol: {
    id: 'cefiderocol', displayName: 'Cefiderocol 2g IV c/8h (3h)',
    shortName: 'FDC', class: 'Cefalosporina siderófora (última línea)',
    pkpdType: 'time', peakConcentration: 35, halfLifeHours: 2.5, doseIntervalHours: 8,
    doseStandard: '2g IV c/8h en 3h de infusión',
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: ['✅ XDR/PDR Gram– incl. NDM, VIM, IMP, OXA-48, OXA-23', 'CREDIBLE-CR: no inferior vs BAT frente carbapenem-r', 'IDSA 2023: recomendado en BR-GNB (XDR tratamiento)', '⚠️ Reservar para últimas líneas — prevenir resistencia'],
  },

  rifampicin: {
    id: 'rifampicin', displayName: 'Rifampicina 600mg IV c/12h',
    shortName: 'RIF', class: 'Rifamicina (antituberculoso/combinación)',
    pkpdType: 'auc', peakConcentration: 12, halfLifeHours: 3, doseIntervalHours: 12,
    doseStandard: '600mg IV c/12h (en combinación)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'broad',
    notes: ['Uso EXCLUSIVO en combinación (resistencia rápida en monoterapia)', 'Combinación: A. baumannii XDR + Colistina', 'Gran inductor CYP3A4 (interacciones múltiples)', 'Colorea orina/lágrimas color naranja'],
  },

  // ─── ÚLTIMA LÍNEA PDR/XDR — NUEVOS AGENTES ────────────────────────────────

  aztreonam: {
    id: 'aztreonam', displayName: 'Aztreonam 2g IV c/6-8h',
    shortName: 'ATM', class: 'Monobactam',
    pkpdType: 'time', peakConcentration: 125, halfLifeHours: 1.5, doseIntervalHours: 8,
    doseStandard: '2g IV c/6-8h (combinación con CAZ-AVI en MBL: 6-8g/día fraccionado)',
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: [
      '⚠️ Hidrolizado por BLEE/KPC/OXA-48 — SOLO estable frente a MBL (NDM, VIM, IMP)',
      '✅ COMBINACIÓN CAZ-AVI + ATM: avibactam de CAZ-AVI protege aztreonam de hidrólisis por serina-carbapenemasas (IDSA XDR-GNB 2023)',
      'Alternativa off-label a ATM-AVI cuando Aztreonam/Avibactam no disponible',
      'Ref: van Duin D, CID 2020 — sinergismo validado vs NDM/VIM co-productores de BLEE',
    ],
  },

  aztreonam_avi: {
    id: 'aztreonam_avi', displayName: 'Aztreonam/Avibactam 6g IV c/8h (3h)',
    shortName: 'ATM-AVI', class: 'Monobactam + INBL (anti-MBL)',
    pkpdType: 'time', peakConcentration: 55, halfLifeHours: 1.5, doseIntervalHours: 8,
    doseStandard: '6g IV c/8h en 3h de infusión (aztreonam 4g + avibactam 2g)',
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: [
      '✅ ÚNICO activo vs NDM, VIM, IMP (metalo-β-lactamasas) — avibactam protege aztreonam de hidrólisis',
      '✅ Combinación estratégica caz-avi + aztreonam para XDR con múltiples MBL',
      'Ref: van Duin D, CID 2020; REVISIÓN IDSA XDR-GNB 2023',
      '⚠️ NO disponible en todos los países — uso compasivo en muchos centros',
      'Monitorizar función renal (ajustar dosis en CrCl < 30)',
    ],
  },

  imipenem_relebactam: {
    id: 'imipenem_relebactam', displayName: 'Imipenem/Cilastatina/Relebactam 1.25g IV c/6h',
    shortName: 'IMI-REL', class: 'Carbapenémico + INBL piperidine',
    pkpdType: 'time', peakConcentration: 45, halfLifeHours: 1, doseIntervalHours: 6,
    doseStandard: '1.25g IV c/6h (500mg IMI + 250mg REL en 30 min)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.001,
    cnsPermeability: 'moderate', spectrum: 'anti_gram_neg',
    notes: [
      '✅ KPC (clase A), AmpC, serina-carbapenemasas — relebactam inhibe KPC y AmpC',
      '✅ P. aeruginosa MDR (MexAB eflujo/AmpC): activo cuando CAZ-AVI falla',
      'Estudio RESTORE-IMI (Motsch, CID 2020): no inferior a colistina en Gram– CR',
      '⚠️ NO activo vs MBL (NDM, VIM) — para NDM usar ATM-AVI',
      '⚠️ Convulsiones (igual que Imipenem) — evitar en SNC',
    ],
  },

  cefepime_enmetazobactam: {
    id: 'cefepime_enmetazobactam', displayName: 'Cefepime/Enmetazobactam 2.5g IV c/8h',
    shortName: 'FEP-ETZ', class: 'Cefalosporina 4G + INBL pirrolidine',
    pkpdType: 'time', peakConcentration: 45, halfLifeHours: 2, doseIntervalHours: 8,
    doseStandard: '2g FEP + 0.5g ETZ IV c/8h en 3h de infusión',
    canExtendedInfusion: true, extendedBonus: 0.18,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_gram_neg',
    notes: [
      '✅ ESBL, KPC (clase A) — enmetazobactam inhibe ESBL y KPC',
      '✅ Enterobacterales MDR: alternativa a carbapenémicos en BLEE/KPC',
      'Estudio ALLIUM (Kaye, NEJM 2022): superior a pip/tazo en ESBL ITU/BS',
      '⚠️ Actividad limitada vs AmpC desreprimida y OXA-48 (preferir CAZ-AVI)',
      '⚠️ NO cubre Pseudomonas ni Acinetobacter',
    ],
  },

  omadacycline: {
    id: 'omadacycline', displayName: 'Omadaciclina 200mg IV (carga) → 100mg IV c/24h',
    shortName: 'OMC', class: 'Aminometilciclina (tetraciclina nueva generación)',
    pkpdType: 'auc', peakConcentration: 2.5, halfLifeHours: 17, doseIntervalHours: 24,
    doseStandard: '200mg IV carga día 1, luego 100mg IV c/24h (VO: 300mg carga → 300mg c/24h)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: [
      '✅ MRSA, VRE, MDR Gram– (incluso algunas bacterias tetraciclin-R por eflujo)',
      '✅ Activo vs Mycoplasma, Legionella, Chlamydia — NAC grave',
      'Estudio OPTIC (File, NEJM 2019): no inferior a moxifloxacino en NAC',
      '⚠️ Bacteriostático — no usar como monoterapia en bacteriemia grave',
      '⚠️ Vómitos frecuentes IV — premedicar con antieméticos',
    ],
  },

  eravacycline: {
    id: 'eravacycline', displayName: 'Eravacicline 1mg/kg IV c/12h',
    shortName: 'ERV', class: 'Fluorociclina (tetracicilina sintética)',
    pkpdType: 'auc', peakConcentration: 2.2, halfLifeHours: 20, doseIntervalHours: 12,
    doseStandard: '1mg/kg IV c/12h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'poor', spectrum: 'broad',
    notes: [
      '✅ A. baumannii XDR, K. pneumoniae MDR, anaerobios — supera efluxo tet(A)/tet(B)',
      '✅ Infecciones intraabdominales complicadas (IAC): aprobado FDA 2018',
      'Estudio IGNITE-4 (Solomkin, JAMA Surg 2019): no inferior a meropenem+met en IAC',
      '⚠️ Bacteriostático — no monoterapia en bacteriemia',
      '⚠️ No ESKAPE pneumonía — datos clínicos limitados en NAV',
    ],
  },

  tedizolid: {
    id: 'tedizolid', displayName: 'Tedizolid 200mg IV/VO c/24h × 6 días',
    shortName: 'TDZ', class: 'Oxazolidinona 2G',
    pkpdType: 'auc', peakConcentration: 3.0, halfLifeHours: 12, doseIntervalHours: 24,
    doseStandard: '200mg IV o VO c/24h × 6 días (SSTI) / uso prolongado off-label',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_gram_pos',
    notes: [
      '✅ MRSA, VRE — menor toxicidad hematológica que Linezolid (AUC 4× menor para efecto)',
      '✅ Opción en cepas con resistencia Linezolid por cfr o OptrA (algunos)',
      'Estudio ESTABLISH-2 (Prokocimer, JAMA 2013): no inferior a linezolid en SSTI',
      '⚠️ Menor experiencia clínica en bacteriemia vs Linezolid',
      '⚠️ Interacciones serotoninérgicas (igual que Linezolid, aunque menos potente)',
    ],
  },

  flucytosine_5fc: {
    id: 'flucytosine_5fc', displayName: '5-Fluorocitosina 25mg/kg VO c/6h',
    shortName: '5-FC', class: 'Antifúngico pirimidínico',
    pkpdType: 'time', peakConcentration: 70, halfLifeHours: 3, doseIntervalHours: 6,
    doseStandard: '25mg/kg VO c/6h (ajustar a CrCl — hepatotoxicidad y mielosupresión)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0.002,
    cnsPermeability: 'good', spectrum: 'anti_fungal',
    notes: [
      '✅ Sinergismo con Anfotericina B: inducción meningitis criptocócica (IDSA 2010)',
      '✅ Excelente penetración LCR — complementa AmB en sistema nervioso',
      '⚠️ Mielosupresión (neutropenia, trombocitopenia) — monitorear hemograma',
      '⚠️ NUNCA en monoterapia — resistencia emerge rápidamente',
      'Ajuste en insuficiencia renal — t½ prolonga y aumenta toxicidad',
    ],
  },

  isavuconazole: {
    id: 'isavuconazole', displayName: 'Isavuconazol 372mg IV c/8h × 6 dosis, luego c/24h',
    shortName: 'ISA', class: 'Antifúngico triazólico 3G',
    pkpdType: 'auc', peakConcentration: 4.5, halfLifeHours: 130, doseIntervalHours: 24,
    doseStandard: '372mg IV c/8h × 6 dosis (carga), luego 372mg c/24h',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'good', spectrum: 'anti_fungal',
    notes: [
      '✅ Aspergillus invasivo (no inferior a Voriconazol, SECURE trial, Maertens NEJM 2016)',
      '✅ Activo vs Mucorales (Mucormicosis) — ventaja vs Voriconazol para Mucor',
      '✅ Mejor perfil de tolerabilidad que Voriconazol (sin fototoxicidad, menos alucinaciones)',
      't½ = 130h — permite dosis diaria y estable (sin CYP2C19 variabilidad)',
      '⚠️ QTc acortamiento (no prolongación) — monitorear en cardiopatía',
    ],
  },

  polymyxin_b: {
    id: 'polymyxin_b', displayName: 'Polimixina B 1.5-2.5mg/kg/día IV en 2 dosis',
    shortName: 'PMB', class: 'Polimixina B (directa, sin profármaco)',
    pkpdType: 'conc', peakConcentration: 5, halfLifeHours: 12, doseIntervalHours: 12,
    doseStandard: '1.25mg/kg IV c/12h (NO requiere ajuste en FRA — farmacocinética diferente a Colistina)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.007,
    cnsPermeability: 'poor', spectrum: 'anti_gram_neg',
    notes: [
      '✅ Alternativa a Colistina: farmacocinética más predecible (no es profármaco)',
      '✅ A. baumannii XDR, P. aeruginosa XDR, K. pneumoniae KPC/NDR',
      'Ventaja sobre colistina: NO requiere ajuste en FRA (Cmax más estable)',
      '⚠️ Nefrotoxicidad similar a Colistina — monitorear diariamente',
      '⚠️ Uso COMBINADO obligatorio — monoterapia selecciona resistencia heterorresistente',
    ],
  },

  azithromycin_iv: {
    id: 'azithromycin_iv', displayName: 'Azitromicina 500mg IV c/24h',
    shortName: 'AZI', class: 'Macrólido 15-membered (azálido)',
    pkpdType: 'auc', peakConcentration: 0.44, halfLifeHours: 68, doseIntervalHours: 24,
    doseStandard: '500mg IV c/24h (NAC: combinación con β-lactámico)',
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
    cnsPermeability: 'moderate', spectrum: 'broad',
    notes: [
      '✅ Cobertura atípicos: Legionella, Mycoplasma, Chlamydia pneumoniae (NAC grave)',
      '✅ Inmunomodulador: ↓IL-8, ↓TNF-α — beneficio en SDRA/NAC severa (observacional)',
      'NAC grave: BTS/IDSA recomienda combinación con β-lactámico',
      '⚠️ Prolongación QTc — ECG basal obligatorio, especial cuidado con fluoroquinolonas',
      '⚠️ Alto Vd — niveles séricos bajos (Cmax 0.44 μg/mL) pero intracelular alto × 1000',
    ],
  },

};

// ══════════════════════════════════════════════════════════════════════════════
// FÁRMACOS ADYUVANTES (no-ATB) — Protocolo ROSE
// ══════════════════════════════════════════════════════════════════════════════

export type DrugCategory = 'diuretic' | 'vasopressor' | 'sedative' | 'analgesic';

export interface AdjunctDrugDef {
  id:                     string;
  displayName:            string;
  shortName:              string;
  category:               DrugCategory;
  halfLifeHours:          number;
  doseRange:              { min: number; max: number; unit: string };
  rosePhase:              ROSEPhase | null;
  roseEffect:             string;
  nephrotoxic:            boolean;
  peakOnsetMinutes:       number;
  durationHours:          number;
  diuresisBoostMLperH?:   number;
  fluidRemovalMLperDose?: number;
}

export const ADJUNCT_DRUG_CATALOG: Record<string, AdjunctDrugDef> = {
  furosemide: {
    id: 'furosemide', displayName: 'Furosemida 40mg IV',
    shortName: 'FURO', category: 'diuretic', halfLifeHours: 1.5,
    doseRange: { min: 20, max: 80, unit: 'mg' },
    rosePhase: 'E',
    roseEffect:
      'Fase E (Evacuación): balance hídrico negativo via diuresis forzada. ' +
      'Meta: -1 a -3 mL/kg/h (SSC 2021 / Malbrain ROSE). ' +
      'Mecanismo: ↑diuresis → ↓volemia → ↓precarga → ↓edema pulmonar → ↑PaO2/FiO2. ' +
      'CONTRAINDICACIÓN: hipovolemia activa (Fase R/O), hipocalemia <3.0 mEq/L.',
    nephrotoxic: false, peakOnsetMinutes: 20, durationHours: 6,
    diuresisBoostMLperH: 300, fluidRemovalMLperDose: 1500,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// RESULTADOS DE CULTIVOS EXPANDIDOS
// ══════════════════════════════════════════════════════════════════════════════

export interface GeneXpertResult {
  target:         string;   // ej: 'M. tuberculosis', 'S. pneumoniae'
  detected:       boolean;
  rifResistance?: boolean;  // para MTB/RIF
  ct?:            number;   // Cycle threshold (si aplica)
}

export interface ViralPanelResult {
  target:       string;    // nombre del virus
  detected:     boolean;
  quantitative?: number;   // copias/mL si aplica (CMV, EBV, HIV)
  unit?:        string;    // 'UI/mL', 'copias/mL'
}

export interface FluidAnalysis {
  // Citoquímico / bioquímica de líquido corporal
  appearance?:    string;    // 'turbio', 'claro', 'hemorrágico'
  wbc?:           number;    // leucocitos mm³
  neutrophils?:   number;    // % PMN
  glucose?:       number;    // mg/dL
  protein?:       number;    // mg/dL
  ldh?:           number;    // UI/L
  ph?:            number;    // pH pleural
  ada?:           number;    // ADA (TBC)
  // LCR específico
  openingPressure?: number;  // mmH₂O
  indiaInkPositive?: boolean; // Cryptococcus
  // Light criteria (pleural)
  serumProtein?:  number;
  serumLdh?:      number;
  // BAL (IDSA cutoffs)
  colonyCount?:   number;    // UFC/mL
}

export interface CultureResult {
  isPositive:      boolean;
  pathogenId:      string;
  pathogenName:    string;
  gramStainDesc:   string;
  sensitivities:   Record<string, SensitivityClass>;
  mics:            Record<string, number>;
  colonyCount?:    number;   // UFC/mL (cultivos cuantitativos)
  // Exámenes adicionales
  fluidAnalysis?:  FluidAnalysis;
  geneXpert?:      GeneXpertResult[];
  viralPanel?:     ViralPanelResult[];
  indiaInk?:       boolean;   // shorthand para UI
  clinicalNote?:   string;
}

// ── Cultivo con sitio expandido ──────────────────────────────────────────────
export interface Culture {
  id:          string;
  siteType:    CultureSiteType;
  orderedAt:   number;    // simulatedElapsed (s)
  readyAt:     number;    // orderedAt + turnaround del sitio
  result:      CultureResult | null;
  status:      'pending' | 'in_progress' | 'ready' | 'positive' | 'negative';
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACES DE ESTADO DINÁMICO (igual que antes)
// ══════════════════════════════════════════════════════════════════════════════

export interface ActiveAntibiotic {
  antibioticId:        string;
  startedAt:           number;
  lastDoseAt:          number;
  extendedInfusion:    boolean;
  serumConcentration:  number;
  troughLevel:         number;
  auc24:               number;
  timeSinceLastDose:   number;
  tAboveMIC:           number;
}

export interface ActiveAdjunctDrug {
  drugId:          string;
  startedAt:       number;
  lastDoseAt:      number;
  serumLevel:      number;
  isActive:        boolean;
  diuresisEffect:  number;
}

export interface ROSEState {
  currentPhase:      ROSEPhase;
  phaseEnteredAt:    number;
  totalFluidGiven:   number;
  fluidBalance:      number;
  pulmonaryEdemaRisk: number;
  mapStableSince:    number | null;
  lastLactateValue:  number;
  lastLactateSampleAt: number;
  lactateClearancePct: number;
}

export interface SSCBundle {
  hemoculture1Drawn:    boolean;  // Hemocultivo periférico #1
  hemoculture2Drawn:    boolean;  // Hemocultivo periférico #2 (AMBOS requeridos)
  bloodCulturesDrawn:   boolean;  // true solo cuando AMBOS x2 tomados
  lactateOrdered:       boolean;
  antibioticsStarted:   boolean;
  fluidBolusSent:       boolean;
  vasopressorsStarted:  boolean;
  sepsisActivatedAt:    number;
  firstATBAt:           number | null;
  firstCultureAt:       number | null;
  adherenceScore:       number;
  delayPenaltyMinutes:  number;
}

// ══════════════════════════════════════════════════════════════════════════════
// VADEMÉCUM UNIFICADO (vista derivada)
// ══════════════════════════════════════════════════════════════════════════════

export interface VademecumEntry {
  id:           string;
  displayName:  string;
  shortName:    string;
  type:         'antibiotic' | 'adjunct';
  category:     string;
  pkpdInfo?:    string;
  spectrum?:    string;
  cnsPermeability?: string;
  rosePhase?:   ROSEPhase | null;
  warnings:     string[];
  notes:        string[];
}

export function getVademecum(): VademecumEntry[] {
  const atbs: VademecumEntry[] = Object.values(ANTIBIOTIC_CATALOG).map((def) => ({
    id:          def.id,
    displayName: def.displayName,
    shortName:   def.shortName,
    type:        'antibiotic' as const,
    category:    def.class,
    pkpdInfo:    def.pkpdType === 'time' ? 'Tiempo-dep: T>MIC ≥40%'
               : def.pkpdType === 'auc'  ? 'AUC/MIC: ≥400 (aminoglicósidos), ≥600 (VAN)'
               : 'Concentración-dep: Cmax/MIC ≥8-10',
    spectrum:    def.spectrum,
    cnsPermeability: def.cnsPermeability,
    rosePhase:   null,
    warnings:    [
      ...(def.nephrotoxic ? [`⚠️ Nefrotóxico (↑Cr ~${(def.nephroStressorRate * 100).toFixed(3)}/h)`] : []),
      ...(def.canExtendedInfusion ? [`✅ Infusión extendida: +${def.extendedBonus * 100}% T>MIC`] : []),
    ],
    notes: def.notes,
  }));

  const adjuncts: VademecumEntry[] = Object.values(ADJUNCT_DRUG_CATALOG).map((def) => ({
    id:          def.id,
    displayName: def.displayName,
    shortName:   def.shortName,
    type:        'adjunct' as const,
    category:    def.category,
    rosePhase:   def.rosePhase,
    warnings:    [...(def.nephrotoxic ? ['⚠️ Nefrotóxico'] : []), def.roseEffect],
    notes:       [],
  }));

  return [...atbs, ...adjuncts];
}

// ══════════════════════════════════════════════════════════════════════════════
// STORE ZUSTAND
// ══════════════════════════════════════════════════════════════════════════════

interface MicrobiologyState {
  hiddenPathogenId:          string | null;
  cultures:                  Culture[];
  activeAntibiotics:         ActiveAntibiotic[];
  activeAdjunctDrugs:        ActiveAdjunctDrug[];
  treatmentEfficacy:         TreatmentEfficacy;
  sepsisProgressionModifier: number;
  rose:                      ROSEState;
  sscBundle:                 SSCBundle;

  // ─── Actions ──────────────────────────────────────────────────────────────
  assignPathogen:    (pathogenId: string) => void;
  orderCulture:      (siteType: CultureSiteType, simElapsed: number) => void;
  startAntibiotic:   (antibioticId: string, simElapsed: number, extended?: boolean) => void;
  stopAntibiotic:    (antibioticId: string) => void;
  startAdjunctDrug:  (drugId: string, simElapsed: number) => void;
  stopAdjunctDrug:   (drugId: string) => void;
  markBundleItem:    (item: keyof Pick<SSCBundle, 'lactateOrdered' | 'bloodCulturesDrawn' | 'antibioticsStarted' | 'fluidBolusSent' | 'vasopressorsStarted'>) => void;
  resetMicrobiology: () => void;
  _engineUpdate:     (patch: Partial<MicrobiologyState>) => void;
}

const INITIAL_ROSE: ROSEState = {
  currentPhase: 'R', phaseEnteredAt: 0, totalFluidGiven: 0, fluidBalance: 0,
  pulmonaryEdemaRisk: 0, mapStableSince: null, lastLactateValue: 1.0,
  lastLactateSampleAt: 0, lactateClearancePct: 0,
};

const INITIAL_BUNDLE: SSCBundle = {
  hemoculture1Drawn: false, hemoculture2Drawn: false, bloodCulturesDrawn: false,
  lactateOrdered: false, antibioticsStarted: false, fluidBolusSent: false,
  vasopressorsStarted: false, sepsisActivatedAt: 0, firstATBAt: null,
  firstCultureAt: null, adherenceScore: 0, delayPenaltyMinutes: 0,
};

export const useMicrobiologyStore = create<MicrobiologyState>((set, get) => ({

  hiddenPathogenId:          null,
  cultures:                  [],
  activeAntibiotics:         [],
  activeAdjunctDrugs:        [],
  treatmentEfficacy:         'none',
  sepsisProgressionModifier: 1.0,
  rose:                      { ...INITIAL_ROSE },
  sscBundle:                 { ...INITIAL_BUNDLE },

  // ── Asignar patógeno ───────────────────────────────────────────────────────
  assignPathogen: (pathogenId) => set({ hiddenPathogenId: pathogenId }),

  // ── Ordenar cultivo — soporte completo de CultureSiteType ─────────────────
  orderCulture: (siteType, simElapsed) => {
    const spec = CULTURE_SITE_CATALOG[siteType];
    if (!spec) return;

    // Evitar duplicados activos del mismo sitio
    const existing = get().cultures.find(
      c => c.siteType === siteType && c.status === 'pending'
    );
    if (existing) return;

    const readyAt = simElapsed + spec.turnaroundHours * 3600; // horas → segundos
    const culture: Culture = {
      id:        `cx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      siteType,
      orderedAt: simElapsed,
      readyAt,
      result:    null,
      status:    'pending',
    };

    set((s) => {
      const newBundle = { ...s.sscBundle };

      // Bundle SSC: requiere AMBOS hemocultivos periféricos
      if (siteType === 'blood_peripheral_1') {
        newBundle.hemoculture1Drawn = true;
        if (!newBundle.firstCultureAt) newBundle.firstCultureAt = simElapsed;
      }
      if (siteType === 'blood_peripheral_2') {
        newBundle.hemoculture2Drawn = true;
        if (!newBundle.firstCultureAt) newBundle.firstCultureAt = simElapsed;
      }
      // bloodCulturesDrawn solo true cuando AMBOS tomados
      newBundle.bloodCulturesDrawn = newBundle.hemoculture1Drawn && newBundle.hemoculture2Drawn;

      return { cultures: [...s.cultures, culture], sscBundle: newBundle };
    });
  },

  // ── Iniciar antibiótico ───────────────────────────────────────────────────
  startAntibiotic: (antibioticId, simElapsed, extended = false) => {
    if (!ANTIBIOTIC_CATALOG[antibioticId]) return;
    const existing = get().activeAntibiotics.find(a => a.antibioticId === antibioticId);
    if (existing) return;

    const atb: ActiveAntibiotic = {
      antibioticId, startedAt: simElapsed, lastDoseAt: simElapsed,
      extendedInfusion: extended, serumConcentration: 0,
      troughLevel: 0, auc24: 0, timeSinceLastDose: 0, tAboveMIC: 0,
    };
    set((s) => ({
      activeAntibiotics: [...s.activeAntibiotics, atb],
      sscBundle: !s.sscBundle.antibioticsStarted
        ? { ...s.sscBundle, antibioticsStarted: true, firstATBAt: simElapsed }
        : s.sscBundle,
    }));
  },

  stopAntibiotic: (antibioticId) =>
    set((s) => ({ activeAntibiotics: s.activeAntibiotics.filter(a => a.antibioticId !== antibioticId) })),

  // ── Iniciar fármaco adyuvante ─────────────────────────────────────────────
  startAdjunctDrug: (drugId, simElapsed) => {
    const drug = ADJUNCT_DRUG_CATALOG[drugId];
    if (!drug) return;
    const existing = get().activeAdjunctDrugs.find(d => d.drugId === drugId);
    if (existing) return;

    const rose = get().rose;
    if (drug.rosePhase === 'E' && (rose.currentPhase === 'R' || rose.currentPhase === 'O')) {
      console.warn(`⚠️ ALERTA PEDAGÓGICA: ${drug.displayName} contraindicado en Fase ${rose.currentPhase} de ROSE.`);
    }

    set((s) => ({
      activeAdjunctDrugs: [...s.activeAdjunctDrugs, {
        drugId, startedAt: simElapsed, lastDoseAt: simElapsed,
        serumLevel: 0, isActive: false, diuresisEffect: 0,
      }],
    }));
  },

  stopAdjunctDrug: (drugId) =>
    set((s) => ({ activeAdjunctDrugs: s.activeAdjunctDrugs.filter(d => d.drugId !== drugId) })),

  markBundleItem: (item) =>
    set((s) => ({ sscBundle: { ...s.sscBundle, [item]: true } })),

  resetMicrobiology: () => set({
    hiddenPathogenId: null, cultures: [], activeAntibiotics: [],
    activeAdjunctDrugs: [], treatmentEfficacy: 'none',
    sepsisProgressionModifier: 1.0,
    rose: { ...INITIAL_ROSE }, sscBundle: { ...INITIAL_BUNDLE },
  }),

  _engineUpdate: (patch) => set(patch),
}));
