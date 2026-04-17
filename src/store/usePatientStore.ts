import { create } from 'zustand';

export type PupilState  = 'reactive' | 'sluggish' | 'unreactive' | 'miotic';
export type LabCategory = 'gases' | 'hema' | 'quimica' | 'especial';

export type FluidType =
  | 'ringer_lactato' | 'sf_09' | 'dex5' | 'dex10' | 'dex50'
  | 'prbc' | 'ffp' | 'platelets' | 'cryo';

export interface FluidProperties {
  label:          string;
  shortLabel:     string;
  color:          string;
  category:       'cristaloide' | 'hemo';
  rbcFraction:    number;
  isCrystalloid:  boolean;
  glucoseG_per_L: number;
  volumes:        number[];
  volumeUnit:     string;
  desc:           string;
}

export const FLUID_CATALOG: Record<FluidType, FluidProperties> = {
  ringer_lactato: {
    label: 'Ringer Lactato', shortLabel: 'RL', color: '#38bdf8',
    category: 'cristaloide', rbcFraction: 0, isCrystalloid: true, glucoseG_per_L: 0,
    volumes: [100, 250, 500, 1000], volumeUnit: 'mL',
    desc: 'Cristaloide balanceado — menor riesgo acidosis hiperclorémica',
  },
  sf_09: {
    label: 'Suero Fisiologico 0.9%', shortLabel: 'SF', color: '#7dd3fc',
    category: 'cristaloide', rbcFraction: 0, isCrystalloid: true, glucoseG_per_L: 0,
    volumes: [100, 250, 500, 1000], volumeUnit: 'mL',
    desc: 'Riesgo acidosis hiperclorémica si mayor de 3L (EAST 2023)',
  },
  dex5: {
    label: 'Dextrosa 5%', shortLabel: 'D5%', color: '#fde68a',
    category: 'cristaloide', rbcFraction: 0, isCrystalloid: true, glucoseG_per_L: 50,
    volumes: [100, 250, 500, 1000], volumeUnit: 'mL',
    desc: '50g glucosa/L — NO para resucitacion de volumen',
  },
  dex10: {
    label: 'Dextrosa 10%', shortLabel: 'D10%', color: '#fbbf24',
    category: 'cristaloide', rbcFraction: 0, isCrystalloid: true, glucoseG_per_L: 100,
    volumes: [100, 250, 500], volumeUnit: 'mL',
    desc: '100g glucosa/L — hipoglicemia moderada-grave',
  },
  dex50: {
    label: 'Dextrosa 50%', shortLabel: 'D50%', color: '#f59e0b',
    category: 'cristaloide', rbcFraction: 0, isCrystalloid: false, glucoseG_per_L: 500,
    volumes: [20, 50, 100], volumeUnit: 'mL (amp)',
    desc: '500g glucosa/L — ampollas para hipoglicemia grave',
  },
  prbc: {
    label: 'GRE (PRBC)', shortLabel: 'GRE', color: '#ef4444',
    category: 'hemo', rbcFraction: 0.70, isCrystalloid: false, glucoseG_per_L: 0,
    volumes: [300, 600], volumeUnit: 'mL (1U=300)',
    desc: 'Objetivo Hb mayor de 7 g/dL trauma — PROPPR 2015',
  },
  ffp: {
    label: 'PFC (FFP)', shortLabel: 'PFC', color: '#f97316',
    category: 'hemo', rbcFraction: 0, isCrystalloid: false, glucoseG_per_L: 0,
    volumes: [250, 500], volumeUnit: 'mL (1U=250)',
    desc: 'Factores coag — ratio 1:1 con GRE (PROPPR 2015)',
  },
  platelets: {
    label: 'Plaquetas', shortLabel: 'PLT', color: '#a78bfa',
    category: 'hemo', rbcFraction: 0, isCrystalloid: false, glucoseG_per_L: 0,
    volumes: [250], volumeUnit: 'mL (1 aferesis)',
    desc: 'Objetivo mayor de 50K trauma — ratio 1:1:1 (EAST 2023)',
  },
  cryo: {
    label: 'Crioprecipitado', shortLabel: 'CRYO', color: '#e879f9',
    category: 'hemo', rbcFraction: 0, isCrystalloid: false, glucoseG_per_L: 0,
    volumes: [50, 250], volumeUnit: 'mL (1U=50)',
    desc: 'Fibrinogeno — indicado si menor de 1.5 g/L',
  },
};

export interface Vitals {
  heartRate:            number;
  systolicBP:           number;
  diastolicBP:          number;
  meanArterialPressure: number;
  cardiacOutput:        number;
  strokeVolume:         number;
  svr:                  number;
  baseSvr:              number;
  cvp:                  number;
  plethAmplitude:       number;
  spo2:                 number;
  etco2:                number;
  respiratoryRate:      number;
  paO2:                 number;
  paCO2:                number;
  pplat:                number;
  ppico:                number;
  urineOutput:          number;
  gcs:                  number;
  pupilState:           PupilState;
  icp:                  number;   // mmHg — PIC (Monroe-Kelly); normal 5-15 mmHg
  pH:                   number;
  hco3:                 number;
  lactate:              number;
  anionGap:             number;
  baseExcess:           number;
  deltaDelta:           number;
  weight:               number;
  temperature:          number;   // °C — 36.0-37.5 normal (SATI/Cárdenas)
  creatinine:           number;   // mg/dL — creatinina sérica (normal 0.7-1.2)
}

