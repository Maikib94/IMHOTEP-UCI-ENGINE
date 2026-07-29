import { create } from 'zustand';
import { useTimeStore } from './useTimeStore';

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
  'atracurium' | 'cisatracurium' | 'rocuronium' | 'pancuronium' |
  // Antiarrítmicos IV
  'amiodarone' | 'digoxin' | 'esmolol' | 'metoprolol_iv' | 'diltiazem_iv' |
  // Diuréticos
  'furosemide_iv' | 'furosemide_oral' |
  'hydrochlorothiazide_oral' | 'metolazone_oral' | 'spironolactone_oral' |
  'acetazolamide_iv' | 'acetazolamide_oral' |
  // Corticoides (Fase 3 — APROCCHSS NEJM 2018; RECOVERY 2021)
  'hydrocortisone' | 'methylprednisolone' | 'dexamethasone' | 'prednisolone_oral' |
  // Aerosoles broncodilatadores y mucolíticos (GINA 2024; GOLD 2024)
  'salbutamol_neb' | 'ipratropium_neb' | 'nac_neb' | 'adrenaline_neb' |
  // Antiarrítmicos orales
  'amiodarone_oral' | 'digoxin_oral' |
  // Antihipertensivos orales
  'enalapril_oral' | 'losartan_oral' | 'amlodipine_oral'
  | 'atenolol_oral' | 'carvedilol_oral' |
  // Insulinas
  'insulin_nph' | 'insulin_regular_iv' | 'insulin_glargine' |
  // Profilaxis UCI
  'enoxaparin' | 'pantoprazole' |
  // Antibióticos IV — PK para CRRT adjustment (Hoff 2020; Roberts ICM 2025)
  'meropenem_iv' | 'piperacillin_tazo_iv' | 'vancomycin_iv' | 'cefepime_iv' |
  'levofloxacin_iv' | 'linezolid_iv' | 'fluconazole_iv' | 'caspofungin_iv' |
  // Hiperosmolar / Especiales
  'mannitol'
  // Endocrino
  | 'dextrose_50'
  | 'levothyroxine_iv'
  | 'propylthiouracil_oral'
  | 'methimazole_oral'
  // Hematológico
  | 'tranexamic_acid_iv'
  | 'vitamin_k_iv'
  | 'pcc_4factor'
  | 'desmopressin_iv'
  | 'argatroban_iv'
  | 'rasburicase_iv'
  // Obstétrico
  | 'oxytocin_iv'
  | 'methylergonovine_im'
  | 'misoprostol_rectal'
  | 'carbetocin_iv'
  | 'magnesium_sulfate_iv';

// ─── PK Definition ────────────────────────────────────────────────────────────

export type EliminationRoute = 'renal' | 'hepatic' | 'mixed' | 'lung' | 'plasma_esterase';

export type CypRole = 'substrate' | 'inhibitor' | 'inducer';
export interface CypInteractions {
  cyp3a4?: CypRole;
  cyp2d6?: CypRole;
  cyp2c9?: CypRole;
  cyp1a2?: CypRole;
  pgp?:    CypRole;
  oatp1b1?: CypRole;
}

export interface DrugPKDef {
  id: DrugId;
  halfLifeMin: number;           // minutos
  vdLkg: number;                 // Vd en L/kg
  inputUnit: 'mcg/kg/min' | 'U/h' | 'mg/kg/h' | 'mcg/kg/h' | 'mg/h' | 'UI/h' | 'g/kg' | 'g/h';
  /** Vía de eliminación predominante — modula clearance por comorbilidades */
  eliminationRoute?: EliminationRoute;
  /** Biodisponibilidad oral 0..1 (ausente = no oral / F=1 IV) */
  oralBioavailability?: number;
  /** Constante de absorción oral ka (fracción/h). Default 1.5 → t½abs ≈ 28 min */
  absorptionRateHr?: number;
  /** Interacciones CYP/P-gp declarativas */
  cypInteractions?: CypInteractions;
  /** Fracción de inhibición a Cp_max estándar (0..1). Ref: Chen 2025 PBPK */
  inhibitionStrength?: number;
  /**
   * Fracción de droga eliminada por CRRT (0–1).
   * Hoff BM Ann Pharmacother 2020; Roberts JA ICM 2025.
   * 0 = no dializable (propofol, amiodarona, proteínas altamente unidas).
   * >0.5 = alta → considerar dosis aumentada durante CRRT.
   */
  dialyzability?: number;
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

  // ── Diurético / Electrolitos ───────────────────────────────────────────────
  /** Efecto diurético tubular (loop diurético).
   *  0 = ninguno, 2.5 = furosemida IV a DRUG_MAX_DOSES.
   *  RenalEngine: ↑ UO independiente del mecanismo ADH.
   *  Calibración: 2.5 × cpRatio=1.2 (40mg bolo) ≈ +1.7 mL/kg/h (Felker NEJM 2011). */
  diureticStrength: number;

  // ── Antiinflamatorio pulmonar ─────────────────────────────────────────────
  /** Efecto antiinflamatorio en SDRA (corticoides).
   *  0 = ninguno, 1.0 = dexametasona RECOVERY 6 mg/d (máx potencia).
   *  PathologyEngine: reduce stress ODE hasta 35% a valor 1.0.
   *  Ref: Meduri CCM 2007; RECOVERY Lancet 2021. */
  antiInflammatoryStrength: number;

