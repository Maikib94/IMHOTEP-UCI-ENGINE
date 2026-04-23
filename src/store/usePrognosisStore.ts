import { create } from 'zustand';

export type OutcomeType =
  | 'ongoing'
  | 'death'
  | 'trach_late_discharge'
  | 'late_discharge'
  | 'discharge';

export interface SOFAComponents {
  respiratory: number;
  coagulation: number;
  liver: number;
  cardiovascular: number;
  cns: number;
  renal: number;
}

interface PrognosisState {
  isActive: boolean;
  sofaScore: number;
  sofaComponents: SOFAComponents;
  apacheII: number;
  outcome: OutcomeType;
  outcomeDay: number;
  managementScore: number;  // 0-1: calidad del manejo
  icuDaysSim: number;       // días de UCI en tiempo simulado

  activate: () => void;
  deactivate: () => void;
  updateScores: (
    sofa: number,
    components: SOFAComponents,
    apache: number,
    mgmt: number,
    icuDays: number,
  ) => void;
  setOutcome: (o: OutcomeType, day: number) => void;
  reset: () => void;
}

const INITIAL_COMPONENTS: SOFAComponents = {
  respiratory: 0, coagulation: 0, liver: 0,
  cardiovascular: 0, cns: 0, renal: 0,
};

export const usePrognosisStore = create<PrognosisState>((set) => ({
  isActive: false,
  sofaScore: 0,
  sofaComponents: { ...INITIAL_COMPONENTS },
  apacheII: 0,
  outcome: 'ongoing',
  outcomeDay: 0,
  managementScore: 0.5,
  icuDaysSim: 0,

  activate: () => set({ isActive: true }),
  deactivate: () => set({ isActive: false }),

  updateScores: (sofa, components, apache, mgmt, icuDays) =>
    set({ sofaScore: sofa, sofaComponents: components, apacheII: apache, managementScore: mgmt, icuDaysSim: icuDays }),

  setOutcome: (o, day) => set({ outcome: o, outcomeDay: day }),

  reset: () => set({
    isActive: false,
    sofaScore: 0,
    sofaComponents: { ...INITIAL_COMPONENTS },
    apacheII: 0,
    outcome: 'ongoing',
    outcomeDay: 0,
    managementScore: 0.5,
    icuDaysSim: 0,
  }),
}));
