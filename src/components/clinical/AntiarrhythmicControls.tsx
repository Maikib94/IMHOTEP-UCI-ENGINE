// src/components/clinical/AntiarrhythmicControls.tsx
// UI de antiarrítmicos: amiodarona + digoxina + esmolol
// Bolos instantáneos (dig/esmolol) y bolos lentos (amio 10/20 min via PharmacologyEngine)
// Concentración display con código de color por ventana terapéutica.

import React from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { PharmacologyEngine } from '../../core/PharmacologyEngine';

// ─── Ventanas terapéuticas (para código de color de concentración) ─────────────
// Amiodarona: terapéutica 1.0-2.5 mg/L   (cpRatio 0.67-1.67)
// Digoxina:   terapéutica 0.8-2.0 ng/mL  (cpRatio 0.67-1.67)
// Esmolol:    terapéutica 0.4-1.2 µg/mL  (cpRatio 0.5-1.0)

interface ConcDisplayProps {
  cpRatio: number;
  value: string;
  unit: string;
  loThreshold: number;  // cpRatio inferior (debajo = subterapéutico)
  hiThreshold: number;  // cpRatio superior (encima = tóxico)
}

function ConcDisplay({ cpRatio, value, unit, loThreshold, hiThreshold }: ConcDisplayProps) {
  const isToxic = cpRatio > hiThreshold;
  const isSub   = cpRatio < loThreshold && cpRatio > 0.01;
  const color   = isToxic ? 'text-red-400' : isSub ? 'text-yellow-400' : cpRatio > 0.01 ? 'text-emerald-400' : 'text-slate-500';
  const label   = isToxic ? '⚠ TÓXICO' : isSub ? '↓ SUB' : cpRatio > 0.01 ? '✓ TER.' : '—';
  const bg      = isToxic ? 'bg-red-900/20 border-red-800/50' : 'bg-slate-800/30 border-slate-700/30';

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.42rem] font-mono font-bold ${bg} ${color}`}>
      {value} {unit}
      <span className="text-slate-500 font-normal text-[0.38rem]">{label}</span>
    </div>
  );
}

// ─── Slider de infusión compacto ──────────────────────────────────────────────

interface InfSliderProps {
  drug: 'amiodarone' | 'digoxin' | 'esmolol';
  min: number;
  max: number;
  step: number;
  label: string;
}

function InfSlider({ drug, min, max, step, label }: InfSliderProps) {
  const value   = usePharmacologyStore(s => s.infusionRates[drug] ?? 0);
  const setRate = usePharmacologyStore(s => s.setInfusionRate);

  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[0.42rem] text-slate-500 w-10 shrink-0">Infusión</span>
      <input type="range" title={label} min={min} max={max} step={step}
        value={value}
        onChange={e => setRate(drug, Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: '#8b5cf6' }}
      />
      <span className="text-[0.42rem] text-violet-300 font-mono font-bold w-16 text-right shrink-0">
        {value.toFixed(value < 1 ? 3 : 1)} {label}
      </span>
    </div>
  );
}

// ─── Botón de bolo ────────────────────────────────────────────────────────────

interface BolusButtonProps {
  label: string;
  onClick: () => void;
}

function BolusBtn({ label, onClick }: BolusButtonProps) {
  return (
    <button type="button" onClick={onClick}
      className="flex-1 py-1 text-[0.44rem] font-black bg-violet-500/10 hover:bg-violet-500/25 border border-violet-600/30 hover:border-violet-500/70 rounded text-violet-400 uppercase tracking-wider cursor-pointer transition-all">
      {label}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AntiarrhythmicControls() {
  const plasmaConc  = usePharmacologyStore(s => s.plasmaConcentrations);
  const queueBolus  = usePharmacologyStore(s => s.queueBolusRatio);
  const DRUG_MAX    = { amiodarone: 60, digoxin: 0.05, esmolol: 200 };
  const HALF_H      = { amiodarone: 1.5, digoxin: 2.0, esmolol: 0.15 };

  const amioRatio  = plasmaConc['amiodarone'] ?? 0;
  const digRatio   = plasmaConc['digoxin']    ?? 0;
  const esmolRatio = plasmaConc['esmolol']    ?? 0;

  // Concentraciones en unidades clínicas
  const amioMgL  = (amioRatio  * 1.5).toFixed(2);   // mg/L  (terapéutico 1.0-2.5)
  const digNgmL  = (digRatio   * 1.2).toFixed(2);   // ng/mL (terapéutico 0.8-2.0)
  const esmUgmL  = (esmolRatio * 0.8).toFixed(2);   // µg/mL (terapéutico 0.4-1.2)

  // Administrar bolo instantáneo (dig, esmolol)
  const giveFastBolus = (drug: 'amiodarone' | 'digoxin' | 'esmolol', doseMg: number) => {
    const ratio = Math.min(doseMg / (DRUG_MAX[drug] * HALF_H[drug]), 3.0);
    queueBolus(drug, ratio);
  };

  // Bolo lento (amiodarona): usa PharmacologyEngine.queueSlowBolus()
  const giveSlowBolus = (doseMg: number, durationSec: number) => {
    PharmacologyEngine.getInstance().queueSlowBolus('amiodarone', doseMg, durationSec);
  };

  return (
    <div className="p-3 space-y-4">

      {/* ── AMIODARONA ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.5rem] font-bold text-slate-300 uppercase tracking-wider">Amiodarona</span>
          <ConcDisplay cpRatio={amioRatio} value={amioMgL} unit="mg/L"
            loThreshold={0.33} hiThreshold={1.67} />
        </div>
        {/* Bolos lentos (según AHA ACLS 2023) */}
        <div className="flex gap-1.5 mb-2">
          <BolusBtn label="Bolo 150mg / 10min" onClick={() => giveSlowBolus(150, 600)} />
          <BolusBtn label="Bolo 300mg / 20min" onClick={() => giveSlowBolus(300, 1200)} />
        </div>
        <InfSlider drug="amiodarone" min={0} max={60} step={1} label="mg/h" />
        <div className="text-[0.36rem] text-slate-600 mt-0.5">
          Mant.: 0.5–1 mg/min (30–60 mg/h) · Clase III VW
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── DIGOXINA ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.5rem] font-bold text-slate-300 uppercase tracking-wider">Digoxina</span>
          <ConcDisplay cpRatio={digRatio} value={digNgmL} unit="ng/mL"
            loThreshold={0.67} hiThreshold={1.67} />
        </div>
        <div className="flex gap-1.5 mb-2">
          <BolusBtn label="Bolo 0.25 mg" onClick={() => giveFastBolus('digoxin', 0.25)} />
          <BolusBtn label="Bolo 0.50 mg" onClick={() => giveFastBolus('digoxin', 0.50)} />
        </div>
        <InfSlider drug="digoxin" min={0} max={0.025} step={0.001} label="mg/h" />
        <div className="text-[0.36rem] text-slate-600 mt-0.5">
          Mant.: 0.125–0.25 mg/día · Ventana estrecha ({'>'} 2.0 ng/mL = tóxico)
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── ESMOLOL ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.5rem] font-bold text-slate-300 uppercase tracking-wider">Esmolol</span>
          <ConcDisplay cpRatio={esmolRatio} value={esmUgmL} unit="µg/mL"
            loThreshold={0.50} hiThreshold={1.00} />
        </div>
        <div className="flex gap-1.5 mb-2">
          <BolusBtn label="Bolo 500 µg/kg" onClick={() => giveFastBolus('esmolol', 500 * 70)} />
        </div>
        <InfSlider drug="esmolol" min={0} max={200} step={10} label="µg/kg/min" />
        <div className="text-[0.36rem] text-slate-600 mt-0.5">
          t½ = 9 min · Revertible en {'<'} 10 min · β₁-bloqueante selectivo
        </div>
      </div>

    </div>
  );
}
