import { create } from 'zustand';

export type DrugId = 
  // Vasopresores
  'noradrenaline' | 'adrenaline' | 'vasopressin' | 'methylene_blue' |
  // Inotrópicos
  'dobutamine' | 'dopamine' | 'milrinone' | 'levosimendan' |
  // Sedantes
  'propofol' | 'midazolam' | 'ketamine' | 'dexmedetomidine' | 'thiopental' |
  // Analgésicos
  'morphine' | 'fentanyl' | 'remifentanil' |
  // BNM
  'atracurium' | 'cisatracurium' | 'rocuronium' | 'pancuronium';

export interface DrugPKDef {
  id: DrugId;
  halfLifeMin: number; // minutes
  vdLkg: number;       // Volume of distribution in L/kg
  inputUnit: 'mcg/kg/min' | 'U/h' | 'mg/kg/h' | 'mcg/kg/h' | 'mg/h';
}

export const DRUG_CATALOG: Record<DrugId, DrugPKDef> = {
  // Vasopresores
  noradrenaline:   { id: 'noradrenaline',   halfLifeMin: 2.5,  vdLkg: 0.5,  inputUnit: 'mcg/kg/min' },
  adrenaline:      { id: 'adrenaline',      halfLifeMin: 2.0,  vdLkg: 0.5,  inputUnit: 'mcg/kg/min' },
  vasopressin:     { id: 'vasopressin',     halfLifeMin: 10.0, vdLkg: 0.2,  inputUnit: 'U/h' },
  methylene_blue:  { id: 'methylene_blue',  halfLifeMin: 300,  vdLkg: 2.0,  inputUnit: 'mg/kg/h' },
  
  // Inotrópicos
  dobutamine:      { id: 'dobutamine',      halfLifeMin: 2.5,  vdLkg: 0.2,  inputUnit: 'mcg/kg/min' },
  dopamine:        { id: 'dopamine',        halfLifeMin: 2.0,  vdLkg: 0.2,  inputUnit: 'mcg/kg/min' },
  milrinone:       { id: 'milrinone',       halfLifeMin: 140,  vdLkg: 0.4,  inputUnit: 'mcg/kg/min' }, // Larga duración relativa
  levosimendan:    { id: 'levosimendan',    halfLifeMin: 1440, vdLkg: 0.2,  inputUnit: 'mcg/kg/min' }, // Metabolito muy largo (simulado)

  // Sedantes
  propofol:        { id: 'propofol',        halfLifeMin: 30,   vdLkg: 4.0,  inputUnit: 'mg/kg/h' },  // Context sensitive
  midazolam:       { id: 'midazolam',       halfLifeMin: 120,  vdLkg: 1.5,  inputUnit: 'mg/kg/h' },
  ketamine:        { id: 'ketamine',        halfLifeMin: 150,  vdLkg: 3.0,  inputUnit: 'mg/kg/h' },
  dexmedetomidine: { id: 'dexmedetomidine', halfLifeMin: 120,  vdLkg: 1.5,  inputUnit: 'mcg/kg/h' },
  thiopental:      { id: 'thiopental',      halfLifeMin: 600,  vdLkg: 2.5,  inputUnit: 'mg/kg/h' },

  // Analgésicos
  morphine:        { id: 'morphine',        halfLifeMin: 120,  vdLkg: 4.0,  inputUnit: 'mg/h' },
  fentanyl:        { id: 'fentanyl',        halfLifeMin: 200,  vdLkg: 4.0,  inputUnit: 'mcg/kg/h' }, // Altamente lipofílico
  remifentanil:    { id: 'remifentanil',    halfLifeMin: 3.0,  vdLkg: 0.3,  inputUnit: 'mcg/kg/min' }, // Cortísima duración
  
  // BNM (Bloqueantes Neuromusculares)
  atracurium:      { id: 'atracurium',      halfLifeMin: 20,   vdLkg: 0.15, inputUnit: 'mg/kg/h' },
  cisatracurium:   { id: 'cisatracurium',   halfLifeMin: 25,   vdLkg: 0.15, inputUnit: 'mg/kg/h' },
  rocuronium:      { id: 'rocuronium',      halfLifeMin: 70,   vdLkg: 0.25, inputUnit: 'mg/kg/h' },
  pancuronium:     { id: 'pancuronium',     halfLifeMin: 120,  vdLkg: 0.25, inputUnit: 'mg/kg/h' },
};

export type PDSystemicEffects = {
  alpha1: number;         // Vasoconstricción (0 a ~2.0+)
  beta1: number;          // Inotropismo/Cronotropismo (0 a ~2.0+)
  beta2: number;          // Broncodilatación / Vasodilatación leve
  vasoplegiaRev: number;  // Reversión directa de vasoplejía
  sedation: number;       // Efecto sedante (0 a 1.0+)
  analgesia: number;      // Efecto analgésico (0 a 1.0+)
  nmba: number;           // Bloqueo neuromuscular (0 = nada, 1.0 = parálisis total)
};

interface PharmacologyState {
  infusionRates: Record<DrugId, number>; // La tasa exacta que ingresa el usuario en el UI
  plasmaConcentrations: Record<DrugId, number>; // Calculada: masa activa / (Vd * weight) = mcg/mL o equiv
  
  // Effects agregados y publicados por el PharmacologyEngine para ser consumidos globalmente:
  systemicEffects: PDSystemicEffects;

  setInfusionRate: (drug: DrugId, rate: number) => void;
  updatePlasmaConcentrations: (cpMap: Record<DrugId, number>) => void;
  updateSystemicEffects: (effects: PDSystemicEffects) => void;
  resetAll: () => void;
}

const INITIAL_RATES = Object.keys(DRUG_CATALOG).reduce((acc, k) => {
  acc[k as DrugId] = 0;
  return acc;
}, {} as Record<DrugId, number>);

const INITIAL_CP = { ...INITIAL_RATES };

const INITIAL_EFFECTS: PDSystemicEffects = {
  alpha1: 0,
  beta1: 0,
  beta2: 0,
  vasoplegiaRev: 0,
  sedation: 0,
  analgesia: 0,
  nmba: 0,
};

export const usePharmacologyStore = create<PharmacologyState>((set) => ({
  infusionRates: { ...INITIAL_RATES },
  plasmaConcentrations: { ...INITIAL_CP },
  systemicEffects: { ...INITIAL_EFFECTS },

  setInfusionRate: (drug, rate) =>
    set((state) => ({
      infusionRates: { ...state.infusionRates, [drug]: rate }
    })),
    
  updatePlasmaConcentrations: (cpMap) =>
    set({ plasmaConcentrations: cpMap }),

  updateSystemicEffects: (effects) =>
    set({ systemicEffects: effects }),

  resetAll: () => set({
    infusionRates: { ...INITIAL_RATES },
    plasmaConcentrations: { ...INITIAL_CP },
    systemicEffects: { ...INITIAL_EFFECTS },
  })
}));
