// src/components/clinical/CorticoidControls.tsx
//
// Subsección CORTICOIDES dentro de FÁRMACOS ESPECIALES.
// Cards: Hidrocortisona (vasopressor-sparing), Metilprednisolona, Dexametasona.
//
// Efectos modelados (Fase 4.C):
//   ↓ SDRA stress ODE hasta 35% (PathologyEngine vía antiInflammatoryEffect)
//   ↑ MAP +2-7 mmHg (efecto mineralocorticoide, pd.mapDirect)
//   vasoplegiaRev: restaura sensibilidad vasopresora (pd.vasoplegiaRev)
//
// Ref: APROCCHSS NEJM 2018; ADRENAL NEJM 2018; RECOVERY Lancet 2021;
//      Meduri CCM 2007; Chaudhuri Crit Care Explor 2024.

import React, { useState, useEffect, useRef } from 'react';
import { usePatientStore }     from '../../store/usePatientStore';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { PharmacologyEngine, DRUG_MAX_DOSES } from '../../core/PharmacologyEngine';
import { DrugControlCard }     from './drugControls';
import type { DrugId }         from '../../store/usePharmacologyStore';

// ─── Preset bolus buttons ────────────────────────────────────────────────────

interface PresetProps {
  label: string;
  onClick: () => void;
  accentColor?: string;
}

function PresetBtn({ label, onClick, accentColor = '#a78bfa' }: PresetProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderColor: accentColor, color: accentColor }}
      className="flex-1 py-0.5 text-[0.42rem] font-black rounded border bg-transparent hover:bg-white/5 uppercase tracking-wider transition-all cursor-pointer"
    >
      {label}
    </button>
  );
}

// ─── Vasopressor-sparing indicator ───────────────────────────────────────────

function VasopressorSparingBadge() {
  const hydroCp  = usePharmacologyStore(s => s.plasmaConcentrations['hydrocortisone'] ?? 0);
  const noraRate = usePharmacologyStore(s => s.infusionRates['noradrenaline'] ?? 0);
  const noraAtStartRef = useRef<number | null>(null);
  const [sparing, setSparing] = useState<number | null>(null);

  useEffect(() => {
    if (hydroCp > 0.05 && noraAtStartRef.current === null) {
      noraAtStartRef.current = noraRate;
    } else if (hydroCp <= 0.05) {
      noraAtStartRef.current = null;
      setSparing(null);
      return;
    }
    if (noraAtStartRef.current !== null && noraAtStartRef.current > 0) {
      const pct = Math.max(0, Math.round((noraAtStartRef.current - noraRate) / noraAtStartRef.current * 100));
      setSparing(pct);
    }
  }, [hydroCp, noraRate]);

  if (sparing === null) return null;

  const color = sparing >= 30 ? '#34d399' : sparing >= 10 ? '#fbbf24' : '#94a3b8';
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.4rem] font-mono font-bold"
      style={{ borderColor: color, color }}
    >
      <span>VASOPRESSOR SPARING</span>
      <span className="text-[0.5rem] font-black">{sparing}%</span>
      {sparing >= 30 && <span>✓</span>}
    </div>
  );
}

// ─── Sub-componente de dosis a horario ────────────────────────────────────────

interface CorticoidScheduleProps {
  drug:    DrugId;
  label:   string;
  doses:   number[];   // mg
  refs:    string;
  color:   string;
}

