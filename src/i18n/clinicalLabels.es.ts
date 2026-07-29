// src/i18n/clinicalLabels.es.ts
// Diccionario ES de fármacos y términos clínicos para IMHOTEP UCI.

import type { DrugId } from '../store/usePharmacologyStore';

export interface DrugLabelEntry {
  short: string;
  full:  string;
  unit:  string;
}

export const DRUG_LABELS_ES: Partial<Record<DrugId, DrugLabelEntry>> = {
  // ── Vasopresores ─────────────────────────────────────────────────────────
  noradrenaline:   { short: 'NA',   full: 'Noradrenalina',    unit: 'mcg/kg/min' },
  adrenaline:      { short: 'ADR',  full: 'Adrenalina',       unit: 'mcg/kg/min' },
  vasopressin:     { short: 'VP',   full: 'Vasopresina',      unit: 'U/h' },
  methylene_blue:  { short: 'AM',   full: 'Azul de Metileno', unit: 'mg/kg/h' },

  // ── Inotrópicos ───────────────────────────────────────────────────────────
  dobutamine:      { short: 'DBT',  full: 'Dobutamina',       unit: 'mcg/kg/min' },
  dopamine:        { short: 'DA',   full: 'Dopamina',         unit: 'mcg/kg/min' },
  milrinone:       { short: 'MILR', full: 'Milrinona',        unit: 'mcg/kg/min' },
  levosimendan:    { short: 'LVS',  full: 'Levosimendán',     unit: 'mcg/kg/min' },

  // ── Sedantes ─────────────────────────────────────────────────────────────
  propofol:        { short: 'PRO',  full: 'Propofol',         unit: 'mg/kg/h' },
  midazolam:       { short: 'MDZ',  full: 'Midazolam',        unit: 'mg/kg/h' },
  ketamine:        { short: 'KET',  full: 'Ketamina',         unit: 'mg/kg/h' },
  dexmedetomidine: { short: 'DEX',  full: 'Dexmedetomidina',  unit: 'mcg/kg/h' },
  thiopental:      { short: 'TIO',  full: 'Tiopental',        unit: 'mg/kg/h' },

  // ── Analgésicos ───────────────────────────────────────────────────────────
  morphine:        { short: 'MOR',  full: 'Morfina',          unit: 'mg/h' },
  fentanyl:        { short: 'FNT',  full: 'Fentanilo',        unit: 'mcg/kg/h' },
  remifentanil:    { short: 'RMF',  full: 'Remifentanilo',    unit: 'mcg/kg/min' },

  // ── BNM ───────────────────────────────────────────────────────────────────
  atracurium:      { short: 'ATR',  full: 'Atracurio',        unit: 'mg/kg/h' },
  cisatracurium:   { short: 'CIS',  full: 'Cisatracurio',     unit: 'mg/kg/h' },
  rocuronium:      { short: 'ROC',  full: 'Rocuronio',        unit: 'mg/kg/h' },
  pancuronium:     { short: 'PAN',  full: 'Pancuronio',       unit: 'mg/kg/h' },

  // ── Antiarrítmicos ────────────────────────────────────────────────────────
  amiodarone:      { short: 'AMIO', full: 'Amiodarona',       unit: 'mg/h' },
  digoxin:         { short: 'DIG',  full: 'Digoxina',         unit: 'mg/h' },
  esmolol:         { short: 'ESM',  full: 'Esmolol',          unit: 'mg/kg/h' },
  metoprolol_iv:   { short: 'METO', full: 'Metoprolol IV',    unit: 'mg/h' },
  diltiazem_iv:    { short: 'DILT', full: 'Diltiazem IV',     unit: 'mg/h' },

  // ── Diuréticos ────────────────────────────────────────────────────────────
  furosemide_iv:   { short: 'FURO IV', full: 'Furosemida IV', unit: 'mg/h' },
  furosemide_oral: { short: 'FURO VO', full: 'Furosemida VO', unit: 'mg/h' },

  // ── Corticoides ───────────────────────────────────────────────────────────
  hydrocortisone:      { short: 'HC',   full: 'Hidrocortisona',      unit: 'mg/h' },
  methylprednisolone:  { short: 'MP',   full: 'Metilprednisolona',   unit: 'mg/h' },
  dexamethasone:       { short: 'DEXA', full: 'Dexametasona',        unit: 'mg/h' },

  // ── Insulina ──────────────────────────────────────────────────────────────
  insulin_regular_iv:  { short: 'INS',  full: 'Insulina Regular IV', unit: 'U/h' },
  mannitol:            { short: 'MAN',  full: 'Manitol 15%',         unit: 'g/kg' },
  // Endocrino
  dextrose_50:         { short: 'D50',  full: 'Dextrosa 50%',         unit: 'g' },
  levothyroxine_iv:    { short: 'L-T4', full: 'Levotiroxina IV',       unit: 'mcg' },
  propylthiouracil_oral: { short: 'PTU', full: 'Propiltiouracilo',     unit: 'mg' },
  methimazole_oral:    { short: 'MMI',  full: 'Metimazol',             unit: 'mg' },
  // Hematológico
  tranexamic_acid_iv:  { short: 'TXA',  full: 'Ác. Tranexámico IV',   unit: 'mg' },
  vitamin_k_iv:        { short: 'VIT-K',full: 'Vitamina K IV',         unit: 'mg' },
  pcc_4factor:         { short: 'CCP',  full: 'CCP 4 Factores',        unit: 'U/kg' },
  desmopressin_iv:     { short: 'DDAVP',full: 'Desmopresina IV',       unit: 'mcg/kg' },
  argatroban_iv:       { short: 'ARG',  full: 'Argatrobán IV',         unit: 'mcg/kg/min' },
  rasburicase_iv:      { short: 'RAS',  full: 'Rasburicasa IV',        unit: 'mg' },
  // Obstétrico
  oxytocin_iv:         { short: 'OXY',  full: 'Oxitocina IV',          unit: 'U/h' },
  methylergonovine_im: { short: 'ERG',  full: 'Ergonovina IM',         unit: 'mg' },
  misoprostol_rectal:  { short: 'MISO', full: 'Misoprostol Rectal',    unit: 'mcg' },
  carbetocin_iv:       { short: 'CARB', full: 'Carbetocina IV',        unit: 'mcg' },
  magnesium_sulfate_iv:{ short: 'Mg',   full: 'Sulfato Mg IV',         unit: 'g/h' },
};

