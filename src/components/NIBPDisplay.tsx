// src/components/NIBPDisplay.tsx
//
// Muestra la última medición NIBP (SYS/DIA/MAP) tomada cada N minutos sim.
// NO renderiza canvas ni curva — solo números con timestamp del último cuff.
// Utilizado por ArterialMonitor cuando invasiveMonitoringActive === false.

import React, { useEffect, useRef, useState } from 'react';
import { usePatientStore } from '../store/usePatientStore';
import { useTimeStore } from '../store/useTimeStore';

const MONO = "[font-family:'JetBrains_Mono',monospace]";

interface NIBPSnapshot {
  sys: number;
  dia: number;
  map: number;
  tickAt: number;
}

interface NIBPDisplayProps {
  intervalMin?: number;  // minutos sim entre mediciones (default 5)
}

export const NIBPDisplay: React.FC<NIBPDisplayProps> = ({ intervalMin = 5 }) => {
  const intervalS = intervalMin * 60;
  const [snap, setSnap] = useState<NIBPSnapshot | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const nextTickRef = useRef<number>(0);

  useEffect(() => {
    const iv = setInterval(() => {
      const ticks = useTimeStore.getState().ticks;
      const v     = usePatientStore.getState().vitals;

      if (snap === null || ticks >= nextTickRef.current) {
        // Simular inflado del manguito: parpadeo 1.5s
        setMeasuring(true);
        setTimeout(() => {
          setMeasuring(false);
          setSnap({
            sys:    Math.round(v.systolicBP  || 120),
            dia:    Math.round(v.diastolicBP || 80),
            map:    Math.round(v.meanArterialPressure || 93),
            tickAt: ticks,
          });
        }, 1500);
        nextTickRef.current = ticks + intervalS;
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [intervalS, snap]);

  const ticks = useTimeStore(s => s.ticks);
  const ageSec = snap ? ticks - snap.tickAt : null;
  const ageLabel = ageSec !== null
    ? ageSec < 60  ? `${Math.round(ageSec)}s`
    : ageSec < 3600 ? `${Math.floor(ageSec / 60)}min`
    : `${(ageSec / 3600).toFixed(1)}h`
    : null;

  const sysColor = !snap ? '#475569'
    : snap.sys < 90  ? '#f87171'
    : snap.sys > 160 ? '#fbbf24'
    : '#e2e8f0';

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#060e1a] rounded-lg border border-white/5 px-3 py-2 gap-1">
      <div className="text-[0.45rem] font-black tracking-widest text-slate-500 uppercase">NIBP</div>

      {measuring && (
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[0.5rem] text-amber-400 font-mono">Midiendo…</span>
        </div>
      )}

      {!measuring && snap && (
        <>
          <div className={`flex items-baseline gap-0.5 ${MONO}`}>
            <span className="text-2xl font-black leading-none" style={{ color: sysColor }}>{snap.sys}</span>
            <span className="text-base font-light opacity-40 text-slate-300">/</span>
            <span className="text-lg font-bold text-slate-300 leading-none">{snap.dia}</span>
          </div>
          <div className={`text-[0.5rem] text-slate-400 ${MONO}`}>
            MAP <span className="font-black text-white">{snap.map}</span> mmHg
          </div>
          {ageLabel && (
            <div className="text-[0.4rem] text-slate-600">
              hace {ageLabel}
            </div>
          )}
        </>
      )}

      {!measuring && !snap && (
        <div className="text-[0.5rem] text-slate-600 italic">Esperando…</div>
      )}

      <div className="text-[0.38rem] text-slate-700 mt-0.5">
        Cada {intervalMin} min sim
      </div>
    </div>
  );
};
