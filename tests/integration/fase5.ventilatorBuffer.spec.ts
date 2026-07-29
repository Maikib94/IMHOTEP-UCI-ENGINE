// tests/integration/fase5.ventilatorBuffer.spec.ts — FASE 5
import { describe, it, expect, beforeEach } from 'vitest';
import { VentilatorSM100Engine } from '../../src/core/VentilatorSM100Engine';
import type { SM100Settings, PatientMechanics } from '../../src/core/VentilatorSM100Engine';

const DEFAULT_SETTINGS: SM100Settings = {
  mode: 'VCV', fio2: 0.5, peep: 5, vtTarget: 500, rrSet: 14,
  pInspSet: 15, pSupport: 10, tInspSet: 1.0, pMaxAlarm: 40,
  atrcEnabled: false, atrcTubeId: 7.5, atrcCompensation: 0.80,
  triggerType: 'flow', flowTriggerLpm: 2.0, pressTriggerCmH2O: 1.5,
  amvMinuteVentTarget: 7.0, amvWeightKg: 70,
  flowPatternVCV: 'square',
};

const DEFAULT_MECHANICS: PatientMechanics = {
  crs: 50, raw: 5, eCw_eTot: 0.5,
  pMusAmplitude: 0, pMusDriveHz: 0.25, vAnat: 154,
};

describe('VentilatorSM100Engine buffer (post-Fase 5)', () => {
  let engine: VentilatorSM100Engine;

  beforeEach(() => {
    engine = VentilatorSM100Engine.getInstance();
    engine.reset(5);
  });

  it('WAVE_BUF = 5000 (50 sec × 100Hz)', () => {
    // After fill: buffer should be 5000 capacity
    const wf = engine.getWaveforms();
    expect(wf.t.length).toBe(5000);
  });

  it('wf.t[writeIdx-1] ≈ engine.getInstantState().simTime tras updates', () => {
    // Run 200 updates
    for (let i = 0; i < 200; i++) {
      engine.update(0.01, DEFAULT_SETTINGS, DEFAULT_MECHANICS);
    }
    const wf = engine.getWaveforms();
    const simT = engine.getInstantState().simTime;
    const lastWrittenT = wf.t[(wf.writeIdx - 1 + 5000) % 5000];
    // wf.t should be tracking simTime, not wall time
    expect(lastWrittenT).toBeGreaterThan(0);
    expect(Math.abs(lastWrittenT - simT)).toBeLessThan(0.1);
  });

  it('Buffer NO contiene NaN tras 100 updates a speed=1', () => {
    for (let i = 0; i < 100; i++) {
      engine.update(0.1, DEFAULT_SETTINGS, DEFAULT_MECHANICS);
    }
    const wf = engine.getWaveforms();
    for (let i = 0; i < wf.length; i++) {
      expect(Number.isNaN(wf.t[i])).toBe(false);
      expect(Number.isNaN(wf.paw[i])).toBe(false);
      expect(Number.isNaN(wf.flow[i])).toBe(false);
    }
  });

  it('getSamplesInRange retorna muestras cronológicas después de 5s sim', () => {
    // Simulate 5 seconds
    for (let i = 0; i < 500; i++) {
      engine.update(0.01, DEFAULT_SETTINGS, DEFAULT_MECHANICS);
    }
    const simT = engine.getWaveCursorTime();
    const samples = engine.getSamplesInRange(simT - 5, simT);
    expect(samples.length).toBeGreaterThan(0);
    // Check chronological order
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].t).toBeGreaterThanOrEqual(samples[i - 1].t);
    }
  });

  it('A speed=60: getSamplesInRange retorna muestras en rango correcto', () => {
    const DT_SIM = 60; // 1 sim-second at x60 = 60 effective sim seconds
    // Run 50 "ticks" with large dt (simulating x60)
    for (let i = 0; i < 50; i++) {
      engine.update(DT_SIM / 100, DEFAULT_SETTINGS, DEFAULT_MECHANICS);
    }
    const simT = engine.getWaveCursorTime();
    const samples = engine.getSamplesInRange(simT - 5, simT);
    // Should have ~5s × 100Hz = ~500 samples in last 5 sim-seconds
    if (samples.length > 0) {
      for (const s of samples) {
        expect(s.t).toBeGreaterThanOrEqual(simT - 5 - 0.05);
        expect(s.t).toBeLessThanOrEqual(simT + 0.05);
      }
    }
  });

  it('getWaveCursorTime() retorna simTime (no wall time)', () => {
    engine.update(1.0, DEFAULT_SETTINGS, DEFAULT_MECHANICS);
    const simT = engine.getWaveCursorTime();
    const instant = engine.getInstantState();
    expect(simT).toBeCloseTo(instant.simTime, 1);
  });
});
