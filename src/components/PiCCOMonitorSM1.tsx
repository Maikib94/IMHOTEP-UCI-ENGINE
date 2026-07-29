// src/components/PiCCOMonitorSM1.tsx
//
// PiCCO SM1 — Display anatómico fotorrealista estilo VolumeView (Edwards).
// Bezel oscuro, diales con LED simulados, sombras profundas, animación flujo.
//
// Refs clínicos:
//   CI:   Cecconi ICM 2014; GEDI: Michard Chest 2003; EVLWI: Kushimoto CritCare 2012
//   CFI:  Jabot CCM 2009; CPI: Fincke JACC 2004

import React, { useMemo } from 'react';
import { useMonitoringStore, type PiCCOSnapshot } from '../store/useMonitoringStore';
import { usePatientStore }  from '../store/usePatientStore';
import { useTimeStore }     from '../store/useTimeStore';
import { useUIStore }       from '../store/useUIStore';

// ─── Clasificador de rango ────────────────────────────────────────────────────

type NormalRange = [number, number];

function classify(v: number, [lo, hi]: NormalRange): 'normal' | 'warn' | 'crit' {
  const margin = (hi - lo) * 0.15;
  if (v < lo - margin || v > hi + margin) return 'crit';
  if (v < lo || v > hi) return 'warn';
  return 'normal';
}

const LED_COLOR: Record<string, string> = {
  normal: '#10b981',
  warn:   '#f59e0b',
  crit:   '#f87171',
};

// ─── Reloj LCD analógico ──────────────────────────────────────────────────────

function ClockSimulated({ ticks }: { ticks: number }) {
  const totalMin = Math.floor(ticks / 60);
  const h = Math.floor(totalMin / 60) % 12;
  const m = totalMin % 60;
  const hrAngle  = (h + m / 60) * (Math.PI * 2 / 12);
  const minAngle = m * (Math.PI * 2 / 60);
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="20" fill="#080810" stroke="#2a2a3a" strokeWidth="1.5" />
      {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
        <line key={i}
          x1={22 + 15 * Math.sin(i * Math.PI / 6)} y1={22 - 15 * Math.cos(i * Math.PI / 6)}
          x2={22 + 18 * Math.sin(i * Math.PI / 6)} y2={22 - 18 * Math.cos(i * Math.PI / 6)}
          stroke="#3a3a4a" strokeWidth="1.5" />
      ))}
      <line x1="22" y1="22"
            x2={22 + 10 * Math.sin(hrAngle)} y2={22 - 10 * Math.cos(hrAngle)}
            stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="22"
            x2={22 + 14 * Math.sin(minAngle)} y2={22 - 14 * Math.cos(minAngle)}
            stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="22" cy="22" r="2" fill="#fbbf24" />
    </svg>
  );
}

// ─── Cronómetro de termodilución ──────────────────────────────────────────────

function ThermodilutionTimer({ doThermo }: { doThermo: () => PiCCOSnapshot }) {
  const lastTick    = useMonitoringStore(s => s.lastThermodilutionTick);
  const alarmActive = useMonitoringStore(s => s.thermodilutionAlarmActive);
  const ticks       = useTimeStore(s => s.ticks);
  const count       = useMonitoringStore(s => s.thermodilutionCount);

  const ageH = lastTick !== null
    ? Math.floor((ticks - lastTick) / 360) / 10
    : null;
  const expired = alarmActive || (ageH !== null && ageH >= 8);

  return (
    <div className="flex items-center gap-2">
      {ageH !== null && (
        <span className={`text-[0.42rem] font-mono px-1.5 py-0.5 rounded border ${
          expired ? 'border-red-600/60 bg-red-900/30 text-red-300 animate-pulse'
                  : 'border-violet-600/40 bg-violet-900/20 text-violet-300'
        }`}>
          {expired ? `⚠ ${ageH}h` : `TD ${ageH}h · ×${count}`}
        </span>
      )}
      <button type="button" onClick={() => doThermo()}
        className="px-2.5 py-1 text-[0.45rem] font-black tracking-wider rounded border border-amber-500/50 bg-amber-900/25 text-amber-300 hover:bg-amber-800/40 cursor-pointer transition-all">
        ◉ TD
      </button>
    </div>
  );
}

