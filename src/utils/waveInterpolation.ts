// src/utils/waveInterpolation.ts
// Pure helpers for ventilator waveform rendering.
// No React, no Zustand — fully unit-testable.

import type { SM100Waveforms } from '../core/VentilatorSM100Engine';

export function lerp(a: number, b: number, frac: number): number {
  return a + (b - a) * frac;
}

/**
 * Extract samples from the ring buffer in time range [t0, t1] (simTime).
 * Returns array sorted chronologically.
 */
export function samplesInRange(
  wf: SM100Waveforms,
  t0: number,
  t1: number,
): Array<{ t: number; paw: number; flow: number; vol: number }> {
  const result: Array<{ t: number; paw: number; flow: number; vol: number }> = [];
  const len = wf.length;
  if (len === 0) return result;
  const bufLen = wf.t.length;
  const wi     = wf.writeIdx;
  for (let k = 0; k < len; k++) {
    const idx     = (wi - 1 - k + bufLen) % bufLen;
    const tSample = wf.t[idx];
    if (tSample < t0) break;
    if (tSample <= t1) {
      result.push({
        t:    tSample,
        paw:  wf.paw[idx],
        flow: wf.flow[idx],
        vol:  wf.vol[idx],
      });
    }
  }
  result.reverse();
  return result;
}

/**
 * Compute autoscale range for a channel over the visible window.
 * Applies 12% padding and ensures minimum range.
 */
export function autoscaleFromBuffer(
  wf: SM100Waveforms,
  channel: 'paw' | 'flow' | 'vol',
  t0: number,
  t1: number,
  minRange: number,
): { min: number; max: number } {
  const buf    = wf[channel] as Float32Array;
  const bufLen = buf.length;
  const wi     = wf.writeIdx;
  const len    = wf.length;
  let mn = +Infinity, mx = -Infinity;
  for (let k = 0; k < len; k++) {
    const idx = (wi - 1 - k + bufLen) % bufLen;
    const t   = wf.t[idx];
    if (t < t0) break;
    if (t > t1) continue;
    const v = buf[idx];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!isFinite(mn) || !isFinite(mx)) return { min: 0, max: minRange };
  const range  = Math.max(minRange, mx - mn);
  const pad    = range * 0.12;
  const center = (mn + mx) / 2;
  const half   = (range + 2 * pad) / 2;
  return { min: center - half, max: center + half };
}
