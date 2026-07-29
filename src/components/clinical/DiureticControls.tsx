// src/components/clinical/DiureticControls.tsx
//
// Subsección DIURÉTICOS dentro de FÁRMACOS ESPECIALES.
// Furosemida IV: bolos 20/40/80 mg + infusión continua 0-20 mg/h.
// Furosemida oral: infusión continua como equivalente dosis oral.
// Display: UO actual (mL/kg/h) + K⁺ sérico con alarma < 3.0.
//
// Ref: Felker NEJM 2011 (DOSE trial); Mullens EHJ 2019; Hoorn JASN 2017.

import React, { useState } from 'react';
import { usePatientStore } from '../../store/usePatientStore';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { PharmacologyEngine, DRUG_MAX_DOSES } from '../../core/PharmacologyEngine';
import { DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { DrugControlCard } from './drugControls';

// ─── Bolus helper ────────────────────────────────────────────────────────────

function useFurosemideBolus() {
  return (drug: 'furosemide_iv', doseMg: number) => {
    // Push over ~2 min IV (120 sim-seconds) — estándar administración furosemida IV
    PharmacologyEngine.getInstance().queueSlowBolus(drug, doseMg, 120);
  };
}

// ─── Bolus preset buttons ────────────────────────────────────────────────────

interface BolusPresetProps {
  doses: number[];
  unit: string;
  onBolus: (dose: number) => void;
  accentColor: string;
}

function BolusPresets({ doses, unit, onBolus, accentColor }: BolusPresetProps) {
  return (
    <div className="flex gap-1 mb-2">
      {doses.map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onBolus(d)}
          style={{ borderColor: accentColor, color: accentColor }}
          className="flex-1 py-0.5 text-[0.44rem] font-black rounded border bg-transparent hover:bg-white/5 uppercase tracking-wider transition-all cursor-pointer"
        >
          ↑ {d} {unit}
        </button>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DiureticControls() {
  const uo      = usePatientStore(s => s.vitals.urineOutput);
  const kPlasma = usePatientStore(s => s.vitals.kPlasma ?? 4.0);
  const weight  = usePatientStore(s => s.vitals.weight ?? 70);
  const admBolus = useFurosemideBolus();

  const furosIVRate   = usePharmacologyStore(s => s.infusionRates['furosemide_iv'] ?? 0);
  const furosOralRate = usePharmacologyStore(s => s.infusionRates['furosemide_oral'] ?? 0);
  const setRate       = usePharmacologyStore(s => s.setInfusionRate);
  const scheduledDoses    = usePharmacologyStore(s => s.scheduledDoses);
  const scheduleDose      = usePharmacologyStore(s => s.scheduleDose);
  const cancelScheduledDose = usePharmacologyStore(s => s.cancelScheduledDose);

  const [pendingDose, setPendingDose]         = useState<number | null>(null);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);

  // UO efectiva en mL/h (para el display clínico junto al peso)
  const uoMlH = parseFloat((uo * weight).toFixed(0));

  // K+ color/alarm
  const kColor = kPlasma < 2.8 ? '#f87171' : kPlasma < 3.0 ? '#fbbf24' : kPlasma < 3.5 ? '#fb923c' : '#34d399';
  const kAlarm = kPlasma < 3.0;

  // Infusion steps (10 % de max)
  const ivStep   = DRUG_MAX_DOSES['furosemide_iv'] * 0.1;    // 2 mg/h
  const oralStep = DRUG_MAX_DOSES['furosemide_oral'] * 0.1;  // 0.7 mg/h

  return (
    <div className="p-3 space-y-3">

      {/* ── Status diurético ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1 bg-[#0f172a] rounded-lg border border-white/5 p-2 text-center">
          <div className="text-[0.42rem] text-slate-500 uppercase tracking-wider mb-0.5">UO actual</div>
          <div className={`text-sm font-black font-mono ${uo < 0.5 ? 'text-red-400' : uo > 3 ? 'text-yellow-400' : 'text-cyan-300'}`}>
            {uo.toFixed(1)} <span className="text-[0.5rem] text-slate-400">mL/kg/h</span>
          </div>
          <div className="text-[0.42rem] text-slate-500 mt-0.5">{uoMlH} mL/h (70 kg ref.)</div>
        </div>
        <div
          className="flex-1 bg-[#0f172a] rounded-lg border p-2 text-center transition-all"
          style={{ borderColor: kAlarm ? kColor : 'rgba(255,255,255,0.05)' }}
        >
          <div className="text-[0.42rem] text-slate-500 uppercase tracking-wider mb-0.5">K⁺ sérico</div>
          <div className="font-black font-mono text-sm" style={{ color: kColor }}>
            {kPlasma.toFixed(1)} <span className="text-[0.5rem] text-slate-400">mEq/L</span>
          </div>
          {kAlarm && (
            <div className="text-[0.4rem] font-black uppercase tracking-widest animate-pulse" style={{ color: kColor }}>
              ⚠ HIPOCALEMIA
            </div>
          )}
          {!kAlarm && (
            <div className="text-[0.42rem] text-slate-500 mt-0.5">
              {kPlasma < 3.5 ? '↓ leve' : kPlasma > 5.0 ? '↑ hiperK' : 'normal'}
            </div>
          )}
        </div>
      </div>

      {/* ── Furosemida IV ────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-cyan-400">
            Furosemida IV
          </div>
          <div className="text-[0.4rem] text-slate-600 font-mono">t½=1.5h · renal · loop</div>
        </div>

        <BolusPresets
          doses={[20, 40, 80]}
          unit="mg"
          onBolus={d => admBolus('furosemide_iv', d)}
          accentColor="#22d3ee"
        />

        {/* Infusión continua */}
        <div className="flex items-center gap-2">
          <span className="text-[0.44rem] text-slate-400 w-16 shrink-0">Infusión cont.</span>
          <input
            type="range"
            min={0}
            max={DRUG_MAX_DOSES['furosemide_iv']}
            step={ivStep}
            value={furosIVRate}
            title="Infusión furosemida IV"
            onChange={e => setRate('furosemide_iv', parseFloat(e.target.value))}
            className="flex-1 accent-cyan-400 h-1"
          />
          <span className="text-[0.5rem] font-mono text-cyan-300 w-14 text-right">
            {furosIVRate.toFixed(1)} mg/h
          </span>
          {furosIVRate > 0 && (
            <button
              type="button"
              onClick={() => setRate('furosemide_iv', 0)}
              className="text-[0.4rem] px-1.5 py-0.5 rounded border border-red-800 text-red-400 hover:bg-red-900/30 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">
          Ref: Felker NEJM 2011 — 40mg EV → +120 mL/h · resistencia en AKI (Mullens EHJ 2019)
        </div>
      </div>

      {/* ── Furosemida oral — dose-based ─────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-teal-400">
            Furosemida oral
          </div>
          <div className="text-[0.4rem] text-slate-600 font-mono">F=50% · t½=1.5h</div>
        </div>

        {/* Dosis presets */}
        <div className="flex gap-1 mb-1.5">
          {[20, 40, 80, 160].map(d => (
            <button key={d} type="button"
              onClick={() => {
                const F = DRUG_CATALOG['furosemide_oral'].oralBioavailability ?? 0.5;
                PharmacologyEngine.getInstance().queueSlowBolus('furosemide_oral', d * F, 60);
              }}
              className="flex-1 py-1 rounded text-[0.48rem] font-bold cursor-pointer transition-all bg-teal-900/20 border border-teal-600/30 text-teal-300 hover:bg-teal-800/30"
            >
              {d}mg
            </button>
          ))}
        </div>

        {/* Frecuencia para dosis programadas VO */}
        <div className="mt-1.5 rounded-lg border border-teal-700/20 bg-black/20 p-1.5">
          <div className="text-[0.44rem] font-bold text-teal-400 uppercase tracking-wider mb-1">
            Programar c/…
          </div>
          <div className="flex gap-1 mb-1">
            {[40, 80, 160].map(d => (
              <button key={d} type="button"
                onClick={() => setPendingDose(d)}
                className={`flex-1 py-0.5 rounded text-[0.46rem] font-bold cursor-pointer transition-all ${
                  pendingDose === d ? 'bg-teal-600/30 text-teal-200 border border-teal-500' : 'bg-black/40 text-slate-500 border border-white/8'
                }`}
              >{d}mg</button>
            ))}
          </div>
          <div className="flex gap-1 mb-1">
            {[6, 8, 12, 24].map(h => (
              <button key={h} type="button"
                onClick={() => setPendingInterval(h)}
                className={`flex-1 py-0.5 rounded text-[0.42rem] cursor-pointer transition-all ${
                  pendingInterval === h ? 'bg-teal-600/30 text-teal-200 border border-teal-500' : 'bg-black/40 text-slate-500 border border-white/8'
                }`}
              >c/{h}h</button>
            ))}
          </div>
          <button type="button"
            disabled={!pendingDose || !pendingInterval}
            onClick={() => {
              if (pendingDose && pendingInterval) {
                scheduleDose('furosemide_oral', pendingDose, pendingInterval);
                setPendingDose(null); setPendingInterval(null);
              }
            }}
            className="w-full py-1 rounded text-[0.46rem] font-bold tracking-wider cursor-pointer disabled:opacity-40 transition-all bg-teal-900/30 border border-teal-600/40 text-teal-300"
          >PROGRAMAR VO</button>
        </div>

        <div className="text-[0.38rem] text-slate-600 mt-1">
          F=50% variable · Brater NEJM 1998 · 40-160 mg/dosis
        </div>
      </div>

      {/* ── Dosis a horario ─────────────────────────────────────────────── */}
      <div className="bg-black/30 rounded-lg border border-orange-500/20 p-2">
        <div className="text-orange-400 font-bold text-[0.5rem] tracking-wider mb-2 uppercase">
          Furosemida IV — Dosis a horario
        </div>

        {/* Selector dosis */}
        <div className="flex gap-1 mb-1.5">
          {[20, 40, 80, 160].map(d => (
            <button key={d} type="button"
              onClick={() => setPendingDose(d)}
              className={`flex-1 py-0.5 rounded text-[0.5rem] font-bold cursor-pointer transition-all ${
                pendingDose === d
                  ? 'bg-orange-500/40 text-orange-200 border border-orange-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              {d}mg
            </button>
          ))}
        </div>

        {/* Selector intervalo */}
        <div className="flex gap-0.5 mb-2">
          {[2, 4, 6, 8, 12, 24].map(h => (
            <button key={h} type="button"
              onClick={() => setPendingInterval(h)}
              className={`flex-1 py-0.5 rounded text-[0.44rem] cursor-pointer transition-all ${
                pendingInterval === h
                  ? 'bg-orange-500/40 text-orange-200 border border-orange-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              c/{h}h
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!pendingDose || !pendingInterval}
          onClick={() => {
            if (pendingDose && pendingInterval) {
              scheduleDose('furosemide_iv', pendingDose, pendingInterval);
              setPendingDose(null);
              setPendingInterval(null);
            }
          }}
          className="w-full py-1 bg-orange-700 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded text-[0.5rem] font-bold cursor-pointer disabled:cursor-not-allowed transition-all"
        >
          PROGRAMAR
        </button>

        {/* Lista de dosis activas */}
        {scheduledDoses.filter(s => s.drug === 'furosemide_iv' && s.active).length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {scheduledDoses
              .filter(s => s.drug === 'furosemide_iv' && s.active)
              .map(s => (
                <div key={s.id} className="flex justify-between items-center bg-orange-900/20 rounded px-1.5 py-0.5">
                  <span className="text-orange-300 text-[0.5rem] font-mono">
                    {s.doseMg}mg c/{s.intervalH}h
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelScheduledDose(s.id)}
                    className="text-red-400 text-[0.5rem] hover:text-red-300 cursor-pointer"
                  >✕</button>
                </div>
              ))
            }
          </div>
        )}
        <div className="text-[0.38rem] text-slate-600 mt-1">
          Felker NEJM 2011; Mullens EHJ 2019 — bolo simulado en 5 min IV
        </div>
      </div>

      {/* ── Diuréticos adicionales ──────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="text-[0.48rem] font-black uppercase tracking-widest text-slate-400 mb-2">
          Tiazidas / Ahorradores K⁺ / ACI
        </div>

        {/* HCT */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.46rem] font-bold text-cyan-300">Hidroclorotiazida oral</span>
            <span className="text-[0.38rem] text-slate-600">CLOROTIC 2022</span>
          </div>
          <div className="flex gap-1">
            {[25, 50, 100].map(d => (
              <button key={d} type="button"
                onClick={() => {
                  scheduleDose('hydrochlorothiazide_oral', d, 12);
                }}
                className="flex-1 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all bg-cyan-900/20 border border-cyan-700/30 text-cyan-400 hover:bg-cyan-800/25"
              >{d}mg c/12h</button>
            ))}
          </div>
        </div>

        {/* Metolazone */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.46rem] font-bold text-indigo-300">Metolazona oral</span>
            <span className="text-[0.38rem] text-slate-600">3T trial 2019</span>
          </div>
          <div className="flex gap-1">
            {[2.5, 5, 10].map(d => (
              <button key={d} type="button"
                onClick={() => scheduleDose('metolazone_oral', d, 24)}
                className="flex-1 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all bg-indigo-900/20 border border-indigo-700/30 text-indigo-400 hover:bg-indigo-800/25"
              >{d}mg c/24h</button>
            ))}
          </div>
        </div>

        {/* Spironolactone */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.46rem] font-bold text-emerald-300">Espironolactona oral</span>
            <span className="text-[0.38rem] text-slate-600">RALES · EMPHASIS-HF</span>
          </div>
          <div className="flex gap-1">
            {[25, 50, 100].map(d => (
              <button key={d} type="button"
                onClick={() => scheduleDose('spironolactone_oral', d, 24)}
                className="flex-1 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all bg-emerald-900/20 border border-emerald-700/30 text-emerald-400 hover:bg-emerald-800/25"
              >{d}mg c/24h</button>
            ))}
          </div>
          <div className="text-[0.36rem] text-yellow-600/70 mt-0.5">⚠ Monitorizar K⁺ + creatinina</div>
        </div>

        {/* Acetazolamide */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.46rem] font-bold text-violet-300">Acetazolamida IV</span>
            <span className="text-[0.38rem] text-slate-600">ADVOR NEJM 2022</span>
          </div>
          <div className="flex gap-1">
            {[250, 500].map(d => (
              <button key={d} type="button"
                onClick={() => {
                  PharmacologyEngine.getInstance().queueSlowBolus('acetazolamide_iv', d, 900);
                  scheduleDose('acetazolamide_iv', d, 24);
                }}
                className="flex-1 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all bg-violet-900/20 border border-violet-700/30 text-violet-400 hover:bg-violet-800/25"
              >{d}mg IV</button>
            ))}
          </div>
          <div className="text-[0.36rem] text-slate-600 mt-0.5">Alcalosis met. · resistencia diurética · máx 3d</div>
        </div>
      </div>

    </div>
  );
}
