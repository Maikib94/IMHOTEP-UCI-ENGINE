// src/store/useMicrobiologyStore.ts
// Blueprint 021 — Módulo 4.2: Microbiología y Farmacocinética Antimicrobiana
//
// Bibliografía blindada:
//   - Sanford Guide 2025 (CIM/breakpoints CLSI)
//   - Surviving Sepsis Campaign 2021/2025 (Bundle Hora-1)
//   - Protocolo ROSE (Malbrain, Anaesthesiol Intensive Ther 2014)
//   - Pinsky: Hemodynamic Applied (fluid responsiveness)
//   - SATI 5ta Ed. / Cárdenas 2da Ed.
//   - Estudio MERINO (Harris, NEJM 2018) — Pip/Tazo vs BLEE

import { create } from 'zustand';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS BASE
// ══════════════════════════════════════════════════════════════════════════════

export type GramStain = 'positive' | 'negative';
export type Phenotype = 'wild' | 'esbl' | 'mrsa' | 'mdr';
export type SensitivityClass = 'S' | 'I' | 'R' | 'INTRINSEC_R';
// S = Sensible | I = Intermedio (CIM-dependiente) | R = Resistente adquirida
// INTRINSEC_R = Resistencia innata (ej. Vanco en Gram–). Pedagógicamente distinto de R.

export type PKPDType = 'time' | 'auc' | 'conc';
export type CultureType = 'blood' | 'urine' | 'resp' | 'wound';
export type ROSEPhase = 'R' | 'O' | 'S' | 'E';
export type TreatmentEfficacy =
  | 'none'           // sin ATB → progresión normal
  | 'mismatch'       // ATB resistente → acelera
  | 'suboptimal'     // ATB sensible pero PK/PD no alcanza target
  | 'empiric_match'  // ATB sensible + PK/PD ok, sin antibiograma
  | 'targeted';      // ATB dirigido post-antibiograma

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGOS ESTÁTICOS (Sanford 2025)
// ══════════════════════════════════════════════════════════════════════════════

export interface MICSensitivity {
  sensitivity: SensitivityClass;
  mic: number;       // μg/mL — valor de referencia Sanford
  breakpointS: number;       // CLSI 2025: ≤ = Sensible
  breakpointR: number;       // CLSI 2025: ≥ = Resistente
  mechanism?: string;       // Ej: 'CTX-M (BLEE)', 'mecA'
  clinicalNote?: string;       // Controversia educativa (MERINO, etc.)
}

export interface PathogenDef {
  id: string;
  displayName: string;
  gramStain: GramStain;
  phenotype: Phenotype;
  typicalSource: string;
  resistanceMechs: string[];
  gramStainDesc: string;      // Lo que ve el lab: 'Cocos Gram+ en racimos'
  sensitivities: Record<string, MICSensitivity>;
}

export interface AntibioticDef {
  id: string;
  displayName: string;
  shortName: string;   // Para monitor: CRO, MEM, VAN...
  class: string;
  pkpdType: PKPDType;
  peakConcentration: number;   // μg/mL (Cmax tras dosis estándar)
  halfLifeHours: number;   // t½ en horas
  doseIntervalHours: number;   // Intervalo entre dosis
  canExtendedInfusion: boolean;
  extendedBonus: number;   // bonus fraccionario de T>MIC si extendida
  nephrotoxic: boolean;
  nephroStressorRate: number;   // incremento creatinina por hora de uso
}

// ── Catálogo de Patógenos MVP ────────────────────────────────────────────────

