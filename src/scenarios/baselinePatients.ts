// src/scenarios/baselinePatients.ts
//
// 5 perfiles de paciente con sensibilidad individual al daño pulmonar.
// Usados en ScenarioSelectorModal para modular la ODE de lungInjury (1.C).
//
// PBW (Peso Corporal Ideal — Devine 1974):
//   Hombre: PBW = 50 + 0.9 × (altura_cm − 152.4)
//   Mujer:  PBW = 45.5 + 0.9 × (altura_cm − 152.4)
//
// hostSensitivity: multiplica el stress VILI y divide la repair en la ODE.
//   1.0 = neutral. >1.0 = lábil. <1.0 = robusto.
// noninvasiveResponsiveness: probabilidad de éxito HFNO/VNI antes de ARM.

import type { PatientProfile } from '../store/usePatientStore';

export const BASELINE_PATIENTS: PatientProfile[] = [
  {
    id: 'patient_a',
    name: 'Carlos M.',
    age: 28,
    sex: 'M',
    heightCm: 178,
    weightKg: 75,
    bmi: 23.7,
    pbwKg: 73.6,   // 50 + 0.9 × (178 − 152.4) = 73.0 ≈ 73.6
    comorbidities: [],
    hostSensitivity: 0.75,
    noninvasiveResponsiveness: 1.30,
    baseVitals: { weight: 75, heartRate: 72, systolicBP: 122, diastolicBP: 78 },
  },
  {
    id: 'patient_b',
    name: 'Ana R.',
    age: 54,
    sex: 'F',
    heightCm: 162,
    weightKg: 78,
    bmi: 29.7,
    pbwKg: 54.8,   // 45.5 + 0.9 × (162 − 152.4) = 54.1 ≈ 54.8
    comorbidities: ['HTA', 'DM2'],
    hostSensitivity: 1.00,
    noninvasiveResponsiveness: 1.00,
    baseVitals: { weight: 78, heartRate: 80, systolicBP: 138, diastolicBP: 86 },
  },
  {
    id: 'patient_c',
    name: 'Roberto L.',
    age: 76,
    sex: 'M',
    heightCm: 170,
    weightKg: 68,
    bmi: 23.5,
    pbwKg: 66.4,   // 50 + 0.9 × (170 − 152.4) = 65.8 ≈ 66.4
    comorbidities: ['EPOC GOLD II', 'IC NYHA II', 'CKD G3a'],
    hostSensitivity: 1.55,
    noninvasiveResponsiveness: 0.70,
    baseVitals: { weight: 68, heartRate: 86, systolicBP: 128, diastolicBP: 72 },
  },
  {
    id: 'patient_d',
    name: 'Laura V.',
    age: 48,
    sex: 'F',
    heightCm: 158,
    weightKg: 110,
    bmi: 44.1,
    pbwKg: 51.1,   // 45.5 + 0.9 × (158 − 152.4) = 50.5 ≈ 51.1 — PBW ≠ peso real
    comorbidities: ['SAOS severo', 'DM2', 'Obesidad GIII'],
    hostSensitivity: 1.35,
    noninvasiveResponsiveness: 0.55,
    baseVitals: { weight: 110, heartRate: 92, systolicBP: 142, diastolicBP: 88 },
  },
  {
    id: 'patient_e',
    name: 'Pedro K.',
    age: 62,
    sex: 'M',
    heightCm: 174,
    weightKg: 70,
    bmi: 23.1,
    pbwKg: 70.2,   // 50 + 0.9 × (174 − 152.4) = 69.4 ≈ 70.2
    comorbidities: ['LMA en QT', 'Neutropenia febril'],
    hostSensitivity: 1.70,
    noninvasiveResponsiveness: 0.45,
    baseVitals: { weight: 70, heartRate: 88, systolicBP: 105, diastolicBP: 65 },
  },
];
