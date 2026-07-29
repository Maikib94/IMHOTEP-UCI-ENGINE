import { create } from 'zustand';
import { type ClinicalCategory, normalizeCategory } from '../types/ClinicalCategory';

// ─── Subtype Unions ────────────────────────────────────────────────────────────

export type NeuroCriticalSubtype =
  | 'tce_leve' | 'tce_moderado' | 'tce_grave'
  | 'hsa' | 'acv_isquemico' | 'acv_hemorragico'
  | 'status_epileptico' | 'meningitis_bacteriana';

export type PolytraumaSubtype =
  | 'tce_aislado' | 'tce_torax' | 'tce_abdomen'
  | 'tce_torax_abdomen' | 'fractura_pelvis_mayor';

export type BurnSubtype = 'fuego' | 'electrico' | 'explosion' | 'quimico';
export type AsthmaSubtype = 'moderada' | 'grave' | 'status_asthmaticus';
export type CopdSubtype = 'exacerbacion_no_infecciosa' | 'exacerbacion_infecciosa';
export type CardioSubtype =
  | 'iam_stemi_anterior' | 'iam_stemi_inferior' | 'iam_nstemi'
  | 'icc_aguda_descompensada' | 'shock_cardiogenico' | 'taponamiento'
  | 'diseccion_aorta' | 'tep_masivo' | 'farva';
export type PneumoniaSubtype = 'bacteriana' | 'viral' | 'fungica' | 'aspirativa';

// Etiología SDRA — Berlin/Global 2023
export type ArdsTrigger =
  | 'pneumonia' | 'sepsis' | 'aspiration' | 'trauma'
  | 'transfusion' | 'pancreatitis' | 'covid';

// ─── PathologyDomain ───────────────────────────────────────────────────────────

export type PathologyDomain =
  | 'sepsis' | 'ards' | 'hemorrhagicShock'
  | 'neuroCritical' | 'polytrauma' | 'burn'
  | 'asthma' | 'copd' | 'cardio' | 'pneumonia';

/** Categoría clínica del caso — gate de visibilidad PIC + sidebar Fase 6.
 *  Robba C et al., Lancet Neurol 2021 (SYNAPSE-ICU): monitoreo PIC selectivo. */
/** Alias retro-compatible — ahora apunta a ClinicalCategory */
export type CaseCategory = ClinicalCategory;

// ─── ArdsState — Berlin 2012 / Global ARDS Definition 2023 ────────────────────
//
//  ARQUITECTURA:
//    hasLungInjury + bilateralOpacities + timeSinceInsultS → datos de contexto
//    lungInjury  → variable de estado continua (ODE en PathologyEngine 1.C)
//    diagnosis   → derivado automáticamente por RespiratoryEngine.diagnoseBerlinARDS()
//    pfRatio/sfRatio → computados por RespiratoryEngine cada tick
//
//  COMPATIBILIDAD HACIA ATRÁS:
//    isActive    = diagnosis !== 'none'   (actualizado por RespiratoryEngine)
//    severity    = lungInjury             (actualizado por PathologyEngine)
//    progressionRate → @deprecated, no leído por ODE; mantenido para UI
//
export interface ArdsState {
  // ── Datos de contexto (setteados por escenario o instructor) ─────────────
  hasLungInjury: boolean;
  bilateralOpacities: boolean;
  trigger: ArdsTrigger | null;

  // ── Variable de estado ODE (PathologyEngine 1.C) ─────────────────────────
  lungInjury: number;         // 0..1
  timeSinceInsultS: number;   // s — Berlin requiere < 7 días (604800 s)

  // ── Diagnóstico derivado (RespiratoryEngine 1.B) — NO setear manualmente ─
  diagnosis: 'none' | 'mild' | 'moderate' | 'severe';
  pfRatio: number;    // paO2 / fio2 (mmHg)
  sfRatio: number;    // SpO2(%) / fio2 — Global 2023

  // ── Intervención terapéutica ───────────────────────────────────────────────
  proneActive: boolean;

  // ── Campos de compatibilidad hacia atrás (CardiovascularEngine, UI) ──────
  /** @deprecated Usar `diagnosis !== 'none'`. Actualizado por RespiratoryEngine. */
  isActive: boolean;
  /** @deprecated Usar `lungInjury`. Actualizado por PathologyEngine. */
  severity: number;
  /** @deprecated ODE usa constantes hardcodeadas. Mantenido para controles de UI. */
  progressionRate: number;
}

// ─── Interfaces — dominios clásicos ───────────────────────────────────────────

