// tests/fixtures/clinicalCases.ts
// Clinically realistic patient state fixtures.

import { usePatientStore }   from '../../src/store/usePatientStore';
import { usePathologyStore } from '../../src/store/usePathologyStore';
import { usePharmacologyStore } from '../../src/store/usePharmacologyStore';

/** TCE Grave con HIC — GCS 6, ICP 34, ARM conectado */
export function applyTCEGrave(): void {
  usePatientStore.getState().updateVitals({
    gcs: 6, icp: 34, paCO2: 34, paO2: 88,
    meanArterialPressure: 123, heartRate: 95,
    systolicBP: 158, diastolicBP: 108,
    spo2: 97, weight: 75, temperature: 37.6,
  });
  usePathologyStore.getState().setCaseCategory('neuro');
  usePathologyStore.getState().activatePathology('neuroCritical', 'tce_grave', 0.85);
  usePatientStore.getState().setProcedure('picMonitor', true);
  usePatientStore.getState().setVentilatorConnected(true);
}

/** Sepsis severa + SDRA — MAP 58, lactato 4.2, P/F 105 */
export function applySepsisSdra(): void {
  usePatientStore.getState().updateVitals({
    heartRate: 128, systolicBP: 78, diastolicBP: 48,
    meanArterialPressure: 58, spo2: 87,
    paO2: 55, paCO2: 38, pH: 7.28, hco3: 17,
    pfRatio: 105, lactate: 4.2, temperature: 38.9,
    respiratoryRate: 30, weight: 70, creatinine: 1.8,
  });
  usePathologyStore.getState().setCaseCategory('infecto');
  usePathologyStore.getState().activatePathology('sepsis', null, 0.75);
  usePathologyStore.getState().activatePathology('ards', null, 0.70);
  usePharmacologyStore.getState().setInfusionRate('noradrenaline', 0.5);
  usePatientStore.getState().setVentilatorConnected(true);
}

/** Urosepsis ESBL — AKI grave, creatinina 3.2, oliguria */
export function applyUrosepsisESBL(): void {
  usePatientStore.getState().updateVitals({
    heartRate: 115, systolicBP: 88, diastolicBP: 55,
    meanArterialPressure: 66, spo2: 94,
    paO2: 72, paCO2: 34, pH: 7.24, hco3: 14,
    lactate: 4.4, urineOutput: 0.1, creatinine: 3.2,
    temperature: 39.2, weight: 70,
  });
  usePathologyStore.getState().setCaseCategory('infecto');
  usePathologyStore.getState().activatePathology('sepsis', null, 0.78);
  usePharmacologyStore.getState().setInfusionRate('noradrenaline', 0.35);
}

/** Quemado TBSA 60% — hipotensión + Parkland activo */
export function applyQuemadoTBSA60(): void {
  usePatientStore.getState().updateVitals({
    heartRate: 135, systolicBP: 85, diastolicBP: 50,
    meanArterialPressure: 62, spo2: 93,
    paO2: 68, temperature: 38.5, weight: 80,
    lactate: 3.8,
  });
  usePathologyStore.getState().setCaseCategory('quemados');
}
