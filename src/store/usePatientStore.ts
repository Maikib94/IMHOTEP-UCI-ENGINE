import { create } from 'zustand';

export type PupilState = 'reactive' | 'sluggish' | 'unreactive' | 'miotic';
export type LabCategory = 'gases' | 'hema' | 'quimica' | 'especial';

export type FluidType =
  | 'ringer_lactato' | 'sf_09' | 'dex5' | 'dex10' | 'dex50'
  | 'prbc' | 'ffp' | 'platelets' | 'cryo';

export interface FluidProperties {
  label: string;
  shortLabel: string;
  color: string;
  category: 'cristaloide' | 'hemo';
  rbcFraction: number;
  isCrystalloid: boolean;
  glucoseG_per_L: number;
  volumes: number[];
  volumeUnit: string;
  desc: string;
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
  heartRate: number;
  systolicBP: number;
  diastolicBP: number;
  meanArterialPressure: number;
  cardiacOutput: number;
  strokeVolume: number;
  svr: number;
  baseSvr: number;
  cvp: number;
  plethAmplitude: number;
  spo2: number;
  etco2: number;
  respiratoryRate: number;
  paO2: number;
  paCO2: number;
  pplat: number;
  meanAirwayPressure: number; // Pmean (Mean Airway Pressure)
  ppico: number;
  deltaP: number; // Driving Pressure (Pplat - PEEP)
  mechanicalPower: number; // Potencia Mecánica (J/min)
  urineOutput: number;
  gcs: number;
  pupilState: PupilState;
  icp: number;   // mmHg — PIC (Monroe-Kelly); normal 5-15 mmHg
  pH: number;
  hco3: number;
  lactate: number;
  anionGap: number;
  baseExcess: number;
  deltaDelta: number;
  weight: number;
  temperature: number;   // °C — 36.0-37.5 normal (SATI/Cárdenas)
  creatinine: number;    // mg/dL — creatinina sérica (normal 0.7-1.2)
  // ARDS derivados (Berlin 2012) — publicados por RespiratoryEngine cada tick
  pfRatio: number;       // paO2 / fio2Effective (mmHg)
  ardsActive: boolean;   // pfRatio ≤ 300 con PEEP ≥ 5 (con histéresis: desactiva > 320)
  ardsSeverityLevel: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE'; // clasificación Berlin
}

export type VentilatorMode = 'VC-AC' | 'PC-AC' | 'PSV' | 'SIMV' | 'CPAP';

export type VentilatorPauseState = 'NONE' | 'INSPIRATORY' | 'EXPIRATORY';

// Modos simplificados para UI del ventilador (Fase 2+)
export type VentMode = 'VCV' | 'PCV' | 'PSV' | 'CPAP' | 'OFF';

export type RespiratorySupport =
  | 'room_air' | 'nasal_cannula' | 'simple_mask' | 'venturi' | 'hfnc' | 'arm';

// Soporte de oxígeno extendido para Fase 4 (8 niveles escalados)
export type O2Support =
  | 'NONE'
  | 'NASAL_CANNULA'
  | 'SIMPLE_MASK'
  | 'RESERVOIR_MASK'
  | 'HFNC'
  | 'NIV_CPAP'
  | 'NIV_BIPAP'
  | 'INVASIVE_ARM';

export interface RespiratoryDevice {
  support: RespiratorySupport;
  cannulaFlow: number;   // L/min (1-6)
  venturiFiO2: number;   // 0.24-0.60
  hfncFlow: number;      // L/min (20-60)
  hfncFiO2: number;      // 0.21-1.0
}

export function computeDeviceFiO2(dev: RespiratoryDevice): number {
  switch (dev.support) {
    case 'nasal_cannula':
      return Math.min(0.44, 0.21 + 0.04 * dev.cannulaFlow);
    case 'simple_mask':
      return Math.min(0.60, 0.35 + 0.01 * Math.max(0, dev.hfncFlow - 5));
    case 'venturi':
      return dev.venturiFiO2;
    case 'hfnc':
      return dev.hfncFiO2;
    case 'arm':
    case 'room_air':
    default:
      return 0.21;
  }
}

