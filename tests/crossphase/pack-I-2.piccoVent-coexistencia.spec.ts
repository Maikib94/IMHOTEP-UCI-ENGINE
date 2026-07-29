// tests/crossphase/pack-I-2.piccoVent-coexistencia.spec.ts
// PACK-I-2: PiCCO + Ventilador coexisten sin interferencia
import { describe, it, expect } from 'vitest';
import { useMonitoringStore } from '../../src/store/useMonitoringStore';
import { usePatientStore }    from '../../src/store/usePatientStore';
import { PiCCOActions }       from '../../src/store/usePiCCOStore';
import { VentilatorSM100Engine } from '../../src/core/VentilatorSM100Engine';
import type { SM100Settings, PatientMechanics } from '../../src/core/VentilatorSM100Engine';
import { applySepsisSdra }    from '../fixtures/clinicalCases';
import { advanceSimSeconds }  from '../helpers/timeAdvance';

const VENT_SETTINGS: SM100Settings = {
  mode: 'VCV', fio2: 0.6, peep: 8, vtTarget: 420, rrSet: 20,
  pInspSet: 20, pSupport: 10, tInspSet: 0.9, pMaxAlarm: 35,
  atrcEnabled: false, atrcTubeId: 7.5, atrcCompensation: 0.80,
  triggerType: 'flow', flowTriggerLpm: 2.0, pressTriggerCmH2O: 1.5,
  amvMinuteVentTarget: 8.0, amvWeightKg: 70, flowPatternVCV: 'square',
};

const ARDS_MECHANICS: PatientMechanics = {
  crs: 28, raw: 8, eCw_eTot: 0.5,
  pMusAmplitude: 0, pMusDriveHz: 0, vAnat: 154,
};

describe('PACK-I-2: PiCCO + Ventilador coexistencia', () => {
  it('✓ PiCCO snapshot populates correctly while ventilator runs', () => {
    applySepsisSdra();
    usePatientStore.getState().setProcedure('arterialLine', true);

    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();

    const snap = useMonitoringStore.getState().piccoSnapshot;
    expect(snap).not.toBeNull();
    expect(Number.isFinite(snap!.ci)).toBe(true);
  });

  it('✓ Ventilator wf buffer has valid samples after 10s sim', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);

    const engine = VentilatorSM100Engine.getInstance();
    engine.reset(8);

    for (let i = 0; i < 100; i++) {
      engine.update(0.1, VENT_SETTINGS, ARDS_MECHANICS);
    }

    const wf = engine.getWaveforms();
    expect(wf.length).toBeGreaterThan(50);

    for (let i = 0; i < Math.min(wf.length, 200); i++) {
      const idx = (wf.writeIdx - 1 - i + 5000) % 5000;
      expect(Number.isNaN(wf.paw[idx])).toBe(false);
      expect(Number.isNaN(wf.flow[idx])).toBe(false);
    }
  });

  it('✓ PiCCO thermodilution does not corrupt ventilator buffer', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);
    useMonitoringStore.getState().setInvasiveMode('picco');

    const engine = VentilatorSM100Engine.getInstance();
    engine.reset(8);

    // Run some ventilator steps
    for (let i = 0; i < 50; i++) {
      engine.update(0.1, VENT_SETTINGS, ARDS_MECHANICS);
    }

    const lenBefore = engine.getWaveforms().length;

    // Perform thermodilution
    useMonitoringStore.getState().performThermodilution();

    // Run more ventilator steps
    for (let i = 0; i < 50; i++) {
      engine.update(0.1, VENT_SETTINGS, ARDS_MECHANICS);
    }

    const lenAfter = engine.getWaveforms().length;
    expect(lenAfter).toBeGreaterThanOrEqual(lenBefore); // buffer still growing
  });

  it('✓ Vitals remain finite after combined PiCCO + ARM advance', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();

    advanceSimSeconds(10, 0.5);

    const v = usePatientStore.getState().vitals;
    expect(Number.isFinite(v.heartRate)).toBe(true);
    expect(Number.isFinite(v.meanArterialPressure)).toBe(true);
    expect(Number.isFinite(v.cardiacOutput)).toBe(true);
  });
});
