// tests/crossphase/pack-I-4.speedX60-stress.spec.ts
// PACK-I-4: Stress test x60 con todos los módulos activos
import { describe, it, expect } from 'vitest';
import { useTimeStore }          from '../../src/store/useTimeStore';
import { usePatientStore }       from '../../src/store/usePatientStore';
import { usePathologyStore }     from '../../src/store/usePathologyStore';
import { useMonitoringStore }    from '../../src/store/useMonitoringStore';
import { useECMOStore }          from '../../src/store/useECMOStore';
import { useCRRTStore }          from '../../src/store/useCRRTStore';
import { usePharmacologyStore }  from '../../src/store/usePharmacologyStore';
import { VentilatorSM100Engine } from '../../src/core/VentilatorSM100Engine';
import { PiCCOActions }          from '../../src/store/usePiCCOStore';
import { applySepsisSdra }       from '../fixtures/clinicalCases';
import { advanceSimSeconds }     from '../helpers/timeAdvance';
import type { SM100Settings, PatientMechanics } from '../../src/core/VentilatorSM100Engine';

const SETTINGS: SM100Settings = {
  mode: 'VCV', fio2: 0.6, peep: 8, vtTarget: 420, rrSet: 20,
  pInspSet: 20, pSupport: 10, tInspSet: 0.9, pMaxAlarm: 35,
  atrcEnabled: false, atrcTubeId: 7.5, atrcCompensation: 0.80,
  triggerType: 'flow', flowTriggerLpm: 2.0, pressTriggerCmH2O: 1.5,
  amvMinuteVentTarget: 8.0, amvWeightKg: 70, flowPatternVCV: 'square',
};
const MECHANICS: PatientMechanics = {
  crs: 28, raw: 8, eCw_eTot: 0.5,
  pMusAmplitude: 0, pMusDriveHz: 0, vAnat: 154,
};

describe('PACK-I-4: Stress test x60 todos módulos activos', () => {
  it('✓ Vitals remain finite after 600s sim with all modules', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);
    usePatientStore.getState().setProcedure('arterialLine', true);
    usePatientStore.getState().setProcedure('picMonitor', true);

    // Activate all extracorporeal modules
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();

    useECMOStore.getState().setActive(true);
    useECMOStore.getState().configure({
      mode: 'vv', bloodFlowLmin: 3, sweepFlowLmin: 3,
      membraneFiO2: 0.6, outputSaO2: 0.97,
    });

    useCRRTStore.getState().setActive(true);
    useCRRTStore.getState().configure({ dose_mLkgh: 25, mode: 'CVVHDF' });

    usePharmacologyStore.getState().setInfusionRate('noradrenaline', 0.3);

    // Pump ventilator
    const vent = VentilatorSM100Engine.getInstance();
    vent.reset(8);

    // Advance 600 sim-seconds (10 min) in large dt steps for speed
    advanceSimSeconds(600, 5);

    // Simultaneously run ventilator steps
    for (let i = 0; i < 60; i++) {
      vent.update(10, SETTINGS, MECHANICS);
    }

    const v = usePatientStore.getState().vitals;
    expect(Number.isFinite(v.heartRate)).toBe(true);
    expect(Number.isFinite(v.meanArterialPressure)).toBe(true);
    expect(Number.isFinite(v.spo2)).toBe(true);
    expect(Number.isFinite(v.paO2)).toBe(true);
    expect(Number.isFinite(v.paCO2)).toBe(true);
    expect(Number.isNaN(v.heartRate)).toBe(false);
    expect(Number.isNaN(v.meanArterialPressure)).toBe(false);
  });

  it('✓ Ventilator wf buffer is not empty after stress', () => {
    const vent = VentilatorSM100Engine.getInstance();
    vent.reset(5);
    for (let i = 0; i < 200; i++) {
      vent.update(1, SETTINGS, MECHANICS);
    }
    expect(vent.getWaveforms().length).toBeGreaterThan(100);
  });

  it('✓ No NaN samples in wf buffer after stress', () => {
    const vent = VentilatorSM100Engine.getInstance();
    vent.reset(5);
    for (let i = 0; i < 100; i++) {
      vent.update(1, SETTINGS, MECHANICS);
    }
    const wf = vent.getWaveforms();
    for (let k = 0; k < Math.min(wf.length, 500); k++) {
      const idx = (wf.writeIdx - 1 - k + 5000) % 5000;
      expect(Number.isNaN(wf.paw[idx])).toBe(false);
    }
  });

  it('✓ caseCategory stays infecto after stress', () => {
    applySepsisSdra();
    advanceSimSeconds(300, 5);
    expect(usePathologyStore.getState().caseCategory).toBe('infecto');
  });

  it('✓ PiCCO snapshot.ci is finite after stress', () => {
    applySepsisSdra();
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();
    advanceSimSeconds(60, 2);
    const snap = useMonitoringStore.getState().piccoSnapshot;
    expect(snap).not.toBeNull();
    expect(Number.isFinite(snap!.ci)).toBe(true);
    expect(snap!.ci).toBeGreaterThan(0.1);
    expect(snap!.ci).toBeLessThan(20);
  });
});
