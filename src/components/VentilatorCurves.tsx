// src/components/VentilatorCurves.tsx
// Shim → PersistentWavePanel (FASE 5 canonical renderer).
import React, { memo } from 'react';
import PersistentWavePanel from './ventilator/PersistentWavePanel';

interface VentilatorCurvesProps {
  heights?: [number, number, number];
}

const VentilatorCurves = memo(function VentilatorCurves({
  heights = [88, 88, 88],
}: VentilatorCurvesProps) {
  return <PersistentWavePanel heights={heights} />;
});

export default VentilatorCurves;