export function computeDevicePEEP(dev: RespiratoryDevice): number {
  if (dev.support === 'hfnc') return Math.min(5, dev.hfncFlow / 10);
  return 0;
}

// ─── Mapa clínico de FiO₂ efectiva y efecto mecánico (Fase 4) ───────────────
//
//  Tabla (especificación clínica):
//  NONE           → FiO₂ 0.21,  PEEP_eff 0,   cFactor 1.0
//  NASAL_CANNULA  → 0.21+0.04×L,PEEP_eff 0,   cFactor 1.0
//  SIMPLE_MASK    → interp 0.35–0.55, PEEP 0,  cFactor 1.0
//  RESERVOIR_MASK → interp 0.60–0.90, PEEP 0,  cFactor 1.0
//  HFNC           → set directo,  PEEP +1/10L, cFactor 1.0
//  NIV_CPAP       → set directo,  PEEP=CPAP,   cFactor 1.05
//  NIV_BIPAP      → set directo,  PEEP=EPAP,   cFactor 1.05
//  INVASIVE_ARM   → set directo,  PEEP=set,    cFactor por patología
//
export interface O2MechanicsResult {
  fio2Eff:  number;  // 0.21–1.0
  peepEff:  number;  // cmH₂O adicional
  cFactor:  number;  // multiplicador de compliance (≥1 → reclutamiento)
}

export function computeEffectiveFiO2AndMechanics(
  o2Support:  O2Support,
  ventilator: Pick<Ventilator, 'fio2' | 'peep' | 'pressureSupport'>,
  device:     RespiratoryDevice,
): O2MechanicsResult {
  switch (o2Support) {
    case 'NONE':
      return { fio2Eff: 0.21, peepEff: 0, cFactor: 1.0 };

    case 'NASAL_CANNULA':
      return {
        fio2Eff: Math.min(0.44, 0.21 + 0.04 * device.cannulaFlow),
        peepEff: 0,
        cFactor: 1.0,
      };

    case 'SIMPLE_MASK': {
      const flow = Math.max(6, Math.min(10, device.hfncFlow));
      const fio2 = 0.35 + ((flow - 6) / 4) * 0.20;
      return { fio2Eff: Math.min(0.55, fio2), peepEff: 0, cFactor: 1.0 };
    }

    case 'RESERVOIR_MASK': {
      const flow = Math.max(10, Math.min(15, device.hfncFlow));
      const fio2 = 0.60 + ((flow - 10) / 5) * 0.30;
      return { fio2Eff: Math.min(0.90, fio2), peepEff: 0, cFactor: 1.0 };
    }

    case 'HFNC':
      return {
        fio2Eff: Math.max(0.21, Math.min(1.0, device.hfncFiO2)),
        peepEff: Math.min(5, device.hfncFlow / 10),
        cFactor: 1.0,
      };

    case 'NIV_CPAP':
      return {
        fio2Eff: Math.max(0.21, Math.min(1.0, ventilator.fio2)),
        peepEff: ventilator.peep,
        cFactor: 1.05,
      };

    case 'NIV_BIPAP':
      return {
        fio2Eff: Math.max(0.21, Math.min(1.0, ventilator.fio2)),
        peepEff: ventilator.peep,
        cFactor: 1.05,
      };

    case 'INVASIVE_ARM':
      return {
        fio2Eff: Math.max(0.21, Math.min(1.0, ventilator.fio2)),
        peepEff: ventilator.peep,
        cFactor: 1.0,
      };
  }
}

export interface Ventilator {
  // ── Controles seteados (UI) ──────────────────────────────────────────────
  mode: VentilatorMode;
  o2Support: O2Support;                 // nivel de soporte de oxígeno (Fase 4)
  fio2: number;                         // 0.21–1.0
  vt: number;                           // mL (VCV)
  peep: number;                         // cmH₂O
  setRR: number;                        // resp/min
  pressureSupport: number;              // cmH₂O sobre PEEP (PSV)
  flowRate: number;                     // L/min flujo inspiratorio (VCV)
  ieRatio: number;                      // I:E como decimal (0.5 = 1:2)
  pControl: number;                     // cmH₂O (PC-AC)
  iTime: number;                        // segundos (tiempo inspiratorio)
  flowPattern: 'SQUARE' | 'DECEL';     // patrón de flujo VCV

