// tests/integration/fase3.ecmoStore.spec.ts — FASE 3
import { describe, it, expect } from 'vitest';
import { useECMOStore } from '../../src/store/useECMOStore';
import { usePatientStore } from '../../src/store/usePatientStore';
import { applySepsisSdra } from '../fixtures/clinicalCases';
import { advanceSimSeconds } from '../helpers/timeAdvance';

describe('useECMOStore', () => {
  it('setActive(true) marks ecmo.active=true', () => {
    useECMOStore.getState().setActive(true);
    expect(useECMOStore.getState().active).toBe(true);
  });

  it('setActive(false) deactivates ECMO', () => {
    useECMOStore.getState().setActive(true);
    useECMOStore.getState().setActive(false);
    expect(useECMOStore.getState().active).toBe(false);
  });

  it('configure() merges settings without losing other fields', () => {
    useECMOStore.getState().configure({ bloodFlowLmin: 5.5 });
    const state = useECMOStore.getState();
    expect(state.bloodFlowLmin).toBe(5.5);
    expect(state.sweepFlowLmin).toBeGreaterThan(0); // other fields preserved
  });

  it('resetECMO() clears active=false', () => {
    useECMOStore.getState().setActive(true);
    useECMOStore.getState().resetECMO();
    expect(useECMOStore.getState().active).toBe(false);
  });
});

describe('RespiratoryEngine + ECMO VV contribution', () => {
  it('ECMO VV with FiO2=1.0 improves PaO2 after 30s sim', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);
    const initialPaO2 = usePatientStore.getState().vitals.paO2;

    useECMOStore.getState().setActive(true);
    useECMOStore.getState().configure({
      mode: 'vv',
      bloodFlowLmin: 4,
      sweepFlowLmin: 4,
      membraneFiO2: 1.0,
      outputSaO2: 0.99,
    });

    advanceSimSeconds(30, 0.5);

    const finalPaO2 = usePatientStore.getState().vitals.paO2;
    expect(finalPaO2).toBeGreaterThan(initialPaO2);
  });

  it('Deactivating ECMO stops O2 contribution', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);

    useECMOStore.getState().setActive(true);
    useECMOStore.getState().configure({
      mode: 'vv', bloodFlowLmin: 4, sweepFlowLmin: 4,
      membraneFiO2: 1.0, outputSaO2: 0.99,
    });
    advanceSimSeconds(30, 0.5);

    useECMOStore.getState().setActive(false);
    const paO2AfterOff = usePatientStore.getState().vitals.paO2;

    advanceSimSeconds(30, 0.5);
    const paO2Later = usePatientStore.getState().vitals.paO2;
    // PaO2 should not climb further without ECMO
    expect(paO2Later).toBeLessThanOrEqual(paO2AfterOff + 20);
  });
});