export const PATHOGEN_CATALOG: Record<string, PathogenDef> = {

  spneumo: {
    id: 'spneumo',
    displayName: 'S. pneumoniae',
    gramStain: 'positive',
    phenotype: 'wild',
    typicalSource: 'Neumonía comunitaria',
    resistanceMechs: [],
    gramStainDesc: 'Diplococos Gram+ lanceolados',
    sensitivities: {
      ceftriaxone: { sensitivity: 'S', mic: 0.5, breakpointS: 1, breakpointR: 2 },
      amp_sulbac: { sensitivity: 'S', mic: 1, breakpointS: 8, breakpointR: 16 },
      pip_tazo: { sensitivity: 'S', mic: 0.5, breakpointS: 8, breakpointR: 16 },
      cefepime: { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 4 },
      meropenem: { sensitivity: 'S', mic: 0.25, breakpointS: 0.5, breakpointR: 1 },
      vancomycin: { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 4 },
      colistin: {
        sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4,
        mechanism: 'Pared Gram+ impermeabilidad'
      },
    },
  },

  ecoli_wild: {
    id: 'ecoli_wild',
    displayName: 'E. coli (Salvaje)',
    gramStain: 'negative',
    phenotype: 'wild',
    typicalSource: 'ITU / Peritonitis',
    resistanceMechs: [],
    gramStainDesc: 'Bacilos Gram-negativos',
    sensitivities: {
      ceftriaxone: { sensitivity: 'S', mic: 0.25, breakpointS: 1, breakpointR: 4 },
      amp_sulbac: { sensitivity: 'S', mic: 4, breakpointS: 8, breakpointR: 32 },
      pip_tazo: { sensitivity: 'S', mic: 2, breakpointS: 16, breakpointR: 128 },
      cefepime: { sensitivity: 'S', mic: 0.25, breakpointS: 2, breakpointR: 16 },
      meropenem: { sensitivity: 'S', mic: 0.06, breakpointS: 1, breakpointR: 4 },
      vancomycin: {
        sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4,
        mechanism: 'Membrana externa Gram-negativa'
      },
      colistin: { sensitivity: 'S', mic: 0.5, breakpointS: 2, breakpointR: 4 },
    },
  },

  kpneumo_esbl: {
    id: 'kpneumo_esbl',
    displayName: 'K. pneumoniae (BLEE)',
    gramStain: 'negative',
    phenotype: 'esbl',
    typicalSource: 'ITU complicada / Peritonitis nosocomial',
    resistanceMechs: ['CTX-M-15 (BLEE)', 'Pérdida OmpK36'],
    gramStainDesc: 'Bacilos Gram-negativos capsulados',
    sensitivities: {
      ceftriaxone: {
        sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4,
        mechanism: 'CTX-M-15 (BLEE)'
      },
      amp_sulbac: {
        sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 32,
        mechanism: 'BLEE + pérdida porina'
      },
      pip_tazo: {
        sensitivity: 'I', mic: 32, breakpointS: 16, breakpointR: 128,
        mechanism: 'BLEE — efecto inóculo variable',
        clinicalNote: '⚠️ CIM-dependiente — Estudio MERINO (NEJM 2018) favorece Meropenem'
      },
      cefepime: {
        sensitivity: 'R', mic: 16, breakpointS: 2, breakpointR: 16,
        mechanism: 'CTX-M-15 hidroliza cefepime a CIM altas'
      },
      meropenem: { sensitivity: 'S', mic: 0.06, breakpointS: 1, breakpointR: 4 },
      vancomycin: {
        sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4,
        mechanism: 'Membrana externa Gram-negativa'
      },
      colistin: { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4 },
    },
  },

  paeru_mdr: {
    id: 'paeru_mdr',
    displayName: 'P. aeruginosa (MDR)',
    gramStain: 'negative',
    phenotype: 'mdr',
    typicalSource: 'NAV / Quemaduras / Catéter',
    resistanceMechs: ['AmpC cromosómica', 'Eflujo MexAB-OprM', 'Pérdida OprD'],
    gramStainDesc: 'Bacilos Gram-negativos no fermentadores',
    sensitivities: {
      ceftriaxone: {
        sensitivity: 'R', mic: 64, breakpointS: 1, breakpointR: 4,
        mechanism: 'Resistencia intrínseca — baja permeabilidad'
      },
      amp_sulbac: {
        sensitivity: 'R', mic: 128, breakpointS: 8, breakpointR: 32,
        mechanism: 'Resistencia intrínseca'
      },
      pip_tazo: {
        sensitivity: 'R', mic: 128, breakpointS: 16, breakpointR: 128,
        mechanism: 'AmpC + eflujo MexAB'
      },
      cefepime: {
        sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 16,
        mechanism: 'AmpC + eflujo'
      },
      meropenem: {
        sensitivity: 'R', mic: 16, breakpointS: 2, breakpointR: 8,
        mechanism: 'Pérdida OprD + AmpC + eflujo'
      },
      vancomycin: {
        sensitivity: 'INTRINSEC_R', mic: 512, breakpointS: 2, breakpointR: 4,
        mechanism: 'Membrana externa Gram-negativa'
      },
      colistin: { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 4 },
    },
  },

  saureus_mrsa: {
    id: 'saureus_mrsa',
    displayName: 'S. aureus (MRSA)',
    gramStain: 'positive',
    phenotype: 'mrsa',
    typicalSource: 'Catéter / Piel y partes blandas / Endocarditis',
    resistanceMechs: ['mecA — PBP2a'],
    gramStainDesc: 'Cocos Gram+ en racimos',
    sensitivities: {
      ceftriaxone: {
        sensitivity: 'R', mic: 64, breakpointS: 8, breakpointR: 16,
        mechanism: 'mecA — PBP2a de baja afinidad'
      },
      amp_sulbac: {
        sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 32,
        mechanism: 'mecA'
      },
      pip_tazo: {
        sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 16,
        mechanism: 'mecA'
      },
      cefepime: {
        sensitivity: 'R', mic: 32, breakpointS: 8, breakpointR: 16,
        mechanism: 'mecA'
      },
      meropenem: {
        sensitivity: 'R', mic: 16, breakpointS: 4, breakpointR: 16,
        mechanism: 'mecA'
      },
      vancomycin: { sensitivity: 'S', mic: 1, breakpointS: 2, breakpointR: 16 },
      colistin: {
        sensitivity: 'INTRINSEC_R', mic: 256, breakpointS: 2, breakpointR: 4,
        mechanism: 'Pared Gram+ — impermeabilidad'
      },
    },
  },
};