  // ── Estado de pausa ──────────────────────────────────────────────────────
  isPaused: boolean;                    // congela tick de CronosEngine
  pauseManeuver: VentilatorPauseState;  // maniobra operador: NONE | INSPIRATORY | EXPIRATORY

  // ── Outputs calculados (read-only para UI, escritos por RespiratoryEngine) ─
  fio2Effective: number;               // 0.21–1.0 (calculado según o2Support)
  pPeak: number;                       // cmH₂O
  pPlateau: number;                    // cmH₂O
  pMean: number;                       // cmH₂O (Mean Airway Pressure)
  autoPEEP: number;                    // cmH₂O
  minuteVentilation: number;           // L/min
}

export interface LabResult {
  values: Record<string, number | string>;
  units: Record<string, string>;
  refs: Record<string, string>;
  flags: Record<string, 'H' | 'L' | 'C' | ''>;
}

export interface LabOrder {
  id: string;
  type: string;
  label: string;
  category: LabCategory;
  orderedAt: number;
  readyAt: number;
  result: LabResult | null;
  snapshot: Partial<Vitals>;
  bloodVolume: number;
  redBloodCellMass: number;
}

const INITIAL_VITALS: Vitals = {
  heartRate: 75,
  systolicBP: 120,
  diastolicBP: 80,
  meanArterialPressure: 93,
  cardiacOutput: 5.3,
  strokeVolume: 70,
  svr: 1295,
  baseSvr: 1295,
  cvp: 8,
  plethAmplitude: 1.0,
  spo2: 98,
  etco2: 38,
  respiratoryRate: 14,
  paO2: 97,
  paCO2: 40,
  meanAirwayPressure: 8, // Initial Pmean
  pplat: 15,
  ppico: 17.5,
  deltaP: 10,
  mechanicalPower: 12,
  urineOutput: 1.0,
  gcs: 15,
  pupilState: 'reactive',
  icp: 12,       // mmHg — normal ICP en adulto (Rangel-Castillo, Neurosurg Clin 2008)
  pH: 7.40,
  hco3: 24.0,
  lactate: 1.0,
  anionGap: 12,
  baseExcess: 0.0,
  deltaDelta: 0,
  weight: 70,
  temperature: 37.0,
  creatinine: 1.0,
  pfRatio: 462,          // paO2 97 / fio2 0.21 ≈ 462 (paciente sano, no cumple criterio ARDS)
  ardsActive: false,
  ardsSeverityLevel: 'NONE',
};

const BV_NORMAL = 5000;
const HTO_NORMAL = 0.45;
export const RBC_MASS_NORMAL = BV_NORMAL * HTO_NORMAL;

function sanitizeVitals(partial: Partial<Vitals>, current: Vitals): Partial<Vitals> {
  const out: Partial<Vitals> = {};
  for (const key in partial) {
    const k = key as keyof Vitals;
    const val = (partial as Record<string, unknown>)[k];
    if (typeof val === 'number') {
      (out as Record<string, unknown>)[k] = isFinite(val) ? val : current[k];
    } else if (val !== undefined) {
      (out as Record<string, unknown>)[k] = val;
    }
  }
  return out;
}

// Rangos físicos válidos para parámetros numéricos del ventilador
const VENT_RANGES: Partial<Record<keyof Ventilator, [number, number]>> = {
  fio2:             [0.21, 1.0],
  vt:               [200,  800],
  peep:             [0,    25],
  setRR:            [4,    40],
  pressureSupport:  [0,    40],
  flowRate:         [20,   80],
  ieRatio:          [0.2,  2.0],
  pControl:         [0,    40],
  iTime:            [0.3,  3.0],
  fio2Effective:    [0.21, 1.0],
  pPeak:            [0,    80],
  pPlateau:         [0,    60],
  pMean:            [0,    50],
  autoPEEP:         [0,    20],
  minuteVentilation:[0,    40],
};