// ── Términos clínicos de UI ───────────────────────────────────────────────────

export const UI_LABELS_ES: Record<string, string> = {
  // Panel headers
  hemodynamics:    'Hemodinamia',
  sedation:        'Sedación',
  analgesia:       'Analgesia',
  nmba:            'Bloqueo NM',
  respiratory:     'Soporte Respiratorio',
  neurology:       'Neurología',
  diuretics:       'Diuréticos',
  corticoids:      'Corticoides',
  aerosols:        'Aerosoles',
  insulin:         'Insulina / HGT',
  pharmacy:        'Farmacia',
  doseAgenda:      'Agenda Dosis',
  infecto:         'Infectología',
  specialMeds:     'Fármacos Especiales',

  // Categorías clínicas (Fase 6)
  categoryGeneral:  'General',
  categoryNeuro:    'Neurología',
  categoryCardio:   'Cardiología',
  categoryPneumo:   'Neumología',
  categoryInfecto:  'Infectología',
  categoryCirugia:  'Cirugía',
  categoryTrauma:   'Traumatología',
  categoryQuemados: 'Quemados',
  customizeCase:    'Personalizar Caso',
  customizeCaseDescription: 'Narrativa libre con inferencia clínica automática',
  permanentSidebar: 'Sidebar Permanente',

  // PiCCO VolumeView
  picco:                     'PiCCO',
  volumeView:                'VolumeView',
  flow:                      'Flujo',
  preload:                   'Precarga',
  lung:                      'Pulmón',
  contractility:             'Contractilidad',
  newThermodilution:         'Nueva Termodilución',
  initialThermodilution:     'Termodilución Inicial Requerida',
  thermodilutionInstruction: 'Inyecte 15 mL de SF frío (<8°C) por catéter venoso central. El sistema calibrará automáticamente.',
  startThermodilution:       'Iniciar Termodilución',
  recalibrateNow:            'Recalibrar Ya',
  inRange:                   'en rango',
  borderline:                'al límite',
  outOfRange:                'fuera de rango',
  reopenPiccoPanel:          'Reabrir panel PiCCO',

  // Acciones
  bolus:           'Bolo IV',
  infusion:        'Infusión',
  scheduled:       'Programado',
  rate:            'Velocidad',
  start:           'Iniciar',
  stop:            'Detener',
  program:         'Programar',
  cancel:          'Cancelar',
  apply:           'Aplicar',
  restore:         'Restaurar',
  close:           'Cerrar',
  open:            'Abrir',

  // Términos farmacológicos
  weight:          'Peso',
  concentration:   'Concentración',
  vial:            'Vial',
  dilution:        'Dilución',
  noLine:          'Sin Línea',
  doseDisplay:     'UI Médica',
  ccH:             'cc/h',
  mcgKgMin:        'mcg/kg/min',
  mgH:             'mg/h',
  uH:              'U/h',

  // Efectos
  vasopressorEffect: 'Vasopresión',
  inotropicEffect:   'Inotropismo',
  sedationEffect:    'Sedación',
  analgesiaEffect:   'Analgesia',
  nmbaEffect:        'Bloqueo NM',
  diureticEffect:    'Diuresis',

  // Grupos
  vasopressors:    'Vasopresores',
  inotropes:       'Inotrópicos',
  sedatives:       'Sedantes',
  analgesics:      'Analgésicos',

  // Severidad / estados
  active:          'Activo',
  inactive:        'Inactivo',
  pending:         'Pendiente',
  overdue:         'Atrasado',
};

/** Retorna el nombre ES de un fármaco (fallback al ID si no existe) */
export function getDrugLabel(drugId: string): string {
  const entry = DRUG_LABELS_ES[drugId as keyof typeof DRUG_LABELS_ES];
  return entry?.full ?? drugId;
}

/** Retorna la abreviatura ES de un fármaco */
export function getDrugShort(drugId: string): string {
  const entry = DRUG_LABELS_ES[drugId as keyof typeof DRUG_LABELS_ES];
  return entry?.short ?? drugId.substring(0, 4).toUpperCase();
}