// ── Catálogo de Antibióticos MVP ─────────────────────────────────────────────

export const ANTIBIOTIC_CATALOG: Record<string, AntibioticDef> = {

  ceftriaxone: {
    id: 'ceftriaxone', displayName: 'Ceftriaxona 2g IV c/24h',
    shortName: 'CRO', class: 'Cefalosporina 3G',
    pkpdType: 'time', peakConcentration: 250,
    halfLifeHours: 8, doseIntervalHours: 24,
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
  },

  amp_sulbac: {
    id: 'amp_sulbac', displayName: 'Ampicilina/Sulbactam 3g IV c/6h',
    shortName: 'AMS', class: 'Aminopenicilina + IBL',
    pkpdType: 'time', peakConcentration: 150,
    halfLifeHours: 1, doseIntervalHours: 6,
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: false, nephroStressorRate: 0,
  },

  pip_tazo: {
    id: 'pip_tazo', displayName: 'Piperacilina/Tazobactam 4.5g IV c/6h',
    shortName: 'PTZ', class: 'Ureidopenicilina + IBL',
    pkpdType: 'time', peakConcentration: 300,
    halfLifeHours: 1, doseIntervalHours: 6,
    canExtendedInfusion: true, extendedBonus: 0.20,
    nephrotoxic: false, nephroStressorRate: 0,
  },

  cefepime: {
    id: 'cefepime', displayName: 'Cefepime 2g IV c/8h',
    shortName: 'FEP', class: 'Cefalosporina 4G',
    pkpdType: 'time', peakConcentration: 160,
    halfLifeHours: 2, doseIntervalHours: 8,
    canExtendedInfusion: true, extendedBonus: 0.15,
    nephrotoxic: false, nephroStressorRate: 0,
  },

  meropenem: {
    id: 'meropenem', displayName: 'Meropenem 1g IV c/8h',
    shortName: 'MEM', class: 'Carbapenémico',
    pkpdType: 'time', peakConcentration: 50,
    halfLifeHours: 1, doseIntervalHours: 8,
    canExtendedInfusion: true, extendedBonus: 0.25,
    nephrotoxic: false, nephroStressorRate: 0,
  },

  vancomycin: {
    id: 'vancomycin', displayName: 'Vancomicina 1g IV c/12h',
    shortName: 'VAN', class: 'Glucopéptido',
    pkpdType: 'auc', peakConcentration: 40,
    halfLifeHours: 6, doseIntervalHours: 12,
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.003,
  },

  colistin: {
    id: 'colistin', displayName: 'Colistina 4.5M UI IV c/12h',
    shortName: 'COL', class: 'Polimixina',
    pkpdType: 'conc', peakConcentration: 12,
    halfLifeHours: 5, doseIntervalHours: 12,
    canExtendedInfusion: false, extendedBonus: 0,
    nephrotoxic: true, nephroStressorRate: 0.008,
  },
};

