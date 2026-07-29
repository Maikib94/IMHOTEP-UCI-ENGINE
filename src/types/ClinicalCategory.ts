// src/types/ClinicalCategory.ts
// Tipo unificado para las 10 especialidades clínicas + 'general'.
// Fuente única de verdad — importado por useScenarioStore, usePathologyStore,
// ScenarioSelectorModal, ProceduresPanel y ProceduralPatientFactory.
//
// Refs:
//   SATI Argentina / AMIB Brasil / AMCI Colombia — taxonomía UCI.
//   JBDS-IP 2023 — DKA/HHS son endocrinas, no solo sépticas.
//   ADA 2024 DKA; Ross JCEM 2016; ACOG 222 Preeclampsia.

export type ClinicalCategory =
  | 'general'      // default — sin clasificación específica
  | 'neuro'        // Neurología / Neurocirugía (TCE, HSA, ACV, status)
  | 'cardio'       // Cardiología (IAM, ICA, arritmias, shock cardiogénico)
  | 'pneumo'       // Neumología (SDRA, EPOC, asma, neumonía no séptica)
  | 'infecto'      // Infectología (sepsis, NAV, urosepsis, peritonitis)
  | 'endocrino'    // Endocrinología/Metabolismo (DKA, HHS, tormenta tiroidea)
  | 'hemato'       // Hematología Crítica (PTT, CID, TLS, HIT)
  | 'cirugia'      // Cirugía (postop mayor, dehiscencia, abdomen abierto)
  | 'trauma'       // Traumatología (politrauma, fracturas, TVP)
  | 'quemados'     // Quemados (térmica, química, inhalación)
  | 'obstetricia'; // Obstétricas Críticas (HELLP, eclampsia, HPP)

/**
 * Orden de visualización en sidebar (10 categorías, sin 'general').
 */
export const CLINICAL_CATEGORY_ORDER: ClinicalCategory[] = [
  'neuro', 'cardio', 'pneumo', 'infecto',
  'endocrino', 'hemato',
  'cirugia', 'trauma', 'quemados',
  'obstetricia',
];

/**
 * Metadata por categoría: icono, label ES, departamento, color.
 */
export const CLINICAL_CATEGORY_META: Record<ClinicalCategory, {
  label:  string;
  dept:   string;
  icon:   string;
  color:  string;
}> = {
  general:    { label: 'General',       dept: 'UCI General',               icon: '⚕️',  color: '#94a3b8' },
  neuro:      { label: 'Neurología',    dept: 'Neurología / Neurocirugía',  icon: '🧠',  color: '#a78bfa' },
  cardio:     { label: 'Cardiología',   dept: 'Cardiología Crítica',        icon: '❤️',  color: '#f43f5e' },
  pneumo:     { label: 'Neumología',    dept: 'Neumología / UCI Resp.',     icon: '🫁',  color: '#22d3ee' },
  infecto:    { label: 'Infectología',  dept: 'Infectología / Sepsis',      icon: '🦠',  color: '#f97316' },
  endocrino:  { label: 'Endocrino',     dept: 'Endocrinología / Metabolismo', icon: '🧪', color: '#22c55e' },
  hemato:     { label: 'Hematológico',  dept: 'Hematología Crítica',        icon: '🩸',  color: '#dc2626' },
  cirugia:    { label: 'Cirugía',       dept: 'Cirugía UCI / Postop.',      icon: '🔪',  color: '#818cf8' },
  trauma:     { label: 'Traumatología', dept: 'Trauma Crítico',             icon: '🩼',  color: '#ef4444' },
  quemados:   { label: 'Quemados',      dept: 'Unidad de Quemados',         icon: '🔥',  color: '#fbbf24' },
  obstetricia:{ label: 'Obstetricia',   dept: 'Obstétricas Críticas',       icon: '🤰',  color: '#ec4899' },
};

/**
 * Mapeo de categorías legacy → canónica.
 */
export const LEGACY_CATEGORY_MAP: Record<string, ClinicalCategory> = {
  // Identidades (passthrough)
  neuro:       'neuro',
  cardio:      'cardio',
  trauma:      'trauma',
  general:     'general',
  // Renombramientos
  respiratory: 'pneumo',
  sepsis:      'infecto',
  surgical:    'cirugia',
  burns:       'quemados',
  // Área 5: metabolic → endocrino (DKA/HHS son crisis endocrinas)
  metabolic:   'endocrino',
  // Nuevas canónicas (passthrough directo)
  pneumo:      'pneumo',
  infecto:     'infecto',
  cirugia:     'cirugia',
  quemados:    'quemados',
  endocrino:   'endocrino',
  hemato:      'hemato',
  obstetricia: 'obstetricia',
};

/**
 * Normaliza cualquier string a una ClinicalCategory válida.
 * Si no matchea, retorna 'general'. Defensivo ante localStorage obsoleto.
 */
export function normalizeCategory(raw: string | undefined | null): ClinicalCategory {
  if (!raw) return 'general';
  if (raw in LEGACY_CATEGORY_MAP) return LEGACY_CATEGORY_MAP[raw];
  if ((CLINICAL_CATEGORY_ORDER as string[]).includes(raw)) return raw as ClinicalCategory;
  if (raw === 'general') return 'general';
  return 'general';
}
