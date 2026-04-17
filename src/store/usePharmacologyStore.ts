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

// ─── PK Definition ────────────────────────────────────────────────────────────
export interface DrugPKDef {
  id: DrugId;
  halfLifeMin: number;  // minutos
  vdLkg: number;        // Vd en L/kg
  inputUnit: 'mcg/kg/min' | 'U/h' | 'mg/kg/h' | 'mcg/kg/h' | 'mg/h';
}

// ─── PD Profile (declarativo por droga) ───────────────────────────────────────
//
// PRINCIPIO DE EXTENSIBILIDAD:
//   Añadir un nuevo fármaco = solo agregar una entrada al DRUG_CATALOG.
//   El PharmacologyEngine suma automáticamente todos los perfiles activos.
//   NUNCA escribir lógica "if (drug === 'propofol')" en los engines fisiológicos.
//
// Cada campo es un COEFICIENTE LINEAL sobre cpRatio (0-1 = dosis max estándar).
// El engine aplica: effect += cp[drug] * profile[field]
// Los engines fisiológicos solo leen PDSystemicEffects — sin conocimiento de drogas.
//
export interface DrugPDProfile {
  // ── Hemodinámicos ──────────────────────────────────────────────────────────
  /** Vasoconstricción α₁ (↑RVS ↑PAM). Rango típico 0–2. */
  alpha1: number;
  /** Inotropismo/Cronotropismo β₁ (↑FC ↑VE). Rango típico 0–2. */
  beta1: number;
  /** Broncodilatación/vasodilatación leve β₂. Rango 0–1. */
  beta2: number;
  /** Reversión de vasoplejía (vasopresina/azul metileno). Rango 0–2. */
  vasoplegiaRev: number;
  /** Efecto vagolítico: ↑FC independiente de β₁ (pancuronio). Rango 0–1.
   *  Valores negativos = vagotónico (tono vagal aumentado, bradicardia). */
  vagolytic: number;
  /** Penalización directa de PAM en mmHg por unidad de cpRatio.
   *  Negativo = hipotensión. Ej: propofol −15 → hasta −15 mmHg a dosis max. */
  mapDirect: number;
  /** Cronotropismo directo en bpm por unidad de cpRatio.
   *  Negativo = bradicardia. */
  hrDirect: number;

  // ── Neurológicos / Sedantes ────────────────────────────────────────────────
  /** Efecto sedante/depresor SNC. Rango 0–2. Acumula hacia coma. */
  sedation: number;
  /** Efecto analgésico (opioides). Rango 0–2. */
  analgesia: number;
  /** Bloqueo neuromuscular. 0 = sin bloqueo, 1 = parálisis total. */
  nmba: number;

  // ── Termogénesis ──────────────────────────────────────────────────────────
  /** Inhibición del termostato hipotalámico.
   *  +1 = máxima hipotermia (propofol pleno), −1 = preserva/↑ termogénesis (ketamina).
   *  El engine lo convierte en ΔT objetivo: termoDepr * −2.0°C máx. */
  thermoDepression: number;

  // ── Función Renal / ADH ───────────────────────────────────────────────────
  /** Modulación ADH (vasopresina antidiurética).
   *  +1 = inhibición ADH → diuresis ↑ (propofol, dex).
   *  −1 = liberación ADH/histamina → antidiuresis (morfina).
   *  Amplia el UO target en ±0.5 ml/kg/h a magnitud 1. */
  adhSuppression: number;

  // ── Metabólico / Ácido-Base ────────────────────────────────────────────────
  /** Estrés metabólico por infusión prolongada.
   *  Propofol > dosis plena → PRIS → ↑lactato (0–1 escala lineal).
   *  Activa solo cuando cp > 1.0 (supramáximo estándar). */
  metabolicStress: number;

  // ── Respiratorio ──────────────────────────────────────────────────────────
  /** Peso en el índice de depresión respiratoria central.
   *  Determina cuánto contribuye este fármaco al índice drugRespDepressionIdx
   *  en el RespiratoryEngine. Rango 0–1. */
  respDepressionWeight: number;
}

// ─── Catálogo Completo ────────────────────────────────────────────────────────
//
// CÓMO AÑADIR UN NUEVO FÁRMACO:
//   1. Añadir DrugId al union type arriba.
//   2. Añadir entrada en DRUG_CATALOG con sus parámetros PK + PD.
//   3. Añadir dosis referencia en PharmacologyEngine.DRUG_MAX_DOSES.
//   4. Añadir en DRUG_CATALOG.inputUnit la unidad correspondiente.
//   ¡Sin tocar ningún engine fisiológico!
//
export interface DrugCatalogEntry extends DrugPKDef {
  pd: DrugPDProfile;
}