export interface Ventilator {
  fio2:  number;
  vt:    number;
  peep:  number;
  setRR: number;
}

export interface LabResult {
  values: Record<string, number | string>;
  units:  Record<string, string>;
  refs:   Record<string, string>;
  flags:  Record<string, 'H' | 'L' | 'C' | ''>;
}

export interface LabOrder {
  id:               string;
  type:             string;
  label:            string;
  category:         LabCategory;
  orderedAt:        number;
  readyAt:          number;
  result:           LabResult | null;
  snapshot:         Partial<Vitals>;
  bloodVolume:      number;
  redBloodCellMass: number;
}

const INITIAL_VITALS: Vitals = {
  heartRate:            75,
  systolicBP:           120,
  diastolicBP:          80,
  meanArterialPressure: 93,
  cardiacOutput:        5.3,
  strokeVolume:         70,
  svr:                  1295,
  baseSvr:              1295,
  cvp:                  8,
  plethAmplitude:       1.0,
  spo2:                 98,
  etco2:                38,
  respiratoryRate:      14,
  paO2:                 97,
  paCO2:                40,
  pplat:                15,
  ppico:                17.5,
  urineOutput:          1.0,
  gcs:                  15,
  pupilState:           'reactive',
  icp:                  12,       // mmHg — normal ICP en adulto (Rangel-Castillo, Neurosurg Clin 2008)
  pH:                   7.40,
  hco3:                 24.0,
  lactate:              1.0,
  anionGap:             12,
  baseExcess:           0.0,
  deltaDelta:           0,
  weight:               70,
  temperature:          37.0,
  creatinine:           1.0,
};

const BV_NORMAL      = 5000;
const HTO_NORMAL     = 0.45;
export const RBC_MASS_NORMAL = BV_NORMAL * HTO_NORMAL;

function sanitizeVitals(partial: Partial<Vitals>, current: Vitals): Partial<Vitals> {
  const out: Partial<Vitals> = {};
  for (const key in partial) {
    const k   = key as keyof Vitals;
    const val = (partial as Record<string, unknown>)[k];
    if (typeof val === 'number') {
      (out as Record<string, unknown>)[k] = isFinite(val) ? val : current[k];
    } else if (val !== undefined) {
      (out as Record<string, unknown>)[k] = val;
    }
  }
  return out;
}

function sanitizeVentilator(partial: Partial<Ventilator>): Partial<Ventilator> {
  const out: Partial<Ventilator> = {};
  if (partial.fio2  !== undefined && isFinite(partial.fio2))  out.fio2  = partial.fio2;
  if (partial.vt    !== undefined && isFinite(partial.vt))    out.vt    = partial.vt;
  if (partial.peep  !== undefined && isFinite(partial.peep))  out.peep  = partial.peep;
  if (partial.setRR !== undefined && isFinite(partial.setRR)) out.setRR = partial.setRR;
  return out;
}

interface PatientState {
  vitals:                  Vitals;
  bloodVolume:             number;
  hemorrhageRate:          number;
  redBloodCellMass:        number;
  crystalloidAccumulated:  number;
  prbcUnitsGiven:          number;
  ffpUnitsGiven:           number;
  instantResults:          boolean;   // Desafío 2: modo instructor
  ventilator:              Ventilator;
  labOrders:               LabOrder[];

  updateVitals:              (partial: Partial<Vitals>) => void;
  // Aliases — Volemia
  administerBolus: (amount?: number) => void;
  applyBolus:      (amount?: number) => void;
  startBleeding:   (rate?: number)   => void;
  stopBleeding:    ()                => void;
  toggleBleeding:  (rate?: number)   => void;

  // Aliases — Ventilador
  setFiO2:       (v: number) => void;
  setVt:         (v: number) => void;
  setPeep:       (v: number) => void;
  setRRVent:     (v: number) => void;
  incrementFiO2: (d?: number) => void;
  decrementFiO2: (d?: number) => void;
  incrementPeep: (d?: number) => void;
  decrementPeep: (d?: number) => void;
  incrementVt:   (d?: number) => void;
  decrementVt:   (d?: number) => void;

  // Core setters
  setBloodVolume:             (v: number) => void;
  setHemorrhageRate:          (v: number) => void;
  setRedBloodCellMass:        (m: number) => void;
  setCrystalloidAccumulated:  (v: number) => void;
  setInstantResults:          (v: boolean) => void;
  resetFluidTracking:         () => void;
  administerFluid:            (type: FluidType, volume: number) => void;
  setVentilator:              (partial: Partial<Ventilator>) => void;
  addLabOrder:                (order: LabOrder) => void;
  fulfillLabOrder:            (id: string, result: LabResult) => void;
  clearLabOrders:             () => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  vitals:                 { ...INITIAL_VITALS },
  bloodVolume:            BV_NORMAL,
  hemorrhageRate:         0,
  redBloodCellMass:       RBC_MASS_NORMAL,
  crystalloidAccumulated: 0,
  prbcUnitsGiven:         0,
  ffpUnitsGiven:          0,
  instantResults:         false,
  ventilator:             { fio2: 0.21, vt: 500, peep: 5, setRR: 14 },
  labOrders:              [],

