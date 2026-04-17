import { create } from 'zustand';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SepsisState {
  isActive: boolean;
  severity: number;
  progressionRate: number;
}

export interface ArdsState {
  isActive: boolean;
  severity: number;
  progressionRate: number;
  proneActive: boolean;
}

export interface HemorrhagicShockState {
  isActive: boolean;
  activeClass: 1 | 2 | 3 | 4;
  hemorrhageRate: number;
  tourniquetApplied: boolean;
}

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

// Tasas de sangrado por clase — ATLS 11ª Ed. (Cannon NEJM 2018)
export const CLASS_HEMORRHAGE_RATES: Record<1 | 2 | 3 | 4, number> = {
  1: 8,
  2: 20,
  3: 45,
  4: 90,
};

// ─── Valores iniciales explícitos ────────────────────────────────────────────
// CRÍTICO: estos objetos deben estar inicializados ANTES de que
// cualquier componente intente leer sus propiedades.

const INITIAL_SEPSIS: SepsisState = {
  isActive: false,
  severity: 0,
  progressionRate: 0.000005,
};

const INITIAL_ARDS: ArdsState = {
  isActive: false,
  severity: 0,
  progressionRate: 0.00003,
  proneActive: false,
};

const INITIAL_HEMORRHAGIC_SHOCK: HemorrhagicShockState = {
  isActive: false,
  activeClass: 1,
  hemorrhageRate: 0,
  tourniquetApplied: false,
};

// ─── Interfaz del Store ───────────────────────────────────────────────────────

interface PathologyState {
  sepsis: SepsisState;
  ards: ArdsState;
  hemorrhagicShock: HemorrhagicShockState;
  modifiers: PathologyModifiers;

  // Sepsis
  activateSepsis: (severity?: number) => void;
  deactivateSepsis: () => void;
  setSepsisSeverity: (v: number) => void;
  setSepsisProgRate: (v: number) => void;

  // SDRA
  activateArds: (severity?: number) => void;
  deactivateArds: () => void;
  setArdsSeverity: (v: number) => void;
  setArdsProgRate: (v: number) => void;
  toggleProne: () => void;

  // Shock Hemorrágico
  activateHemorrhagicShock: (shockClass: 1 | 2 | 3 | 4) => void;
  deactivateHemorrhagicShock: () => void;
  setHemorrhageClass: (shockClass: 1 | 2 | 3 | 4) => void;
  applyTourniquet: () => void;
  releaseTourniquet: () => void;

  // Global
  updateModifiers: (m: PathologyModifiers) => void;
  resetAllPathologies: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePathologyStore = create<PathologyState>((set) => ({

  // ── Estado inicial — los 3 objetos explícitamente inicializados ──────────
  sepsis: { ...INITIAL_SEPSIS },
  ards: { ...INITIAL_ARDS },
  hemorrhagicShock: { ...INITIAL_HEMORRHAGIC_SHOCK },
  modifiers: { ...NEUTRAL_MODIFIERS },

  // ── Sepsis ────────────────────────────────────────────────────────────────
  activateSepsis: (severity = 0.10) =>
    set((s) => ({
      sepsis: {
        ...s.sepsis,
        isActive: true,
        severity: Math.max(0.05, Math.min(1, severity)),
      },
    })),

  deactivateSepsis: () =>
    set((s) => ({
      sepsis: { ...s.sepsis, isActive: false, severity: 0 },
    })),

  setSepsisSeverity: (v) =>
    set((s) => ({
      sepsis: { ...s.sepsis, severity: Math.max(0, Math.min(1, v)) },
    })),

  setSepsisProgRate: (v) =>
    set((s) => ({
      sepsis: { ...s.sepsis, progressionRate: Math.max(0, v) },
    })),

  // ── SDRA ──────────────────────────────────────────────────────────────────
  activateArds: (severity = 0.10) =>
    set((s) => ({
      ards: {
        ...s.ards,
        isActive: true,
        severity: Math.max(0.05, Math.min(1, severity)),
      },
    })),

  deactivateArds: () =>
    set((s) => ({
      ards: { ...s.ards, isActive: false, severity: 0, proneActive: false },
    })),

  setArdsSeverity: (v) =>
    set((s) => ({
      ards: { ...s.ards, severity: Math.max(0, Math.min(1, v)) },
    })),

  setArdsProgRate: (v) =>
    set((s) => ({
      ards: { ...s.ards, progressionRate: Math.max(0, v) },
    })),

  toggleProne: () =>
    set((s) => ({
      ards: { ...s.ards, proneActive: !s.ards.proneActive },
    })),

  // ── Shock Hemorrágico ─────────────────────────────────────────────────────
  activateHemorrhagicShock: (shockClass) =>
    set(() => ({
      hemorrhagicShock: {
        isActive: true,
        activeClass: shockClass,
        hemorrhageRate: CLASS_HEMORRHAGE_RATES[shockClass],
        tourniquetApplied: false,
      },
    })),

  deactivateHemorrhagicShock: () =>
    set((s) => {
      // También resetea la tasa de sangrado en el patientStore
      import('./usePatientStore').then(m => m.usePatientStore.getState().setHemorrhageRate(0));
      return { hemorrhagicShock: { ...INITIAL_HEMORRHAGIC_SHOCK } };
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
    set((s) => ({
      hemorrhagicShock: { ...s.hemorrhagicShock, tourniquetApplied: true },
    })),

  releaseTourniquet: () =>
    set((s) => ({
      hemorrhagicShock: { ...s.hemorrhagicShock, tourniquetApplied: false },
    })),

  // ── Global ────────────────────────────────────────────────────────────────
  updateModifiers: (m) => set({ modifiers: m }),

  resetAllPathologies: () =>
    set({
      sepsis: { ...INITIAL_SEPSIS },
      ards: { ...INITIAL_ARDS },
      hemorrhagicShock: { ...INITIAL_HEMORRHAGIC_SHOCK },
      modifiers: { ...NEUTRAL_MODIFIERS },
    }),
}));