// ── Fármacos Adyuvantes (no-ATB) — Protocolo ROSE ───────────────────────────
//
// Furosemida: efecto FISIOLÓGICO puro (Directiva Miguel / Director Clínico)
//   - NO tiene modificador directo de hipotensión
//   - Acción: ↑diuresis (RenalEngine) → ↓fluidBalance → ↓precarga
//   - El motor hemodinámico refleja la caída de PAM por hipovolemia, no vasoplejía
//   - Balance hídrico negativo → ↓edema pulmonar → ↑compliance → ↑oxigenación

export type DrugCategory = 'diuretic' | 'vasopressor' | 'sedative' | 'analgesic';

export interface AdjunctDrugDef {
  id:                     string;
  displayName:            string;
  shortName:              string;
  category:               DrugCategory;
  halfLifeHours:          number;
  doseRange:              { min: number; max: number; unit: string };
  rosePhase:              ROSEPhase | null;    // Fase ROSE donde es indicado
  roseEffect:             string;              // Descripción clínica del efecto
  nephrotoxic:            boolean;
  peakOnsetMinutes:       number;              // Onset de acción IV
  durationHours:          number;              // Duración del efecto
  // PK/PD para diuréticos: efecto sobre diuresis
  diuresisBoostMLperH?:   number;              // mL/h adicionales de diuresis
  fluidRemovalMLperDose?: number;              // Balance negativo estimado/dosis
}