const ZERO_PD: DrugPDProfile = {
  alpha1: 0, beta1: 0, beta2: 0, vasoplegiaRev: 0, vagolytic: 0,
  mapDirect: 0, hrDirect: 0, sedation: 0, analgesia: 0, nmba: 0,
  thermoDepression: 0, adhSuppression: 0, metabolicStress: 0, respDepressionWeight: 0,
};

export const DRUG_CATALOG: Record<DrugId, DrugCatalogEntry> = {
  // ── VASOPRESORES ────────────────────────────────────────────────────────────
  noradrenaline: {
    id: 'noradrenaline', halfLifeMin: 2.5, vdLkg: 0.5, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      alpha1: 1.5,          // predominio α₁ → ↑RVS ↑PAM (Goodman & Gilman 13ª)
      beta1: 0.3,           // algo β₁ → ↑cont. cardíaca leve
      mapDirect: 10,        // hasta +10 mmHg a 0.5 mcg/kg/min
    },
  },
  adrenaline: {
    id: 'adrenaline', halfLifeMin: 2.0, vdLkg: 0.5, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      alpha1: 1.0,          // α₁ dosis altas
      beta1: 1.5,           // β₁ potente
      beta2: 1.0,           // β₂: broncodilatación, vasodilatación periferica
      hrDirect: 20,         // taquicardia hasta +20 bpm
    },
  },
  vasopressin: {
    id: 'vasopressin', halfLifeMin: 10.0, vdLkg: 0.2, inputUnit: 'U/h',
    pd: { ...ZERO_PD,
      vasoplegiaRev: 1.5,   // V1 vascular → vasoconstricción directa
      adhSuppression: -0.8, // agonista ADH/V2 renal → antidiurético
    },
  },
  methylene_blue: {
    id: 'methylene_blue', halfLifeMin: 300, vdLkg: 2.0, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      vasoplegiaRev: 2.0,   // inhibidor NOS → bloquea vasodilatación
    },
  },

  // ── INOTRÓPICOS ─────────────────────────────────────────────────────────────
  dobutamine: {
    id: 'dobutamine', halfLifeMin: 2.5, vdLkg: 0.2, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      beta1: 1.5,           // β₁ selectivo → ↑inotropismo fuerte
      hrDirect: 10,         // taquicardia moderada
    },
  },
  dopamine: {
    id: 'dopamine', halfLifeMin: 2.0, vdLkg: 0.2, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      beta1: 1.0,           // dosis bajas: D₁/β₁ predominan
      alpha1: 0.5,          // dosis altas: cruza a α₁
      adhSuppression: 0.3,  // leve efecto natriurético vía DA₁ renal
    },
  },
  milrinone: {
    id: 'milrinone', halfLifeMin: 140, vdLkg: 0.4, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      beta1: 1.2,           // inhibidor PDE3 → ↑AMPc → inotropismo
      mapDirect: -5,        // vasodilatación venosa/arterial
    },
  },
  levosimendan: {
    id: 'levosimendan', halfLifeMin: 1440, vdLkg: 0.2, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      beta1: 1.0,           // sensibilizador calcio → ↑contractilidad
      mapDirect: -4,        // PDE3 → vasodilatación moderada
    },
  },

  // ── SEDANTES ────────────────────────────────────────────────────────────────
  propofol: {
    id: 'propofol', halfLifeMin: 30, vdLkg: 4.0, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      sedation: 1.2,        // GABA-A bulbar → coma dosis-dependiente
      mapDirect: -15,       // vasodilat. sistémica + inotropismo neg → ↓PAM
      hrDirect: -5,         // ↓FC leve (descenso tono simpático)
      thermoDepression: 0.6,  // inhibe termostato hipotalámico → hipotermia
      adhSuppression: 0.4,    // inhibe liberación ADH → leve diuresis
      metabolicStress: 0.8,   // PRIS: a Cp>1 → acidosis/lactato (cuadrático en engine)
      respDepressionWeight: 0.50,
    },
  },
  midazolam: {
    id: 'midazolam', halfLifeMin: 120, vdLkg: 1.5, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      sedation: 1.0,        // GABA-A → sedación moderada
      mapDirect: -8,        // vasodilatación leve-moderada (Reves et al.)
      hrDirect: -2,
      thermoDepression: 0.3,  // hipotermia moderada (Sessler 1994)
      adhSuppression: 0.1,    // efecto menor sobre ADH
      respDepressionWeight: 0.30,
    },
  },
  ketamine: {
    id: 'ketamine', halfLifeMin: 150, vdLkg: 3.0, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      sedation: 0.8,        // disociatvo: NMDA → sedación, NO depresión resp profunda
      mapDirect: 15,        // simpáticomimético → ↑NE → ↑PAM (Miller Anesthesia, Cap.19)
      hrDirect: 15,         // taquicardia simpaticomimética
      thermoDepression: -0.15, // mantiene/↑ termogénesis simpática (negativo = conserva calor)
      adhSuppression: -0.2,   // vasoconstricción renal → leve ↓UO
      respDepressionWeight: 0.05, // mínima depresión resp (preserva drive faríngeo)
    },
  },
  dexmedetomidine: {
    id: 'dexmedetomidine', halfLifeMin: 120, vdLkg: 1.5, inputUnit: 'mcg/kg/h',
    pd: { ...ZERO_PD,
      sedation: 0.5,        // α₂ central → sedación cooperativa (RASS −1 a −3)
      mapDirect: -12,       // ↓tono simpático → ↓SVR → ↓PAM (Venn & Grounds ICM 2001)
      hrDirect: -16,        // α₂ → ↓liberación NE → bradicardia prominente (Precedex PI)
      thermoDepression: 0.2,  // hipotermia leve
      adhSuppression: 0.3,    // α₂ renal → natriuresis/diuresis protectora (Bhatt 2018)
      respDepressionWeight: 0.20, // α₂: reduce drive sin apnea franca
    },
  },
  thiopental: {
    id: 'thiopental', halfLifeMin: 600, vdLkg: 2.5, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      sedation: 1.5,        // barbitúrico → depresión tronco encefálico intensa
      mapDirect: -20,       // depresión miocárdica + venodilatación (Stoelting Pharm 5ª)
      hrDirect: 8,          // taquicardia refleja barorreceptora por hipotensión
      thermoDepression: 0.5,  // barbitúrico → hipotermia 
      adhSuppression: 0.15,   // menor efecto renal
      respDepressionWeight: 0.50,
    },
  },

  // ── ANALGÉSICOS ─────────────────────────────────────────────────────────────
  morphine: {
    id: 'morphine', halfLifeMin: 120, vdLkg: 4.0, inputUnit: 'mg/h',
    pd: { ...ZERO_PD,
      analgesia: 1.0,       // μ-opioide: analgesia potente
      mapDirect: -6,        // histamina → vasodilatación arteriolar (Rang & Dale, Cap.41)
      hrDirect: -5,         // tono vagal aumentado (Goodman & Gilman 13ª)
      thermoDepression: 0.25, // vasodilatación cutánea → ↑pérdida calor
      adhSuppression: -0.5,   // libera ADH + histamina → retención hídrica → ↓UO
      respDepressionWeight: 0.30,
    },
  },
  fentanyl: {
    id: 'fentanyl', halfLifeMin: 200, vdLkg: 4.0, inputUnit: 'mcg/kg/h',
    pd: { ...ZERO_PD,
      analgesia: 1.5,       // μ-opioide potente y lipofílico
      hrDirect: -8,         // vagal potente (Goodman & Gilman 13ª)
      thermoDepression: 0.20, // redistribución calor + vasodilatación
      adhSuppression: -0.2,   // leve efecto antidiurético (menor que morfina)
      respDepressionWeight: 0.45,
    },
  },
  remifentanil: {
    id: 'remifentanil', halfLifeMin: 3.0, vdLkg: 0.3, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      analgesia: 1.5,       // μ-opioide ultracorto (esterasa plasmática)
      hrDirect: -12,        // vagal muy potente — onset/offset ultrarrápido
      thermoDepression: 0.15, // rápida redistribución
      adhSuppression: -0.1,   // efecto mínimo (t½ = 3 min)
      respDepressionWeight: 0.55,
    },
  },

  // ── BNM ──────────────────────────────────────────────────────────────────────
  atracurium: {
    id: 'atracurium', halfLifeMin: 20, vdLkg: 0.15, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      nmba: 1.0,            // bloqueo unión neuromuscular (nicotínico)
      mapDirect: -3,        // liberation histamina leve (Atracurio vs Cis)
    },
  },
  cisatracurium: {
    id: 'cisatracurium', halfLifeMin: 25, vdLkg: 0.15, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      nmba: 1.0,            // isómero cis: NO libera histamina
    },
  },
  rocuronium: {
    id: 'rocuronium', halfLifeMin: 70, vdLkg: 0.25, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      nmba: 1.0,            // aminoesteroidal — reversible con sugammadex
    },
  },
  pancuronium: {
    id: 'pancuronium', halfLifeMin: 120, vdLkg: 0.25, inputUnit: 'mg/kg/h',
    pd: { ...ZERO_PD,
      nmba: 1.0,            // aminoesteroidal de larga duración
      vagolytic: 1.2,       // VAGOLÍTICO: bloquea m-AChR cardíaco → taquicardia +10-20bpm
                            // Ref: Miller Anesthesia 9ª Ed. Cap.28 — pancuronium vagolysis
      hrDirect: 12,         // taquicardia directa por vagólisis
    },
  },
};