// ─── Anatomía SVG corazón + pulmones con animación de flujo ──────────────────

const AnatomicalHeartLungs: React.FC = () => (
  <g>
    <defs>
      <style>{`
        @keyframes picco-flow { to { stroke-dashoffset: -24; } }
        .picco-flow-art { animation: picco-flow 1.1s linear infinite; }
        .picco-flow-ven { animation: picco-flow 1.6s linear infinite; }
      `}</style>
      <radialGradient id="p-lung-L" cx="40%" cy="35%">
        <stop offset="0%"   stopColor="#1e3a8a" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#060e24" stopOpacity="0.95" />
      </radialGradient>
      <radialGradient id="p-lung-R" cx="60%" cy="35%">
        <stop offset="0%"   stopColor="#7f1d1d" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#1a0505" stopOpacity="0.95" />
      </radialGradient>
      <radialGradient id="p-heart" cx="48%" cy="38%">
        <stop offset="0%"   stopColor="#991b1b" stopOpacity="0.95" />
        <stop offset="65%"  stopColor="#7f1d1d" stopOpacity="0.90" />
        <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.85" />
      </radialGradient>
      <linearGradient id="p-ao" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" /><stop offset="100%" stopColor="#7f1d1d" />
      </linearGradient>
      <linearGradient id="p-vc" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#1e3a8a" />
      </linearGradient>
      <filter id="p-glow-red">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="p-glow-blue">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    {/* Pulmón izquierdo */}
    <path d="M 28 88 Q 14 178 55 272 Q 98 295 135 210 Q 148 120 118 76 Q 90 52 58 66 Z"
          fill="url(#p-lung-L)" stroke="#1e40af" strokeWidth="1.5" opacity="0.92" />
    {/* Trama vascular izquierda */}
    <line x1="72" y1="105" x2="88" y2="205" stroke="#1d4ed8" strokeWidth="0.6" opacity="0.45" />
    <line x1="92" y1="95"  x2="104" y2="218" stroke="#1d4ed8" strokeWidth="0.6" opacity="0.38" />
    <line x1="52" y1="125" x2="72" y2="245" stroke="#1d4ed8" strokeWidth="0.5" opacity="0.38" />
    <text x="65" y="162" fill="#93c5fd" fontSize="9.5" textAnchor="middle" fontFamily="JetBrains Mono" opacity="0.5">L</text>

    {/* Pulmón derecho */}
    <path d="M 452 88 Q 466 178 425 272 Q 382 295 345 210 Q 332 120 362 76 Q 390 52 422 66 Z"
          fill="url(#p-lung-R)" stroke="#b91c1c" strokeWidth="1.5" opacity="0.92" />
    <line x1="408" y1="105" x2="392" y2="205" stroke="#dc2626" strokeWidth="0.6" opacity="0.45" />
    <line x1="388" y1="95"  x2="376" y2="218" stroke="#dc2626" strokeWidth="0.6" opacity="0.38" />
    <text x="415" y="162" fill="#fca5a5" fontSize="9.5" textAnchor="middle" fontFamily="JetBrains Mono" opacity="0.5">R</text>

    {/* Venas pulmonares → AI */}
    <path d="M 135 195 Q 160 183 196 167" stroke="#3b82f6" strokeWidth="4" fill="none" strokeDasharray="4 8" className="picco-flow-ven" filter="url(#p-glow-blue)" />
    <path d="M 135 220 Q 165 213 200 190" stroke="#3b82f6" strokeWidth="4" fill="none" strokeDasharray="4 8" className="picco-flow-ven" filter="url(#p-glow-blue)" />
    {/* Arterias pulmonares ← VD */}
    <path d="M 345 195 Q 320 183 284 167" stroke="#ef4444" strokeWidth="4" fill="none" strokeDasharray="4 8" className="picco-flow-art" filter="url(#p-glow-red)" />
    <path d="M 345 218 Q 315 212 280 190" stroke="#ef4444" strokeWidth="4" fill="none" strokeDasharray="4 8" className="picco-flow-art" filter="url(#p-glow-red)" />

    {/* Corazón */}
    <path d="M 176 148 Q 156 170 168 220 Q 182 256 240 268 Q 298 256 312 220 Q 324 170 304 148 Q 284 108 240 108 Q 196 108 176 148 Z"
          fill="url(#p-heart)" stroke="#dc2626" strokeWidth="2" />

    {/* Aurículas */}
    <ellipse cx="210" cy="134" rx="27" ry="15" fill="#7f1d1d" stroke="#b91c1c" strokeWidth="1" />
    <text x="210" y="138" fill="#fca5a5" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono">AI</text>
    <ellipse cx="270" cy="134" rx="27" ry="15" fill="#1e3a8a" stroke="#1d4ed8" strokeWidth="1" />
    <text x="270" y="138" fill="#93c5fd" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono">AD</text>

    {/* VI / VD */}
    <path d="M 185 162 Q 183 242 240 262 L 240 162 Z" fill="#991b1b" opacity="0.7" />
    <text x="208" y="208" fill="#fca5a5" fontSize="7.5" fontFamily="JetBrains Mono">VI</text>
    <path d="M 295 162 Q 297 242 240 262 L 240 162 Z" fill="#1e40af" opacity="0.7" />
    <text x="264" y="208" fill="#93c5fd" fontSize="7.5" fontFamily="JetBrains Mono">VD</text>

    {/* Tabique */}
    <line x1="240" y1="162" x2="240" y2="262" stroke="#111827" strokeWidth="1.5" opacity="0.9" />

    {/* Aorta ascendente + arco */}
    <path d="M 218 112 L 218 72 Q 218 48 246 43 Q 278 38 312 54 Q 348 68 365 90"
          stroke="url(#p-ao)" strokeWidth="7" fill="none" strokeLinecap="round" />
    {/* Animación flujo aórtico */}
    <path d="M 218 112 L 218 72 Q 218 48 246 43 Q 278 38 312 54 Q 348 68 365 90"
          stroke="#ef4444" strokeWidth="3" fill="none" strokeDasharray="5 10" className="picco-flow-art" opacity="0.55" />
    <text x="252" y="50" fill="#fca5a5" fontSize="7.5" fontFamily="JetBrains Mono" opacity="0.7">Ao</text>

    {/* Aorta descendente */}
    <path d="M 218 112 L 218 302" stroke="#dc2626" strokeWidth="5" fill="none" />
    <path d="M 218 150 L 218 302" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeDasharray="5 10" className="picco-flow-art" opacity="0.45" />

    {/* Arteria pulmonar */}
    <path d="M 285 138 Q 312 122 342 140 Q 368 156 366 188"
          stroke="#dc2626" strokeWidth="6" fill="none" strokeLinecap="round" />

    {/* VCS */}
    <path d="M 268 118 L 268 52" stroke="url(#p-vc)" strokeWidth="7" fill="none" />
    <path d="M 268 118 L 268 52" stroke="#3b82f6" strokeWidth="3" fill="none" strokeDasharray="4 9" className="picco-flow-ven" opacity="0.5" />
    {/* VCI */}
    <path d="M 265 150 L 265 302" stroke="#1d4ed8" strokeWidth="5" fill="none" />

    {/* Halo cardíaco */}
    <ellipse cx="240" cy="188" rx="73" ry="70" fill="none"
             stroke="#dc2626" strokeWidth="0.8" opacity="0.2" strokeDasharray="5 6" />
  </g>
);

