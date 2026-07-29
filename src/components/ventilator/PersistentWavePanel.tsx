// src/components/ventilator/PersistentWavePanel.tsx
// Three-channel ARM waveform panel: Paw / Flow / Volume.
// Mounts PersistentWaveCanvas × 3, each taking 1/3 of available height.

import React, { useRef, useEffect, useState, memo } from 'react';
import PersistentWaveCanvas from './PersistentWaveCanvas';
import type { WaveChannelConfig } from './PersistentWaveCanvas';

const CHANNELS: WaveChannelConfig[] = [
  { key: 'paw',  color: '#f5c518', label: 'PRESIÓN', unit: 'cmH₂O', minRange: 15,  hasZero: false },
  { key: 'flow', color: '#3ddc84', label: 'FLUJO',   unit: 'L/min',  minRange: 30,  hasZero: true  },
  { key: 'vol',  color: '#22d3ee', label: 'VOLUMEN', unit: 'mL',     minRange: 200, hasZero: false },
];

interface PersistentWavePanelProps {
  heights?: [number, number, number];
}

const PersistentWavePanel = memo(function PersistentWavePanel({
  heights,
}: PersistentWavePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [trackH, setTrackH] = useState(heights ? heights[0] : 88);

  useEffect(() => {
    if (heights) {
      setTrackH(heights[0]);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const h = Math.floor(entries[0].contentRect.height / 3);
      if (h > 0) setTrackH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [heights]);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
    >
      {CHANNELS.map((ch, i) => (
        <PersistentWaveCanvas
          key={ch.key}
          cfg={ch}
          height={heights ? heights[i] : trackH}
        />
      ))}
    </div>
  );
});

export { PersistentWavePanel };
export default PersistentWavePanel;
