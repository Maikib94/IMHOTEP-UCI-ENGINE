import React, { useEffect, useState } from 'react';
import { usePatientStore } from '../store/usePatientStore';

// Tailwind arbitrary class — reemplaza todos los style={{ fontFamily: MONO }} del archivo.
// Equivalente exacto de "'JetBrains Mono', monospace" sin inline style.
const MONO_CLASS = "[font-family:'JetBrains_Mono',monospace]";

type SpO2SensorState = 'normal' | 'artifact' | 'fail';

// colorClass: clase Tailwind de texto (e.g. "text-[#39ff14]").
// La barra de acento usa bg-gradient-to-r from-current, que toma currentColor
// del texto — no requiere inline style para el gradiente.
function VitalCard({ title, colorClass, children, className = "flex-1" }: {
  title: string;
  colorClass: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} bg-[#111827] rounded-xl border border-white/5 relative overflow-hidden flex flex-col justify-center p-2 shadow-[6px_6px_12px_rgba(0,0,0,0.5),-3px_-3px_8px_rgba(255,255,255,0.02)] min-h-0`}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-current to-transparent ${colorClass}`} />
      <div className={`text-[0.6rem] font-bold tracking-wider uppercase mb-1 shrink-0 ${colorClass}`}>
        {title}
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {children}
      </div>
    </div>
  );
}