export interface SepsisState {
  isActive: boolean;
  severity: number;
  progressionRate: number;
  /** Tiempo desde el inicio del insulto séptico (s). Incrementado por PathologyEngine cada tick.
   *  Resetea a 0 al activar sepsis. Usado para curva gamma de fuga capilar (Saravi 2023). */
  timeSinceOnsetS: number;
  /** Control de foco logrado (cirugía, drenaje, etc.) — activa resolución acelerada de fuga.
   *  Ref: SSC 2021; ANDROMEDA-SHOCK-2 JAMA 2025. */
  sourceControlAchieved: boolean;
  /** Cobertura antibiótica adecuada — reduce progresión y fuga capilar.
   *  Ref: Kumar CCM 2006; SSC 2021. */
  adequateAntibiotics: boolean;
}

export interface HemorrhagicShockState {
  isActive: boolean;
  activeClass: 1 | 2 | 3 | 4;
  hemorrhageRate: number;
  tourniquetApplied: boolean;
}

// ─── Interfaces — nuevos dominios ─────────────────────────────────────────────

export interface GenericPathologyState {
  isActive: boolean;
  severity: number;
  subtype: string | null;
}
export interface NeuroCriticalState extends GenericPathologyState { subtype: NeuroCriticalSubtype | null; }
export interface PolytraumaState extends GenericPathologyState {
  subtype: PolytraumaSubtype | null;
  tceScore: number; thoracicScore: number; abdominalScore: number;
}
export interface BurnState extends GenericPathologyState {
  subtype: BurnSubtype | null;
  tbsaPercent: number; airwayBurn: boolean; parklandDeliveredMl: number;
}
export interface AsthmaState  extends GenericPathologyState { subtype: AsthmaSubtype  | null; }
export interface CopdState    extends GenericPathologyState { subtype: CopdSubtype    | null; }
export interface CardioState  extends GenericPathologyState { subtype: CardioSubtype  | null; }
export interface PneumoniaState extends GenericPathologyState { subtype: PneumoniaSubtype | null; }

// ─── Modificadores fisiológicos ───────────────────────────────────────────────

export interface PathologyModifiers {
  svrMultiplier: number;
  capillaryLeakRate: number;
  hyperdynamicFactor: number;
  lungShuntFraction: number;
  complianceMultiplier: number;
}

export const NEUTRAL_MODIFIERS: PathologyModifiers = {
  svrMultiplier: 1.0,
  capillaryLeakRate: 0,
  hyperdynamicFactor: 1.0,
  lungShuntFraction: 0.05,
  complianceMultiplier: 1.0,
};

export const CLASS_HEMORRHAGE_RATES: Record<1 | 2 | 3 | 4, number> = {
  1: 8, 2: 20, 3: 45, 4: 90,
};

// ─── Valores iniciales ────────────────────────────────────────────────────────

const INITIAL_SEPSIS: SepsisState = {
  isActive: false, severity: 0, progressionRate: 0.000005,
  timeSinceOnsetS: 0, sourceControlAchieved: false, adequateAntibiotics: false,
};

const INITIAL_ARDS: ArdsState = {
  hasLungInjury: false,
  bilateralOpacities: false,
  trigger: null,
  lungInjury: 0,
  timeSinceInsultS: 0,
  diagnosis: 'none',
  pfRatio: 0,
  sfRatio: 0,
  proneActive: false,
  isActive: false,
  severity: 0,
  progressionRate: 0.00003,
};

const INITIAL_HEMORRHAGIC_SHOCK: HemorrhagicShockState = {
  isActive: false, activeClass: 1, hemorrhageRate: 0, tourniquetApplied: false,
};

const INITIAL_NEURO: NeuroCriticalState       = { isActive: false, severity: 0, subtype: null };
const INITIAL_POLYTRAUMA: PolytraumaState     = { isActive: false, severity: 0, subtype: null, tceScore: 0, thoracicScore: 0, abdominalScore: 0 };
const INITIAL_BURN: BurnState                 = { isActive: false, severity: 0, subtype: null, tbsaPercent: 0, airwayBurn: false, parklandDeliveredMl: 0 };
const INITIAL_ASTHMA: AsthmaState             = { isActive: false, severity: 0, subtype: null };
const INITIAL_COPD: CopdState                 = { isActive: false, severity: 0, subtype: null };
const INITIAL_CARDIO: CardioState             = { isActive: false, severity: 0, subtype: null };
const INITIAL_PNEUMONIA: PneumoniaState       = { isActive: false, severity: 0, subtype: null };

