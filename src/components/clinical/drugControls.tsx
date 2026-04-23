// src/components/clinical/drugControls.tsx
// Helpers compartidos para controles de droga (slider toggle + barra de progreso).
// Separados del panel principal para ser reutilizados por sub-componentes.

import React from 'react';
import { usePharmacologyStore, type DrugId, DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { DRUG_MAX_DOSES } from '../../core/PharmacologyEngine';

// ─── Paleta de colores por tema ───────────────────────────────────────────────

export type ColorTheme = 'cyan' | 'red' | 'orange' | 'yellow' | 'blue' | 'emerald' | 'violet';

export const THEME_COLORS: Record<ColorTheme, {
  bg: string; shadow: string; text: string; input: string;
}> = {
  cyan:    { bg: 'bg-cyan-500',    shadow: 'shadow-[0_0_10px_rgba(6,182,212,0.6)]',    text: 'text-cyan-400',    input: 'text-cyan-300 focus:border-cyan-500'    },
  red:     { bg: 'bg-red-600',     shadow: 'shadow-[0_0_10px_rgba(220,38,38,0.6)]',    text: 'text-red-600',     input: 'text-red-400 focus:border-red-600'       },
  orange:  { bg: 'bg-orange-500',  shadow: 'shadow-[0_0_10px_rgba(249,115,22,0.6)]',   text: 'text-orange-500',  input: 'text-orange-400 focus:border-orange-500' },
  yellow:  { bg: 'bg-yellow-400',  shadow: 'shadow-[0_0_10px_rgba(250,204,21,0.6)]',   text: 'text-yellow-400',  input: 'text-yellow-300 focus:border-yellow-400' },
  blue:    { bg: 'bg-blue-500',    shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.6)]',   text: 'text-blue-500',    input: 'text-blue-400 focus:border-blue-500'     },
  emerald: { bg: 'bg-emerald-400', shadow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]',   text: 'text-emerald-400', input: 'text-emerald-300 focus:border-emerald-400'},
  violet:  { bg: 'bg-violet-500',  shadow: 'shadow-[0_0_10px_rgba(139,92,246,0.6)]',   text: 'text-violet-400',  input: 'text-violet-300 focus:border-violet-500' },
};

// ─── Barra de progreso ────────────────────────────────────────────────────────

export function ProgressBar({
  value, max, colorClass, height = 'h-2',
}: { value: number; max: number; colorClass: string; height?: string }) {
  const fillPct = `${Math.min(100, (value / max) * 100).toFixed(1)}%`;
  return (
    <div className={`relative ${height} bg-slate-800 rounded-full overflow-hidden`}>
      <div
        ref={el => { if (el) el.style.width = fillPct; }}
        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${colorClass}`}
      />
    </div>
  );
}

// ─── Infusion control row (toggle + número) ───────────────────────────────────

interface InfusionControlProps {
  label: string;
  drug: DrugId;
  unit: string;
  step?: number;
  colorTheme?: ColorTheme;
}

export function InfusionControl({ label, drug, unit, step = 0.05, colorTheme = 'cyan' }: InfusionControlProps) {
  const value       = usePharmacologyStore(s => s.infusionRates[drug] ?? 0);
  const setRate     = usePharmacologyStore(s => s.setInfusionRate);
  const t = THEME_COLORS[colorTheme];
  const isActive = value > 0;

  return (
    <div className="flex items-center justify-between bg-[#0f172a] p-2 rounded-lg border border-white/5 mb-2 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setRate(drug, isActive ? 0 : step)}
          className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isActive ? `${t.bg} ${t.shadow}` : 'bg-slate-700'}`}
        >
          <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${isActive ? t.text : 'text-slate-400'}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value === 0 ? '' : Number(value).toFixed(2)}
          placeholder="0.00"
          step={step}
          title={label}
          onChange={e => {
            const val = parseFloat(e.target.value);
            setRate(drug, isNaN(val) ? 0 : val);
          }}
          className={`w-16 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none font-mono shadow-inner placeholder-slate-600 ${t.input}`}
        />
        <span className="text-[0.5rem] text-slate-500 w-12 shrink-0">{unit}</span>
      </div>
    </div>
  );
}

// ─── Bolus row ────────────────────────────────────────────────────────────────

interface BolusRowProps {
  label: string;
  drug: DrugId;
  dose: number;
  unit: string;
  colorTheme?: ColorTheme;
  onDoseChange: (dose: number) => void;
  onBolus: () => void;
  step: number;
  max: number;
}

export function BolusRow({ label, drug: _drug, dose, unit, colorTheme = 'yellow', onDoseChange, onBolus, step, max }: BolusRowProps) {
  const t = THEME_COLORS[colorTheme];
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className={`text-[0.55rem] font-bold w-14 shrink-0 ${t.text}`}>{label}</span>
      <input
        type="number"
        title={`Dosis bolo ${label}`}
        value={dose}
        step={step}
        min={0}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value);
          onDoseChange(isNaN(v) ? 0 : v);
        }}
        className={`w-12 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1 py-0.5 focus:outline-none font-mono ${t.input}`}
      />
      <span className="text-[0.45rem] text-slate-500 w-9 shrink-0">{unit}</span>
      <button
        type="button"
        onClick={onBolus}
        className={`flex-1 py-0.5 px-1.5 text-[0.48rem] font-bold rounded uppercase tracking-wider transition-all cursor-pointer ${
          colorTheme === 'yellow'
            ? 'bg-yellow-500/10 hover:bg-yellow-500/25 border border-yellow-600/30 hover:border-yellow-500/70 text-yellow-400'
            : colorTheme === 'blue'
              ? 'bg-blue-500/10 hover:bg-blue-500/25 border border-blue-600/30 hover:border-blue-500/70 text-blue-400'
              : 'bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-600/30 hover:border-emerald-500/70 text-emerald-400'
        }`}
      >
        BOLO ↑
      </button>
    </div>
  );
}

// ─── Hook para administrar bolo ───────────────────────────────────────────────

export function useBolusAdmin() {
  const queueBolusRatio = usePharmacologyStore(s => s.queueBolusRatio);
  return (drug: DrugId, doseMg: number) => {
    const maxRate   = DRUG_MAX_DOSES[drug];
    const halfLifeH = DRUG_CATALOG[drug].halfLifeMin / 60;
    const ratio     = doseMg / (maxRate * halfLifeH);
    queueBolusRatio(drug, Math.min(ratio, 3.0));
  };
}
