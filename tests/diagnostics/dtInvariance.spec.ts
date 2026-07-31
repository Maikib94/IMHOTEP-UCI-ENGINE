// tests/diagnostics/dtInvariance.spec.ts
//
// C1.5 V4 — guard estructural: la fisica no debe depender de que velocidad
// de reproduccion eligio el usuario.
//
// HALLAZGO QUE LO MOTIVA: tests/helpers/timeAdvance.ts usa dt=0.5 por
// defecto. En produccion dt = (1/240) * speedMultiplier:
//   x1  → 0.004167
//   x10 → 0.041667
//   x60 → 0.25
// dt=0.5 equivale a "x120", una velocidad que no existe en la UI. Antes de
// C1.5 la suite entera validaba un regimen numerico que el usuario nunca
// ejecuta, y por construccion no podia detectar el bug de cuantizacion
// (que dependia exactamente de que dt fuera fino).
//
// Este test corre el MISMO escenario clinico a los dos extremos reales de
// dt (x1 fino, x60 grueso — el mas grueso que existe en la UI) y exige que
// ambos converjan al mismo estado dentro de tolerancia. Si algo diverge,
// es fisica dependiente de la velocidad de reproduccion — un bug real, no
// se silencia ajustando la tolerancia.

import { describe, it, expect } from 'vitest';
import { usePatientStore, type Vitals } from '../../src/store/usePatientStore';
import { RespiratoryEngine } from '../../src/core/RespiratoryEngine';
import { AcidBaseEngine } from '../../src/core/AcidBaseEngine';
import { PharmacologyEngine } from '../../src/core/PharmacologyEngine';
import { AcuteMortalityEngine } from '../../src/core/AcuteMortalityEngine';
import { advanceSimSeconds } from '../helpers/timeAdvance';
import { resetAllStores } from '../helpers/storeReset';
import { applySepsisSdra } from '../fixtures/clinicalCases';

const FIELDS = [
  'pH', 'hco3', 'lactate', 'paO2', 'paCO2', 'spo2', 'etco2',
  'temperature', 'urineOutput', 'evlwi', 'heartRate', 'meanArterialPressure',
] as const satisfies readonly (keyof Vitals)[];

function snapshotVitals(): Record<(typeof FIELDS)[number], number> {
  const v = usePatientStore.getState().vitals;
  const snap = {} as Record<(typeof FIELDS)[number], number>;
  for (const f of FIELDS) snap[f] = v[f] as number;
  return snap;
}

// Motores singleton con estado privado mutable: deben resetearse entre las
// dos corridas o el segundo run arranca contaminado por el primero.
// CardiovascularEngine NO tiene reset() — fuera de alcance de C1.5 (ver
// prompt: "reset() de CardiovascularEngine y RespiratoryEngine" → C3).
// Su leak residual (noiseTimer/treatmentRecovery) es acotado y no sesga
// resultados de largo plazo: noiseTimer se recicla cada ~1 sim-s, y
// treatmentRecovery solo crece con treatmentEfficacy 'targeted'/'empiric_match'
// (aplySepsisSdra no prescribe ATB, se mantiene en su default).
function resetEnginesAndStores(): void {
  resetAllStores();
  RespiratoryEngine.getInstance().reset();
  AcidBaseEngine.getInstance().reset();
  PharmacologyEngine.getInstance().reset();
  AcuteMortalityEngine.getInstance().reset();
}

describe('C1.5 V4 — invarianza de dt (produccion x1 vs x60)', () => {
  it('diverge <5% relativo entre dt=1/240 y dt=0.25 tras 1800s sim (pH: tolerancia absoluta 0.03)', () => {
    // Run A: dt=1/240 (x1 — produccion real, el regimen que este PR arregla)
    resetEnginesAndStores();
    applySepsisSdra();
    advanceSimSeconds(1800, 1 / 240);
    const snapFine = snapshotVitals();

    // Run B: dt=0.25 (x60 — el dt mas grueso que existe realmente en la UI)
    resetEnginesAndStores();
    applySepsisSdra();
    advanceSimSeconds(1800, 0.25);
    const snapCoarse = snapshotVitals();

    const rows: Array<{
      campo: string; fine: number; coarse: number;
      diffAbs: number; diffRelPct: number; tolerancia: string; pass: boolean;
    }> = [];

    for (const f of FIELDS) {
      const fine = snapFine[f], coarse = snapCoarse[f];
      const diffAbs = Math.abs(fine - coarse);
      const diffRel = fine !== 0 ? diffAbs / Math.abs(fine) : (coarse === 0 ? 0 : Infinity);
      const isPH = f === 'pH';
      const pass = isPH ? diffAbs < 0.03 : diffRel < 0.05;
      rows.push({
        campo: f, fine, coarse, diffAbs,
        diffRelPct: isFinite(diffRel) ? diffRel * 100 : Infinity,
        tolerancia: isPH ? 'abs<0.03' : 'rel<5%',
        pass,
      });
    }

    console.table(rows);

    const failures = rows.filter(r => !r.pass);
    if (failures.length > 0) {
      console.log(
        'CAMPOS QUE DIVERGEN MAS ALLA DE TOLERANCIA (fisica dependiente de dt):\n' +
        failures.map(f =>
          `  ${f.campo}: fine=${f.fine.toFixed(4)} coarse=${f.coarse.toFixed(4)} ` +
          `diffAbs=${f.diffAbs.toFixed(4)} diffRel=${f.diffRelPct.toFixed(2)}%`
        ).join('\n')
      );
    }

    // No se ajusta la tolerancia para forzar el pase — una divergencia real
    // aqui es un bug de dt-dependencia que hay que reportar, no esconder.
    expect(failures.map(f => f.campo)).toEqual([]);
  }, 900_000);
});
