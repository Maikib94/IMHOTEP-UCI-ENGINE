import React, { useEffect, useState } from 'react';
import { usePatientStore } from '../store/usePatientStore';

const MONO = "'JetBrains Mono', monospace";

// SpO2 artifact logic for visual realism
type SpO2SensorState = 'normal' | 'artifact' | 'fail';

function VitalCard({ title, titleColor, children, className = "flex-1" }: { title: string, titleColor: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={`${className} bg-[#111827] rounded-xl border border-white/5 relative overflow-hidden flex flex-col justify-center p-2 shadow-[6px_6px_12px_rgba(0,0,0,0.5),-3px_-3px_8px_rgba(255,255,255,0.02)] min-h-0`}>
      <div 
        className="absolute top-0 left-0 right-0 h-[2px]" 
        style={{ background: `linear-gradient(90deg, ${titleColor}, transparent)` }} 
      />
      <div 
        className="text-[0.6rem] font-bold tracking-wider uppercase mb-1 shrink-0"
        style={{ color: titleColor }}
      >
        {title}
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {children}
      </div>
    </div>
  );
}

export default function VitalSignsPanel() {
  // We use local state to throttle updates and prevent 60fps React re-renders from the physics engine
  const [dv, setDv] = useState(() => {
    const v = usePatientStore.getState().vitals;
    return {
      hr: Math.round(v.heartRate || 0),
      sys: Math.round(v.systolicBP || 0),
      dia: Math.round(v.diastolicBP || 0),
      map: Math.round(v.meanArterialPressure || 0),
      rr: Math.round(v.respiratoryRate || 0),
      etco2: Math.round(v.etco2 || 0),
      ppico: Math.round(v.ppico || 0),
      pplat: Math.round(v.pplat || 0),
      pi: isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0,
      spo2Real: isFinite(v.spo2) ? Math.round(v.spo2) : 97
    };
  });

  // SpO2 Artifact State
  const [spo2Art, setSpo2Art] = useState({ value: '--', color: '#00e5ff', unit: '%', state: 'normal' as SpO2SensorState });

  useEffect(() => {
    const iv = setInterval(() => {
      const v = usePatientStore.getState().vitals;
      const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
      const pi = isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0;
      const spo2Real = isFinite(v.spo2) ? Math.round(v.spo2) : 97;

      setDv({
        hr: Math.round(v.heartRate || 0),
        sys: Math.round(v.systolicBP || 0),
        dia: Math.round(v.diastolicBP || 0),
        map: Math.round(map),
        rr: Math.round(v.respiratoryRate || 0),
        etco2: Math.round(v.etco2 || 0),
        ppico: Math.round(v.ppico || 0),
        pplat: Math.round(v.pplat || 0),
        pi,
        spo2Real
      });

      const nowMs = performance.now();
      const state: SpO2SensorState = (pi < 0.12 || map < 40) ? 'fail' : (pi < 0.30 || map < 55) ? 'artifact' : 'normal';

      if (state === 'fail') {
        const isBlinking = (Math.floor(nowMs / 500) % 2) === 0;
        setSpo2Art({ value: isBlinking ? '---' : '   ', color: '#ef4444', unit: 'SIN SEÑAL', state: 'fail' });
      } else if (state === 'artifact') {
        const piFactor = pi < 0.30 ? Math.max(0, (0.30 - pi) / 0.18) : 0;
        const mapFactor = map < 55 ? Math.max(0, (55 - map) / 15) : 0;
        const factor = Math.min(1.0, Math.max(piFactor, mapFactor));
        const drop = factor * 10 + Math.sin(nowMs * 0.0009) * 4 * factor + Math.sin(nowMs * 0.004 + 1.2) * 2 * factor;
        const artifVal = Math.round(Math.max(70, Math.min(99, spo2Real - drop)));
        setSpo2Art({ value: `~${artifVal}`, color: '#fbbf24', unit: 'ARTEFACTO', state: 'artifact' });
      } else {
        setSpo2Art({ value: String(spo2Real), color: '#00e5ff', unit: '%', state: 'normal' });
      }
    }, 1000); // Throttled to 1 second
    return () => clearInterval(iv);
  }, []);

  // Derived Values from throttled state
  const { hr, sys, dia, map, rr, etco2, ppico, pplat, pi } = dv;

  // Mocked ICP derived loosely from MAP to show visual changes, normal around 10-15
  const mockIcp = Math.max(Math.round(map * 0.2), 12);
  const icpWarning = mockIcp > 20;

  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-y-auto overflow-x-hidden min-w-0 pr-1">
      {/* HR Card -> Alineado con onda ECG (80px) -> height: 76px + gap: 4px = 80px */}
      <VitalCard title="HR" titleColor="#39ff14" className="h-[76px] shrink-0">
        <div className="relative flex items-end">
          <div className="text-4xl font-black leading-none text-[#39ff14]" style={{ fontFamily: MONO }}>
            {hr}
          </div>
          <div className="text-xs opacity-50 ml-2 mb-1 text-[#39ff14]">bpm</div>
          {/* Trend arrow mock */}
          <div className="absolute right-0 top-0 text-[#39ff14]">
            {hr > 100 ? '↑' : hr < 60 ? '↓' : ''}
          </div>
        </div>
        <div className="text-[10px] font-mono text-[#39ff14] opacity-70 mt-1">
          Sinus Rhythm
        </div>
      </VitalCard>

      {/* NIBP / ABP Card -> Alineado con onda ART (80px) */}
      <VitalCard title="BP" titleColor="#ff3366" className="h-[76px] shrink-0">
        <div className="flex items-baseline gap-0.5 relative">
          <span className="text-4xl font-black text-[#ff3366] leading-none" style={{ fontFamily: MONO }}>
            {sys}
          </span>
          <span className="text-xl font-light opacity-40 text-[#ff3366] leading-none" style={{ fontFamily: MONO }}>/</span>
          <span className="text-2xl font-bold text-[#ff3366] leading-none" style={{ fontFamily: MONO }}>
            {dia}
          </span>
          <div className="absolute right-0 top-0 text-[#ff3366]">
            {sys < 90 ? '↓↓' : sys > 160 ? '↑↑' : ''}
          </div>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="text-xs opacity-70 text-[#ff3366] leading-none" style={{ fontFamily: MONO }}>
            ({map})
          </div>
          <div className="text-[10px] opacity-50 text-[#ff3366] leading-none">mmHg</div>
        </div>
      </VitalCard>

      {/* SpO2 Card -> Alineado con onda PLETH (80px) */}
      <VitalCard title="SpO2" titleColor={spo2Art.color} className="h-[76px] shrink-0">
        <div 
          className="text-4xl font-black leading-none transition-colors duration-300" 
          style={{ fontFamily: MONO, color: spo2Art.color }}
        >
          {spo2Art.value}
          {spo2Art.state === 'normal' && <span className="text-[10px] opacity-40 ml-1">%</span>}
        </div>
        <div 
          className="text-[10px] uppercase font-mono mt-1 transition-colors duration-300 leading-none"
          style={{ color: spo2Art.color, opacity: spo2Art.state !== 'normal' ? 0.9 : 0.5, fontWeight: spo2Art.state !== 'normal' ? 700 : 400 }}
        >
          {spo2Art.state !== 'normal' ? spo2Art.unit : `PI: ${pi}`}
        </div>
      </VitalCard>

      {/* EtCO2 y FR Card -> Alineado con ondas EtCO2 y RESP (160px). 156px height + 4px gap = 160px */}
      <VitalCard title="EtCO2 / FR" titleColor="#a3e635" className="h-[156px] shrink-0">
        <div className="flex flex-col justify-around h-full">
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-[#a3e635] leading-none" style={{ fontFamily: MONO }}>{etco2}</span>
              <span className="text-[10px] opacity-50 text-[#a3e635]">mmHg</span>
            </div>
            <div className="text-[10px] font-mono opacity-50 text-[#a3e635] text-right">
              Ppic:{ppico}<br/>Pplat:{pplat}
            </div>
          </div>
          <div className="w-full h-px bg-white/10 my-1"></div>
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white leading-none" style={{ fontFamily: MONO }}>{rr}</span>
              <span className="text-[10px] opacity-50 text-white">rpm</span>
            </div>
          </div>
        </div>
      </VitalCard>

      {/* ICP Card -> Mover al final de las ondas */}
      <VitalCard title="ICP" titleColor="#ffbf00" className="h-[76px] shrink-0 mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline">
            <span className="text-4xl font-black text-[#ffbf00] leading-none" style={{ fontFamily: MONO }}>
              {mockIcp}
            </span>
          </div>
          {icpWarning && (
            <div className="bg-orange-600/30 text-orange-400 px-2 py-0.5 rounded font-bold text-[10px] border border-orange-500/50 flex items-center justify-center">
              ⚠️ HIGH
            </div>
          )}
        </div>
        <div className="flex justify-between mt-1 items-end">
          <div className="text-[10px] font-mono text-[#ffbf00] opacity-70 whitespace-nowrap overflow-hidden leading-none">
            P2 {'>'} P1 Peak Wait
          </div>
          <div className="text-[10px] opacity-50 text-[#ffbf00] leading-none">mmHg</div>
        </div>
      </VitalCard>

      {/* TEMP / DIURESIS Card */}
      <VitalCard title="TEMP / DIURESIS" titleColor="#ffffff" className="h-[76px] shrink-0 mt-1">
        <div className="flex justify-between items-center h-full">
          {/* TEMP */}
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-white leading-none" style={{ fontFamily: MONO }}>36.8</span>
              <span className="text-[10px] opacity-50 text-white leading-none">°C</span>
            </div>
            <div className="text-[10px] opacity-40 font-mono text-white mt-1">AXILAR</div>
          </div>
          {/* DIURESIS */}
          <div className="w-px h-full bg-white/10 mx-2"></div>
          <div className="flex flex-col justify-center items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-cyan-300 leading-none" style={{ fontFamily: MONO }}>85</span>
              <span className="text-[10px] opacity-50 text-cyan-300 leading-none">ml/h</span>
            </div>
            <div className="text-[10px] opacity-40 font-mono text-cyan-300 mt-1 text-right">RITMO DIUR.</div>
          </div>
        </div>
      </VitalCard>

      {/* SOFA Score Box -> Al final de todo */}
      <div className="mt-auto shrink-0 min-h-[40px] bg-[#1a2236] rounded-xl border border-white/10 p-2 flex items-center justify-between shadow-lg">
        <div>
          <div className="text-[0.65rem] font-bold text-gray-400 leading-none mb-1">SOFA Score</div>
          <div className="text-[0.55rem] text-gray-500 leading-none">(Sepsis/Neuro)</div>
        </div>
        <div className="text-3xl font-black text-white leading-none" style={{ fontFamily: MONO }}>
          {/* Mock SOFA Score */}
          8
        </div>
      </div>
    </div>
  );
}