// ─── PiCCOLabel — texto sobre anatomía ───────────────────────────────────────

interface LabelProps {
  x: number; y: number; label: string; value: string; unit?: string;
  normal?: NormalRange; primary?: boolean; pulse?: boolean;
  anchor?: 'start' | 'middle' | 'end';
}

const PiCCOLabel: React.FC<LabelProps> = ({
  x, y, label, value, unit, normal, primary, pulse, anchor = 'start',
}) => {
  const numVal = parseFloat(value);
  let ledColor = '#facc15';
  if (normal && !isNaN(numVal)) ledColor = LED_COLOR[classify(numVal, normal)];

  const fs = primary ? 14 : 11;
  const lfs = primary ? 9 : 7.5;

  return (
    <g transform={`translate(${x},${y})`} className={pulse ? 'animate-pulse' : ''}>
      <circle cx="0" cy="-6" r={primary ? 4.5 : 3} fill={ledColor} opacity="0.95"
              style={{ filter: `drop-shadow(0 0 ${primary ? 6 : 4}px ${ledColor})` }} />
      <text x={anchor === 'end' ? -7 : 7} y="-1"
            fill={ledColor} fontSize={fs} fontWeight="900"
            fontFamily="JetBrains Mono, ui-monospace"
            textAnchor={anchor === 'end' ? 'end' : 'start'}>
        {value}
      </text>
      <text x={anchor === 'end' ? -7 : 7} y={fs + 2}
            fill="#cbd5e1" fontSize={lfs} fontFamily="JetBrains Mono, ui-monospace"
            textAnchor={anchor === 'end' ? 'end' : 'start'}>
        {label}
      </text>
      {unit && (
        <text x={anchor === 'end' ? -7 : 7} y={fs + lfs + 4}
              fill="#475569" fontSize="6.5" fontFamily="JetBrains Mono, ui-monospace"
              textAnchor={anchor === 'end' ? 'end' : 'start'}>
          {unit}
        </text>
      )}
    </g>
  );
};

