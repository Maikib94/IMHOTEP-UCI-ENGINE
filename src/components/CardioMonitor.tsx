// src/components/CardioMonitor.tsx
//
// Muestra NIBP cíclico cuando invasiveMode='none' o curva ART continua
// cuando invasiveMode = 'art_cvp' | 'picco'.
//
// NIBP: snapshot cada 5 min sim (automático), sin canvas.
// ART:  waveform continua via ArterialMonitor → ArterialWaveform.

import React from 'react';
import { useMonitoringStore } from '../store/useMonitoringStore';
import { ArterialMonitor }    from './ArterialMonitor';
import { NIBPDisplay }        from './NIBPDisplay';

export const CardioMonitor: React.FC = () => {
  const mode = useMonitoringStore(s => s.invasiveMode);

  if (mode === 'none') {
    return <NIBPDisplay intervalMin={5} />;
  }

  return <ArterialMonitor />;
};