function sanitizeVentilator(partial: Partial<Ventilator>): Partial<Ventilator> {
  const out: Partial<Ventilator> = {};
  if (partial.mode !== undefined) out.mode = partial.mode;
  if (partial.flowPattern !== undefined) out.flowPattern = partial.flowPattern;
  if (partial.isPaused !== undefined) out.isPaused = partial.isPaused;
  if (partial.pauseManeuver !== undefined) out.pauseManeuver = partial.pauseManeuver;

  for (const key of Object.keys(VENT_RANGES) as (keyof typeof VENT_RANGES)[]) {
    const val = (partial as Partial<Record<keyof Ventilator, number>>)[key];
    if (val !== undefined && isFinite(val)) {
      (out as Record<string, unknown>)[key] = val;
    }
  }
  return out;
}

const INITIAL_RESP_DEVICE: RespiratoryDevice = {
  support: 'room_air',
  cannulaFlow: 2,
  venturiFiO2: 0.28,
  hfncFlow: 40,
  hfncFiO2: 0.60,
};

// ─── UI persistent state (acordeón) ─────────────────────────────────────────
const ACCORDION_DEFAULTS: Record<string, boolean> = {
  'drugs-vasopressors':    true,
  'drugs-inotropes':       false,
  'drugs-antiarrhythmics': false,
  'drugs-sedation':        false,
  'drugs-analgesia':       false,
  'drugs-bnm':             false,
  'clinical-neuro':        false,
  'infecto-lab':           false,
  'arm-quick':             true,
};

interface PatientState {
  vitals: Vitals;
  bloodVolume: number;

  // UI
  accordionExpanded: Record<string, boolean>;
  setAccordionExpanded: (id: string, expanded: boolean) => void;
  hemorrhageRate: number;
  redBloodCellMass: number;
  crystalloidAccumulated: number;
  prbcUnitsGiven: number;
  ffpUnitsGiven: number;
  instantResults: boolean;
  isVentilatorConnected: boolean;
  ventilator: Ventilator;
  respiratoryDevice: RespiratoryDevice;
  labOrders: LabOrder[];

  updateVitals: (partial: Partial<Vitals>) => void;
  // Aliases — Volemia
  administerBolus: (amount?: number) => void;
  applyBolus: (amount?: number) => void;
  startBleeding: (rate?: number) => void;
  stopBleeding: () => void;
  toggleBleeding: (rate?: number) => void;

  // Aliases — Ventilador
  setFiO2: (v: number) => void;
  setVt: (v: number) => void;
  setPeep: (v: number) => void;
  setRRVent: (v: number) => void;
  setVentMode: (v: VentilatorMode) => void;
  setPressureSupport: (v: number) => void;
  setVentilatorSettings: (partial: Partial<Ventilator>) => void;
  incrementFiO2: (d?: number) => void;
  decrementFiO2: (d?: number) => void;
  incrementPeep: (d?: number) => void;
  decrementPeep: (d?: number) => void;
  incrementVt: (d?: number) => void;
  decrementVt: (d?: number) => void;

  // Acciones Fase 2+
  toggleVentilatorPause: () => void;
  setVentilatorParam: (k: keyof Ventilator, v: number) => void;
  applyVentOutputs: (outputs: Pick<Ventilator, 'pPeak' | 'pPlateau' | 'pMean' | 'autoPEEP' | 'minuteVentilation' | 'fio2Effective'>) => void;

  // Acciones Fase 3 — maniobras de pausa del operador
  triggerPauseManeuver: (type: VentilatorPauseState) => void;

  // Acciones Fase 4
  setO2Support: (support: O2Support) => void;

  // Soporte Respiratorio Escalonado
  setRespiratorySupport: (support: RespiratorySupport) => void;
  setRespiratoryDevice: (partial: Partial<RespiratoryDevice>) => void;

