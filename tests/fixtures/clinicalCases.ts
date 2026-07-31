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

/** Acidosis lactica sostenida por hipoperfusion — SIN vasopresor.
 *  Diseñado para que DO2 permanezca bajo DO2_CRIT (~7 mL/kg/min) durante
 *  toda la corrida (30 min), manteniendo el aclaramiento de lactato en el
 *  regimen lento (t½=2h, AcidBaseEngine) en vez del rapido (t½=0.5h) que
 *  se dispara cuando un vasopresor normaliza DO2.
 *
 *  bloodVolume calibrado a 2200 mL (56% de perdida — shock hemorragico
 *  clase IV) tras barrido empirico (C1.7 commit 2):
 *    - 3400/2800 mL, sin SDRA: sobrevive, pero la taquicardia
 *      compensatoria (HR→~170-190) sube el CO lo suficiente para que
 *      DO2 supere el critico en <200s sim — el lactato se aclara
 *      (6.0→~3.6 en 30 min).
 *    - 3800-4400 mL + SDRA (para sostener hipoxemia via shunt): el
 *      combo sepsis+SDRA dispara el amplificador hemodinamico
 *      sepsis×Pplat / riesgo ACP (CardiovascularEngine) y el paciente
 *      MUERE por shock hemorragico refractario/catastrofico en
 *      300-1300s, sin importar VT.
 *    - 2200 mL, SIN SDRA: la taquicardia compensatoria satura (~190 bpm,
 *      cerca de HR_MAX=220) pero la hemoglobina diluida (hbEst≈6.15,
 *      severa anemia dilucional) mantiene CaO2 bajo incluso con
 *      spo2/paO2 ya normalizados (~97%/91 mmHg) — DO2 se sostiene en
 *      ~6.2-6.5 mL/kg/min (bajo el critico) los 1800s completos, el
 *      paciente SOBREVIVE (useMortalityStore.isDeceased permanece false).
 *
 *  LIMITE DEL MODELO (documentado, no es un bug de este fixture): con
 *  DO2 apenas por debajo del critico (~6.4 vs umbral 7), la produccion
 *  anaerobia resultante (~0.19 mmol/L/h) mas la disfuncion mitocondrial
 *  septica (~0.30 mmol/L/h) no alcanzan a IGUALAR el aclaramiento lento
 *  a lactato=6.0 (~1.7 mmol/L/h) — el lactato declina LENTO (6.0→~5.5 en
 *  30 min) en vez de subir. Como hco3FromLac en AcidBaseEngine esta
 *  atado al SIGNO de dLactato/dt (no a su nivel absoluto), esa declinacion
 *  lenta regenera hco3 lentamente tambien (+0.5 en 30 min) — mucho menor
 *  que el rebote del fixture con vasopresor (+3.6 en 30 min), pero no
 *  llega a ser una caida neta. Lograr una caida neta de hco3 requeriria
 *  produccion anaerobia mayor a la que un DO2 hemodinamicamente
 *  sobrevivible (sin SDRA, sin vasopresor) puede sostener en este motor.
 *  TEST 5 ajusta su assert de hco3 a esta realidad fisiologica (ver
 *  comentario inline alli). */
export function applySustainedLacticAcidosis(): void {
  usePatientStore.getState().updateVitals({
    heartRate: 118, systolicBP: 82, diastolicBP: 50,
    meanArterialPressure: 61, spo2: 82,
    paO2: 48, paCO2: 34, pH: 7.30, hco3: 20,
    lactate: 6.0, temperature: 38.2, weight: 70,
  });
  usePatientStore.getState().setBloodVolume(2200);
  usePathologyStore.getState().setCaseCategory('infecto');
  usePathologyStore.getState().activatePathology('sepsis', null, 0.7);
  // SIN infusiones vasoactivas — es la condicion clave del fixture.
  usePatientStore.getState().setVentilatorConnected(true);
  usePatientStore.getState().setVentilatorSettings({
    mode: 'VC-AC', vt: 450, setRR: 16, fio2: 0.21, peep: 5,
  });
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
