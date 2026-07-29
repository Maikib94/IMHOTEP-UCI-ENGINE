// tests/unit/autoscaleFromBuffer.spec.ts — FASE 5
import { describe, it, expect } from 'vitest';
import { autoscaleFromBuffer } from '../../src/utils/waveInterpolation';
import type { SM100Waveforms } from '../../src/core/VentilatorSM100Engine';

function makeWf(pawVals: number[], flowVals: number[], volVals: number[]): SM100Waveforms {
  const n = pawVals.length;
  const wf: SM100Waveforms = {
    t:      new Float32Array(n),
    paw:    new Float32Array(n),
    pTrach: new Float32Array(n),
    flow:   new Float32Array(n),
    vol:    new Float32Array(n),
    ppl:    new Float32Array(n),
    pTP:    new Float32Array(n),
    length:   n,
    writeIdx: n % Math.max(n, 1),
  };
  for (let i = 0; i < n; i++) {
    wf.t[i]    = i * 0.1;
    wf.paw[i]  = pawVals[i];
    wf.flow[i] = flowVals[i];
    wf.vol[i]  = volVals[i];
  }
  wf.writeIdx = n;
  return wf;
}

describe('autoscaleFromBuffer', () => {
  it('Canal paw con valores 5–30 cmH2O → range incluye ambos + pad', () => {
    const paw  = Array.from({ length: 50 }, (_, i) => 5 + 25 * (i / 49));
    const flow = Array(50).fill(0);
    const vol  = Array(50).fill(400);
    const wf   = makeWf(paw, flow, vol);
    const { min, max } = autoscaleFromBuffer(wf, 'paw', 0, 5, 15);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(30);
  });

  it('Canal flow con min=-40, max=40 → range bipolar', () => {
    const flow = Array.from({ length: 100 }, (_, i) => -40 + 80 * (i / 99));
    const wf   = makeWf(Array(100).fill(15), flow, Array(100).fill(400));
    const { min, max } = autoscaleFromBuffer(wf, 'flow', 0, 10, 30);
    expect(min).toBeLessThan(-40);
    expect(max).toBeGreaterThan(40);
  });

  it('Rango < minRange → expandido a minRange centrado', () => {
    // All paw values close together (range ~1 cmH2O)
    const paw = Array(50).fill(15);
    const wf  = makeWf(paw, Array(50).fill(0), Array(50).fill(400));
    const { min, max } = autoscaleFromBuffer(wf, 'paw', 0, 5, 15);
    expect(max - min).toBeGreaterThanOrEqual(15);
  });

  it('Buffer vacío en ventana → retorna {0, minRange}', () => {
    const wf: SM100Waveforms = {
      t:      new Float32Array(10),
      paw:    new Float32Array(10),
      pTrach: new Float32Array(10),
      flow:   new Float32Array(10),
      vol:    new Float32Array(10),
      ppl:    new Float32Array(10),
      pTP:    new Float32Array(10),
      length:   0,
      writeIdx: 0,
    };
    const { min, max } = autoscaleFromBuffer(wf, 'paw', 100, 200, 15);
    expect(min).toBe(0);
    expect(max).toBe(15);
  });
});
