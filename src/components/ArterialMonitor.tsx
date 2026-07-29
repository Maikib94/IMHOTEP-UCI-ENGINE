// src/components/ArterialMonitor.tsx
//
// Gate condicional: curva ART continua si hay línea arterial activa (art_cvp o picco),
// NIBP cíclico si monitoreo no-invasivo.

import React from 'react';
import { useMonitoringStore } from '../store/useMonitoringStore';
import { ArterialWaveform } from './ArterialWaveform';
import { NIBPDisplay } from './NIBPDisplay';

interface ArterialMonitorProps {
  height?: number;
  nibpIntervalMin?: number;
}

export const ArterialMonitor: React.FC<ArterialMonitorProps> = ({
  height = 80,
  nibpIntervalMin = 5,
}) => {
  const invasive = useMonitoringStore(s => s.invasiveMonitoringActive);

  if (!invasive) {
    return <NIBPDisplay intervalMin={nibpIntervalMin} />;
  }

  return <ArterialWaveform height={height} />;
};