// ─── Interfaz del Store ───────────────────────────────────────────────────────

interface PathologyState {
  sepsis: SepsisState;
  ards: ArdsState;
  hemorrhagicShock: HemorrhagicShockState;
  modifiers: PathologyModifiers;

  neuroCritical: NeuroCriticalState;
  polytrauma: PolytraumaState;
  burn: BurnState;
  asthma: AsthmaState;
  copd: CopdState;
  cardio: CardioState;
  pneumonia: PneumoniaState;

  // ── Sepsis ────────────────────────────────────────────────────────────────
  activateSepsis: (severity?: number) => void;
  deactivateSepsis: () => void;
  setSepsisSeverity: (v: number) => void;
  setSepsisProgRate: (v: number) => void;
  setSourceControl: (v: boolean) => void;
  setAdequateAntibiotics: (v: boolean) => void;
  advanceSepsisTime: (dt: number) => void;

  // ── SDRA — nueva arquitectura ─────────────────────────────────────────────
  activateArds: (severity?: number, trigger?: ArdsTrigger | null, bilateralOpacities?: boolean) => void;
  deactivateArds: () => void;
  setArdsSeverity: (v: number) => void;
  setArdsProgRate: (v: number) => void;   // @deprecated kept for UI compat
  toggleProne: () => void;
  /** Llamado por RespiratoryEngine.diagnoseBerlinARDS() cada tick */
  updateArdsFromEngine: (
    diagnosis: ArdsState['diagnosis'],
    pfRatio: number,
    sfRatio: number,
  ) => void;
  /** Llamado por PathologyEngine ODE cada tick */
  updateLungInjuryFromEngine: (lungInjury: number, timeSinceInsultS: number) => void;

  // ── Shock Hemorrágico ─────────────────────────────────────────────────────
  activateHemorrhagicShock: (shockClass: 1 | 2 | 3 | 4) => void;
  deactivateHemorrhagicShock: () => void;
  setHemorrhageClass: (shockClass: 1 | 2 | 3 | 4) => void;
  applyTourniquet: () => void;
  releaseTourniquet: () => void;

  // ── Nuevos dominios ───────────────────────────────────────────────────────
  activatePathology: (domain: PathologyDomain, subtype: string | null, severity: number) => void;
  deactivatePathology: (domain: PathologyDomain) => void;
  setBurnTbsa: (pct: number) => void;
  setBurnAirway: (v: boolean) => void;
  addParklandDelivered: (ml: number) => void;
  setPolytraumaScores: (tce: number, thoracic: number, abdominal: number) => void;