// ─── PDSystemicEffects — efectos agragados publicados al resto del sistema ─────
//
// REGLA: Los engines fisiológicos (CardiovascularEngine, RenalEngine, etc.)
//        SOLO leen este objeto. NUNCA leen plasmaConcentrations directamente.
//        Esto garantiza que añadir drogas no rompa ningún engine fisiológico.
//
export type PDSystemicEffects = {
  // Hemodinámicos
  alpha1: number;           // Vasoconstricción (0–3+)
  beta1: number;            // Inotropismo/Cronotropismo (0–3+)
  beta2: number;            // Broncodilatación (0–1)
  vasoplegiaRev: number;    // Reversión vasoplejía (0–3)
  vagolytic: number;        // Vagólisis neta → taquicardia (0–1); negativo = vagotónico
  mapDirectDelta: number;   // Δ PAM acumulado en mmHg (suma de todos los fármacos)
  hrDirectDelta: number;    // Δ FC acumulado en bpm (suma de todos los fármacos)

  // Neurológicos
  sedation: number;         // Sedación acumulada (0–2+)
  analgesia: number;        // Analgesia (0–2)
  nmba: number;             // Bloqueo neuromuscular (0–1)

  // Termogénesis
  thermoDepression: number; // Inhibición hipotalámica neta (0–1); negativo = ketamina

  // Renal/ADH
  adhSuppression: number;   // Modulación ADH neta (+diurético / −antidiurético)

  // Metabólico
  metabolicStress: number;  // PRIS / estrés metabólico (0–1)

  // Respiratorio
  respDepressionIdx: number;// Índice de depresión cent. respiratoria (0–1)
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface PharmacologyState {
  infusionRates: Record<DrugId, number>;
  plasmaConcentrations: Record<DrugId, number>;
  systemicEffects: PDSystemicEffects;
  pendingBolusRatios: Partial<Record<DrugId, number>>;

  setInfusionRate:            (drug: DrugId, rate: number) => void;
  updatePlasmaConcentrations: (cpMap: Record<DrugId, number>) => void;
  updateSystemicEffects:      (effects: PDSystemicEffects) => void;
  queueBolusRatio:            (drug: DrugId, ratio: number) => void;
  clearPendingBolusRatios:    () => void;
  resetAll:                   () => void;
}

const INITIAL_RATES = Object.keys(DRUG_CATALOG).reduce((acc, k) => {
  acc[k as DrugId] = 0;
  return acc;
}, {} as Record<DrugId, number>);

const INITIAL_CP = { ...INITIAL_RATES };

const INITIAL_EFFECTS: PDSystemicEffects = {
  alpha1: 0, beta1: 0, beta2: 0, vasoplegiaRev: 0,
  vagolytic: 0, mapDirectDelta: 0, hrDirectDelta: 0,
  sedation: 0, analgesia: 0, nmba: 0,
  thermoDepression: 0, adhSuppression: 0, metabolicStress: 0,
  respDepressionIdx: 0,
};

export const usePharmacologyStore = create<PharmacologyState>((set) => ({
  infusionRates:        { ...INITIAL_RATES },
  plasmaConcentrations: { ...INITIAL_CP },
  systemicEffects:      { ...INITIAL_EFFECTS },
  pendingBolusRatios:   {},

  setInfusionRate: (drug, rate) =>
    set((state) => ({
      infusionRates: { ...state.infusionRates, [drug]: rate }
    })),

  updatePlasmaConcentrations: (cpMap) =>
    set({ plasmaConcentrations: cpMap }),

  updateSystemicEffects: (effects) =>
    set({ systemicEffects: effects }),

  queueBolusRatio: (drug, ratio) =>
    set((state) => ({
      pendingBolusRatios: {
        ...state.pendingBolusRatios,
        [drug]: (state.pendingBolusRatios[drug] || 0) + ratio,
      }
    })),

  clearPendingBolusRatios: () => set({ pendingBolusRatios: {} }),

  resetAll: () => set({
    infusionRates:        { ...INITIAL_RATES },
    plasmaConcentrations: { ...INITIAL_CP },
    systemicEffects:      { ...INITIAL_EFFECTS },
    pendingBolusRatios:   {},
  }),
}));
