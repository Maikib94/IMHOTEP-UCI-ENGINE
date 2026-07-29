// src/store/usePiCCOStore.ts
// Fachada delgada — selectores + acciones que leen desde useMonitoringStore y useUIStore.
// No crea un nuevo store Zustand. Fuente única de verdad intacta.
//
// Refs: Bendjelid 2013; Monnet 2017; Huber 2015.

import { useMonitoringStore } from './useMonitoringStore';
import { useUIStore }         from './useUIStore';
import type { PiCCOSnapshot } from './useMonitoringStore';

// Re-exportar el tipo para que los consumidores no importen de useMonitoringStore
export type { PiCCOSnapshot };

// ─── Hooks selectores ─────────────────────────────────────────────────────────

export function usePiCCOSnapshot(): PiCCOSnapshot | null {
  return useMonitoringStore(s => s.piccoSnapshot);
}

export function usePiCCOActive(): boolean {
  return useMonitoringStore(s => s.invasiveMode === 'picco');
}

export function usePiCCORecalibrationAlarm(): boolean {
  return useMonitoringStore(s => s.thermodilutionAlarmActive);
}

export function usePiCCOThermodilutionCount(): number {
  return useMonitoringStore(s => s.thermodilutionCount);
}

export function usePiCCOPanelVisible(): boolean {
  return useUIStore(s => s.piccoPanelVisible);
}

export function usePiCCOLastTDTick(): number | null {
  return useMonitoringStore(s => s.lastThermodilutionTick);
}

// ─── Hook compuesto — TODO lo que el panel necesita ───────────────────────────

export function usePiCCOPanel() {
  const active      = usePiCCOActive();
  const visible     = usePiCCOPanelVisible();
  const snapshot    = usePiCCOSnapshot();
  const alarmActive = usePiCCORecalibrationAlarm();
  const tdCount     = usePiCCOThermodilutionCount();
  const lastTDTick  = usePiCCOLastTDTick();
  return { active, visible, snapshot, alarmActive, tdCount, lastTDTick };
}

// ─── Acciones (no son hooks) ──────────────────────────────────────────────────

export const PiCCOActions = {
  requestRecalibration(): PiCCOSnapshot {
    return useMonitoringStore.getState().performThermodilution();
  },

  closePanelVisible(): void {
    useUIStore.getState().setPiccoPanelVisible(false);
  },

  openPanelVisible(): void {
    useUIStore.getState().setPiccoPanelVisible(true);
  },

  initializeIfNeeded(): void {
    const m = useMonitoringStore.getState();
    if (m.invasiveMode === 'picco' && m.piccoSnapshot === null) {
      m.performThermodilution();
    }
  },
};
