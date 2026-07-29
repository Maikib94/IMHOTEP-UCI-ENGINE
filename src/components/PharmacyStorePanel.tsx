// src/components/PharmacyStorePanel.tsx
// Modal "Farmacia / Diluciones" — calcula cc/h por fármaco.
//
// Refs:
//   Forshay CM et al. AJHP 2020 — VERB concentraciones estandarizadas.
//   Nery J et al. AJHP 2025 — 347,170 infusiones: calculador reduce errores 10×.
/* eslint-disable react/forbid-dom-props */

import React, { useState, useMemo, memo } from 'react';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { usePatientStore }      from '../store/usePatientStore';
import type { DrugId }          from '../store/usePharmacologyStore';
import {
  DRUG_CONCENTRATIONS,
  PHARMACY_GROUPS,
  PHARMACY_GROUP_LABELS,
  type PharmacyGroup,
} from '../data/DrugConcentrations';
import { computeInfusionRate } from '../utils/DrugCalculator';
import type { ConcentrationUnit } from '../utils/DrugCalculator';
import { DRUG_LABELS_ES } from '../i18n/clinicalLabels.es';
import { DRUG_CATALOG }   from '../store/usePharmacologyStore';

// ─── DrugCard ─────────────────────────────────────────────────────────────────

interface DrugCardProps {
  drugId:   DrugId;
  weightKg: number;
}

