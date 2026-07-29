// src/scenarios/hematoScenarios.ts
// Escenarios de hematología crítica para IMHOTEP.
// Refs: Scully ASH 2020 (PTT); ISTH 2018 (CID); Coiffier JCO 2008 (TLS).
import type { ScenarioDefinition } from '../store/useScenarioStore';

export const hematoScenarios: ScenarioDefinition[] = [
  {
    id: 'hemato_ptt_severo',
    category: 'hemato',
    name: 'PTT con MAHA y compromiso neurológico',
    description: 'Mujer 35 años, fiebre + petequias + confusión + AKI + anemia microangiopática. Plaquetas 12k, LDH 1820, esquistocitos +++. ADAMTS13 pendiente.',
    baseSeverity: 0.85,
    tags: ['PTT', 'hemato', 'plasmaféresis', 'microangiopatía'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.85 },
    ],
    initialVitals: {
      heartRate: 110, systolicBP: 142, diastolicBP: 82,
      meanArterialPressure: 102, respiratoryRate: 20,
      spo2: 96, temperature: 38.4,
      gcs: 12, creatinine: 2.4, lactate: 1.8,
    },
    clinicalNotes: 'EMERGENCIA HEMATOLÓGICA: iniciar plasmaféresis dentro de 4h. Si no disponible: PFC alto volumen (15-30 mL/kg) mientras se traslada. Metilprednisolona 1 g IV/día. Rituximab 375 mg/m² semana 1. Caplacizumab si disponible (TITAN 2019). CONTRAINDICACIÓN ABSOLUTA: transfusión de plaquetas (puede precipitar trombosis microvascular).',
    references: ['Scully ASH 2020', 'TITAN NEJM 2019 — caplacizumab'],
  },
  {
    id: 'hemato_cid_septica',
    category: 'hemato',
    name: 'CID asociada a sepsis — ISTH Score 6',
    description: 'Sepsis grave por foco abdominal + CID overt. Sangrado por venopunciones, hematuria. Plaquetas 38k, fibrinógeno 90, INR 2.4, dímero-D 28.000.',
    baseSeverity: 0.80,
    tags: ['CID', 'hemato', 'sepsis', 'coagulopatía'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.80 },
      { domain: 'sepsis', subtype: null, baseSeverity: 0.75 },
    ],
    initialVitals: {
      heartRate: 128, systolicBP: 84, diastolicBP: 48,
      meanArterialPressure: 60, respiratoryRate: 26,
      spo2: 91, temperature: 39.1,
      lactate: 3.6, creatinine: 2.1,
      pH: 7.22, hco3: 14,
    },
    clinicalNotes: 'TRATAR FOCO SÉPTICO es PRIORIDAD #1 (CID es consecuencia). Soporte hemostático: PFC 15 mL/kg si INR>1.5 + sangrado activo; crioprecipitados 10U si fibrinógeno <100 mg/dL; plaquetas si <20k o <50k con sangrado. Ácido tranexámico 1 g IV SOLO si patrón hiperfibrinolítico (D-dímero muy alto, ROTEM con LY30>15%). Heparina solo si trombosis predominante (subtipo crónico/neoplásico). Anti-Xa CRRT no protege.',
    references: ['ISTH 2018 DIC Score', 'Wada JTH 2013', 'Levi NEJM 2014'],
  },
  {
    id: 'hemato_tls_qt',
    category: 'hemato',
    name: 'Síndrome de Lisis Tumoral post-QT agresiva',
    description: 'Linfoma Burkitt, 48h post-ciclofosfamida. K+ 6.8, fósforo 9.4, ácido úrico 18, Ca++ 6.2 mg/dL, creatinina 3.2, anuria.',
    baseSeverity: 0.78,
    tags: ['TLS', 'hemato', 'oncohematología', 'AKI', 'hiperkalemia'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.85 },
    ],
    initialVitals: {
      heartRate: 102, systolicBP: 124, diastolicBP: 72,
      meanArterialPressure: 89, respiratoryRate: 22,
      spo2: 95,
      kPlasma: 6.8, creatinine: 3.2,
      urineOutput: 0.1,
    },
    clinicalNotes: 'Rasburicasa 0.2 mg/kg IV × 1 dosis (recombinante; NO usar en G6PD deficiencia). Hiperhidratación 3 L/m²/día SF 0.9% (sin K+, sin fosfato). Corregir hiperK: calcio gluconato 1 g IV (estabiliza membrana) + insulina 10U + D50 25g + bicarbonato. NO corregir hipoCa asintomática (riesgo de precipitación CaxP en vías renales). CRRT temprana si oligoanuria + K+>6.5 o sobrecarga hídrica. Meta uricemia <8 mg/dL.',
    references: ['Coiffier JCO 2008 TLS Guidelines', 'Cairo BJH 2004'],
  },
];
