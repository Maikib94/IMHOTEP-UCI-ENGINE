// src/components/QuickARMPanel.tsx
// Panel ARM rápido — barra lateral debajo de drogas (Fase 3)
// Lee del store con selectores granulares, escribe con setVentilatorParam.
// Los botones de pausa llaman a triggerPauseManeuver (RespiratoryEngine los ejecuta).

import React from 'react';
import { usePatientStore, VentilatorPauseState } from '../store/usePatientStore';

// ─── Pasos clínicos estándar por parámetro (spec Fase 3) ─────────────────────
const STEP = {
  vt:       10,   // mL
  peep:      1,   // cmH₂O
  setRR:     1,   // /min
  fio2:    0.05,  // fracción
  flowRate:  5,   // L/min
  iTime:   0.1,   // s
} as const;

// ─── Rangos físicos (coinciden con VENT_RANGES del store) ────────────────────
const RANGE: Record<string, [number, number]> = {
  vt:       [200,  800],
  peep:     [0,    25],
  setRR:    [4,    40],
  fio2:     [0.21, 1.0],
  flowRate: [20,   80],
  iTime:    [0.3,  3.0],
};

// ─── Formateador de valor por campo ──────────────────────────────────────────
function fmt(key: string, val: number): string {
  if (key === 'fio2') return `${Math.round(val * 100)}%`;
  if (key === 'iTime') return val.toFixed(1);
  return String(Math.round(val));
}

// ─── Unidades por campo ───────────────────────────────────────────────────────
const UNIT: Record<string, string> = {
  vt:       'mL',
  peep:     'cmH₂O',
  setRR:    '/min',
  fio2:     '',
  flowRate: 'L/min',
  iTime:    's',
};

// ─── Etiquetas ────────────────────────────────────────────────────────────────
const LABEL: Record<string, string> = {
  vt:       'VT',
  peep:     'PEEP',
  setRR:    'FR',
  fio2:     'FiO₂',
  flowRate: 'FLUJO',
  iTime:    'Ti',
};

// ─── SpinCell compacto ────────────────────────────────────────────────────────

interface SpinCellProps {
  fieldKey: string;
  value: number;
  disabled?: boolean;
}