const DrugCard = memo(function DrugCard({ drugId, weightKg }: DrugCardProps) {
  const rate      = usePharmacologyStore(s => s.infusionRates[drugId] ?? 0);
  const setRate   = usePharmacologyStore(s => s.setInfusionRate);

  const label    = DRUG_LABELS_ES[drugId];
  const concData = DRUG_CONCENTRATIONS[drugId];
  const catalog  = DRUG_CATALOG[drugId];

  const [localDose, setLocalDose] = useState<string>(rate.toFixed(2));
  const [concValue, setConcValue] = useState<number>(concData?.default ?? 1);
  const [concUnit,  setConcUnit]  = useState<ConcentrationUnit>(concData?.unit ?? 'mg/mL');

  const ccH = useMemo(() => {
    const dose = parseFloat(localDose);
    if (isNaN(dose) || !catalog) return 0;
    return computeInfusionRate({
      dose,
      inputUnit:         catalog.inputUnit as Parameters<typeof computeInfusionRate>[0]['inputUnit'],
      weightKg,
      concentration:     concValue,
      concentrationUnit: concUnit,
    });
  }, [localDose, concValue, concUnit, weightKg, catalog]);

  const isActive = rate > 0;
  const color    = isActive ? '#34d399' : '#475569';

  if (!label || !concData || !catalog) return null;

  return (
    <div
      className="rounded-xl border p-3 space-y-2 transition-all"
      style={{
        background:  isActive ? 'rgba(52,211,153,0.06)' : 'rgba(0,0,0,0.35)',
        borderColor: isActive ? 'rgba(52,211,153,0.3)'  : 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[0.6rem] font-black" style={{ color }}>
            {label.full}
          </span>
          <span
            className="ml-1.5 text-[0.4rem] font-bold px-1 rounded"
            style={{ background: `${color}20`, color }}
          >
            {label.short}
          </span>
        </div>
        {isActive && (
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
          />
        )}
      </div>

      {/* Dosis input */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-[0.48rem] text-slate-400 shrink-0">Dosis</span>
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <input
            type="number"
            value={localDose}
            step={0.01}
            min={0}
            onChange={e => {
              setLocalDose(e.target.value);
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0) setRate(drugId, val);
            }}
            className="w-16 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[0.5rem] font-mono text-right text-slate-200 focus:border-cyan-500/50 focus:outline-none"
          />
          <span className="text-[0.42rem] text-slate-500 shrink-0 w-16 text-left">
            {catalog.inputUnit}
          </span>
        </div>
      </label>

      {/* Concentración selector */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-[0.48rem] text-slate-400 shrink-0">Concent.</span>
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <select
            value={concValue}
            onChange={e => setConcValue(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[0.48rem] font-mono text-slate-200 cursor-pointer"
            style={{ fontSize: '0.48rem' }}
          >
            {[concData.default, ...concData.alternatives].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <span className="text-[0.42rem] text-slate-500 shrink-0">{concUnit}</span>
        </div>
      </label>

      {/* Peso */}
      <div className="flex items-center justify-between">
        <span className="text-[0.46rem] text-slate-500">Peso</span>
        <span className="text-[0.46rem] font-mono text-slate-400">{weightKg} kg</span>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Resultado */}
      <div className="flex items-center justify-between">
        <span className="text-[0.46rem] text-slate-400">Velocidad bomba</span>
        <span
          className="text-sm font-black font-mono"
          style={{ color: ccH > 0 ? '#60a5fa' : '#334155' }}
        >
          {ccH > 0 ? `${ccH} cc/h` : '—'}
        </span>
      </div>

      {/* Nota dilución */}
      <div className="text-[0.36rem] text-slate-700 leading-relaxed">
        {concData.vialNote}
      </div>
    </div>
  );
});

// ─── Column per group ─────────────────────────────────────────────────────────

const GroupColumn = memo(function GroupColumn({
  group,
  weightKg,
}: { group: PharmacyGroup; weightKg: number }) {
  const drugs = PHARMACY_GROUPS[group];
  const label = PHARMACY_GROUP_LABELS[group];

  return (
    <div className="flex flex-col min-w-[200px] max-w-[220px] shrink-0">
      <div
        className="text-[0.48rem] font-black uppercase tracking-widest mb-2 pb-1 border-b"
        style={{ color: '#94a3b8', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {label}
      </div>
      <div className="space-y-2 flex-1">
        {drugs.map(d => (
          <DrugCard key={d} drugId={d as DrugId} weightKg={weightKg} />
        ))}
      </div>
    </div>
  );
});

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
}

export const PharmacyStorePanel: React.FC<Props> = memo(function PharmacyStorePanel({ open, onClose }) {
  const weightKg = usePatientStore(s => s.vitals.weight ?? 70);
  const setRate  = usePharmacologyStore(s => s.setInfusionRate);

  if (!open) return null;

  const handleRestoreDefaults = () => {
    // Restaurar todas las infusiones a 0 (bomba apagada)
    Object.values(PHARMACY_GROUPS).flat().forEach(d => setRate(d as DrugId, 0));
  };

  return (
    <div
      className="fixed inset-0 z-[4000] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ background: '#080d1a', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div>
          <div className="text-[0.75rem] font-black uppercase tracking-[0.15em] text-slate-200">
            💊 Farmacia — Calculador de Diluciones
          </div>
          <div className="text-[0.45rem] text-slate-500 font-mono mt-0.5">
            Forshay AJHP 2020 · Nery AJHP 2025 · Peso paciente: {weightKg} kg
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors cursor-pointer text-xl"
        >
          ✕
        </button>
      </div>

      {/* Content — horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 px-6 py-4 h-full min-w-max">
          {(Object.keys(PHARMACY_GROUPS) as PharmacyGroup[]).map(group => (
            <GroupColumn key={group} group={group} weightKg={weightKg} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-6 py-3 border-t shrink-0"
        style={{ background: '#080d1a', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <button
          type="button"
          onClick={handleRestoreDefaults}
          className="text-[0.48rem] font-bold text-slate-500 hover:text-amber-400 transition-colors cursor-pointer"
        >
          ↺ Detener todas las infusiones
        </button>
        <div className="text-[0.4rem] text-slate-700 font-mono">
          cc/h = (dosis × peso × factor) ÷ concentración
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-[0.5rem] font-bold cursor-pointer transition-all border border-slate-600 text-slate-300 hover:border-slate-400"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
});

export default PharmacyStorePanel;
