// tests/diagnostics/dtBisect.spec.ts
//
// C1.7 commit 3 — biseccion de la no-invarianza temporal.
// GRAVEDAD MAXIMA: el mismo escenario septico, 1800s, MUERE a dt=1/240
// (x1) y SOBREVIVE a dt=0.25 (x60). Este archivo LOCALIZA la causa —
// NO la corrige (3E: el fix se propone por escrito en el reporte).
//
// Paso 3A (obligatorio, va primero): prueba de determinismo — ver
// tests/diagnostics/determinism.spec.ts. Sin RNG controlado, dos
// corridas del mismo escenario al mismo dt podrian diferir por azar,
// no solo por dt, y la biseccion no significaria nada. Este archivo usa
// installSeededRandom(SEED) en cada corrida para eliminar esa variable.
//
// Paso 3B: serie temporal (muestreada cada 1s SIMULADO, no cada tick) de
// bloodVolume, strokeVolume, cardiacOutput, meanArterialPressure,
// urineOutput, heartRate, svr, cvp, lactate, hco3, pH — comparando
// dt=1/240 vs dt=0.25 sobre el MISMO escenario (cadena completa),
// reportando el primer instante en que cada campo supera 1% de
// divergencia relativa.
//
// Paso 3C: repite la comparacion activando subconjuntos incrementales de
// motores (Cardiovascular solo, +Renal, +Respiratory, +AcidBase,
// +Pharmacology, cadena completa) para localizar en cual aparece la
// divergencia.
//
// Ventanas mas cortas que el escenario original (1800s) a proposito: la
// muerte original ocurre a simTime=302s: 600s (3B) / 300s (3C) alcanzan
// para ver el inicio de la divergencia sin correr 1800s x 14 corridas.

import { describe, it, expect } from 'vitest';
import { usePatientStore, type Vitals } from '../../src/store/usePatientStore';
import { useTimeStore } from '../../src/store/useTimeStore';
import { RespiratoryEngine } from '../../src/core/RespiratoryEngine';
import { AcidBaseEngine } from '../../src/core/AcidBaseEngine';
import { PharmacologyEngine } from '../../src/core/PharmacologyEngine';
import { RenalEngine } from '../../src/core/RenalEngine';
import { CardiovascularEngine } from '../../src/core/CardiovascularEngine';
import { CrosstalkEngine } from '../../src/core/CrosstalkEngine';
import { AcuteMortalityEngine } from '../../src/core/AcuteMortalityEngine';
import { PathologyEngine } from '../../src/core/PathologyEngine';
import { resetAllStores } from '../helpers/storeReset';
import { applySepsisSdra } from '../fixtures/clinicalCases';
import { installSeededRandom, restoreRandom } from '../helpers/seededRandom';

const SEED = 1337;
const SAMPLE_FIELDS = [
  'bloodVolume', 'strokeVolume', 'cardiacOutput', 'meanArterialPressure',
  'urineOutput', 'heartRate', 'svr', 'cvp', 'lactate', 'hco3', 'pH',
] as const;
type SampleField = (typeof SAMPLE_FIELDS)[number];
type Sample = Record<SampleField, number> & { t: number };

function readSample(t: number): Sample {
  const state = usePatientStore.getState();
  const v = state.vitals;
  return {
    t,
    bloodVolume: state.bloodVolume,
    strokeVolume: v.strokeVolume,
    cardiacOutput: v.cardiacOutput,
    meanArterialPressure: v.meanArterialPressure,
    urineOutput: v.urineOutput,
    heartRate: v.heartRate,
    svr: v.svr,
    cvp: v.cvp,
    lactate: v.lactate,
    hco3: v.hco3,
    pH: v.pH,
  };
}

function resetEngines(): void {
  resetAllStores();
  RespiratoryEngine.getInstance().reset();
  AcidBaseEngine.getInstance().reset();
  PharmacologyEngine.getInstance().reset();
  AcuteMortalityEngine.getInstance().reset();
}

type EngineName = 'pathology' | 'pharmacology' | 'renal' | 'respiratory' | 'cardiovascular' | 'acidbase' | 'crosstalk' | 'mortality';

function tickSubset(dt: number, engines: EngineName[]): void {
  useTimeStore.getState().advanceTick(dt);
  if (engines.includes('pathology'))      PathologyEngine.getInstance().update(dt);
  if (engines.includes('pharmacology'))   PharmacologyEngine.getInstance().update(dt);
  if (engines.includes('renal'))          RenalEngine.getInstance().update(dt);
  if (engines.includes('respiratory'))    RespiratoryEngine.getInstance().update(dt);
  if (engines.includes('cardiovascular')) CardiovascularEngine.getInstance().updateHemodynamics(dt);
  if (engines.includes('acidbase'))       AcidBaseEngine.getInstance().update(dt);
  if (engines.includes('crosstalk'))      CrosstalkEngine.getInstance().update(dt);
  if (engines.includes('mortality'))      AcuteMortalityEngine.getInstance().update(dt);
}

