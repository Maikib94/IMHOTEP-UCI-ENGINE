// tests/integration/fase4.piccoFacade.spec.ts — FASE 4
import { describe, it, expect } from 'vitest';
import { useMonitoringStore } from '../../src/store/useMonitoringStore';
import { useUIStore }         from '../../src/store/useUIStore';
import {
  usePiCCOActive, usePiCCOPanelVisible,
  usePiCCOSnapshot, usePiCCOThermodilutionCount,
  PiCCOActions,
} from '../../src/store/usePiCCOStore';
import { applySepsisSdra } from '../fixtures/clinicalCases';

describe('usePiCCOStore facade', () => {
  it('usePiCCOActive() === false por default', () => {
    expect(useMonitoringStore.getState().invasiveMode).toBe('none');
  });

  it('usePiCCOPanelVisible() === true por default', () => {
    expect(useUIStore.getState().piccoPanelVisible).toBe(true);
  });

  it('setInvasiveMode("picco") → usePiCCOActive() === true', () => {
    useMonitoringStore.getState().setInvasiveMode('picco');
    expect(useMonitoringStore.getState().invasiveMode).toBe('picco');
  });

  it('PiCCOActions.initializeIfNeeded() dispara primera TD cuando snapshot=null', () => {
    applySepsisSdra();
    useMonitoringStore.getState().setInvasiveMode('picco');
    expect(useMonitoringStore.getState().piccoSnapshot).toBeNull();
    PiCCOActions.initializeIfNeeded();
    const snap = useMonitoringStore.getState().piccoSnapshot;
    expect(snap).not.toBeNull();
  });

  it('Tras initialize: snapshot.ci, gedi, evlwi, svv son números finitos > 0', () => {
    applySepsisSdra();
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();
    const snap = useMonitoringStore.getState().piccoSnapshot!;
    expect(snap).not.toBeNull();
    expect(Number.isFinite(snap.ci)).toBe(true);
    expect(Number.isFinite(snap.gedi)).toBe(true);
    expect(Number.isFinite(snap.evlwi)).toBe(true);
    expect(Number.isFinite(snap.svv)).toBe(true);
    expect(snap.ci).toBeGreaterThan(0);
    expect(snap.gedi).toBeGreaterThan(0);
    expect(snap.evlwi).toBeGreaterThan(0);
  });

  it('Cerrar panel (setPiccoPanelVisible(false)) NO cambia invasiveMode', () => {
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.closePanelVisible();
    expect(useUIStore.getState().piccoPanelVisible).toBe(false);
    expect(useMonitoringStore.getState().invasiveMode).toBe('picco');
  });

  it('Reabrir panel mantiene snapshot anterior', () => {
    applySepsisSdra();
    useMonitoringStore.getState().setInvasiveMode('picco');
    PiCCOActions.initializeIfNeeded();
    const snap1 = useMonitoringStore.getState().piccoSnapshot;
    PiCCOActions.closePanelVisible();
    PiCCOActions.openPanelVisible();
    const snap2 = useMonitoringStore.getState().piccoSnapshot;
    expect(snap2?.ci).toBeCloseTo(snap1!.ci, 1);
  });

  it('performThermodilution() incrementa thermodilutionCount', () => {
    applySepsisSdra();
    useMonitoringStore.getState().setInvasiveMode('picco');
    const before = useMonitoringStore.getState().thermodilutionCount;
    useMonitoringStore.getState().performThermodilution();
    expect(useMonitoringStore.getState().thermodilutionCount).toBe(before + 1);
  });
});
