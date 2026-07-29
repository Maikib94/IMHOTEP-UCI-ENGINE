// src/components/ThermodilutionAlarm.tsx
//
// Alarma visual + sonora cuando PiCCO lleva > 8h sim sin recalibrar.
// Ref: Huber BMC Anesthesiol 2015 — PE > 30% tras 8h sin termodilución.
//      Hamzaoui CCM 2008 — recalibrar cada 1-2h en inestables.
//
// Audio: Web Audio API puro (sin archivos ni libs externas).

import React, { useEffect } from 'react';
import { useMonitoringStore } from '../store/useMonitoringStore';

export const ThermodilutionAlarm: React.FC = () => {
  const active = useMonitoringStore(s => s.thermodilutionAlarmActive);
  const ack    = useMonitoringStore(s => s.acknowledgeThermodilutionAlarm);
  const start  = useMonitoringStore(s => s.startThermodilution);

  useEffect(() => {
    if (!active) return;

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    let cancelled = false;

    function beep() {
      if (cancelled || ctx.state === 'closed') return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;  // A5
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15,   ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.30);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    }

    const iv = setInterval(beep, 4000);
    beep();

    return () => {
      cancelled = true;
      clearInterval(iv);
      ctx.close();
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-72 bg-red-600/95 border-2 border-red-400 rounded-lg p-4 shadow-2xl animate-pulse">
      <div className="text-white font-black text-sm tracking-wider">
        ⚠ PiCCO: REALIZAR TERMODILUCIÓN
      </div>
      <div className="text-red-100 text-xs mt-1 leading-relaxed">
        Última calibración hace &gt; 8 h sim. Valores pulse-contour
        pueden tener error &gt; 30 % (Huber 2015).
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => start()}
          className="px-3 py-1.5 bg-white text-red-700 rounded font-bold text-xs cursor-pointer hover:bg-red-50 transition-colors"
        >
          ◉ TERMODILUCIÓN AHORA
        </button>
        <button
          type="button"
          onClick={ack}
          className="px-3 py-1.5 bg-red-800 text-white rounded text-xs cursor-pointer hover:bg-red-900 transition-colors"
        >
          Posponer
        </button>
      </div>
    </div>
  );
};