export const ADJUNCT_DRUG_CATALOG: Record<string, AdjunctDrugDef> = {

  furosemide: {
    id: 'furosemide',
    displayName: 'Furosemida 40mg IV',
    shortName: 'FURO',
    category: 'diuretic',
    halfLifeHours: 1.5,
    doseRange: { min: 20, max: 80, unit: 'mg' },
    rosePhase: 'E',
    roseEffect:
      'Fase E (Evacuación): balance hídrico negativo via diuresis forzada. ' +
      'Meta: -1 a -3 mL/kg/h (SSC 2021 / Malbrain ROSE). ' +
      'Mecanismo fisiológico: ↑diuresis → ↓volemia → ↓precarga → ' +
      '↓edema pulmonar → ↑compliance → ↑PaO2/FiO2. ' +
      'NO produce vasoplejía. Caída de PAM = hipovolemia por diuresis excesiva. ' +
      'INDICACIÓN: PAM ≥65 estable sin vasopresores ×6h (Fase S completada). ' +
      'CONTRAINDICACIÓN: hipovolemia activa (Fase R/O), hipocalemia <3.0 mEq/L.',
    nephrotoxic: false,
    peakOnsetMinutes: 20,
    durationHours: 6,
    diuresisBoostMLperH: 300,       // Furosemida 40mg IV → ~300 mL/h extra
    fluidRemovalMLperDose: 1500,    // ~1500 mL en 6h de efecto
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACES DE ESTADO DINÁMICO
// ══════════════════════════════════════════════════════════════════════════════

export interface Culture {
  id: string;
  type: CultureType;
  orderedAt: number;         // simulatedElapsed (s)
  readyAt: number;         // orderedAt + 172800 (48h sim) — override instantResults
  result: CultureResult | null;
}

export interface CultureResult {
  isPositive: boolean;
  pathogenId: string;
  pathogenName: string;
  gramStainDesc: string;
  sensitivities: Record<string, SensitivityClass>;
  mics: Record<string, number>;
}

export interface ActiveAntibiotic {
  antibioticId: string;
  startedAt: number;
  lastDoseAt: number;
  extendedInfusion: boolean;
  // Campos actualizados por MicrobiologyEngine cada tick:
  serumConcentration: number;   // μg/mL
  troughLevel: number;   // μg/mL
  auc24: number;   // μg·h/mL
  timeSinceLastDose: number;   // s
  tAboveMIC: number;   // fracción del intervalo con conc > MIC (0-1)
}

export interface ActiveAdjunctDrug {
  drugId:         string;
  startedAt:      number;           // simulatedElapsed (s)
  lastDoseAt:     number;
  // PK estado — actualizado por MicrobiologyEngine cada tick
  serumLevel:     number;           // nivel sérico normalizado (0-1)
  isActive:       boolean;          // efecto farmacológico activo (post onset)
  diuresisEffect: number;           // mL/h actuales de diuresis extra
}

export interface ROSEState {
  currentPhase: ROSEPhase;
  phaseEnteredAt: number;
  totalFluidGiven: number;   // mL acumulados desde sepsis
  fluidBalance: number;   // mL
  pulmonaryEdemaRisk: number;   // 0-1
  mapStableSince: number | null;
  lastLactateValue: number;
  lastLactateSampleAt: number;
  lactateClearancePct: number;
}

export interface SSCBundle {
  lactateOrdered: boolean;
  bloodCulturesDrawn: boolean;
  antibioticsStarted: boolean;
  fluidBolusSent: boolean;
  vasopressorsStarted: boolean;
  sepsisActivatedAt: number;
  firstATBAt: number | null;
  firstCultureAt: number | null;
  adherenceScore: number;   // 0-5
  delayPenaltyMinutes: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// VADEMÉCUM UNIFICADO — Vista derivada ATB + Fármacos Adyuvantes
// No se guarda en store — se genera bajo demanda para la UI
// ══════════════════════════════════════════════════════════════════════════════

export interface VademecumEntry {
  id:          string;
  displayName: string;
  shortName:   string;
  type:        'antibiotic' | 'adjunct';
  category:    string;
  pkpdInfo?:   string;
  rosePhase?:  ROSEPhase | null;
  warnings:    string[];
}

export function getVademecum(): VademecumEntry[] {
  const atbs: VademecumEntry[] = Object.values(ANTIBIOTIC_CATALOG).map((def) => ({
    id: def.id,
    displayName: def.displayName,
    shortName: def.shortName,
    type: 'antibiotic' as const,
    category: def.class,
    pkpdInfo: def.pkpdType === 'time' ? 'Tiempo-dep: T>MIC ≥40%'
            : def.pkpdType === 'auc'  ? 'AUC/MIC ≥400 (SSC 2025)'
            : 'Concentración-dep: Cmax/MIC ≥8',
    rosePhase: null,
    warnings: [
      ...(def.nephrotoxic ? [`⚠️ Nefrotóxico (↑Cr ${def.nephroStressorRate}/h)`] : []),
      ...(def.canExtendedInfusion ? [`✅ Infusión extendida: +${def.extendedBonus * 100}% T>MIC`] : []),
    ],
  }));

  const adjuncts: VademecumEntry[] = Object.values(ADJUNCT_DRUG_CATALOG).map((def) => ({
    id: def.id,
    displayName: def.displayName,
    shortName: def.shortName,
    type: 'adjunct' as const,
    category: def.category,
    rosePhase: def.rosePhase,
    warnings: [
      ...(def.nephrotoxic ? ['⚠️ Nefrotóxico'] : []),
      def.roseEffect,
    ],
  }));

  return [...atbs, ...adjuncts];
}

// ══════════════════════════════════════════════════════════════════════════════
// STORE ZUSTAND
// ══════════════════════════════════════════════════════════════════════════════

interface MicrobiologyState {
  // Escenario oculto
  hiddenPathogenId: string | null;

  // Cultivos
  cultures: Culture[];

  // ATB activos
  activeAntibiotics: ActiveAntibiotic[];

  // Fármacos adyuvantes activos (Furosemida, etc.)
  activeAdjunctDrugs: ActiveAdjunctDrug[];

  // Resultado del motor (modificado por MicrobiologyEngine cada tick)
  treatmentEfficacy: TreatmentEfficacy;
  sepsisProgressionModifier: number;
  //  +1.0 = sin ATB (progresión normal)
  //  +1.2 = mismatch (ATB resistente → acelera)
  //  +0.3 = suboptimal (freno parcial)
  //  -0.3 = empiric_match (mejora lenta)
  //  -0.5 = targeted (reversión activa)

  // ROSE
  rose: ROSEState;

  // Bundle SSC
  sscBundle: SSCBundle;

  // ─── Actions ─────────────────────────────────────────────────────────────
  assignPathogen: (pathogenId: string) => void;
  orderCulture: (type: CultureType, simElapsed: number) => void;
  startAntibiotic: (antibioticId: string, simElapsed: number, extended?: boolean) => void;
  stopAntibiotic: (antibioticId: string) => void;
  startAdjunctDrug: (drugId: string, simElapsed: number) => void;
  stopAdjunctDrug: (drugId: string) => void;
  markBundleItem: (item: 'lactateOrdered' | 'bloodCulturesDrawn' | 'antibioticsStarted' | 'fluidBolusSent' | 'vasopressorsStarted') => void;
  resetMicrobiology: () => void;

  // Solo para uso interno del engine
  _engineUpdate: (patch: Partial<MicrobiologyState>) => void;
}

// ── Valores iniciales ────────────────────────────────────────────────────────

const INITIAL_ROSE: ROSEState = {
  currentPhase: 'R',
  phaseEnteredAt: 0,
  totalFluidGiven: 0,
  fluidBalance: 0,
  pulmonaryEdemaRisk: 0,
  mapStableSince: null,
  lastLactateValue: 1.0,
  lastLactateSampleAt: 0,
  lactateClearancePct: 0,
};

const INITIAL_BUNDLE: SSCBundle = {
  lactateOrdered: false,
  bloodCulturesDrawn: false,
  antibioticsStarted: false,
  fluidBolusSent: false,
  vasopressorsStarted: false,
  sepsisActivatedAt: 0,
  firstATBAt: null,
  firstCultureAt: null,
  adherenceScore: 0,
  delayPenaltyMinutes: 0,
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useMicrobiologyStore = create<MicrobiologyState>((set, get) => ({

  hiddenPathogenId: null,
  cultures: [],
  activeAntibiotics: [],
  activeAdjunctDrugs: [],
  treatmentEfficacy: 'none',
  sepsisProgressionModifier: 1.0,
  rose: { ...INITIAL_ROSE },
  sscBundle: { ...INITIAL_BUNDLE },

  // ── Instructor asigna patógeno oculto ────────────────────────────────────
  assignPathogen: (pathogenId) =>
    set({ hiddenPathogenId: pathogenId }),

  // ── Pedir cultivo ────────────────────────────────────────────────────────
  orderCulture: (type, simElapsed) => {
    const culture: Culture = {
      id: `cx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      orderedAt: simElapsed,
      readyAt: simElapsed + 172800,   // 48h simuladas
      result: null,
    };
    set((s) => ({
      cultures: [...s.cultures, culture],
      sscBundle: type === 'blood' && !s.sscBundle.bloodCulturesDrawn
        ? { ...s.sscBundle, bloodCulturesDrawn: true, firstCultureAt: simElapsed }
        : s.sscBundle,
    }));
  },

  // ── Iniciar antibiótico ──────────────────────────────────────────────────
  startAntibiotic: (antibioticId, simElapsed, extended = false) => {
    const existing = get().activeAntibiotics.find((a) => a.antibioticId === antibioticId);
    if (existing) return; // ya activo — no duplicar

    const atb: ActiveAntibiotic = {
      antibioticId,
      startedAt: simElapsed,
      lastDoseAt: simElapsed,
      extendedInfusion: extended,
      serumConcentration: 0,
      troughLevel: 0,
      auc24: 0,
      timeSinceLastDose: 0,
      tAboveMIC: 0,
    };
    set((s) => ({
      activeAntibiotics: [...s.activeAntibiotics, atb],
      sscBundle: !s.sscBundle.antibioticsStarted
        ? { ...s.sscBundle, antibioticsStarted: true, firstATBAt: simElapsed }
        : s.sscBundle,
    }));
  },

  // ── Detener antibiótico ──────────────────────────────────────────────────
  stopAntibiotic: (antibioticId) =>
    set((s) => ({
      activeAntibiotics: s.activeAntibiotics.filter((a) => a.antibioticId !== antibioticId),
    })),

  // ── Iniciar fármaco adyuvante (con guard ROSE) ────────────────────────────
  startAdjunctDrug: (drugId, simElapsed) => {
    const drug = ADJUNCT_DRUG_CATALOG[drugId];
    if (!drug) return;

    const existing = get().activeAdjunctDrugs.find((d) => d.drugId === drugId);
    if (existing) return; // ya activo — no duplicar

    // Guard pedagógico ROSE: Furosemida contraindicada en Fase R/O
    // No bloquea (el médico puede equivocarse) pero registra el error
    const rose = get().rose;
    if (drug.rosePhase === 'E' && (rose.currentPhase === 'R' || rose.currentPhase === 'O')) {
      console.warn(
        `⚠️ ALERTA PEDAGÓGICA: ${drug.displayName} contraindicado en Fase ` +
        `${rose.currentPhase} de ROSE. Riesgo de hipoperfusión por diuresis ` +
        `en paciente hemodinámicamente inestable (SSC 2021 / Malbrain).`
      );
    }

    const adj: ActiveAdjunctDrug = {
      drugId,
      startedAt: simElapsed,
      lastDoseAt: simElapsed,
      serumLevel: 0,
      isActive: false,        // se activa post-onset (peakOnsetMinutes)
      diuresisEffect: 0,      // engine calcula según PK
    };
    set((s) => ({
      activeAdjunctDrugs: [...s.activeAdjunctDrugs, adj],
    }));
  },

  // ── Detener fármaco adyuvante ──────────────────────────────────────────────
  stopAdjunctDrug: (drugId) =>
    set((s) => ({
      activeAdjunctDrugs: s.activeAdjunctDrugs.filter((d) => d.drugId !== drugId),
    })),

  // ── Marcar item del Bundle SSC ───────────────────────────────────────────
  markBundleItem: (item) =>
    set((s) => ({
      sscBundle: { ...s.sscBundle, [item]: true },
    })),

  // ── Reset completo ───────────────────────────────────────────────────────
  resetMicrobiology: () =>
    set({
      hiddenPathogenId: null,
      cultures: [],
      activeAntibiotics: [],
      activeAdjunctDrugs: [],
      treatmentEfficacy: 'none',
      sepsisProgressionModifier: 1.0,
      rose: { ...INITIAL_ROSE },
      sscBundle: { ...INITIAL_BUNDLE },
    }),

  // ── Engine-only update ───────────────────────────────────────────────────
  _engineUpdate: (patch) => set(patch),
}));