  updateVitals: (partial) =>
    set((s) => ({ vitals: { ...s.vitals, ...sanitizeVitals(partial, s.vitals) } })),

  setBloodVolume:            (v) => set({ bloodVolume:            Math.max(0, v) }),
  setHemorrhageRate:         (v) => set({ hemorrhageRate:         Math.max(0, v) }),
  setRedBloodCellMass:       (m) => set({ redBloodCellMass:       Math.max(0, m) }),
  setCrystalloidAccumulated: (v) => set({ crystalloidAccumulated: Math.max(0, v) }),
  setInstantResults:         (v) => set({ instantResults: v }),

  resetFluidTracking: () => set({
    redBloodCellMass:       RBC_MASS_NORMAL,
    crystalloidAccumulated: 0,
    prbcUnitsGiven:         0,
    ffpUnitsGiven:          0,
  }),

  administerFluid: (type, volume) => set((s) => {
    const props    = FLUID_CATALOG[type];
    const newBV    = Math.min(9000, s.bloodVolume + volume);
    const rbcAdded = volume * props.rbcFraction;
    const newRBC   = Math.min(newBV * 0.90, s.redBloodCellMass + rbcAdded);
    const newCryst = props.isCrystalloid
      ? s.crystalloidAccumulated + volume
      : s.crystalloidAccumulated;
    const prbcDelta = type === 'prbc' ? Math.round(volume / 300) : 0;
    const ffpDelta  = type === 'ffp'  ? Math.round(volume / 250) : 0;
    return {
      bloodVolume:            newBV,
      redBloodCellMass:       newRBC,
      crystalloidAccumulated: newCryst,
      prbcUnitsGiven:         s.prbcUnitsGiven + prbcDelta,
      ffpUnitsGiven:          s.ffpUnitsGiven  + ffpDelta,
    };
  }),

  setVentilator: (partial) =>
    set((s) => ({ ventilator: { ...s.ventilator, ...sanitizeVentilator(partial) } })),

  addLabOrder:     (order)         => set((s) => ({ labOrders: [...s.labOrders, order] })),
  fulfillLabOrder: (id, result)    => set((s) => ({ labOrders: s.labOrders.map((o) => o.id === id ? { ...o, result } : o) })),
  clearLabOrders:  ()              => set({ labOrders: [] }),

  administerBolus: (ml = 500) =>
    set((s) => ({
      bloodVolume:            Math.min(9000, s.bloodVolume + ml),
      crystalloidAccumulated: s.crystalloidAccumulated + ml,
    })),
  applyBolus: (ml = 500) =>
    set((s) => ({
      bloodVolume:            Math.min(9000, s.bloodVolume + ml),
      crystalloidAccumulated: s.crystalloidAccumulated + ml,
    })),
  startBleeding:  (rate = 50) => set({ hemorrhageRate: rate }),
  stopBleeding:   ()          => set({ hemorrhageRate: 0 }),
  toggleBleeding: (rate = 50) =>
    set((s) => ({ hemorrhageRate: s.hemorrhageRate > 0 ? 0 : rate })),

  setFiO2:   (v) => set((s) => ({ ventilator: { ...s.ventilator, fio2:  Math.max(0.21, Math.min(1.0, v)) } })),
  setVt:     (v) => set((s) => ({ ventilator: { ...s.ventilator, vt:    Math.max(200,  Math.min(800, v)) } })),
  setPeep:   (v) => set((s) => ({ ventilator: { ...s.ventilator, peep:  Math.max(0,    Math.min(30,  v)) } })),
  setRRVent: (v) => set((s) => ({ ventilator: { ...s.ventilator, setRR: Math.max(4,    Math.min(40,  v)) } })),

  incrementFiO2: (d = 0.05) => set((s) => ({ ventilator: { ...s.ventilator, fio2:  Math.min(1.0, s.ventilator.fio2  + d) } })),
  decrementFiO2: (d = 0.05) => set((s) => ({ ventilator: { ...s.ventilator, fio2:  Math.max(0.21,s.ventilator.fio2  - d) } })),
  incrementPeep: (d = 1)    => set((s) => ({ ventilator: { ...s.ventilator, peep:  Math.min(30,  s.ventilator.peep  + d) } })),
  decrementPeep: (d = 1)    => set((s) => ({ ventilator: { ...s.ventilator, peep:  Math.max(0,   s.ventilator.peep  - d) } })),
  incrementVt:   (d = 50)   => set((s) => ({ ventilator: { ...s.ventilator, vt:    Math.min(800, s.ventilator.vt    + d) } })),
  decrementVt:   (d = 50)   => set((s) => ({ ventilator: { ...s.ventilator, vt:    Math.max(200, s.ventilator.vt    - d) } })),
}));