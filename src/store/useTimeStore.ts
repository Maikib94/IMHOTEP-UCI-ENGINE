import { create } from 'zustand';

interface TimeState {
  ticks:            number;
  simulatedElapsed: number;
  isRunning:        boolean;
  speedMultiplier:  number;

  // Métodos que usa MonitorApp.tsx
  start:         () => void;
  pause:         () => void;
  stop:          () => void;
  setRunning:    (v: boolean) => void;
  setSpeed:      (v: number)  => void;
  incrementTick: () => void;
  advanceTick:   (dt: number) => void;
  reset:         () => void;
}

export const useTimeStore = create<TimeState>((set) => ({
  ticks:            0,
  simulatedElapsed: 0,
  isRunning:        false,
  speedMultiplier:  1,

  start:  () => set({ isRunning: true }),
  pause:  () => set({ isRunning: false }),
  stop:   () => set({ isRunning: false }),

  setRunning: (v) => set({ isRunning: v }),
  setSpeed:   (v) => set({ speedMultiplier: v }),

  incrementTick: () =>
    set((s) => ({
      ticks:            s.ticks + 1,
      simulatedElapsed: s.simulatedElapsed + 1,
    })),

  advanceTick: (dt) =>
    set((s) => ({
      ticks:            s.ticks + 1,
      simulatedElapsed: s.simulatedElapsed + dt,
    })),

  reset: () => set({ ticks: 0, simulatedElapsed: 0 }),
}));