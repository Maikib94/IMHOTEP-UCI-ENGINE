import React, { useEffect, useState, useMemo } from 'react';
import { usePatientStore }  from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { useTimeStore }      from '../store/useTimeStore';
import { triggerNIBPNow }    from '../hooks/useNIBPCycle';
import { NIBPCuffProgress }  from './NIBPCuffAnimation';

// Tailwind arbitrary class — reemplaza todos los style={{ fontFamily: MONO }} del archivo.
// Equivalente exacto de "'JetBrains Mono', monospace" sin inline style.
const MONO_CLASS = "[font-family:'JetBrains_Mono',monospace]";

// Formateador seguro con clamp para evitar desbordamiento 4 dígitos imposibles
function fmtV(v: number, lo: number, hi: number, digits = 0): string {
  if (!isFinite(v)) return '--';
  return Math.max(lo, Math.min(hi, v)).toFixed(digits);
}

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

  // ── Procedures & caseCategory state ───────────────────────────────────────
  const procedures   = usePatientStore(s => s.procedures);
  const caseCategory = usePathologyStore(s => s.caseCategory);
  const currentTicks = useTimeStore(s => s.ticks);

  const useNIBP   = !procedures.arterialLine;
  const showPIC   = procedures.picMonitor || caseCategory === 'neuro';
  const nibpSample = procedures.nibp.lastSample;

  // NIBP countdown (seconds until next measurement)
  const nibpCountdown = useMemo(() => {
    if (!useNIBP || !nibpSample) return null;
    const intervalS = procedures.nibp.intervalMinutes * 60;
    const elapsed   = currentTicks - nibpSample.capturedAtTick;
    const remaining = Math.max(0, intervalS - elapsed);
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  }, [useNIBP, nibpSample, currentTicks, procedures.nibp.intervalMinutes]);

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
            {fmtV(hr, 20, 250)}
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

      {/* ABP card — Línea Arterial activa (valores live, rojo) */}
      {!useNIBP && (
        <VitalCard title="ABP" colorClass="text-[#ff3366]" className="h-[90px] shrink-0">
          <div className="flex items-baseline gap-0.5 relative">
            <span className={`text-4xl font-black text-[#ff3366] leading-none ${MONO_CLASS}`}>{fmtV(sys, 40, 280)}</span>
            <span className={`text-xl font-light opacity-40 text-[#ff3366] leading-none ${MONO_CLASS}`}>/</span>
            <span className={`text-2xl font-bold text-[#ff3366] leading-none ${MONO_CLASS}`}>{fmtV(dia, 20, 180)}</span>
            <div className="absolute right-0 top-0 text-[#ff3366]">{sys < 90 ? '↓↓' : sys > 160 ? '↑↑' : ''}</div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <div className={`text-xs opacity-70 text-[#ff3366] leading-none ${MONO_CLASS}`}>({fmtV(map, 20, 180)})</div>
            <div className="text-[10px] text-[#ff4466] opacity-60">ART · {procedures.arterialSite.replace('_', ' ')}</div>
          </div>
        </VitalCard>
      )}

      {/* NIBP card — Sin línea arterial (snapshot, ámbar, con countdown) */}
      {useNIBP && (
        <VitalCard title="NIBP" colorClass="text-[#fbbf24]" className="h-[110px] shrink-0">
          {nibpSample ? (
            <>
              <div className="flex items-baseline gap-0.5 relative">
                <span className={`text-4xl font-black text-[#fbbf24] leading-none ${MONO_CLASS}`}>{nibpSample.systolicBP}</span>
                <span className={`text-xl font-light opacity-40 text-[#fbbf24] leading-none ${MONO_CLASS}`}>/</span>
                <span className={`text-2xl font-bold text-[#fbbf24] leading-none ${MONO_CLASS}`}>{nibpSample.diastolicBP}</span>
                <div className="absolute right-0 top-0 text-[#fbbf24]">{nibpSample.systolicBP < 90 ? '↓↓' : ''}</div>
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <div className={`text-xs opacity-70 text-[#fbbf24] leading-none ${MONO_CLASS}`}>({nibpSample.meanArterialPressure})</div>
                <div className="text-[10px] opacity-50 text-[#fbbf24] leading-none">mmHg</div>
              </div>
              {nibpSample.systolicBP < 90 && nibpSample.meanArterialPressure < 65 && (
                <div className="text-[8px] text-amber-600 mt-0.5">⚠ NIBP poco fiable (Lehman 2013)</div>
              )}
            </>
          ) : (
            <div className="text-2xl font-black text-amber-700 opacity-60">---/---</div>
          )}
          {/* Countdown + intervalo */}
          <div className="flex items-center justify-between mt-1">
            <div className="text-[9px] text-amber-600 font-mono">
              {nibpCountdown ? `Próx: ${nibpCountdown}` : 'Midiendo...'}
            </div>
            <div className="flex gap-0.5">
              {([5, 10, 15, 30] as const).map(m => (
                <button key={m} type="button"
                  onClick={() => usePatientStore.getState().setNIBPInterval(m)}
                  className="text-[8px] px-1 rounded cursor-pointer"
                  style={{
                    background:  procedures.nibp.intervalMinutes === m ? 'rgba(251,191,36,0.25)' : 'rgba(0,0,0,0.3)',
                    color:       procedures.nibp.intervalMinutes === m ? '#fbbf24' : '#475569',
                    border:      `1px solid ${procedures.nibp.intervalMinutes === m ? '#fbbf24' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >{m}′</button>
              ))}
            </div>
          </div>
          {/* Inline inflation progress — replaces floating overlay (Bug 4) */}
          <NIBPCuffProgress />
          <button type="button" onClick={triggerNIBPNow}
            className="w-full mt-1 text-[8px] text-amber-600 hover:text-amber-400 cursor-pointer border border-amber-800/30 rounded py-0.5">
            Medir Ahora
          </button>
        </VitalCard>
      )}

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
              <span className={`text-4xl font-black text-[#a3e635] leading-none ${MONO_CLASS}`}>{fmtV(etco2, 10, 80)}</span>
              <span className="text-[10px] opacity-50 text-[#a3e635]">mmHg</span>
            </div>
            <div className="text-[10px] font-mono opacity-50 text-[#a3e635] text-right">
              Ppic:{fmtV(ppico, 0, 80)}<br/>Pplat:{fmtV(pplat, 0, 60)}
            </div>
          </div>
          <div className="w-full h-px bg-white/10 my-1"></div>
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-black text-white leading-none ${MONO_CLASS}`}>{fmtV(rr, 0, 60)}</span>
              <span className="text-[10px] opacity-50 text-white">rpm</span>
            </div>
          </div>
        </div>
      </VitalCard>

      {/* PIC / PPC Card — solo visible con monitor activo o caso neuro */}
      {showPIC && <VitalCard title={`PIC / PPC${procedures.icpDevice === 'ventricular_evd' ? ' · DVE' : procedures.icpDevice === 'parenchymal' ? ' · Codman' : ''}`} colorClass={icpTextClass} className="h-[76px] shrink-0 mt-2">
        <div className="flex items-center justify-between h-full">
          {/* PIC */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-0.5">
              <span className={`text-4xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${icpTextClass}`}>
                {fmtV(icp, 0, 60)}
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
                {fmtV(cpp, 0, 100)}
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
      </VitalCard>}

      {/* TEMP / DIURESIS Card */}
      <VitalCard title="TEMP / DIURESIS" colorClass={tempTextClass} className="h-[76px] shrink-0 mt-1">
        <div className="flex justify-between items-center h-full">
          {/* TEMP */}
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black leading-none transition-colors duration-500 ${MONO_CLASS} ${tempTextClass}`}>
                {fmtV(temp, 32, 42, 1)}
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
                {fmtV(uoMl, 0, 500)}
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
            GCS:{gcs} │ SpO2:{dv.spo2Real}% │ MAP:{fmtV(map, 20, 180)}
          </div>
        </div>
        <div className={`text-3xl font-black leading-none ${MONO_CLASS} ${sofaTextClass}`}>
          {gcs >= 15 ? 0 : gcs >= 13 ? 1 : gcs >= 10 ? 2 : gcs >= 6 ? 3 : 4}
        </div>
      </div>
    </div>
  );
}