function CorticoidScheduleBlock({ drug, label, doses, refs, color }: CorticoidScheduleProps) {
  const [pendingDose,     setPendingDose]     = useState<number | null>(null);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);
  const scheduledDoses    = usePharmacologyStore(s => s.scheduledDoses);
  const scheduleDose      = usePharmacologyStore(s => s.scheduleDose);
  const cancelScheduled   = usePharmacologyStore(s => s.cancelScheduledDose);

  const activeDoses = scheduledDoses.filter(s => s.drug === drug && s.active);
  const INTERVALS   = [6, 8, 12, 24] as const;

  return (
    <div className="mt-1.5 rounded-lg border p-2 bg-black/25" style={{ borderColor: `${color}30` }}>
      <div className="text-[0.48rem] font-bold uppercase tracking-wider mb-1.5" style={{ color }}>
        Programar {label}
      </div>

      {/* Presets dosis */}
      <div className="flex gap-1 mb-1">
        {doses.map(d => (
          <button key={d} type="button"
            onClick={() => setPendingDose(d)}
            className="flex-1 py-0.5 rounded text-[0.46rem] font-bold cursor-pointer transition-all"
            style={{
              background: pendingDose === d ? `${color}25` : 'rgba(0,0,0,0.4)',
              border: `1px solid ${pendingDose === d ? color : 'rgba(255,255,255,0.08)'}`,
              color: pendingDose === d ? color : '#64748b',
            }}>
            {d}mg
          </button>
        ))}
      </div>

      {/* Intervalos */}
      <div className="flex gap-1 mb-1.5">
        {INTERVALS.map(h => (
          <button key={h} type="button"
            onClick={() => setPendingInterval(h)}
            className="flex-1 py-0.5 rounded text-[0.42rem] cursor-pointer transition-all"
            style={{
              background: pendingInterval === h ? `${color}20` : 'rgba(0,0,0,0.4)',
              border: `1px solid ${pendingInterval === h ? color : 'rgba(255,255,255,0.08)'}`,
              color: pendingInterval === h ? color : '#475569',
            }}>
            c/{h}h
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!pendingDose || !pendingInterval}
        onClick={() => {
          if (pendingDose && pendingInterval) {
            PharmacologyEngine.getInstance().queueSlowBolus(drug, pendingDose, 300);
            scheduleDose(drug, pendingDose, pendingInterval);
            setPendingDose(null);
            setPendingInterval(null);
          }
        }}
        className="w-full py-1 rounded text-[0.48rem] font-bold tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        style={{
          background: `${color}20`,
          border: `1px solid ${color}40`,
          color,
        }}>
        PROGRAMAR
      </button>

      {/* Dosis activas */}
      {activeDoses.map(s => (
        <div key={s.id} className="flex justify-between items-center mt-1 bg-black/20 rounded px-1.5 py-0.5">
          <span className="text-[0.46rem] font-mono" style={{ color }}>
            {s.doseMg}mg c/{s.intervalH}h
          </span>
          <button type="button" onClick={() => cancelScheduled(s.id)}
            className="text-red-400 text-[0.48rem] cursor-pointer">✕</button>
        </div>
      ))}

      <div className="text-[0.36rem] text-slate-600 mt-1">{refs}</div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CorticoidControls() {
  const weight = usePatientStore(s => s.vitals.weight ?? 70);

  const hydroStep = DRUG_MAX_DOSES['hydrocortisone'] * 0.1;          // 5 mg/h
  const methylStep = DRUG_MAX_DOSES['methylprednisolone'] * 0.05;    // 6.25 mg/h
  const dexaStep   = DRUG_MAX_DOSES['dexamethasone'] * 0.1;          // 0.05 mg/h

  // Bolus handlers
  const hydroBolus = (doseMg: number) =>
    PharmacologyEngine.getInstance().queueSlowBolus('hydrocortisone', doseMg, 300);
  const methylBolus = (doseMg: number) =>
    PharmacologyEngine.getInstance().queueSlowBolus('methylprednisolone', doseMg, 600);
  const dexaBolus = (doseMg: number) =>
    PharmacologyEngine.getInstance().queueSlowBolus('dexamethasone', doseMg, 300);

  // RECOVERY preset: 6 mg/d dexametasona = 0.25 mg/h
  const setRate = usePharmacologyStore(s => s.setInfusionRate);
  const applyRecovery = () => setRate('dexamethasone', 0.25);

  // Anti-inflammatory effect display
  const antiInflamm = usePharmacologyStore(s => s.systemicEffects.antiInflammatoryEffect ?? 0);

  return (
    <div className="p-3 space-y-3">

      {/* ── Estado antiinflamatorio global ──────────────────────────────── */}
      {antiInflamm > 0.05 && (
        <div className="bg-[#0f172a] rounded-lg border border-violet-800/30 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.44rem] font-black uppercase tracking-widest text-violet-400">
              Efecto antiinflamatorio pulmonar
            </span>
            <span className="text-[0.5rem] font-mono font-black text-violet-300">
              −{Math.round(antiInflamm * 35)}% VILI stress
            </span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${Math.min(100, antiInflamm * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Hidrocortisona ──────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-amber-400">
            Hidrocortisona
          </div>
          <div className="text-[0.38rem] text-slate-600 font-mono">200mg/d · mineralocorticoide</div>
        </div>
        <VasopressorSparingBadge />
        <div className="flex gap-1 mt-1.5 mb-1.5">
          <PresetBtn label="↑ 100mg" onClick={() => hydroBolus(100)} accentColor="#fbbf24" />
          <PresetBtn label="↑ 200mg" onClick={() => hydroBolus(200)} accentColor="#fbbf24" />
          <PresetBtn label="APROCCHSS 8.3mg/h" onClick={() => setRate('hydrocortisone', 8.3)} accentColor="#fbbf24" />
        </div>
        <DrugControlCard
          label="Hidrocortisona"
          drug="hydrocortisone"
          unit="mg/h"
          step={hydroStep}
          bolusLabel="200mg"
          onBolus={() => hydroBolus(200)}
          colorTheme="yellow"
          decimals={1}
        />
        <div className="text-[0.38rem] text-slate-600">
          APROCCHSS 2018: 200 mg/d IV continua en shock séptico
        </div>
        <CorticoidScheduleBlock
          drug="hydrocortisone"
          label="Hidrocortisona"
          doses={[50, 100, 200]}
          color="#fbbf24"
          refs="50mg c/6h=200mg/d (APROCCHSS NEJM 2018; ADRENAL NEJM 2018) · 65mg c/6h óptimo meta-análisis (Pitre Crit Care Explor 2024)"
        />
      </div>

      {/* ── Metilprednisolona ────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-orange-400">
            Metilprednisolona
          </div>
          <div className="text-[0.38rem] text-slate-600 font-mono">no mineralocorticoide · SDRA</div>
        </div>
        <div className="flex gap-1 mb-1.5">
          <PresetBtn
            label={`↑ 1mg/kg (${Math.round(weight)}mg)`}
            onClick={() => methylBolus(Math.round(weight * 1))}
            accentColor="#fb923c"
          />
          <PresetBtn
            label={`↑ 2mg/kg (${Math.round(weight*2)}mg)`}
            onClick={() => methylBolus(Math.round(weight * 2))}
            accentColor="#fb923c"
          />
        </div>
        <div className="flex gap-1 mb-1.5">
          <PresetBtn
            label={`↑ 30mg/kg PULSE (${Math.round(weight*30)}mg)`}
            onClick={() => methylBolus(Math.round(weight * 30))}
            accentColor="#ef4444"
          />
        </div>
        <DrugControlCard
          label="Metilprednisolona"
          drug="methylprednisolone"
          unit="mg/h"
          step={methylStep}
          bolusLabel={`1mg/kg`}
          onBolus={() => methylBolus(Math.round(weight))}
          colorTheme="orange"
          decimals={1}
        />
        <div className="text-[0.38rem] text-slate-600">
          Pulse SCI/anafilaxia: 30mg/kg · SDRA: 0.5-2mg/kg/d (Meduri CCM 2007)
        </div>
        <CorticoidScheduleBlock
          drug="methylprednisolone"
          label="Metilprednisolona"
          doses={[40, 80, 125]}
          color="#fb923c"
          refs="40mg c/24h×7d CAP severa (Meduri ICM 2022; n=584 RR 0.56 mort 28d)"
        />
      </div>

      {/* ── Dexametasona ────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-blue-400">
            Dexametasona
          </div>
          <div className="text-[0.38rem] text-slate-600 font-mono">sin mineralocorticoide · RECOVERY</div>
        </div>
        <div className="flex gap-1 mb-1.5">
          <PresetBtn
            label="RECOVERY 6mg/d"
            onClick={applyRecovery}
            accentColor="#60a5fa"
          />
          <PresetBtn label="↑ 4mg" onClick={() => dexaBolus(4)} accentColor="#60a5fa" />
          <PresetBtn label="↑ 8mg" onClick={() => dexaBolus(8)} accentColor="#60a5fa" />
          <PresetBtn label="↑ 16mg" onClick={() => dexaBolus(16)} accentColor="#3b82f6" />
        </div>
        <DrugControlCard
          label="Dexametasona"
          drug="dexamethasone"
          unit="mg/h"
          step={dexaStep}
          bolusLabel="6mg"
          onBolus={() => dexaBolus(6)}
          colorTheme="blue"
          decimals={3}
        />
        <div className="text-[0.38rem] text-slate-600">
          RECOVERY 2021: 6mg/d IV/VO × 10d → RR mort 0.83 en SDRA grave
        </div>
        <CorticoidScheduleBlock
          drug="dexamethasone"
          label="Dexametasona"
          doses={[4, 6, 8]}
          color="#60a5fa"
          refs="6mg c/24h×10d COVID-ARDS (RECOVERY Lancet 2021) · 4mg c/6h edema cerebral"
        />
      </div>

    </div>
  );
}