  // ── Diuréticos expandidos ─────────────────────────────────────────────────
  /** Pérdida de K⁺ por dosis (mEq/L) — tiazidas, asa. RenalEngine. */
  kLoss?: number;
  /** Retención de K⁺ (antagonistas aldosterona). */
  kSparing?: number;
  /** Bloqueo de aldosterona — espironolactona/eplerenona. */
  aldosteroneAntagonism?: number;
  /** Efecto sobre HCO₃ sérico (inhibidores anhidrasa carbónica). Negativo = acidosis. */
  bicarbosisEffect?: number;
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
  /** Nombre corto para UI (si no se especifica, usa el id) */
  shortName?: string;
}

const ZERO_PD: DrugPDProfile = {
  alpha1: 0, beta1: 0, beta2: 0, vasoplegiaRev: 0, vagolytic: 0,
  mapDirect: 0, hrDirect: 0, sedation: 0, analgesia: 0, nmba: 0,
  thermoDepression: 0, adhSuppression: 0, metabolicStress: 0, respDepressionWeight: 0,
  diureticStrength: 0, antiInflammatoryStrength: 0,
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
    id: 'propofol', halfLifeMin: 30, vdLkg: 4.0, inputUnit: 'mg/kg/h', dialyzability: 0.0,
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
    id: 'midazolam', halfLifeMin: 120, vdLkg: 1.5, inputUnit: 'mg/kg/h', dialyzability: 0.20,
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
    id: 'morphine', halfLifeMin: 120, vdLkg: 4.0, inputUnit: 'mg/h', dialyzability: 0.30,
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
    id: 'fentanyl', halfLifeMin: 200, vdLkg: 4.0, inputUnit: 'mcg/kg/h', dialyzability: 0.10,
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

  // ── ANTIARRÍTMICOS (Fase 4) ──────────────────────────────────────────────────
  //
  // PK: monocompartimental normalizado. cpRatio = 1.0 ≡ concentración terapéutica.
  // halfLifeMin representa el t½ efectivo del efecto cardíaco agudo (≠ t½ plasmático
  // terminal, que para amiodarona es 25-50 días — clínicamente no relevante en UCI
  // de corta duración). Ref: Goodman & Gilman 13ª, cap. Antiarrhythmics.
  //
  // DRUG_MAX_DOSES se setea de modo que:
  //   bolo 150mg amiodarona → cpRatio ≈ 1.0-2.5 (efecto terapéutico visible)
  //   bolo 0.25mg digoxina  → cpRatio ≈ 1.0-2.5 (efecto visible, ventana estrecha)
  // La lógica cronotropa Hill se implementa en CardiovascularEngine (no en pd.hrDirect),
  // porque requiere el modelo de sinergia y curva sigmoide específica.
  //
  amiodarone: {
    // Vaughan-Williams clase III (bloqueo K⁺) + efectos I, II, IV (Goodman&Gilman 13ª)
    // halfLifeMin=90: t½ efectivo de simulación (≠ t½ terminal 40h irrelevante en UCI corta).
    // Asegura bolo 150mg → totalRatio = 150/(60×1.5h) = 1.67 → efecto Hill+PD visible.
    // Ref: Bosch NA Chest 2020; Siu CW CCM 2009; Kowey JACC 2009
    //
    // CYP/P-gp inhibition (IV: moderado, menor que oral por distribución tisular diferente)
    // inhibitionStrength=0.55 (IV) vs 0.70 (oral) — Lesko LJ Clin Pharmacokinet 1989;
    //   Chen Y Pharmacotherapy 2025 (PBPK: P-gp inh potente = 0.70 en formulación oral).
    id: 'amiodarone', halfLifeMin: 90, vdLkg: 60, inputUnit: 'mg/h',
    cypInteractions: { cyp3a4: 'inhibitor', cyp2c9: 'inhibitor', pgp: 'inhibitor' },
    inhibitionStrength: 0.55, // IV: moderado (tabla 2.3 BIBLIOGRAPHY_DELTA — P-gp inh)
    pd: { ...ZERO_PD,
      hrDirect:   -22,  // rate control via nodo AV (clase IV) y simpático (clase II)
      beta1:      -0.4, // antagonismo β leve → reduce cronotropismo adrenérgico
      mapDirect:  -4,   // vasodilatación periférica → hipotensión leve (IV bolus)
      vagolytic:  -0.2, // efecto vagotónico (potencia tono parasimpático AV)
    },
    // NOTA: el Hill model en CardiovascularEngine.computeChronotropicEffect() también actúa
    // (sinergia amio→dig). Ambos mecanismos son aditivos intencionalmente.
  },
  digoxin: {
    // Inhibidor Na⁺/K⁺-ATPasa → ↑ Ca²⁺ intracelular → potenciación vagal AV nodal
    // t½ efecto hemodinámico ≈ 36h (renal-dependent); ventana terapéutica estrecha
    // Ref: Kotecha D JAMA 2020; Gheorghiade EHJ 2010; Goodman&Gilman 13ª cap.28
    // halfLifeMin=2160 (36h): bolo 0.5mg → totalRatio=1.39, decae lento (días, correcto para dig).
    // inputUnit='mg/h'; DRUG_MAX=0.01 → cpRatio=1 ≡ 0.01 mg/h mantenimiento (0.24mg/day).
    id: 'digoxin', halfLifeMin: 2160, vdLkg: 7.3, inputUnit: 'mg/h',
    pd: { ...ZERO_PD,
      hrDirect:  -15,  // rate control vía potenciación vagal AV nodal
      vagolytic: -0.5, // efecto vagotónico potente (parasimpaticomimético indirecto)
      beta1:     +0.3, // inotropismo positivo leve (único antiarrítmico con ↑contractilidad)
    },
    // NOTA: Hill model en CardiovascularEngine también actúa con sinergia amio-dig.
  },
  esmolol: {
    // β₁-bloqueante cardioselectivo ultrarrápido — metabolismo por esterasas eritrocitarias
    // t½ plasmático = 9 min → onset 2 min, offset < 10 min tras suspensión
    // Ref: Schwartz Am J Cardiol 1985; Reves Anesth 1984; Goodman&Gilman 13ª cap.12
    id: 'esmolol', halfLifeMin: 9, vdLkg: 3.4, inputUnit: 'mcg/kg/min',
    pd: { ...ZERO_PD,
      hrDirect:  -25,  // β₁ selectivo → ↓FC directa potente
      beta1:     -1.2, // bloqueo β₁ potente → ↓inotropismo + ↓cronotropismo adrenérgico
      mapDirect: -8,   // inotropismo negativo → ↓CO → ↓MAP
    },
    // Spec 3.D: hrDirectDelta(-25) + beta1(-1.2)×15 = -43 bpm contribución directa.
    // Hill model además aplica ESMOLOL_MAX_HR_REDUCTION=30% multiplicativo.
  },
  metoprolol_iv: {
    // β₁-bloqueante cardioselectivo — formulación IV para UCI/urgencias
    // t½ IV ≈ 3-4h (oral = 6-12h por efecto de primer paso); Vd = 3.9 L/kg
    // Dosis: 5 mg IV en 2 min; máx 15 mg (3 bolos). Infusión: 1-2 mg/h mantenimiento.
    // Ref: Kramer NR CCM 1997; Gottlieb SS MERIT-HF 1999; Goodman&Gilman 13ª cap.12
    id: 'metoprolol_iv', halfLifeMin: 240, vdLkg: 3.9, inputUnit: 'mg/h',
    pd: { ...ZERO_PD,
      hrDirect:  -22,  // β₁ selectivo → ↓FC (similar a esmolol, onset más lento)
      beta1:     -1.0, // bloqueo β₁ potente → ↓inotropismo + ↓cronotropismo
      mapDirect: -7,   // ↓CO → ↓MAP moderado
    },
  },
  diltiazem_iv: {
    // Ca²⁺-bloqueante no-dihidropiridínico (BCC no-DHP) — clase IV Vaughan-Williams
    // Enlentece conducción AV y nodo SA → superior a amio en rate control (Siu CCM 2009)
    // Contraindicado en ICC sistólica (inotropismo negativo moderado)
    // t½ ≈ 3.5-4.5h; Vd = 3.1 L/kg. Bolus 0.25mg/kg (≈20mg); inf 5-15mg/h.
    // Ref: Siu CW CCM 2009; Goodman&Gilman 13ª cap.12; Ellenbogen JACC 1991
    id: 'diltiazem_iv', halfLifeMin: 220, vdLkg: 3.1, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic',
    pd: { ...ZERO_PD,
      hrDirect:  -28,
      beta1:     -0.3,
      mapDirect: -6,
    },
  },

  // ── DIURÉTICOS ───────────────────────────────────────────────────────────────
  furosemide_iv: {
    // t½ 1.5-2h; Vd 0.1 L/kg. Dosis UCI: 20-200 mg/24h en infusión continua
    // Ref: Goodman&Gilman 13ª cap. Diuréticos; Felker NEJM 2011 (DOSE trial)
    id: 'furosemide_iv', halfLifeMin: 100, vdLkg: 0.1, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.50,
    pd: { ...ZERO_PD,
      adhSuppression: 0.8,   // inhibe reabsorción Na+/K+/2Cl- → ↑ diuresis
      diureticStrength: 2.5, // calibrado: cpRatio=1.2 (40mg bolo) → +1.7 mL/kg/h (Felker 2011)
    },
  },
  furosemide_oral: {
    // F=0.50 (alta variabilidad); t½ 1.5h; absorción 45-60 min post-dosis
    // Ref: Goodman&Gilman 13ª; Brater NEJM 1998
    id: 'furosemide_oral', halfLifeMin: 100, vdLkg: 0.1, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.50, absorptionRateHr: 1.2,
    pd: { ...ZERO_PD,
      adhSuppression: 0.7,
      diureticStrength: 1.5, // oral: atenuado por F=0.50 + absorción tardía
    },
  },

  // ── ANTIBIÓTICOS IV — PK para CRRT dosing adjustment ────────────────────────
  // Refs: Hoff BM Ann Pharmacother 2020; Roberts JA ICM 2025; Wieringa CMI 2025.
  // Estos fármacos tienen ZERO_PD — su efecto clínico está modelado en MicrobiologyEngine.
  // Se rastrean aquí exclusivamente para calcular el clearance por CRRT en CrosstalkEngine.
  meropenem_iv: {
    id: 'meropenem_iv', halfLifeMin: 60, vdLkg: 0.35, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.75, shortName: 'Meropenem',
    pd: { ...ZERO_PD },
  },
  piperacillin_tazo_iv: {
    id: 'piperacillin_tazo_iv', halfLifeMin: 60, vdLkg: 0.24, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.70, shortName: 'Pip-Tazo',
    pd: { ...ZERO_PD },
  },
  vancomycin_iv: {
    // Roberts SMARRT 2020: eTRCL mediano 50 mL/min. Ajuste por AUC (25-35 mg·h/L).
    id: 'vancomycin_iv', halfLifeMin: 360, vdLkg: 0.7, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.65, shortName: 'Vancomicina',
    pd: { ...ZERO_PD },
  },
  cefepime_iv: {
    id: 'cefepime_iv', halfLifeMin: 120, vdLkg: 0.3, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.80, shortName: 'Cefepime',
    pd: { ...ZERO_PD },
  },
  levofloxacin_iv: {
    id: 'levofloxacin_iv', halfLifeMin: 480, vdLkg: 1.27, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', dialyzability: 0.20, shortName: 'Levofloxacino',
    pd: { ...ZERO_PD },
  },
  linezolid_iv: {
    id: 'linezolid_iv', halfLifeMin: 330, vdLkg: 0.6, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', dialyzability: 0.30, shortName: 'Linezolid',
    pd: { ...ZERO_PD },
  },
  fluconazole_iv: {
    id: 'fluconazole_iv', halfLifeMin: 1800, vdLkg: 0.65, inputUnit: 'mg/h',
    eliminationRoute: 'renal', dialyzability: 0.60, shortName: 'Fluconazol',
    pd: { ...ZERO_PD },
  },
  caspofungin_iv: {
    // Caspofungina: proteína-unión alta → baja dializabilidad (Hoff 2020).
    id: 'caspofungin_iv', halfLifeMin: 1500, vdLkg: 0.39, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', dialyzability: 0.05, shortName: 'Caspofungina',
    pd: { ...ZERO_PD },
  },

  // ── DIURÉTICOS ADICIONALES ───────────────────────────────────────────────────
  hydrochlorothiazide_oral: {
    // CLOROTIC trial: HCT 50mg añadida a furosemida ↑ natriuresis en IC aguda
    // Trullàs J et al. Eur Heart J 2022;43:2828-37. DOI:10.1093/eurheartj/ehac210
    id: 'hydrochlorothiazide_oral', halfLifeMin: 600, vdLkg: 0.8, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.70, absorptionRateHr: 1.0,
    shortName: 'HCT',
    pd: { ...ZERO_PD,
      diureticStrength: 0.6,  // tiazida: menor potencia que asa
      kLoss: 0.3,             // riesgo hipokalemia — mEq/L por dosis
    },
  },
  metolazone_oral: {
    // 3T trial: metolazona comparable a clorotiazida IV o tolvaptán (Cox JACC 2019)
    // Cox ZL et al. JACC Heart Fail 2019;7:1011-9. DOI:10.1016/j.jchf.2019.08.005
    id: 'metolazone_oral', halfLifeMin: 1440, vdLkg: 95, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', oralBioavailability: 0.65, absorptionRateHr: 1.5,
    shortName: 'Metolazone',
    pd: { ...ZERO_PD,
      diureticStrength: 0.8,
      kLoss: 0.5,
    },
  },
  spironolactone_oral: {
    // RALES NEJM 1999; EMPHASIS-HF NEJM 2011; Mullens EJHF 2019
    // Riesgo hiperK + AKI en ERC/IECA (Secora Mayo Clin Proc 2020)
    id: 'spironolactone_oral', halfLifeMin: 1200, vdLkg: 4.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.85, absorptionRateHr: 2.0,
    shortName: 'Espiro',
    pd: { ...ZERO_PD,
      diureticStrength: 0.15,  // diurético débil per se
      kSparing: 0.3,           // ↑K — efecto protector cardíaco
      aldosteroneAntagonism: 1,
    },
  },
  acetazolamide_iv: {
    // ADVOR trial: 500 mg IV/día × 3d ↑ descongestión vs placebo en IC
    // Mullens W et al. NEJM 2022;387:1185-95. DOI:10.1056/NEJMoa2203094
    id: 'acetazolamide_iv', halfLifeMin: 540, vdLkg: 0.25, inputUnit: 'mg/h',
    eliminationRoute: 'renal',
    shortName: 'Acetazolamida IV',
    pd: { ...ZERO_PD,
      diureticStrength: 0.5,
      bicarbosisEffect: -0.3,   // ↓HCO₃ sérico → útil en alcalosis metabólica
    },
  },
  acetazolamide_oral: {
    // Sabirov I et al. J Clin Med 2025 (ORION-A) — 250 mg VO TID ↑ diuresis
    id: 'acetazolamide_oral', halfLifeMin: 480, vdLkg: 0.3, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.75, absorptionRateHr: 1.0,
    shortName: 'Acetazolamida VO',
    pd: { ...ZERO_PD,
      diureticStrength: 0.35,
      bicarbosisEffect: -0.2,
    },
  },

  // ── CORTICOIDES ──────────────────────────────────────────────────────────────
  hydrocortisone: {
    // 200 mg/d IV continua en shock séptico (APROCCHSS NEJM 2018; ADRENAL NEJM 2018)
    // Sensibiliza receptores α → vasopressor-sparing effect en 12-24h
    id: 'hydrocortisone', halfLifeMin: 90, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic',
    pd: { ...ZERO_PD,
      vasoplegiaRev: 0.30,            // restaura sensibilidad vasopresora (APROCCHSS 2018)
      mapDirect: 4,                    // efecto mineralocorticoide leve → ↑MAP
      hrDirect: -2,
      antiInflammatoryStrength: 0.55, // reduce stress SDRA ~19%; ADRENAL 2018
    },
  },
  methylprednisolone: {
    // Dosis UCI: 0.5-1 mg/kg/d. Mayor actividad glucocorticoide que hidrocortisona.
    // ↑ Glucemia RR 1.21 (Chaudhuri Crit Care Explor 2024)
    id: 'methylprednisolone', halfLifeMin: 180, vdLkg: 1.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic',
    pd: { ...ZERO_PD,
      vasoplegiaRev: 0.22,
      mapDirect: 3,
      antiInflammatoryStrength: 0.80, // fuerte; usado en SDRA moderado-grave (Meduri CCM 2007)
    },
  },
  dexamethasone: {
    // 6 mg/d IV/VO en COVID-ARDS — RECOVERY Lancet 2021; t½ 36-54h
    // F oral = 0.81; mayor potencia antiinflamatoria, sin efecto mineralocorticoide
    id: 'dexamethasone', halfLifeMin: 2400, vdLkg: 1.0, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.81, absorptionRateHr: 1.8,
    pd: { ...ZERO_PD,
      vasoplegiaRev: 0.15,            // menor efecto mineralocorticoide (RECOVERY 2021)
      mapDirect: 2,
      antiInflammatoryStrength: 1.00, // máxima potencia antiinflamatoria (RECOVERY 2021)
    },
  },
  prednisolone_oral: {
    // F=0.80; t½ 3h; equivalencia 5 mg prednisolona = 1 mg dexametasona
    id: 'prednisolone_oral', halfLifeMin: 180, vdLkg: 0.9, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.80, absorptionRateHr: 2.0,
    pd: { ...ZERO_PD,
      vasoplegiaRev: 0.12,
      mapDirect: 2,
      antiInflammatoryStrength: 0.35, // oral, potencia moderada
    },
  },

  // ── AEROSOLES BRONCODILATADORES ─────────────────────────────────────────────
  salbutamol_neb: {
    // 2.5-5 mg/4-6h nebulizado. Absorción sistémica parcial (~15%)
    // β₂ actúa sobre músculo liso bronquial → ↓Raw; PD sistémico leve (GINA 2024)
    id: 'salbutamol_neb', halfLifeMin: 300, vdLkg: 2.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.15, absorptionRateHr: 3.0,
    pd: { ...ZERO_PD,
      beta2: 1.5,    // broncodilatación principal (reduce Raw en EPOC/asma)
      hrDirect: 8,   // taquicardia por β₂ sistémico
    },
  },
  ipratropium_neb: {
    // 0.5 mg/6h nebulizado. Acción anticolinérgica → ↓tono parasimpático bronquial
    // Absorción sistémica mínima (~5%). Sinergia con salbutamol (GOLD 2024)
    id: 'ipratropium_neb', halfLifeMin: 90, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'lung', oralBioavailability: 0.05, absorptionRateHr: 2.0,
    pd: { ...ZERO_PD,
      beta2: 0.3,       // broncodilatación anticolinérgica
      vagolytic: 0.25,  // bloqueo m-AChR bronquial
    },
  },

  nac_neb: {
    // N-acetilcisteína nebulizada — mucolítico; indicación selectiva (EPOC con tapones)
    // Absorción sistémica ~10%. Sin efectos hemodinámicos relevantes.
    // Dosis: 300-600 mg en 3-5 mL SF cada 8-12h (Grandjean Eur Respir J 2000)
    id: 'nac_neb', halfLifeMin: 120, vdLkg: 0.4, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.10, absorptionRateHr: 1.0,
    pd: { ...ZERO_PD,
      respDepressionWeight: -0.05,  // ligero efecto broncodilatador indirecto
    },
  },
  adrenaline_neb: {
    // Adrenalina nebulizada — laringitis/estridor post-extubación, edema glótico
    // 5 mg (5 mL amp 1 mg/mL) nebulizados. Efecto local vasoconstrictor mucosa.
    // Absorción sistémica ~15-20% → algo de beta1/beta2 sistémico.
    // Dosis única; repetir en 20 min si necesario. (Bjornsson EHJ 2001)
    id: 'adrenaline_neb', halfLifeMin: 60, vdLkg: 0.3, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', oralBioavailability: 0.18, absorptionRateHr: 3.0,
    pd: { ...ZERO_PD,
      alpha1: 0.3,   // vasoconstricción mucosa laríngea
      beta2:  0.4,   // broncodilatación
      beta1:  0.2,   // algo FC si alta absorción sistémica
      hrDirect: 8,
    },
  },

  // ── ANTIARRÍTMICOS ORALES ──────────────────────────────────────────────────
  amiodarone_oral: {
    // F=0.40-0.50 (Lehnert BJCP 2022; Awan Pharmaceutics 2022)
    // t½ terminal 30-40 días → usar halfLife = 57600 min para efecto acumulativo
    // Loading 600-800 mg/d × 7-10d → entonces 200 mg/d mantenimiento
    // inhibitionStrength=0.70 → tHalfBoost digoxin = 1/(1-0.6×0.70)=1.724 → AUC+72%
    //   (Chen Y Pharmacotherapy 2025: +79% AUC; discrepancia ±7% aceptable)
    //   P-gp inh potente 0.70 — BIBLIOGRAPHY_DELTA.md §2.3 tabla maestra CYP/P-gp
    id: 'amiodarone_oral', halfLifeMin: 57600, vdLkg: 60, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.43, absorptionRateHr: 0.4,
    cypInteractions: { cyp3a4: 'inhibitor', cyp2c9: 'inhibitor', pgp: 'inhibitor' },
    inhibitionStrength: 0.70, // updated from 0.60 (calibrated to Chen 2025 PBPK)
    pd: { ...ZERO_PD,
      hrDirect: -18,
      beta1:    -0.35,
      mapDirect: -3,
      vagolytic: -0.18,
    },
  },
  digoxin_oral: {
    // F=0.70-0.80 (Goodman&Gilman 13ª). t½=36-40h. Mantenimiento 0.125-0.25 mg/d
    id: 'digoxin_oral', halfLifeMin: 2160, vdLkg: 7.3, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.75, absorptionRateHr: 1.2,
    cypInteractions: { pgp: 'substrate' },
    pd: { ...ZERO_PD,
      hrDirect:  -12,
      vagolytic: -0.45,
      beta1:     +0.25,
    },
  },

  // ── ANTIHIPERTENSIVOS ORALES ───────────────────────────────────────────────
  enalapril_oral: {
    // Prodrug (→ enalaprilato activo); F=0.60; t½ 11h (enalaprilato); IECA
    id: 'enalapril_oral', halfLifeMin: 660, vdLkg: 1.7, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.60, absorptionRateHr: 1.5,
    pd: { ...ZERO_PD,
      mapDirect: -8,   // ↓ angiotensina II → ↓ SVR → ↓ MAP
      hrDirect:  -3,
    },
  },
  losartan_oral: {
    // ARA-II; F=0.33; t½ metabolito activo 6-9h; sin inhibición CYP relevante
    id: 'losartan_oral', halfLifeMin: 540, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.33, absorptionRateHr: 1.8,
    pd: { ...ZERO_PD,
      mapDirect: -7,
      hrDirect:  -2,
    },
  },
  amlodipine_oral: {
    // BCC dihidropiridínico; F=0.65; t½ 35-50h; NO efecto cronotrópico relevante
    id: 'amlodipine_oral', halfLifeMin: 2700, vdLkg: 21, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.65, absorptionRateHr: 0.6,
    pd: { ...ZERO_PD,
      mapDirect: -6,   // vasodilatación arterial
      hrDirect:  -4,   // reflejo vagal leve
    },
  },
  atenolol_oral: {
    // β₁-bloqueante cardioselectivo; F=0.50; t½ 6-9h; eliminación renal pura
    id: 'atenolol_oral', halfLifeMin: 450, vdLkg: 0.7, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.50, absorptionRateHr: 1.5,
    pd: { ...ZERO_PD,
      hrDirect: -18,
      beta1:    -0.85,
      mapDirect: -6,
    },
  },
  carvedilol_oral: {
    // α/β bloqueante; F=0.25 (alto first-pass hepático); t½ 7-10h
    // Ref: Goodman&Gilman 13ª; MERIT-HF Lancet 1999
    id: 'carvedilol_oral', halfLifeMin: 510, vdLkg: 2.0, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.25, absorptionRateHr: 1.4,
    pd: { ...ZERO_PD,
      hrDirect:  -16,
      beta1:     -1.0,
      alpha1:    +0.15,   // bloqueo α₁ leve → ↓ SVR
      mapDirect: -7,
    },
  },

  // ── INSULINAS ────────────────────────────────────────────────────────────────
  insulin_nph: {
    // Insulina NPH: acción intermedia; t½ absortivo ~14h; pico 4-8h
    id: 'insulin_nph', halfLifeMin: 840, vdLkg: 0.15, inputUnit: 'UI/h',
    eliminationRoute: 'mixed', oralBioavailability: 0.80, absorptionRateHr: 0.3,
    pd: { ...ZERO_PD },  // glucosa no modelada en engine actual
  },
  insulin_regular_iv: {
    // Insulina regular EV: t½ plasmático 5 min; acción 2-4h
    id: 'insulin_regular_iv', halfLifeMin: 5, vdLkg: 0.15, inputUnit: 'UI/h',
    eliminationRoute: 'plasma_esterase',
    pd: { ...ZERO_PD },
  },
  insulin_glargine: {
    // Insulina glargina SC: peakless; t½ efecto ~24h; F SC ≈ 0.80
    id: 'insulin_glargine', halfLifeMin: 1440, vdLkg: 0.15, inputUnit: 'UI/h',
    eliminationRoute: 'mixed', oralBioavailability: 0.80, absorptionRateHr: 0.15,
    pd: { ...ZERO_PD },
  },

  // ── PROFILAXIS UCI ────────────────────────────────────────────────────────────
  enoxaparin: {
    // Heparina de bajo peso molecular SC; F SC=0.90; t½ 4-5h; eliminación renal
    // Profilaxis: 40 mg/24h SC; terapéutica: 1 mg/kg/12h SC
    id: 'enoxaparin', halfLifeMin: 270, vdLkg: 0.07, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.90, absorptionRateHr: 0.8,
    pd: { ...ZERO_PD },  // anticoagulación no modelada en hemostasia actual
  },
  pantoprazole: {
    // IBP EV/VO; F IV=1.0, oral=0.77; t½ 1-2h; metabolismo CYP2C19
    // Profilaxis úlcera estrés en UCI (PEPTIC NEJM 2020)
    id: 'pantoprazole', halfLifeMin: 90, vdLkg: 0.15, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.77, absorptionRateHr: 2.0,
    pd: { ...ZERO_PD },
  },
  mannitol: {
    id: 'mannitol', halfLifeMin: 90, vdLkg: 0.20, inputUnit: 'g/kg',
    eliminationRoute: 'renal', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  // ── ENDOCRINO ────────────────────────────────────────────────────────────────
  dextrose_50: {
    // D50 IV — hipoglucemia aguda. 25g = 50mL de D50%.
    // Refs: ADA Hypoglycemia Guidelines 2023.
    id: 'dextrose_50', halfLifeMin: 30, vdLkg: 0.6, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', oralBioavailability: 1.0,
    pd: { ...ZERO_PD },
  },
  levothyroxine_iv: {
    // L-T4 IV — coma mixedematoso. t½ 7 días. Wartofsky NEJM 2009.
    id: 'levothyroxine_iv', halfLifeMin: 7*24*60, vdLkg: 0.25, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  propylthiouracil_oral: {
    // PTU — tormenta tiroidea. Ross JCEM 2016.
    id: 'propylthiouracil_oral', halfLifeMin: 90, vdLkg: 0.4, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.75,
    pd: { ...ZERO_PD },
  },
  methimazole_oral: {
    // MMI — hipertiroidismo. Ross JCEM 2016.
    id: 'methimazole_oral', halfLifeMin: 300, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.93,
    pd: { ...ZERO_PD },
  },
  // ── HEMATOLÓGICO ─────────────────────────────────────────────────────────────
  tranexamic_acid_iv: {
    // TXA — hemostasia. CRASH-2 Lancet 2010; WOMAN Lancet 2017.
    id: 'tranexamic_acid_iv', halfLifeMin: 120, vdLkg: 0.39, inputUnit: 'mg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.4, dialyzability: 0.7,
    pd: { ...ZERO_PD },
  },
  vitamin_k_iv: {
    // Vit K IV — reversión anticoagulación. Crowther CHEST 2007.
    id: 'vitamin_k_iv', halfLifeMin: 90, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.5,
    pd: { ...ZERO_PD },
  },
  pcc_4factor: {
    // CCP-4F — reversión warfarina urgente. Sarode Circulation 2013.
    id: 'pcc_4factor', halfLifeMin: 360, vdLkg: 0.05, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  desmopressin_iv: {
    // DDAVP — hemofilia A leve / vWF. Mannucci Blood 1997.
    id: 'desmopressin_iv', halfLifeMin: 75, vdLkg: 0.5, inputUnit: 'mcg/kg/h',
    eliminationRoute: 'renal', oralBioavailability: 0.1,
    pd: { ...ZERO_PD },
  },
  argatroban_iv: {
    // Argatroban — HIT. Cuker ASH 2018.
    id: 'argatroban_iv', halfLifeMin: 45, vdLkg: 0.17, inputUnit: 'mcg/kg/min',
    eliminationRoute: 'hepatic', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  rasburicase_iv: {
    // Rasburicasa — TLS. Coiffier JCO 2008.
    id: 'rasburicase_iv', halfLifeMin: 1080, vdLkg: 0.11, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  // ── OBSTÉTRICO ───────────────────────────────────────────────────────────────
  oxytocin_iv: {
    // Oxitocina — HPP / inducción. WHO 2017 PPH; ACOG 183.
    id: 'oxytocin_iv', halfLifeMin: 5, vdLkg: 0.5, inputUnit: 'U/h',
    eliminationRoute: 'mixed', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  methylergonovine_im: {
    // Ergonovina — HPP (2ª línea). Mavrides BJOG 2016.
    id: 'methylergonovine_im', halfLifeMin: 30, vdLkg: 0.4, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.6,
    pd: { ...ZERO_PD, alpha1: 0.8 },  // vasoconstricción significativa
  },
  misoprostol_rectal: {
    // Misoprostol — HPP (3ª línea). WHO 2017.
    id: 'misoprostol_rectal', halfLifeMin: 40, vdLkg: 0.5, inputUnit: 'mg/h',
    eliminationRoute: 'hepatic', oralBioavailability: 0.85,
    pd: { ...ZERO_PD },
  },
  carbetocin_iv: {
    // Carbetocina — profilaxis HPP cesárea. CHAMPION NEJM 2018.
    id: 'carbetocin_iv', halfLifeMin: 40, vdLkg: 0.4, inputUnit: 'mg/h',
    eliminationRoute: 'mixed', oralBioavailability: 0,
    pd: { ...ZERO_PD },
  },
  magnesium_sulfate_iv: {
    // Sulfato Mg IV — eclampsia/preeclampsia. MAGPIE Lancet 2002.
    // PD: bloqueo NMJ + neuroprotección + antihipertensivo leve.
    id: 'magnesium_sulfate_iv', halfLifeMin: 300, vdLkg: 0.4, inputUnit: 'g/h',
    eliminationRoute: 'renal', oralBioavailability: 0, dialyzability: 0.9,
    pd: { ...ZERO_PD,
      nmba: 0.2,          // bloqueo NMJ parcial (riesgo parálisis a toxicidad)
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

  // Diurético (Fase 4.B)
  diureticEffect: number;          // Efecto loop diurético neto (0 = ninguno, 3+ = furosemida plena)

  // Antiinflamatorio pulmonar (Fase 4.C)
  antiInflammatoryEffect: number;  // Corticoides → reduce stress SDRA (0–1)
};

// ─── Dosis a horario ──────────────────────────────────────────────────────────

export interface ScheduledDose {
  id: string;
  drug: DrugId;
  doseMg: number;
  intervalH: number;   // c/2h, c/4h, c/6h, c/8h, c/12h, c/24h
  nextTickAt: number;  // tick sim (= sim-seconds) donde se dispara la siguiente dosis
  active: boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface PharmacologyState {
  infusionRates: Record<DrugId, number>;
  plasmaConcentrations: Record<DrugId, number>;
  systemicEffects: PDSystemicEffects;
  pendingBolusRatios: Partial<Record<DrugId, number>>;
  scheduledDoses: ScheduledDose[];
  /** History of administered boluses (last 200 entries) */
  bolusHistory: { drug: DrugId; doseMg: number; tickAt: number; route: 'iv' | 'oral' }[];

  setInfusionRate:            (drug: DrugId, rate: number) => void;
  updatePlasmaConcentrations: (cpMap: Record<DrugId, number>) => void;
  setPlasmaConc:              (drug: DrugId, value: number) => void;
  updateSystemicEffects:      (effects: PDSystemicEffects) => void;
  queueBolusRatio:            (drug: DrugId, ratio: number) => void;
  clearPendingBolusRatios:    () => void;
  scheduleDose:               (drug: DrugId, doseMg: number, intervalH: number) => void;
  cancelScheduledDose:        (id: string) => void;
  addBolusHistory:            (drug: DrugId, doseMg: number, tickAt: number, route?: 'iv' | 'oral') => void;
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
  diureticEffect: 0, antiInflammatoryEffect: 0,
};

export const usePharmacologyStore = create<PharmacologyState>((set) => ({
  infusionRates:        { ...INITIAL_RATES },
  plasmaConcentrations: { ...INITIAL_CP },
  systemicEffects:      { ...INITIAL_EFFECTS },
  pendingBolusRatios:   {},
  scheduledDoses:       [],
  bolusHistory:         [],

  setInfusionRate: (drug, rate) =>
    set((state) => ({
      infusionRates: { ...state.infusionRates, [drug]: rate }
    })),

  updatePlasmaConcentrations: (cpMap) =>
    set({ plasmaConcentrations: cpMap }),

  setPlasmaConc: (drug, value) =>
    set((s) => ({ plasmaConcentrations: { ...s.plasmaConcentrations, [drug]: Math.max(0, value) } })),

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

  scheduleDose: (drug, doseMg, intervalH) => {
    const tickNow = useTimeStore.getState().ticks;
    set((state) => ({
      scheduledDoses: [
        ...state.scheduledDoses,
        {
          id: `${drug}-${Date.now()}`,
          drug,
          doseMg,
          intervalH,
          nextTickAt: tickNow + intervalH * 3600,
          active: true,
        } satisfies ScheduledDose,
      ],
    }));
  },

  cancelScheduledDose: (id) =>
    set((state) => ({
      scheduledDoses: state.scheduledDoses.map(s =>
        s.id === id ? { ...s, active: false } : s
      ),
    })),

  addBolusHistory: (drug, doseMg, tickAt, route = 'iv') =>
    set((state) => ({
      bolusHistory: [
        ...state.bolusHistory.slice(-199),
        { drug, doseMg, tickAt, route },
      ],
    })),

  resetAll: () => set({
    infusionRates:        { ...INITIAL_RATES },
    plasmaConcentrations: { ...INITIAL_CP },
    systemicEffects:      { ...INITIAL_EFFECTS },
    pendingBolusRatios:   {},
    scheduledDoses:       [],
    bolusHistory:         [],
  }),
}));
