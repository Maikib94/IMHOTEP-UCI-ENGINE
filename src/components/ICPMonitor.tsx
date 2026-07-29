// src/components/ICPMonitor.tsx
//
// Triple gate ESTRICTO para curva PIC:
//   1. category === 'neuro' (no renders en burn, sepsis, etc.)
//   2. scenario.icpCatheterRequired === true (indicación clínica)
//   3. icpCatheterPlaced === true (catéter físicamente colocado por usuario)
//
// Refs:
//   Hawryluk GWJ et al. ICM 2022;48(6):649-66. DOI:10.1007/s00134-022-06676-3
//   Robba C et al. Lancet Neurol 2021 (SYNAPSE-ICU)
//   Ziółkowski 2023 Front Physiol; de Moraes 2022 Neurocrit Care

import React from 'react';
import { useScenarioStore }  from '../store/useScenarioStore';
import { useMonitoringStore } from '../store/useMonitoringStore';
import { ICPWaveform }       from './ICPWaveform';

interface ICPMonitorProps {
  height?: number;
}

export const ICPMonitor: React.FC<ICPMonitorProps> = ({ height = 80 }) => {
  const cat          = useScenarioStore(s => s.activeScenario?.category);
  const hieIndicated = useScenarioStore(s => s.activeScenario?.icpCatheterRequired ?? false);
  const placed       = useMonitoringStore(s => s.icpCatheterPlaced);

  // Gate 1: solo categoría neuro
  if (cat !== 'neuro') return null;
  // Gate 2: la narrativa del escenario indica HIE que justifica catéter PIC
  if (!hieIndicated) return null;
  // Gate 3: catéter colocado por el usuario (acción explícita)
  if (!placed) return null;

  return <ICPWaveform height={height} />;
};
