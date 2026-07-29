// src/data/LethalThresholds.ts
//
// Tabla de umbrales fisiológicos letales con evidencia clínica.
// AcuteMortalityEngine evalúa estos umbrales cada tick para disparar muerte aguda.
//
// Referencias:
//   Walsh AJ et al. Anesthesiology 2013;119:507-15 (MAP perioperatorio)
//   AHA 2025 Part 11 Post-Cardiac Arrest Care
//   Lehman LH et al. Crit Care Med 2013;41:34-40 (deuda hipotensión)
//   Goligher EC et al. AJRCCM 2021;204:1378-86 (SpO₂ crítica)
//   Nunn JF. Applied Respiratory Physiology (textbook)
//   Kraut JA, Madias NE. NEJM 2010;363:1646-54 (acidemia)
//   Hawryluk GWJ et al. ICM 2022;48:649-66 (BTF 2016 guidelines)
//   Robba C et al. Lancet Neurology 2021 (SYNAPSE-ICU)
//   KDIGO AKI 2012 Guidelines
//   ATLS 10th ed., Chapter 3 — Shock Classification
//   Brown DJA et al. NEJM 2012;367:1930-8 (accidental hypothermia)
//   Bouchama A, Knochel JP. NEJM 2002;346:1978-88 (heatstroke)
//   AHA 2025 ACLS algorithms

import type { Vitals } from '../store/usePatientStore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Identificadores únicos de causas letales — usados como claves en el store */
export type LethalCauseId =
  | 'hemo_refractaria'
  | 'hemo_catastrofica'
  | 'hipoxia_grave'
  | 'hipoxia_critica'
  | 'acidosis_refractaria'
  | 'acidosis_catastrofica'
  | 'herniacion_cerebral'
  | 'cpp_critico'
  | 'hiperkalemia_mortal'
  | 'hipotermia_grave'
  | 'hipertermia_maligna'
  | 'shock_hemorragico_terminal'
  | 'bradicardia_extrema'
  | 'taquicardia_extrema'
  | 'hipoglucemia_coma'
  | 'hipermagnesemia_letal';

/**
 * Claves de vitales que evalúa el engine.
 * 'cpp' es un virtual: MAP - ICP
 * 'bloodVolume' se lee de usePatientStore.bloodVolume, no de vitals
 */
export type VitalKey =
  | keyof Vitals
  | 'cpp'         // synthetic: MAP - ICP
  | 'bloodVolume' // from usePatientStore.bloodVolume
  | 'glucose'     // alias for glucoseMgdL
  | 'magnesium';  // alias for magnesiumMgdL

/** Contexto de estado de la simulación pasado a exemptIf */
export interface SimulationState {
  vitals: Vitals;
  bloodVolume: number;
  ecmo: {
    active: boolean;
    mode: string;  // 'vv' | 'va'
  };
  crrt: {
    active: boolean;
    dose_mLkgh: number;
  };
}

/** Definición completa de un umbral letal */
export interface LethalThreshold {
  /** Identificador único */
  id: LethalCauseId;
  /** Nombre en español para UI */
  nameES: string;
  /** Descripción de una línea del mecanismo */
  description: string;
  /** Vital evaluado */
  vital: VitalKey;
  /** Operador de comparación */
  operator: '<' | '>' | '<=' | '>=';
  /** Valor de corte */
  cutoff: number;
  /** Segundos de exposición sostenida para que sea letal */
  sustainedSeconds: number;
  /** Condición de exención — si retorna true, este threshold se ignora */
  exemptIf?: (s: SimulationState) => boolean;
  /** Emoji para el badge HUD */
  icon: string;
  /** Cita bibliográfica corta para tooltip */
  referenceCitation: string;
  /** Explicación didáctica para el residente */
  didacticNote: string;
}

// ─── Tabla de umbrales ───────────────────────────────────────────────────────

