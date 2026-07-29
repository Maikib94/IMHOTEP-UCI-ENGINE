// tests/crossphase/pack-I-1.neuroCase-cascada.spec.ts
// PACK-I-1: Selección de caso Neuro dispara cascada Fase 2 → 3 → 6
import { describe, it, expect, vi } from 'vitest';
import { usePathologyStore } from '../../src/store/usePathologyStore';
import { usePatientStore }   from '../../src/store/usePatientStore';
import { normalizeCategory } from '../../src/types/ClinicalCategory';
import { ImagingEngine, useImagingStore } from '../../src/core/ImagingEngine';
import { applyTCEGrave }     from '../fixtures/clinicalCases';
import { advanceSimSeconds } from '../helpers/timeAdvance';

describe('PACK-I-1: Neuro case cascada Fase 2/3/6', () => {
  it('✓ caseCategory=neuro after applying neuro fixture', () => {
    applyTCEGrave();
    expect(usePathologyStore.getState().caseCategory).toBe('neuro');
  });

  it('✓ procedures.picMonitor=true in neuro case', () => {
    applyTCEGrave();
    expect(usePatientStore.getState().procedures.picMonitor).toBe(true);
  });

  it('✓ normalizeCategory("neuro") → "neuro" (for applyScenario sync)', () => {
    expect(normalizeCategory('neuro')).toBe('neuro');
  });

  it('✓ ImagingEngine: ct_brain order resolves with finding', async () => {
    vi.useFakeTimers();
    applyTCEGrave();
    const engine = ImagingEngine.getInstance();
    engine.reset();
    const promise = engine.requestStudy('ct_brain');
    await vi.advanceTimersByTimeAsync(35_000);
    const finding = await promise;
    expect(finding).toBeDefined();
    expect(finding.description).toBeTruthy();
    vi.useRealTimers();
  });

  it('✓ Vitals remain physiologically plausible after 2s sim with neuro fixture', () => {
    applyTCEGrave();
    usePatientStore.getState().setVentilatorConnected(true);
    advanceSimSeconds(2, 0.5);

    const v = usePatientStore.getState().vitals;
    expect(Number.isFinite(v.heartRate)).toBe(true);
    expect(Number.isFinite(v.meanArterialPressure)).toBe(true);
    expect(v.gcs).toBeGreaterThanOrEqual(3);
  });

  it('✓ caseCategory persists after engine ticks', () => {
    applyTCEGrave();
    advanceSimSeconds(5, 1);
    expect(usePathologyStore.getState().caseCategory).toBe('neuro');
  });
});