  // ── Global ────────────────────────────────────────────────────────────────
  updateModifiers: (m: PathologyModifiers) => void;
  resetAllPathologies: () => void;
  caseCategory: CaseCategory;
  setCaseCategory: (c: CaseCategory) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePathologyStore = create<PathologyState>((set) => ({
  caseCategory: 'general',
  setCaseCategory: (c) => set({ caseCategory: normalizeCategory(c as string) }),

  sepsis: { ...INITIAL_SEPSIS },
  ards: { ...INITIAL_ARDS },
  hemorrhagicShock: { ...INITIAL_HEMORRHAGIC_SHOCK },
  modifiers: { ...NEUTRAL_MODIFIERS },
  neuroCritical: { ...INITIAL_NEURO },
  polytrauma: { ...INITIAL_POLYTRAUMA },
  burn: { ...INITIAL_BURN },
  asthma: { ...INITIAL_ASTHMA },
  copd: { ...INITIAL_COPD },
  cardio: { ...INITIAL_CARDIO },
  pneumonia: { ...INITIAL_PNEUMONIA },

  // ── Sepsis ────────────────────────────────────────────────────────────────
  activateSepsis: (severity = 0.10) =>
    set((s) => ({
      sepsis: {
        ...s.sepsis,
        isActive: true,
        severity: Math.max(0.05, Math.min(1, severity)),
        timeSinceOnsetS: 0,  // resetear timer al activar
        sourceControlAchieved: false,
        adequateAntibiotics: false,
      },
    })),
  deactivateSepsis: () =>
    set((s) => ({ sepsis: { ...s.sepsis, isActive: false, severity: 0, timeSinceOnsetS: 0 } })),
  setSepsisSeverity: (v) =>
    set((s) => ({ sepsis: { ...s.sepsis, severity: Math.max(0, Math.min(1, v)) } })),
  setSepsisProgRate: (v) =>
    set((s) => ({ sepsis: { ...s.sepsis, progressionRate: Math.max(0, v) } })),
  setSourceControl: (v) =>
    set((s) => ({ sepsis: { ...s.sepsis, sourceControlAchieved: v } })),
  setAdequateAntibiotics: (v) =>
    set((s) => ({ sepsis: { ...s.sepsis, adequateAntibiotics: v } })),
  advanceSepsisTime: (dt) =>
    set((s) => ({ sepsis: { ...s.sepsis, timeSinceOnsetS: s.sepsis.timeSinceOnsetS + dt } })),

  // ── SDRA ──────────────────────────────────────────────────────────────────
  activateArds: (severity = 0.10, trigger = null, bilateralOpacities = true) =>
    set((s) => {
      const inj = Math.max(0.05, Math.min(1, severity));
      return {
        ards: {
          ...s.ards,
          hasLungInjury: true,
          lungInjury: inj,
          bilateralOpacities,
          trigger: trigger ?? null,
          isActive: false,   // engine will set this on first tick
          severity: inj,     // compat
        },
      };
    }),

  deactivateArds: () =>
    set(() => ({ ards: { ...INITIAL_ARDS } })),

  setArdsSeverity: (v) =>
    set((s) => {
      const inj = Math.max(0, Math.min(1, v));
      return {
        ards: {
          ...s.ards,
          lungInjury: inj,
          severity: inj,           // compat
          hasLungInjury: inj > 0,
        },
      };
    }),

  // @deprecated — no usado por el ODE; mantenido para controles del panel instructor
  setArdsProgRate: (v) =>
    set((s) => ({ ards: { ...s.ards, progressionRate: Math.max(0, v) } })),

  toggleProne: () =>
    set((s) => ({ ards: { ...s.ards, proneActive: !s.ards.proneActive } })),

  updateArdsFromEngine: (diagnosis, pfRatio, sfRatio) =>
    set((s) => ({
      ards: {
        ...s.ards,
        diagnosis,
        pfRatio,
        sfRatio,
        isActive: diagnosis !== 'none',  // compat
      },
    })),

  updateLungInjuryFromEngine: (lungInjury, timeSinceInsultS) =>
    set((s) => ({
      ards: {
        ...s.ards,
        lungInjury,
        timeSinceInsultS,
        severity: lungInjury,  // compat
      },
    })),

  // ── Shock Hemorrágico ─────────────────────────────────────────────────────
  activateHemorrhagicShock: (shockClass) =>
    set(() => ({
      hemorrhagicShock: {
        isActive: true, activeClass: shockClass,
        hemorrhageRate: CLASS_HEMORRHAGE_RATES[shockClass], tourniquetApplied: false,
      },
    })),

  deactivateHemorrhagicShock: () =>
    set((s) => {
      import('./usePatientStore').then(m => m.usePatientStore.getState().setHemorrhageRate(0));
      import('./usePatientStore').then(m => m.usePatientStore.getState().resetFluidTracking());
      return { hemorrhagicShock: { ...s.hemorrhagicShock, isActive: false, hemorrhageRate: 0 } };
    }),

  setHemorrhageClass: (shockClass) =>
    set((s) => ({
      hemorrhagicShock: {
        ...s.hemorrhagicShock,
        activeClass: shockClass,
        hemorrhageRate: CLASS_HEMORRHAGE_RATES[shockClass],
      },
    })),

  applyTourniquet: () =>
    set((s) => ({ hemorrhagicShock: { ...s.hemorrhagicShock, tourniquetApplied: true } })),

  releaseTourniquet: () =>
    set((s) => ({ hemorrhagicShock: { ...s.hemorrhagicShock, tourniquetApplied: false } })),

  // ── Activación genérica (todos los dominios) ──────────────────────────────
  activatePathology: (domain, subtype, severity) => {
    const sev = Math.max(0.05, Math.min(1, severity));
    set((s) => {
      switch (domain) {
        case 'sepsis':
          return { sepsis: { ...s.sepsis, isActive: true, severity: sev } };
        case 'ards': {
          const inj = sev;
          return {
            ards: {
              ...s.ards,
              hasLungInjury: true,
              lungInjury: inj,
              bilateralOpacities: true,
              trigger: subtype as ArdsTrigger ?? null,
              severity: inj,  // compat
            },
          };
        }
        case 'hemorrhagicShock': {
          const cls = parseInt(subtype ?? '1', 10);
          const validClass = ([1, 2, 3, 4].includes(cls) ? cls : 1) as 1 | 2 | 3 | 4;
          return {
            hemorrhagicShock: {
              ...s.hemorrhagicShock,
              isActive: true,
              activeClass: validClass,
              hemorrhageRate: CLASS_HEMORRHAGE_RATES[validClass],
            },
          };
        }
        case 'neuroCritical': return { neuroCritical: { ...s.neuroCritical, isActive: true, severity: sev, subtype: subtype as NeuroCriticalSubtype } };
        case 'polytrauma':    return { polytrauma: { ...s.polytrauma, isActive: true, severity: sev, subtype: subtype as PolytraumaSubtype } };
        case 'burn':          return { burn: { ...s.burn, isActive: true, severity: sev, subtype: subtype as BurnSubtype } };
        case 'asthma':        return { asthma: { ...s.asthma, isActive: true, severity: sev, subtype: subtype as AsthmaSubtype } };
        case 'copd':          return { copd: { ...s.copd, isActive: true, severity: sev, subtype: subtype as CopdSubtype } };
        case 'cardio':        return { cardio: { ...s.cardio, isActive: true, severity: sev, subtype: subtype as CardioSubtype } };
        case 'pneumonia':     return { pneumonia: { ...s.pneumonia, isActive: true, severity: sev, subtype: subtype as PneumoniaSubtype } };
        default:              return {};
      }
    });
  },

  deactivatePathology: (domain) => {
    set((s) => {
      switch (domain) {
        case 'sepsis':           return { sepsis: { ...s.sepsis, isActive: false, severity: 0 } };
        case 'ards':             return { ards: { ...INITIAL_ARDS } };
        case 'hemorrhagicShock': {
          import('./usePatientStore').then(m => m.usePatientStore.getState().setHemorrhageRate(0));
          return { hemorrhagicShock: { ...s.hemorrhagicShock, isActive: false, hemorrhageRate: 0 } };
        }
        case 'neuroCritical': return { neuroCritical: { ...INITIAL_NEURO } };
        case 'polytrauma':    return { polytrauma: { ...INITIAL_POLYTRAUMA } };
        case 'burn':          return { burn: { ...INITIAL_BURN } };
        case 'asthma':        return { asthma: { ...INITIAL_ASTHMA } };
        case 'copd':          return { copd: { ...INITIAL_COPD } };
        case 'cardio':        return { cardio: { ...INITIAL_CARDIO } };
        case 'pneumonia':     return { pneumonia: { ...INITIAL_PNEUMONIA } };
        default:              return {};
      }
    });
  },

  // ── Burn extras ───────────────────────────────────────────────────────────
  setBurnTbsa: (pct) => set((s) => ({ burn: { ...s.burn, tbsaPercent: Math.max(0, Math.min(100, pct)) } })),
  setBurnAirway: (v) => set((s) => ({ burn: { ...s.burn, airwayBurn: v } })),
  addParklandDelivered: (ml) => set((s) => ({ burn: { ...s.burn, parklandDeliveredMl: s.burn.parklandDeliveredMl + ml } })),

  // ── Polytrauma extras ─────────────────────────────────────────────────────
  setPolytraumaScores: (tce, thoracic, abdominal) =>
    set((s) => ({
      polytrauma: {
        ...s.polytrauma,
        tceScore: Math.max(0, Math.min(1, tce)),
        thoracicScore: Math.max(0, Math.min(1, thoracic)),
        abdominalScore: Math.max(0, Math.min(1, abdominal)),
      },
    })),

  // ── Global ────────────────────────────────────────────────────────────────
  updateModifiers: (m) => set({ modifiers: m }),

  resetAllPathologies: () => {
    import('./usePatientStore').then(m => {
      m.usePatientStore.getState().setHemorrhageRate(0);
      m.usePatientStore.getState().resetFluidTracking();
    });
    set({
      caseCategory: 'general',
      sepsis: { ...INITIAL_SEPSIS },
      ards: { ...INITIAL_ARDS },
      hemorrhagicShock: { ...INITIAL_HEMORRHAGIC_SHOCK },
      modifiers: { ...NEUTRAL_MODIFIERS },
      neuroCritical: { ...INITIAL_NEURO },
      polytrauma: { ...INITIAL_POLYTRAUMA },
      burn: { ...INITIAL_BURN },
      asthma: { ...INITIAL_ASTHMA },
      copd: { ...INITIAL_COPD },
      cardio: { ...INITIAL_CARDIO },
      pneumonia: { ...INITIAL_PNEUMONIA },
    });
  },
}));