export const LETHAL_THRESHOLDS: LethalThreshold[] = [

  // ─── HEMODINÁMICOS ─────────────────────────────────────────────────────────

  {
    id: 'hemo_refractaria',
    nameES: 'PCR por hipotensión refractaria',
    description: 'MAP < 30 mmHg sostenido > 5 min: presión coronaria diastólica colapsa → isquemia miocárdica → asistolia',
    vital: 'meanArterialPressure',
    operator: '<',
    cutoff: 30,
    sustainedSeconds: 300,
    icon: '💔',
    referenceCitation: 'Walsh AJ 2013 (n=33,330 perioperatorio)',
    didacticNote: 'Por debajo de MAP 30 mmHg, la presión de perfusión coronaria es insuficiente para mantener flujo en epicardio. Resultado: isquemia subendocárdica → arritmia ventricular → asistolia. Reversible si MAP se restaura en <5 min.',
  },

  {
    id: 'hemo_catastrofica',
    nameES: 'PCR por colapso hemodinámico catastrófico',
    description: 'MAP < 40 mmHg sostenido > 15 min: hipoperfusión multiorgánica irreversible',
    vital: 'meanArterialPressure',
    operator: '<',
    cutoff: 40,
    sustainedSeconds: 900,
    icon: '💔',
    referenceCitation: 'AHA 2025, Lehman CCM 2013',
    didacticNote: 'A MAP 30-40 mmHg durante >15 min se acumula deuda metabólica intracelular irreversible. El daño orgánico persiste tras restaurar el MAP. Noradrenalina en infusión continua es el agente de primera línea (SSCG 2024).',
  },

  // ─── HIPOXÉMICOS ───────────────────────────────────────────────────────────

  {
    id: 'hipoxia_grave',
    nameES: 'PCR hipoxémico',
    description: 'SpO₂ < 50% sostenido > 10 min: hipoxia tisular irreversible → asistolia',
    vital: 'spo2',
    operator: '<',
    cutoff: 50,
    sustainedSeconds: 600,
    exemptIf: (s) => s.ecmo.active && s.ecmo.mode !== 'ECCO2R',
    icon: '🫁',
    referenceCitation: 'Goligher AJRCCM 2021',
    didacticNote: 'SpO₂ <50% equivale a PaO₂ <30 mmHg (curva de disociación Hb-O₂). El cerebro tolera ~6 min de anoxia total; el miocardio ~10 min. Exención si VV-ECMO o VA-ECMO activos — la oxigenación viene de la membrana extracorpórea.',
  },

  {
    id: 'hipoxia_critica',
    nameES: 'PCR por anoxia',
    description: 'PaO₂ < 25 mmHg sostenido > 5 min: aporte de O₂ incompatible con metabolismo aeróbico',
    vital: 'paO2',
    operator: '<',
    cutoff: 25,
    sustainedSeconds: 300,
    exemptIf: (s) => s.ecmo.active && s.ecmo.mode !== 'ECCO2R',
    icon: '🫁',
    referenceCitation: 'Nunn Applied Resp Physiology',
    didacticNote: 'Por debajo de PaO₂ 25 mmHg el aporte de O₂ es incompatible con metabolismo aeróbico tisular incluso con gasto cardíaco máximo. Objetivo mínimo PaO₂ >55 mmHg (SpO₂ >88%) en ARDS (ARDSNet 2000).',
  },

  // ─── METABÓLICOS ───────────────────────────────────────────────────────────

  {
    id: 'acidosis_refractaria',
    nameES: 'PCR por acidemia incompatible con la vida',
    description: 'pH < 6.80 sostenido > 15 min: pérdida de respuesta catecolamínica + paro cardíaco',
    vital: 'pH',
    operator: '<',
    cutoff: 6.80,
    sustainedSeconds: 900,
    icon: '⚗️',
    referenceCitation: 'Kraut & Madias NEJM 2010',
    didacticNote: 'A pH <6.8 la mioglobina y los receptores β-adrenérgicos pierden función conformacional. Los vasopresores dejan de elevar el MAP. La asistolia es refractaria a algoritmos ACLS convencionales. Tratar causa: lactato (hipoperfusión), cetonas (CAD), uremia.',
  },

  {
    id: 'acidosis_catastrofica',
    nameES: 'Asistolia por acidemia extrema',
    description: 'pH < 6.60 sostenido > 5 min: límite de viabilidad celular humana',
    vital: 'pH',
    operator: '<',
    cutoff: 6.60,
    sustainedSeconds: 300,
    icon: '⚗️',
    referenceCitation: 'Kraut & Madias NEJM 2010',
    didacticNote: 'pH 6.6 es el límite de viabilidad celular conocido en humanos. La desnaturalización enzimática es global. Asistolia inevitable e irreversible a este rango. Ninguna intervención farmacológica es efectiva sin corrección de la causa subyacente.',
  },

  // ─── NEUROLÓGICOS ──────────────────────────────────────────────────────────

  {
    id: 'herniacion_cerebral',
    nameES: 'Muerte encefálica por herniación',
    description: 'CPP ≤ 0 mmHg (ICP ≥ MAP) sostenido > 15 min: cese de perfusión cerebral',
    vital: 'cpp',
    operator: '<=',
    cutoff: 0,
    sustainedSeconds: 900,
    icon: '🧠',
    referenceCitation: 'Hawryluk ICM 2022 (BTF 2016)',
    didacticNote: 'Cuando ICP iguala o supera MAP, no hay gradiente de presión que perfunda el cerebro. Tras ~15 min sin perfusión cerebral: muerte encefálica clínica. Triada de Cushing tardía (bradicardia + HTA + irregularidad respiratoria) es signo de inminencia. Manitol 20% 0.5-1 g/kg IV urgente.',
  },

  {
    id: 'cpp_critico',
    nameES: 'Isquemia cerebral global',
    description: 'CPP < 30 mmHg sostenido > 30 min: daño cortical extenso con preservación troncoencefálica',
    vital: 'cpp',
    operator: '<',
    cutoff: 30,
    sustainedSeconds: 1800,
    icon: '🧠',
    referenceCitation: 'BTF 2016, Robba Lancet Neurology 2021',
    didacticNote: 'CPP <30 mmHg durante 30 min causa daño cortical extenso aún con preservación troncoencefálica. Pronóstico funcional catastrófico (estado vegetativo persistente). El objetivo de CPP en TCE grave es 60-70 mmHg (BTF 2016, nivel IIB).',
  },

  // ─── ELECTROLÍTICOS ────────────────────────────────────────────────────────

  {
    id: 'hiperkalemia_mortal',
    nameES: 'PCR por hiperkalemia',
    description: 'K+ > 8.5 mEq/L sostenido > 10 min: VF/asistolia por despolarización miocárdica',
    vital: 'kPlasma',
    operator: '>',
    cutoff: 8.5,
    sustainedSeconds: 600,
    exemptIf: (s) => s.crrt.active && s.crrt.dose_mLkgh >= 20,
    icon: '⚡',
    referenceCitation: 'KDIGO 2012, ATLS',
    didacticNote: 'K+ >8.5 mEq/L produce ondas T picudas → QRS ancho → ritmo sinusal con bloqueo → fibrilación ventricular. Tratamiento: gluconato Ca²+ IV (membrano-estabilizador), bicarbonato, insulina-glucosa, kayexalato. Exención si CRRT activa con dosis ≥20 mL/kg/h (aclaramiento de K+ efectivo).',
  },

  // ─── TEMPERATURA ───────────────────────────────────────────────────────────

  {
    id: 'hipotermia_grave',
    nameES: 'PCR por hipotermia grave',
    description: 'T < 28°C sostenido > 30 min: umbral de fibrilación ventricular espontánea',
    vital: 'temperature',
    operator: '<',
    cutoff: 28,
    sustainedSeconds: 1800,
    icon: '🥶',
    referenceCitation: 'Brown NEJM 2012',
    didacticNote: 'Por debajo de 28°C el miocardio entra en zona FV-prone. Las maniobras de RCP son menos efectivas en hipotermia; el paciente debe recalentarse extracorpóreamente (ECMO-VA preferida sobre manta calefactora). "No está muerto hasta que está caliente y muerto" (axioma de urgencias).',
  },

  {
    id: 'hipertermia_maligna',
    nameES: 'Hipertermia maligna refractaria',
    description: 'T > 41.5°C sostenido > 20 min: desnaturalización proteica irreversible + MOF',
    vital: 'temperature',
    operator: '>',
    cutoff: 41.5,
    sustainedSeconds: 1200,
    icon: '🥵',
    referenceCitation: 'Bouchama NEJM 2002',
    didacticNote: 'Por encima de 41.5°C las proteínas estructurales empiezan a desnaturalizarse irreversiblemente. El daño hepatocelular, la rabdomiólisis y la coagulopatía son consecuencias inmediatas. Medidas de enfriamiento agresivas: packing con hielo, lavado gástrico frío, CRRT a temperatura baja.',
  },

  // ─── HEMORRÁGICOS ──────────────────────────────────────────────────────────

  {
    id: 'shock_hemorragico_terminal',
    nameES: 'PCR por shock hemorrágico clase IV',
    description: 'Volumen circulante < 2000 mL (>65% pérdida TBV) → colapso circulatorio irreversible',
    vital: 'bloodVolume',
    operator: '<',
    cutoff: 2000,
    sustainedSeconds: 180,
    icon: '🩸',
    referenceCitation: 'ATLS 10th ed.',
    didacticNote: 'Pérdida >40% TBV (clase IV ATLS) sin reposición masiva → colapso circulatorio. <2000 mL en adulto 70 kg ≈ >65% pérdida. Sin reposición rápida + control quirúrgico, irreversible en ~3 min. Activar protocolo transfusión masiva: ratio 1:1:1 GRE:PFC:PLT (PROPPR 2015).',
  },

  // ─── ARRÍTMICOS ────────────────────────────────────────────────────────────

  {
    id: 'bradicardia_extrema',
    nameES: 'Asistolia por bradicardia extrema',
    description: 'FC < 20 lpm sostenido > 5 min sin marcapasos: gasto cardíaco incompatible con vida',
    vital: 'heartRate',
    operator: '<',
    cutoff: 20,
    sustainedSeconds: 300,
    icon: '📉',
    referenceCitation: 'AHA 2025 ACLS',
    didacticNote: 'FC <20 lpm con MAP <50 = parada inminente. Atropina 0.5-1 mg IV (hasta 3 mg total) y marcapasos transcutáneo deben iniciarse antes de 3 min. Si refractaria: considerar causa reversible (bloqueo AV completo, hiperpotasemia, intoxicación digitálica).',
  },

  {
    id: 'taquicardia_extrema',
    nameES: 'PCR por taquiarritmia',
    description: 'FC > 220 lpm sostenido > 5 min con MAP < 60: tiempo de llenado diastólico insuficiente',
    vital: 'heartRate',
    operator: '>',
    cutoff: 220,
    sustainedSeconds: 300,
    icon: '📈',
    referenceCitation: 'AHA 2025 ACLS',
    didacticNote: 'A FC >220 lpm el tiempo de llenado diastólico es <0.27 s — insuficiente para llenado ventricular izquierdo. Hipoperfusión severa → síncope → PCR. Si inestable: cardioversión eléctrica sincronizada inmediata (ACLS 2025). Verificar causa: WPW, TV polimórfica, toxicidad simpaticomiméticos.',
  },

  // ── ENDOCRINO / OBSTÉTRICO ────────────────────────────────────────────────
  {
    id: 'hipoglucemia_coma',
    nameES: 'Coma hipoglucémico irreversible',
    description: 'Glucosa < 30 mg/dL sostenida > 10 min: daño cortical permanente',
    vital: 'glucose',
    operator: '<', cutoff: 30, sustainedSeconds: 600,
    icon: '🍯',
    referenceCitation: 'ADA Hypoglycemia Guidelines 2023',
    didacticNote: 'Glucosa < 30 mg/dL por >10 min produce daño cortical isquémico — el cerebro no tiene reserva energética. Tratamiento inmediato: D50 25 g IV. Si refractaria: glucagón 1 mg IM + investigar insulinoma/sulfonilureas.',
  },
  {
    id: 'hipermagnesemia_letal',
    nameES: 'PCR por hipermagnesemia (toxicidad sulfato Mg)',
    description: 'Mg > 12 mg/dL sostenido > 5 min: parálisis respiratoria + bloqueo cardíaco',
    vital: 'magnesium',
    operator: '>', cutoff: 12, sustainedSeconds: 300,
    exemptIf: (s) => s.crrt.active,
    icon: '⚡',
    referenceCitation: 'ACOG 222 · Lu CJASN 2017',
    didacticNote: 'Sulfato Mg en eclampsia: rango terapéutico 4-7 mg/dL. Toxicidad: pérdida ROT >9 mg/dL, parálisis resp >10, PCR >12. Antídoto: gluconato de calcio 1 g IV. Suspender Mg inmediatamente. CRRT aclara Mg rápidamente.',
  },
];

/** Mapa de acceso rápido por id */
export const LETHAL_THRESHOLD_MAP: Record<LethalCauseId, LethalThreshold> =
  Object.fromEntries(LETHAL_THRESHOLDS.map(t => [t.id, t])) as Record<LethalCauseId, LethalThreshold>;
