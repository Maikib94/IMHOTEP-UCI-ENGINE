// src/components/clinical/drugControls.tsx
// Helpers compartidos: InfusionControl (vasopresores/inotrópicos), DrugControlCard (antiarrítmicos).
// DrugControlCard: layout horizontal con ▲▼ stepper + botón BOLO, idéntico en estética.

import React from 'react';
import { usePharmacologyStore, type DrugId, DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { DRUG_MAX_DOSES } from '../../core/PharmacologyEngine';
import { usePatientStore } from '../../store/usePatientStore';
import { useUIStore } from '../../store/useUIStore';
import { doseToCcH, type DrugUnit } from '../../utils/dilutionTable';

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

// ─── Infusion control row — stepper + always-editable input + cc/h ──────────
// FIX: input is ALWAYS editable (no read-only when rate > 0)

export interface InfusionControlProps {
  label:            string;
  drug:             DrugId;
  unit:             string;
  step?:            number;
  colorTheme?:      ColorTheme;
  showDilutionGear?: boolean;
}

export function InfusionControl({
  label, drug, unit, step, colorTheme = 'cyan',
}: InfusionControlProps) {
  const rate      = usePharmacologyStore(s => s.infusionRates[drug] ?? 0);
  const setRate   = usePharmacologyStore(s => s.setInfusionRate);
  const dripMode  = useUIStore(s => s.dripUnitMode);
  const weight    = usePatientStore(s => s.vitals.weight ?? 70);

  const t = THEME_COLORS[colorTheme];
  const isActive  = rate > 0;
  const maxRate   = DRUG_MAX_DOSES[drug] ?? 100;
  const stepSize  = step ?? Math.max(0.01, maxRate * 0.05);

  const ccH = doseToCcH(drug, rate, unit as DrugUnit, weight);

  function nudge(delta: number) {
    // Only prevents negative values — no upper cap (pedagogía libre de over-dosing)
    const next = Math.max(0, rate + delta);
    setRate(drug, parseFloat(next.toFixed(3)));
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors mb-1 ${
      isActive ? 'border-white/10 bg-[#0f1b2d]' : 'border-white/5 bg-[#0f172a]'
    }`}>
      {/* Label */}
      <span className={`text-[0.5rem] font-bold w-24 shrink-0 truncate ${isActive ? t.text : 'text-slate-500'}`}>
        {label}
      </span>

      {/* Stepper − */}
      <button type="button" onClick={() => nudge(-stepSize)}
        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded text-[0.65rem] font-bold cursor-pointer shrink-0">
        −
      </button>

      {/* Input — ALWAYS editable (read-only bug fix) */}
      <input
        type="number"
        value={rate === 0 ? '' : Number(rate).toFixed(2)}
        placeholder="0.00"
        step={stepSize}
        min={0}
        title={label}
        onChange={e => {
          const v = parseFloat(e.target.value);
          setRate(drug, Number.isNaN(v) ? 0 : Math.max(0, v));
        }}
        className={`w-12 bg-[#1e293b] text-right text-[0.6rem] border border-slate-700 rounded px-1 py-0.5 focus:outline-none font-mono ${t.input}`}
      />

      {/* Stepper + */}
      <button type="button" onClick={() => nudge(+stepSize)}
        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded text-[0.65rem] font-bold cursor-pointer shrink-0">
        +
      </button>

      {/* Unit */}
      <span className="text-[0.42rem] text-slate-500 flex-1 min-w-0 truncate">{unit}</span>

      {/* cc/h badge — visible when dripMode is not pure medical */}
      {dripMode !== 'medical' && ccH > 0 && (
        <span className="text-[0.42rem] text-cyan-300 font-mono whitespace-nowrap shrink-0">
          ≈{ccH.toFixed(1)}
        </span>
      )}

      {/* ⚠ over-range badge — non-blocking feedback when above clinical cap */}
      {rate > maxRate && (
        <span
          className="text-[0.38rem] font-bold text-amber-400 px-0.5 rounded border border-amber-700/40 bg-amber-900/20 shrink-0 whitespace-nowrap"
          title="Dosis fuera del rango clínico estándar — observe respuesta y efectos adversos"
        >
          ⚠&gt;máx
        </span>
      )}

      {/* Stop button — only when rate > 0 */}
      {isActive && (
        <button type="button" onClick={() => setRate(drug, 0)}
          title="Detener infusión"
          className="text-[0.6rem] text-slate-600 hover:text-red-400 cursor-pointer shrink-0 leading-none">
          ⏹
        </button>
      )}
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
// Bug 3 fix: now also calls addBolusHistory so all boluses appear in DoseAgenda.

import { useTimeStore } from '../../store/useTimeStore';

export function useBolusAdmin() {
  const queueBolusRatio = usePharmacologyStore(s => s.queueBolusRatio);
  const addBolusHistory = usePharmacologyStore(s => s.addBolusHistory);

  return (drug: DrugId, doseMg: number, route: 'iv' | 'oral' = 'iv') => {
    if (!Number.isFinite(doseMg) || doseMg <= 0) {
      console.warn(`[BOLUS] Invalid dose for ${drug}: ${doseMg}`);
      return;
    }
    // 1) PK effect
    const maxRate   = DRUG_MAX_DOSES[drug] ?? 1;
    const halfLifeH = (DRUG_CATALOG[drug]?.halfLifeMin ?? 60) / 60;
    const ratio     = doseMg / (maxRate * halfLifeH);
    queueBolusRatio(drug, Math.min(ratio, 3.0));

    // 2) Agenda registration
    const currentTick = useTimeStore.getState().ticks;
    addBolusHistory(drug, doseMg, currentTick, route);
  };
}

// ─── DrugControlCard — @deprecated wrapper retro-compat ───────────────────────
// Use InfusionControl + BolusRow separately. Kept for legacy imports.

interface DrugControlCardProps {
  label:       string;
  drug:        DrugId;
  unit:        string;
  step:        number;
  bolusLabel:  string;
  onBolus:     () => void;
  colorTheme?: ColorTheme;
  decimals?:   number;
}

export function DrugControlCard({
  label, drug, unit, step, bolusLabel, onBolus,
  colorTheme = 'violet',
}: DrugControlCardProps) {
  return (
    <div className="space-y-1 mb-1">
      <InfusionControl label={label} drug={drug} unit={unit} step={step} colorTheme={colorTheme} />
      <button
        type="button"
        onClick={onBolus}
        className={`w-full py-0.5 px-1 rounded text-[0.45rem] font-bold uppercase tracking-wider cursor-pointer ${
          colorTheme === 'violet'
            ? 'bg-violet-900/20 border border-violet-700/40 text-violet-400 hover:bg-violet-800/30'
            : 'bg-slate-900/20 border border-slate-700/40 text-slate-400 hover:bg-slate-800/30'
        }`}
      >
        ↑ BOLO {bolusLabel}
      </button>
    </div>
  );
}
