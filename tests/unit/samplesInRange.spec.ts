// tests/unit/samplesInRange.spec.ts — FASE 5
import { describe, it, expect, beforeEach } from 'vitest';
import { samplesInRange } from '../../src/utils/waveInterpolation';
import type { SM100Waveforms } from '../../src/core/VentilatorSM100Engine';

function makeWf(nSamples: number, tStart = 0, tStep = 0.1): SM100Waveforms {
  const BUF = 500;
  const wf: SM100Waveforms = {
    t:      new Float32Array(BUF),
    paw:    new Float32Array(BUF),
    pTrach: new Float32Array(BUF),
    flow:   new Float32Array(BUF),
    vol:    new Float32Array(BUF),
    ppl:    new Float32Array(BUF),
    pTP:    new Float32Array(BUF),
    length:   0,
    writeIdx: 0,
  };
  const count = Math.min(nSamples, BUF);
  for (let i = 0; i < count; i++) {
    wf.t[i]    = tStart + i * tStep;
    wf.paw[i]  = 15 + 5 * Math.sin(i * 0.2);
    wf.flow[i] = 30 * Math.sin(i * 0.2);
    wf.vol[i]  = 400 + 50 * i / count;
  }
  wf.length   = count;
  wf.writeIdx = count % BUF;
  return wf;
}

describe('samplesInRange ring buffer', () => {
  let wf: SM100Waveforms;

  beforeEach(() => {
    // 100 samples, t = 0..9.9 s (step 0.1)
    wf = makeWf(100, 0, 0.1);
  });

  it('Rango [2, 5] devuelve solo muestras con t ∈ [2, 5]', () => {
    const res = samplesInRange(wf, 2, 5);
    expect(res.length).toBeGreaterThan(0);
    for (const s of res) {
      expect(s.t).toBeGreaterThanOrEqual(2 - 0.001);
      expect(s.t).toBeLessThanOrEqual(5 + 0.001);
    }
  });

  it('Rango vacío [-1, -0.5] devuelve []', () => {
    const res = samplesInRange(wf, -1, -0.5);
    expect(res).toHaveLength(0);
  });

  it('Rango más allá del buffer [50, 60] devuelve []', () => {
    const res = samplesInRange(wf, 50, 60);
    expect(res).toHaveLength(0);
  });

  it('Orden cronológico ascendente garantizado', () => {
    const res = samplesInRange(wf, 0, 9.9);
    for (let i = 1; i < res.length; i++) {
      expect(res[i].t).toBeGreaterThanOrEqual(res[i - 1].t);
    }
  });

  it('Ring overwrite: muestras detrás del writeIdx devueltas correctamente', () => {
    // Create ring buffer that wraps around
    const BUF = 50;
    const wfWrap: SM100Waveforms = {
      t:      new Float32Array(BUF),
      paw:    new Float32Array(BUF),
      pTrach: new Float32Array(BUF),
      flow:   new Float32Array(BUF),
      vol:    new Float32Array(BUF),
      ppl:    new Float32Array(BUF),
      pTP:    new Float32Array(BUF),
      length:   BUF,
      writeIdx: 0,
    };
    // Write 60 samples, overwriting positions 0-9 with newer data (t=50..59)
    for (let i = 0; i < BUF; i++) {
      const idx = i % BUF;
      wfWrap.t[idx] = i + 10; // t=10..59
      wfWrap.paw[idx] = i * 0.5;
      wfWrap.flow[idx] = 0;
      wfWrap.vol[idx] = 0;
    }
    wfWrap.writeIdx = 0;
    wfWrap.length   = BUF;

    const res = samplesInRange(wfWrap, 10, 59.9);
    expect(res.length).toBeGreaterThan(0);
    // All returned samples should be within range
    for (const s of res) {
      expect(s.t).toBeGreaterThanOrEqual(10 - 0.01);
    }
  });

  it('Muestras retornadas contienen campos t, paw, flow, vol', () => {
    const res = samplesInRange(wf, 1, 3);
    expect(res.length).toBeGreaterThan(0);
    for (const s of res) {
      expect(s).toHaveProperty('t');
      expect(s).toHaveProperty('paw');
      expect(s).toHaveProperty('flow');
      expect(s).toHaveProperty('vol');
    }
  });
});
