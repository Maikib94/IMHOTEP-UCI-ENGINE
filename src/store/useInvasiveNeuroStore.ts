// src/store/useInvasiveNeuroStore.ts
// Gate de monitorización neurológica invasiva (catéter PIC)

import { create } from 'zustand';

export type IcpCatheterType = 'parenchymal' | 'intraventricular';

interface InvasiveNeuroState {
  icpCatheterPlaced: boolean;
  catheterType: IcpCatheterType | null;
  placementTick: number | null;

  placeCatheter: (type: IcpCatheterType) => void;
  removeCatheter: () => void;
}

export const useInvasiveNeuroStore = create<InvasiveNeuroState>((set) => ({
  icpCatheterPlaced: false,
  catheterType: null,
  placementTick: null,

  placeCatheter: (type) => set({
    icpCatheterPlaced: true,
    catheterType: type,
    placementTick: Date.now(),
  }),

  removeCatheter: () => set({
    icpCatheterPlaced: false,
    catheterType: null,
    placementTick: null,
  }),
}));