function SpinCell({ fieldKey, value, disabled = false }: SpinCellProps) {
  const setVentilatorParam = usePatientStore(s => s.setVentilatorParam);
  const step  = STEP[fieldKey as keyof typeof STEP] ?? 1;
  const range = RANGE[fieldKey] ?? [0, 9999];

  const dec = () => {
    const next = Math.max(range[0], Math.round((value - step) / step) * step);
    // fio2 needs special rounding to avoid float drift
    const clamped = fieldKey === 'fio2' ? Math.round(next * 100) / 100 : next;
    setVentilatorParam(fieldKey as 'vt', clamped);
  };
  const inc = () => {
    const next = Math.min(range[1], Math.round((value + step) / step) * step);
    const clamped = fieldKey === 'fio2' ? Math.round(next * 100) / 100 : next;
    setVentilatorParam(fieldKey as 'vt', clamped);
  };

  return (
    <div className={`flex flex-col items-center gap-0.5 bg-[#0f172a] border border-white/5 rounded-lg p-1.5 min-w-0 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-[0.38rem] font-black text-slate-500 tracking-widest uppercase">{LABEL[fieldKey]}</span>
      <span className="text-[0.7rem] font-black font-mono text-cyan-300 leading-none">{fmt(fieldKey, value)}</span>
      <span className="text-[0.32rem] text-slate-600">{UNIT[fieldKey]}</span>
      <div className="flex gap-1 mt-0.5">
        <button
          type="button"
          onClick={dec}
          className="w-5 h-4 text-[0.55rem] font-black bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-slate-300 leading-none cursor-pointer"
        >−</button>
        <button
          type="button"
          onClick={inc}
          className="w-5 h-4 text-[0.55rem] font-black bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-slate-300 leading-none cursor-pointer"
        >+</button>
      </div>
    </div>
  );
}

// ─── Botón de Pausa ───────────────────────────────────────────────────────────

interface PauseButtonProps {
  type: 'INSPIRATORY' | 'EXPIRATORY';
  activePause: VentilatorPauseState;
  disabled?: boolean;
}

function PauseButton({ type, activePause, disabled = false }: PauseButtonProps) {
  const triggerPauseManeuver = usePatientStore(s => s.triggerPauseManeuver);
  const isActive = activePause === type;
  const duration = type === 'INSPIRATORY' ? '2s' : '3s';
  const label    = type === 'INSPIRATORY' ? 'PAUSA INSP.' : 'PAUSA ESP.';
  const activeColor = type === 'INSPIRATORY'
    ? 'bg-yellow-900/60 border-yellow-500 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.4)]'
    : 'bg-cyan-900/60 border-cyan-500 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)]';

  return (
    <button
      type="button"
      onClick={() => triggerPauseManeuver(isActive ? 'NONE' : type)}
      disabled={disabled || (activePause !== 'NONE' && !isActive)}
      className={`flex-1 py-1.5 px-1 rounded-lg border font-black text-[0.42rem] tracking-widest uppercase transition-all duration-150 cursor-pointer ${
        isActive
          ? activeColor
          : 'bg-slate-900/60 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {isActive ? `⏸ ${label} · ${duration}` : `⏸ ${label}`}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function QuickARMPanel() {
  const vt        = usePatientStore(s => s.ventilator.vt);
  const peep      = usePatientStore(s => s.ventilator.peep);
  const setRR     = usePatientStore(s => s.ventilator.setRR);
  const fio2      = usePatientStore(s => s.ventilator.fio2);
  const flowRate  = usePatientStore(s => s.ventilator.flowRate);
  const iTime     = usePatientStore(s => s.ventilator.iTime);
  const mode      = usePatientStore(s => s.ventilator.mode);
  const pause     = usePatientStore(s => s.ventilator.pauseManeuver);
  const isArm     = usePatientStore(s => s.isVentilatorConnected);

  // Etiqueta de modo para display
  const modeLabel: Record<string, string> = {
    'VC-AC': 'VCV', 'PC-AC': 'PCV', 'PSV': 'PSV', 'SIMV': 'SIMV', 'CPAP': 'CPAP',
  };

  return (
    <div className="shrink-0 px-3 pt-1 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[0.42rem] font-black text-slate-500 tracking-widest uppercase">Acceso Rápido ARM</div>
        <div className={`text-[0.42rem] font-black px-1.5 py-0.5 rounded border font-mono ${
          isArm
            ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          {isArm ? (modeLabel[mode] ?? mode) : 'DESCONECTADO'}
        </div>
      </div>

      {/* Grid de parámetros — 3 × 2 */}
      <div className="grid grid-cols-3 gap-1 mb-1.5">
        <SpinCell fieldKey="vt"       value={vt}       disabled={!isArm} />
        <SpinCell fieldKey="peep"     value={peep}     disabled={!isArm} />
        <SpinCell fieldKey="setRR"    value={setRR}    disabled={!isArm} />
        <SpinCell fieldKey="fio2"     value={fio2}     disabled={!isArm} />
        <SpinCell fieldKey="flowRate" value={flowRate} disabled={!isArm} />
        <SpinCell fieldKey="iTime"    value={iTime}    disabled={!isArm} />
      </div>

      {/* Botones de pausa */}
      <div className="flex gap-1">
        <PauseButton type="INSPIRATORY" activePause={pause} disabled={!isArm} />
        <PauseButton type="EXPIRATORY"  activePause={pause} disabled={!isArm} />
      </div>

      {/* Feedback de maniobra activa */}
      {pause !== 'NONE' && (
        <div className={`mt-1 rounded text-center py-1 text-[0.38rem] font-bold border ${
          pause === 'INSPIRATORY'
            ? 'bg-yellow-900/30 border-yellow-800 text-yellow-400'
            : 'bg-cyan-900/30 border-cyan-800 text-cyan-400'
        }`}>
          {pause === 'INSPIRATORY'
            ? `Pausa inspiratoria activa — Pplat ≈ ${Math.round(usePatientStore.getState().vitals.pplat)} cmH₂O`
            : `Pausa espiratoria activa — midiendo Auto-PEEP…`
          }
        </div>
      )}
    </div>
  );
}