// ─── PhotorealisticDial ────────────────────────────────────────────────────────

interface DialProps {
  label: string; value: string; unit: string; normal?: NormalRange;
}

const PhotorealisticDial: React.FC<DialProps> = ({ label, value, unit, normal }) => {
  const numVal = parseFloat(value);
  let cls = 'normal';
  if (normal && !isNaN(numVal)) cls = classify(numVal, normal);
  const led = LED_COLOR[cls];

  return (
    <div style={{
      background: 'radial-gradient(circle at 30% 30%, #2a2a36, #0a0a14)',
      borderRadius: '50%', width: 88, height: 88, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
      boxShadow: `inset 0 -3px 8px rgba(0,0,0,0.65), inset 0 3px 6px rgba(255,255,255,0.07), 0 4px 14px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06)`,
    }}>
      {/* LED indicator */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        width: 8, height: 8, borderRadius: '50%', background: led,
        boxShadow: `0 0 10px ${led}, 0 0 4px ${led}`,
      }} />
      <div style={{
        fontFamily: "'JetBrains Mono', ui-monospace",
        fontWeight: 900, fontSize: 15, color: led, lineHeight: 1,
        textShadow: `0 0 8px ${led}88`,
      }}>
        {value}
      </div>
      <div style={{ fontSize: '0.38rem', color: '#64748b', marginTop: 2, textAlign: 'center', lineHeight: 1.2 }}>
        {unit}
      </div>
      <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#94a3b8', marginTop: 3, letterSpacing: '0.05em' }}>
        {label}
      </div>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

interface PiCCOMonitorSM1Props {
  isOpen:  boolean;
  onClose: () => void;
}

export default function PiCCOMonitorSM1({ isOpen, onClose }: PiCCOMonitorSM1Props) {
  const snap        = useMonitoringStore(s => s.piccoSnapshot);
  const count       = useMonitoringStore(s => s.thermodilutionCount);
  const lastTick    = useMonitoringStore(s => s.lastThermodilutionTick);
  const alarmActive = useMonitoringStore(s => s.thermodilutionAlarmActive);
  const doThermo    = useMonitoringStore(s => s.performThermodilution);
  const ticks       = useTimeStore(s => s.ticks);
  const hr          = usePatientStore(s => s.vitals.heartRate);
  const map         = usePatientStore(s => s.vitals.meanArterialPressure);
  const temp        = usePatientStore(s => s.vitals.temperature);
  const photoreal   = useUIStore(s => s.picoPhotoreal);

  const calibAge_h = lastTick !== null
    ? Math.floor((ticks - lastTick) / 360) / 10
    : null;
  const calibExpired = alarmActive || (calibAge_h !== null && calibAge_h >= 8);

  const svi = useMemo(() => {
    if (!snap) return '--';
    const hrSafe = hr > 20 ? hr : 75;
    return String(Math.round((snap.ci * 1000) / hrSafe));
  }, [snap, hr]);

  if (!isOpen) return null;

  const shellBg = photoreal
    ? 'linear-gradient(145deg, #1c1c22, #0a0a10)'
    : 'linear-gradient(145deg, #0d1224, #060a12)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: 'rgba(0,0,0,0.82)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* ── Shell fotorrealista ─────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 108px', gap: 12,
        width: '92vw', maxWidth: 980, maxHeight: '90vh',
        background: shellBg,
        borderRadius: 18, padding: 18, overflow: 'hidden',
        boxShadow: photoreal
          ? '0 16px 50px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.07), inset 0 -1px 1px rgba(0,0,0,0.45)'
          : '0 0 60px rgba(139,92,246,0.12)',
        border: '1px solid rgba(139,92,246,0.25)',
      }}>

        {/* ── Bezel + Pantalla ──────────────────────────────────────────── */}
        <div style={{
          background: photoreal ? 'linear-gradient(180deg, #2c2c32, #1c1c22)' : 'transparent',
          borderRadius: 14,
          padding: photoreal ? 14 : 0,
          boxShadow: photoreal ? 'inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 4px 8px rgba(0,0,0,0.55)' : 'none',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClockSimulated ticks={ticks} />
              <div>
                <div style={{ color: '#a78bfa', fontWeight: 900, fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                  PiCCO SM1 · VolumeView
                </div>
                <div style={{ color: '#475569', fontSize: '0.38rem', fontFamily: 'monospace' }}>
                  Transpulmonary Thermodilution · {count} medicion{count !== 1 ? 'es' : ''}
                </div>
              </div>
              {calibExpired && (
                <span style={{
                  fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid #991b1b', color: '#f87171',
                }}>
                  ⚠ CALIB {calibAge_h}h
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ThermodilutionTimer doThermo={doThermo} />
              <button type="button" onClick={onClose} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 15, padding: '2px 9px',
              }}>✕</button>
            </div>
          </div>

          {/* Screen */}
          <div style={{
            flex: 1, position: 'relative',
            background: photoreal ? 'radial-gradient(ellipse at center, #0a0e1a 0%, #000 100%)' : '#060a12',
            borderRadius: 8, overflow: 'hidden',
            boxShadow: photoreal ? 'inset 0 0 40px rgba(0,0,0,0.75)' : 'none',
          }}>
            {!snap ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260, color: '#475569' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 6 }}>◉</div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>SIN DATOS</div>
                  <div style={{ fontSize: '0.45rem', marginTop: 3 }}>Presione TERMODILUCIÓN para inicializar</div>
                </div>
              </div>
            ) : (
              <svg viewBox="0 0 480 335" style={{ width: '100%', flex: 1, display: 'block' }}>
                <AnatomicalHeartLungs />

                {/* Labels sobre anatomía */}
                <PiCCOLabel x={28}  y={108} label="SVV"   value={String(Math.round(snap.svv))}    unit="%"       normal={[0, 12]} />
                <PiCCOLabel x={28}  y={196} label="ELWI"  value={snap.evlwi.toFixed(1)}           unit="mL/kg"   normal={[3, 7]}  pulse={snap.evlwi > 10} />
                <PiCCOLabel x={28}  y={246} label="PVPI"  value={snap.pvpi.toFixed(1)}            unit=""        normal={[1, 3]} />
                <PiCCOLabel x={28}  y={308} label="ScvO₂" value={String(Math.round(snap.scvo2))} unit="%"       normal={[70, 80]} />

                <PiCCOLabel x={240} y={82}  label="GEDI"  value={String(Math.round(snap.gedi))}   unit="mL/m²"  normal={[680, 800]} primary anchor="middle" />

                <PiCCOLabel x={188} y={212} label="GEF"   value={String(Math.round(snap.gef))}    unit="%"       normal={[25, 35]} />
                <PiCCOLabel x={254} y={212} label="CFI"   value={snap.cfi.toFixed(1)}             unit="/min"    normal={[4.5, 6.5]} />

                <PiCCOLabel x={328} y={58}  label="IRVSi" value={String(Math.round(snap.svri))}   unit="dyn·s·m²" anchor="end" />
                <PiCCOLabel x={455} y={108} label="PPV"   value={String(Math.round(snap.ppv))}    unit="%"       normal={[0, 13]} anchor="end" />
                <PiCCOLabel x={455} y={178} label="dPmx"  value={String(Math.round(snap.dpmx))}   unit="mmHg/s"  normal={[1200, 2000]} anchor="end" />

                <PiCCOLabel x={152} y={295} label="CVP"   value="—"    unit="mmHg" />
                <PiCCOLabel x={240} y={295} label="ICi"   value={snap.cpi.toFixed(1)} unit="W/m²" normal={[0.5, 0.7]} anchor="middle" />
                <PiCCOLabel x={332} y={295} label="DO2I"  value={String(Math.round(snap.do2i))} unit="mL/m²" normal={[300, 650]} />

                <PiCCOLabel x={70}  y={332} label="PAM"   value={String(Math.round(map))}   unit="mmHg" normal={[65, 120]} />
                <PiCCOLabel x={240} y={332} label="HR"    value={String(Math.round(hr))}    unit="bpm"  normal={[50, 110]} anchor="middle" />
                <PiCCOLabel x={382} y={332} label="VO2I"  value={String(Math.round(snap.vo2i))} unit="mL/m²" anchor="end" />
              </svg>
            )}
          </div>

          {/* Footer */}
          {snap && (
            <div style={{
              marginTop: 6, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: '0.42rem', fontFamily: 'monospace', color: '#334155',
            }}>
              <span>BT {temp.toFixed(1)}°C · GEDI:{Math.round(snap.gedi)} · ITBV:{Math.round(snap.itbv)} · CO:{snap.co.toFixed(1)} L/min</span>
              <span>PiCCO SM1 · IMHOTEP UCI</span>
            </div>
          )}
        </div>

        {/* ── Diales fotorrealistas ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 10,
          borderLeft: photoreal ? '1px solid rgba(255,255,255,0.05)' : 'none',
          paddingLeft: photoreal ? 12 : 0,
          background: photoreal ? 'rgba(0,0,0,0.25)' : 'transparent',
          borderRadius: photoreal ? '0 10px 10px 0' : 0,
        }}>
          <PhotorealisticDial label="CI"    value={snap?.ci.toFixed(1) ?? '--'}         unit="L/min/m²" normal={[3.0, 5.0]} />
          <PhotorealisticDial label="SVV"   value={String(snap ? Math.round(snap.svv) : '--')} unit="%"  normal={[0, 12]}    />
          <PhotorealisticDial label="SVI"   value={svi}                                  unit="mL/m²"    normal={[35, 50]}   />
          <PhotorealisticDial label="ScvO₂" value={String(snap ? Math.round(snap.scvo2) : '--')} unit="%" normal={[70, 80]}  />
        </div>
      </div>
    </div>
  );
}