  // Core setters
  setBloodVolume: (v: number) => void;
  setHemorrhageRate: (v: number) => void;
  setRedBloodCellMass: (m: number) => void;
  setCrystalloidAccumulated: (v: number) => void;
  setInstantResults: (v: boolean) => void;
  setVentilatorConnected: (v: boolean) => void;
  resetFluidTracking: () => void;
  administerFluid: (type: FluidType, volume: number) => void;
  setVentilator: (partial: Partial<Ventilator>) => void;
  addLabOrder: (order: LabOrder) => void;
  fulfillLabOrder: (id: string, result: LabResult) => void;
  clearLabOrders: () => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  vitals: { ...INITIAL_VITALS },
  accordionExpanded: { ...ACCORDION_DEFAULTS },
  setAccordionExpanded: (id, expanded) =>
    set(s => ({ accordionExpanded: { ...s.accordionExpanded, [id]: expanded } })),
  bloodVolume: BV_NORMAL,
  hemorrhageRate: 0,
  redBloodCellMass: RBC_MASS_NORMAL,
  crystalloidAccumulated: 0,
  prbcUnitsGiven: 0,
  ffpUnitsGiven: 0,
  instantResults: false,
  isVentilatorConnected: false,
  ventilator: {
    mode: 'VC-AC', o2Support: 'INVASIVE_ARM',
    fio2: 0.40, vt: 500, peep: 5, setRR: 14,
    pressureSupport: 10, flowRate: 40, ieRatio: 0.5, pControl: 15,
    iTime: 1.0, flowPattern: 'SQUARE',
    isPaused: false,
    pauseManeuver: 'NONE',
    fio2Effective: 0.40,
    pPeak: 0, pPlateau: 0, pMean: 0, autoPEEP: 0, minuteVentilation: 0,
  },
  respiratoryDevice: { ...INITIAL_RESP_DEVICE },
  labOrders: [],

  updateVitals: (partial) =>
    set((s) => ({ vitals: { ...s.vitals, ...sanitizeVitals(partial, s.vitals) } })),

  setBloodVolume: (v) => set({ bloodVolume: Math.max(0, v) }),
  setHemorrhageRate: (v) => set({ hemorrhageRate: Math.max(0, v) }),
  setRedBloodCellMass: (m) => set({ redBloodCellMass: Math.max(0, m) }),
  setCrystalloidAccumulated: (v) => set({ crystalloidAccumulated: Math.max(0, v) }),
  setInstantResults: (v) => set({ instantResults: v }),
  setVentilatorConnected: (v) => set({ isVentilatorConnected: v }),

  resetFluidTracking: () => set({
    redBloodCellMass: RBC_MASS_NORMAL,
    crystalloidAccumulated: 0,
    prbcUnitsGiven: 0,
    ffpUnitsGiven: 0,
  }),

  administerFluid: (type, volume) => set((s) => {
    const props = FLUID_CATALOG[type];
    const newBV = Math.min(9000, s.bloodVolume + volume);
    const rbcAdded = volume * props.rbcFraction;
    const newRBC = Math.min(newBV * 0.90, s.redBloodCellMass + rbcAdded);
    const newCryst = props.isCrystalloid
      ? s.crystalloidAccumulated + volume
      : s.crystalloidAccumulated;
    const prbcDelta = type === 'prbc' ? Math.round(volume / 300) : 0;
    const ffpDelta = type === 'ffp' ? Math.round(volume / 250) : 0;
    return {
      bloodVolume: newBV,
      redBloodCellMass: newRBC,
      crystalloidAccumulated: newCryst,
      prbcUnitsGiven: s.prbcUnitsGiven + prbcDelta,
      ffpUnitsGiven: s.ffpUnitsGiven + ffpDelta,
    };
  }),

  setVentilator: (partial) =>
    set((s) => ({ ventilator: { ...s.ventilator, ...sanitizeVentilator(partial) } })),

  addLabOrder: (order) => set((s) => ({ labOrders: [...s.labOrders, order] })),
  fulfillLabOrder: (id, result) => set((s) => ({ labOrders: s.labOrders.map((o) => o.id === id ? { ...o, result } : o) })),
  clearLabOrders: () => set({ labOrders: [] }),

