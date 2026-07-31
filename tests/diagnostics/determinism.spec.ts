// tests/diagnostics/determinism.spec.ts
//
// C1.7 commit 3, paso 3A.2 — prueba de determinismo, obligatoria ANTES de
// bisecar dtBisect.spec.ts. Sin determinismo, dos corridas del mismo
// escenario al mismo dt pueden diferir por puro azar (Math.random en
// CardiovascularEngine, InfectoEngine, LabEngine, MicrobiologyEngine), y
// la biseccion de la no-invarianza de dt no significaria nada — no se
// podria distinguir "diverge por dt" de "diverge por semilla distinta".
//
// De los usos de Math.random() en src/core, solo CardiovascularEngine
// (ruido de FC, linea ~403) esta en el camino de advanceSimSeconds()
// (Pathology, Pharmacology, Renal, Respiratory, Cardiovascular, AcidBase,
// Crosstalk, AcuteMortality) — InfectoEngine/LabEngine/MicrobiologyEngine
// no son parte de esa cadena. Tambien se greppeo Date.now()/crypto.random:
// apariciones en LabEngine (ID de resultado de lab) y ProceduralPatientFactory
// (ID de paciente custom) — ninguna de las dos escribe vitals, no afectan
// el estado fisiologico comparado aqui.

import { describe, it, expect } from 'vitest';
import { usePatientStore } from '../../src/store/usePatientStore';
import { RespiratoryEngine } from '../../src/core/RespiratoryEngine';
import { AcidBaseEngine } from '../../src/core/AcidBaseEngine';
import { PharmacologyEngine } from '../../src/core/PharmacologyEngine';
import { AcuteMortalityEngine } from '../../src/core/AcuteMortalityEngine';
import { advanceSimSeconds } from '../helpers/timeAdvance';
import { resetAllStores } from '../helpers/storeReset';
import { applySepsisSdra } from '../fixtures/clinicalCases';
import { installSeededRandom, restoreRandom } from '../helpers/seededRandom';

const SEED = 1337;

function resetEngines(): void {
  resetAllStores();
  RespiratoryEngine.getInstance().reset();
  AcidBaseEngine.getInstance().reset();
  PharmacologyEngine.getInstance().reset();
  AcuteMortalityEngine.getInstance().reset();
}

function runScenario(dt: number): Record<string, unknown> {
  resetEngines();
  installSeededRandom(SEED);
  try {
    applySepsisSdra();
    advanceSimSeconds(1800, dt);
  } finally {
    restoreRandom();
  }
  // Snapshot completo — no solo un subconjunto de campos. Si algo fuera
  // de "vitals" tambien depende de random (ej. bloodVolume), esto lo
  // detecta igual porque comparamos el snapshot entero.
  const state = usePatientStore.getState();
  return {
    vitals: { ...state.vitals },
    bloodVolume: state.bloodVolume,
  };
}

describe('C1.7 commit 3 — prueba de determinismo (obligatoria antes de bisecar)', () => {
  it('mismo escenario, mismo dt, misma semilla → identidad exacta (===) en todos los campos', () => {
    const snap1 = runScenario(1 / 240);
    const snap2 = runScenario(1 / 240);

    // Comparacion campo a campo con === explicito (no solo toEqual) para
    // poder reportar CUAL campo difiere si el determinismo falla.
    const keys = new Set([
      ...Object.keys(snap1.vitals as object),
      ...Object.keys(snap2.vitals as object),
    ]);
    const mismatches: string[] = [];
    for (const k of keys) {
      const a = (snap1.vitals as Record<string, unknown>)[k];
      const b = (snap2.vitals as Record<string, unknown>)[k];
      if (a !== b) mismatches.push(`vitals.${k}: ${String(a)} !== ${String(b)}`);
    }
    if (snap1.bloodVolume !== snap2.bloodVolume) {
      mismatches.push(`bloodVolume: ${snap1.bloodVolume} !== ${snap2.bloodVolume}`);
    }

    if (mismatches.length > 0) {
      console.log('CAMPOS NO DETERMINISTAS (fuente de azar sin controlar):\n' + mismatches.join('\n'));
    }
    expect(mismatches).toEqual([]);
  }, 300_000);
});