export default function VitalSignsPanel() {
  const [dv, setDv] = useState(() => {
    const v = usePatientStore.getState().vitals;
    return {
      hr:      Math.round(v.heartRate || 0),
      sys:     Math.round(v.systolicBP || 0),
      dia:     Math.round(v.diastolicBP || 0),
      map:     Math.round(v.meanArterialPressure || 0),
      rr:      Math.round(v.respiratoryRate || 0),
      etco2:   Math.round(v.etco2 || 0),
      ppico:   Math.round(v.ppico || 0),
      pplat:   Math.round(v.pplat || 0),
      pi:      isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0,
      spo2Real:isFinite(v.spo2) ? Math.round(v.spo2) : 97,
      temp:    isFinite(v.temperature) ? v.temperature : 37.0,
      uoMl:    isFinite(v.urineOutput) ? v.urineOutput * 70 : 70,
      gcs:     v.gcs || 15,
      icp:     isFinite(v.icp) ? Math.round(v.icp) : 12,
    };
  });

  // SpO2 Artifact State — colorClass reemplaza el campo color (hex)
  const [spo2Art, setSpo2Art] = useState({
    value:      '--',
    colorClass: 'text-cyan-400',
    unit:       '%',
    state:      'normal' as SpO2SensorState,
  });

  useEffect(() => {
    const iv = setInterval(() => {
      const v   = usePatientStore.getState().vitals;
      const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
      const pi  = isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0;
      const spo2Real = isFinite(v.spo2) ? Math.round(v.spo2) : 97;
      const weight = isFinite(v.weight) ? v.weight : 70;
      const uoMl   = isFinite(v.urineOutput) ? Math.round(v.urineOutput * weight) : 70;
      const temp   = isFinite(v.temperature) ? v.temperature : 37.0;

      setDv({
        hr:       Math.round(v.heartRate || 0),
        sys:      Math.round(v.systolicBP || 0),
        dia:      Math.round(v.diastolicBP || 0),
        map:      Math.round(map),
        rr:       Math.round(v.respiratoryRate || 0),
        etco2:    Math.round(v.etco2 || 0),
        ppico:    Math.round(v.ppico || 0),
        pplat:    Math.round(v.pplat || 0),
        pi,
        spo2Real,
        temp,
        uoMl,
        gcs: v.gcs || 15,
        icp: isFinite(v.icp) ? Math.round(v.icp) : 12,
      });

      const nowMs = performance.now();
      const state: SpO2SensorState = (pi < 0.12 || map < 40) ? 'fail' : (pi < 0.30 || map < 55) ? 'artifact' : 'normal';

      if (state === 'fail') {
        const isBlinking = (Math.floor(nowMs / 500) % 2) === 0;
        setSpo2Art({ value: isBlinking ? '---' : '   ', colorClass: 'text-red-500',   unit: 'SIN SEÑAL', state: 'fail' });
      } else if (state === 'artifact') {
        const piFactor  = pi  < 0.30 ? Math.max(0, (0.30 - pi)  / 0.18) : 0;
        const mapFactor = map < 55   ? Math.max(0, (55   - map)  / 15)   : 0;
        const factor    = Math.min(1.0, Math.max(piFactor, mapFactor));
        const drop = factor * 10 + Math.sin(nowMs * 0.0009) * 4 * factor + Math.sin(nowMs * 0.004 + 1.2) * 2 * factor;
        const artifVal  = Math.round(Math.max(70, Math.min(99, spo2Real - drop)));
        setSpo2Art({ value: `~${artifVal}`, colorClass: 'text-amber-400', unit: 'ARTEFACTO', state: 'artifact' });
      } else {
        setSpo2Art({ value: String(spo2Real), colorClass: 'text-cyan-400', unit: '%', state: 'normal' });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const { hr, sys, dia, map, rr, etco2, ppico, pplat, pi, temp, uoMl, gcs, icp } = dv;

  // PPC (Presión de Perfusión Cerebral) = PAM - PIC (target ≥ 60 mmHg)
  const cpp = map - icp;

  // Clases Tailwind para semáforos dinámicos — sin hex inline
  const icpTextClass  = icp  > 30 ? 'text-red-500'    : icp  > 20 ? 'text-orange-500' : 'text-purple-400';
  const cppTextClass  = cpp  < 50 ? 'text-red-500'    : cpp  < 60 ? 'text-orange-500' : 'text-lime-400';
  const tempTextClass =
    temp < 35.0 ? 'text-blue-400'   :
    temp < 36.0 ? 'text-blue-300'   :
    temp > 38.5 ? 'text-orange-500' :
    temp > 38.0 ? 'text-amber-400'  :
    'text-white';
  const uoTextClass   = uoMl < 20  ? 'text-red-500'  : uoMl < 35  ? 'text-orange-500' : uoMl > 200 ? 'text-blue-400' : 'text-cyan-300';
  const sofaTextClass = gcs  <= 8  ? 'text-red-500'  : gcs  <= 12 ? 'text-orange-500' : 'text-lime-400';

  const icpAlarm = icp > 20;

  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-y-auto overflow-x-hidden min-w-0 pr-1">

      {/* HR Card */}
      <VitalCard title="HR" colorClass="text-[#39ff14]" className="h-[76px] shrink-0">
        <div className="relative flex items-end">
          <div className={`text-4xl font-black leading-none text-[#39ff14] ${MONO_CLASS}`}>
            {hr}
          </div>
          <div className="text-xs opacity-50 ml-2 mb-1 text-[#39ff14]">bpm</div>
          <div className="absolute right-0 top-0 text-[#39ff14]">
            {hr > 100 ? '↑' : hr < 60 ? '↓' : ''}
          </div>
        </div>
        <div className="text-[10px] font-mono text-[#39ff14] opacity-70 mt-1">
          Sinus Rhythm
        </div>
      </VitalCard>

      {/* NIBP / ABP Card */}
      <VitalCard title="BP" colorClass="text-[#ff3366]" className="h-[76px] shrink-0">
        <div className="flex items-baseline gap-0.5 relative">
          <span className={`text-4xl font-black text-[#ff3366] leading-none ${MONO_CLASS}`}>
            {sys}
          </span>
          <span className={`text-xl font-light opacity-40 text-[#ff3366] leading-none ${MONO_CLASS}`}>/</span>
          <span className={`text-2xl font-bold text-[#ff3366] leading-none ${MONO_CLASS}`}>
            {dia}
          </span>
          <div className="absolute right-0 top-0 text-[#ff3366]">
            {sys < 90 ? '↓↓' : sys > 160 ? '↑↑' : ''}
          </div>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className={`text-xs opacity-70 text-[#ff3366] leading-none ${MONO_CLASS}`}>
            ({map})
          </div>
          <div className="text-[10px] opacity-50 text-[#ff3366] leading-none">mmHg</div>
        </div>
      </VitalCard>

      {/* SpO2 Card */}
      <VitalCard title="SpO2" colorClass={spo2Art.colorClass} className="h-[76px] shrink-0">
        <div className={`text-4xl font-black leading-none transition-colors duration-300 ${MONO_CLASS} ${spo2Art.colorClass}`}>
          {spo2Art.value}
          {spo2Art.state === 'normal' && <span className="text-[10px] opacity-40 ml-1">%</span>}
        </div>
        <div className={`text-[10px] uppercase font-mono mt-1 transition-colors duration-300 leading-none ${spo2Art.colorClass} ${spo2Art.state !== 'normal' ? 'opacity-90 font-bold' : 'opacity-50 font-normal'}`}>
          {spo2Art.state !== 'normal' ? spo2Art.unit : `PI: ${pi}`}
        </div>
      </VitalCard>

      {/* EtCO2 / FR Card */}
      <VitalCard title="EtCO2 / FR" colorClass="text-[#a3e635]" className="h-[156px] shrink-0">
        <div className="flex flex-col justify-around h-full">
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-black text-[#a3e635] leading-none ${MONO_CLASS}`}>{etco2}</span>
              <span className="text-[10px] opacity-50 text-[#a3e635]">mmHg</span>
            </div>
            <div className="text-[10px] font-mono opacity-50 text-[#a3e635] text-right">
              Ppic:{ppico}<br/>Pplat:{pplat}
            </div>
          </div>
          <div className="w-full h-px bg-white/10 my-1"></div>
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-black text-white leading-none ${MONO_CLASS}`}>{rr}</span>
              <span className="text-[10px] opacity-50 text-white">rpm</span>
            </div>
          </div>
        </div>
      </VitalCard>

      {/* PIC / PPC Card */}
      <VitalCard title="PIC / PPC" colorClass={icpTextClass} className="h-[76px] shrink-0 mt-2">
        <div className="flex items-center justify-between h-full">
          {/* PIC */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-0.5">
              <span className={`text-4xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${icpTextClass}`}>
                {icp}
              </span>
              <span className={`text-[10px] opacity-50 leading-none ${icpTextClass}`}>mmHg</span>
            </div>
            <div className={`text-[9px] font-mono opacity-70 mt-0.5 ${icpTextClass}`}>
              {icp > 30 ? '⚠ HERNIAC.' : icp > 20 ? 'P2>P1 ↑' : icp > 15 ? 'LÍMITE' : 'NORMAL'}
            </div>
          </div>
          {/* PPC */}
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-0.5">
              <span className={`text-[9px] opacity-60 mr-0.5 ${cppTextClass}`}>PPC</span>
              <span className={`text-2xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${cppTextClass}`}>
                {cpp}
              </span>
            </div>
            <div className={`text-[9px] font-mono opacity-70 mt-0.5 ${cppTextClass}`}>
              {cpp < 50 ? '⚠ CRÍTICO' : cpp < 60 ? 'SUB-OPT' : 'OK ≥60'}
            </div>
          </div>
          {icpAlarm && (
            <div className="absolute right-1 top-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            </div>
          )}
        </div>
      </VitalCard>

      {/* TEMP / DIURESIS Card */}
      <VitalCard title="TEMP / DIURESIS" colorClass={tempTextClass} className="h-[76px] shrink-0 mt-1">
        <div className="flex justify-between items-center h-full">
          {/* TEMP */}
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${tempTextClass}`}>
                {temp.toFixed(1)}
              </span>
              <span className={`text-[10px] opacity-50 leading-none ${tempTextClass}`}>°C</span>
            </div>
            <div className={`text-[10px] opacity-60 font-mono mt-1 ${tempTextClass}`}>
              {temp < 35.0 ? 'HIPOTERMIA' : temp < 36.0 ? 'SUB-NORM' : temp > 38.5 ? 'FIEBRE' : temp > 38.0 ? 'SUBFEBRIL' : 'AXILAR'}
            </div>
          </div>
          <div className="w-px h-full bg-white/10 mx-2"></div>
          {/* DIURESIS */}
          <div className="flex flex-col justify-center items-end">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${uoTextClass}`}>
                {uoMl}
              </span>
              <span className={`text-[10px] opacity-50 leading-none ${uoTextClass}`}>ml/h</span>
            </div>
            <div className={`text-[10px] opacity-60 font-mono mt-1 text-right ${uoTextClass}`}>
              {uoMl < 20 ? 'ANURIA' : uoMl < 35 ? 'OLIGURIA' : uoMl > 200 ? 'POLIURIA' : 'DIUR.OK'}
            </div>
          </div>
        </div>
      </VitalCard>

      {/* SOFA Score Box */}
      <div className="mt-auto shrink-0 min-h-[40px] bg-[#1a2236] rounded-xl border border-white/10 p-2 flex items-center justify-between shadow-lg">
        <div>
          <div className="text-[0.65rem] font-bold text-gray-400 leading-none mb-1">SOFA Score</div>
          <div className="text-[0.55rem] text-gray-500 leading-none">
            GCS:{gcs} │ SpO2:{dv.spo2Real}% │ MAP:{map}
          </div>
        </div>
        <div className={`text-3xl font-black leading-none ${MONO_CLASS} ${sofaTextClass}`}>
          {gcs >= 15 ? 0 : gcs >= 13 ? 1 : gcs >= 10 ? 2 : gcs >= 6 ? 3 : 4}
        </div>
      </div>
    </div>
  );
}