  administerBolus: (ml = 500) =>
    set((s) => ({
      bloodVolume: Math.min(9000, s.bloodVolume + ml),
      crystalloidAccumulated: s.crystalloidAccumulated + ml,
    })),
  applyBolus: (ml = 500) =>
    set((s) => ({
      bloodVolume: Math.min(9000, s.bloodVolume + ml),
      crystalloidAccumulated: s.crystalloidAccumulated + ml,
    })),
  startBleeding: (rate = 50) => set({ hemorrhageRate: rate }),
  stopBleeding: () => set({ hemorrhageRate: 0 }),
  toggleBleeding: (rate = 50) =>
    set((s) => ({ hemorrhageRate: s.hemorrhageRate > 0 ? 0 : rate })),

  setFiO2: (v) => set((s) => ({ ventilator: { ...s.ventilator, fio2: Math.max(0.21, Math.min(1.0, v)) } })),
  setVt: (v) => set((s) => ({ ventilator: { ...s.ventilator, vt: Math.max(200, Math.min(800, v)) } })),
  setPeep: (v) => set((s) => ({ ventilator: { ...s.ventilator, peep: Math.max(0, Math.min(30, v)) } })),
  setRRVent: (v) => set((s) => ({ ventilator: { ...s.ventilator, setRR: Math.max(4, Math.min(40, v)) } })),
  setVentMode: (v) => set((s) => ({ ventilator: { ...s.ventilator, mode: v } })),
  setPressureSupport: (v) => set((s) => ({ ventilator: { ...s.ventilator, pressureSupport: Math.max(0, Math.min(40, v)) } })),
  setVentilatorSettings: (partial) =>
    set((s) => ({ ventilator: { ...s.ventilator, ...sanitizeVentilator(partial) } })),

  incrementFiO2: (d = 0.05) => set((s) => ({ ventilator: { ...s.ventilator, fio2: Math.min(1.0, s.ventilator.fio2 + d) } })),
  decrementFiO2: (d = 0.05) => set((s) => ({ ventilator: { ...s.ventilator, fio2: Math.max(0.21, s.ventilator.fio2 - d) } })),
  incrementPeep: (d = 1) => set((s) => ({ ventilator: { ...s.ventilator, peep: Math.min(30, s.ventilator.peep + d) } })),
  decrementPeep: (d = 1) => set((s) => ({ ventilator: { ...s.ventilator, peep: Math.max(0, s.ventilator.peep - d) } })),
  incrementVt: (d = 50) => set((s) => ({ ventilator: { ...s.ventilator, vt: Math.min(800, s.ventilator.vt + d) } })),
  decrementVt: (d = 50) => set((s) => ({ ventilator: { ...s.ventilator, vt: Math.max(200, s.ventilator.vt - d) } })),

  setRespiratorySupport: (support) => set((s) => {
    const isArm = support === 'arm';
    return {
      isVentilatorConnected: isArm,
      respiratoryDevice: { ...s.respiratoryDevice, support },
    };
  }),

  setRespiratoryDevice: (partial) => set((s) => ({
    respiratoryDevice: { ...s.respiratoryDevice, ...partial },
  })),

  toggleVentilatorPause: () =>
    set((s) => ({ ventilator: { ...s.ventilator, isPaused: !s.ventilator.isPaused } })),

  triggerPauseManeuver: (type) =>
    set((s) => ({ ventilator: { ...s.ventilator, pauseManeuver: type } })),

  setVentilatorParam: (k, v) => set((s) => {
    const range = VENT_RANGES[k];
    if (range === undefined) return {};
    const [lo, hi] = range;
    const clamped = Math.max(lo, Math.min(hi, v));
    return { ventilator: { ...s.ventilator, [k]: clamped } };
  }),

  applyVentOutputs: (outputs) =>
    set((s) => ({ ventilator: { ...s.ventilator, ...outputs } })),

  setO2Support: (support) => set((s) => {
    const isInvasive = support === 'INVASIVE_ARM';
    return {
      isVentilatorConnected: isInvasive,
      ventilator: { ...s.ventilator, o2Support: support },
    };
  }),
}));