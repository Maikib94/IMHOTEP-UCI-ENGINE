// src/scenarios/endocrineScenarios.ts
// Escenarios de endocrinología/metabolismo crítico para IMHOTEP.
// Refs: ADA 2024 DKA; Kitabchi Diabetes Care 2009; Ross JCEM 2016; Wartofsky NEJM 2009.
import type { ScenarioDefinition } from '../store/useScenarioStore';

export const endocrineScenarios: ScenarioDefinition[] = [
  {
    id: 'endo_dka_severa',
    category: 'endocrino',
    name: 'Cetoacidosis Diabética Severa',
    description: 'DM1 con omisión de insulina y precipitante infeccioso. pH 6.95, glucosa 580 mg/dL, K+ 5.6 (corporal total bajo). Letargia GCS 12, Kussmaul.',
    baseSeverity: 0.75,
    tags: ['DKA', 'endocrino', 'metabólico', 'ácido-base'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: 'dka', baseSeverity: 0.85 },
    ],
    initialVitals: {
      heartRate: 124, systolicBP: 96, diastolicBP: 58,
      meanArterialPressure: 71, respiratoryRate: 28,
      spo2: 97, temperature: 38.1,
      pH: 6.95, paCO2: 18, hco3: 6, lactate: 2.1,
      glucoseMgdL: 580, kPlasma: 5.6,
      gcs: 12, urineOutput: 0.3,
    },
    clinicalNotes: 'Iniciar insulina IV 0.1 U/kg/h tras 1L SF 0.9% en 1ª hora. Reponer K cuando <5.2 mEq/L. Fluidos 10-20 mL/kg/h según severidad. Buscar foco infeccioso. Vigilar edema cerebral (niños: mannitol 0.5-1 g/kg si deterioro). Criterios resolución: pH>7.30, HCO3>15, AG cerrado.',
    references: ['ADA 2024 DKA Position Statement', 'Kitabchi Diabetes Care 2009'],
  },
  {
    id: 'endo_hhs_anciano',
    category: 'endocrino',
    name: 'Estado Hiperglucémico Hiperosmolar',
    description: 'DM2 anciano con neumonía precipitante. Glucosa 920 mg/dL, Na+ 152, osmolaridad 348. Letárgico, deshidratación severa, no acidosis.',
    baseSeverity: 0.78,
    tags: ['HHS', 'endocrino', 'anciano', 'deshidratación'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: 'hhs', baseSeverity: 0.80 },
      { domain: 'sepsis',    subtype: null,   baseSeverity: 0.40 },
    ],
    initialVitals: {
      heartRate: 118, systolicBP: 88, diastolicBP: 52,
      meanArterialPressure: 64, respiratoryRate: 22,
      spo2: 92, temperature: 38.6,
      pH: 7.32, paCO2: 38, hco3: 22,
      glucoseMgdL: 920, kPlasma: 4.4,
      gcs: 11, urineOutput: 0.2, creatinine: 2.1,
    },
    clinicalNotes: 'Hidratación agresiva: 1-1.5 L/h SF 0.9% en 1ª hora, luego SF 0.45% si Na+ corregido >145. Insulina BAJA (0.05 U/kg/h) — no agresiva como en DKA. Meta glucosa 250-300 primeras 12h. Corregir déficit hídrico (promedio 8-10L) en 48h. Anticoagulación preventiva (riesgo TVP alto).',
    references: ['ADA 2024 HHS', 'Pasquel Diabetes Care 2014'],
  },
  {
    id: 'endo_tormenta_tiroidea',
    category: 'endocrino',
    name: 'Tormenta Tiroidea — Burch-Wartofsky 65',
    description: 'Mujer 38 años, Graves no tratado, post-cirugía dental. T 40.5°C, FC 165 (fibrilación auricular), agitada, vómitos, ictericia leve. BWS 65.',
    baseSeverity: 0.82,
    tags: ['tormenta_tiroidea', 'endocrino', 'hipertermia', 'FA'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.88 },
    ],
    initialVitals: {
      heartRate: 165, systolicBP: 168, diastolicBP: 88,
      meanArterialPressure: 115, respiratoryRate: 28,
      spo2: 96, temperature: 40.5,
      glucoseMgdL: 145, kPlasma: 3.8,
      gcs: 13,
    },
    clinicalNotes: 'SECUENCIA DE FOWLER: (1) PTU 500-1000 mg dosis carga vía SNG → luego 200 mg c/4h (bloquea síntesis + conversión T4→T3). (2) Yodo (Lugol) 5-10 gotas c/8h ≥1h DESPUÉS del PTU (bloquea release; si PTU antes, evitar síntesis adicional). (3) Propranolol 0.5-1 mg IV lento, titular a FC. (4) Hidrocortisona 100 mg IV c/8h (bloquea conversión periférica). (5) Antipiréticos — NO AAS (desplaza T4 de proteínas). (6) Manejo FA: amiodarona IV si inestable hemodinámicamente.',
    references: ['Burch Endocrinol Metab Clin 1993', 'Ross JCEM 2016', 'Akamizu Thyroid 2012'],
  },
];