/** Corre el escenario con el subconjunto de motores dado, muestreando
 *  cada 1s simulado. Semilla fija — determinismo controlado (3A). */
function runSampled(dt: number, durationS: number, engines: EngineName[]): Sample[] {
  resetEngines();
  installSeededRandom(SEED);
  const samples: Sample[] = [];
  try {
    applySepsisSdra();
    samples.push(readSample(0));
    const steps = Math.round(durationS / dt);
    let nextSampleT = 1;
    for (let i = 0; i < steps; i++) {
      tickSubset(dt, engines);
      const t = (i + 1) * dt;
      if (t >= nextSampleT) {
        samples.push(readSample(Math.round(t)));
        nextSampleT += 1;
      }
    }
  } finally {
    restoreRandom();
  }
  return samples;
}

/** Compara dos series (pueden tener distinto numero de muestras si una
 *  corrida termino distinto; se compara hasta el minimo comun) y
 *  devuelve, por campo, el primer t con divergencia relativa > 1%. */
function firstDivergence(fine: Sample[], coarse: Sample[]): Record<SampleField, number | null> {
  const result = {} as Record<SampleField, number | null>;
  const n = Math.min(fine.length, coarse.length);
  for (const f of SAMPLE_FIELDS) {
    result[f] = null;
    for (let i = 0; i < n; i++) {
      const a = fine[i][f], b = coarse[i][f];
      const diffAbs = Math.abs(a - b);
      const diffRel = a !== 0 ? diffAbs / Math.abs(a) : (b !== 0 ? Infinity : 0);
      if (diffRel > 0.01) {
        result[f] = fine[i].t;
        break;
      }
    }
  }
  return result;
}

describe('C1.7 commit 3 — biseccion de la no-invarianza de dt (diagnostico, no corrige)', () => {
  it('3B — serie temporal cadena completa: primer instante de divergencia por campo (600s)', () => {
    const fine = runSampled(1 / 240, 600, ['pathology', 'pharmacology', 'renal', 'respiratory', 'cardiovascular', 'acidbase', 'crosstalk', 'mortality']);
    const coarse = runSampled(0.25, 600, ['pathology', 'pharmacology', 'renal', 'respiratory', 'cardiovascular', 'acidbase', 'crosstalk', 'mortality']);

    const divergence = firstDivergence(fine, coarse);
    const ranked = SAMPLE_FIELDS
      .map(f => ({ campo: f, primerT: divergence[f] }))
      .filter(r => r.primerT !== null)
      .sort((a, b) => (a.primerT! - b.primerT!));

    console.log('=== 3B: primer instante de divergencia >1% por campo (orden cronologico) ===');
    console.table(ranked);

    console.log('=== 3B: primeras 20 muestras — fine (dt=1/240) ===');
    console.table(fine.slice(0, 20));
    console.log('=== 3B: primeras 20 muestras — coarse (dt=0.25) ===');
    console.table(coarse.slice(0, 20));

    expect(ranked.length).toBeGreaterThanOrEqual(0); // diagnostico puro
  }, 300_000);

  it.each([
    { label: '(1) solo Cardiovascular', engines: ['cardiovascular'] as EngineName[] },
    { label: '(2) +Renal', engines: ['renal', 'cardiovascular'] as EngineName[] },
    { label: '(3) +Respiratory', engines: ['renal', 'respiratory', 'cardiovascular'] as EngineName[] },
    { label: '(4) +AcidBase', engines: ['renal', 'respiratory', 'cardiovascular', 'acidbase'] as EngineName[] },
    { label: '(5) +Pharmacology', engines: ['pharmacology', 'renal', 'respiratory', 'cardiovascular', 'acidbase'] as EngineName[] },
    { label: '(6) cadena completa', engines: ['pathology', 'pharmacology', 'renal', 'respiratory', 'cardiovascular', 'acidbase', 'crosstalk', 'mortality'] as EngineName[] },
  ])('3C — biseccion por motor: $label (300s)', ({ label, engines }) => {
    const fine = runSampled(1 / 240, 300, engines);
    const coarse = runSampled(0.25, 300, engines);
    const divergence = firstDivergence(fine, coarse);
    const ranked = SAMPLE_FIELDS
      .map(f => ({ campo: f, primerT: divergence[f] }))
      .filter(r => r.primerT !== null)
      .sort((a, b) => (a.primerT! - b.primerT!));

    console.log(`=== 3C ${label}: campos que divergen >1% en 300s (subconjunto: ${engines.join(',')}) ===`);
    if (ranked.length === 0) {
      console.log('  (sin divergencia >1% detectada en esta ventana/subconjunto)');
    } else {
      console.table(ranked);
    }

    expect(ranked.length).toBeGreaterThanOrEqual(0); // diagnostico puro
  }, 300_000);
});
