// src/components/clinical/DilutionConfigModal.tsx
//
// Modal de configuración de dilución por droga.
// Permite al usuario sobreescribir la dilución estándar con valores personalizados.
// Persiste en useDilutionStore → localStorage.

import React, { useState } from 'react';
import { useDilutionStore, computeCcHWithPreset, type DilutionPreset, type DiluentType } from '../../store/useDilutionStore';
import { DILUTION_STANDARDS } from '../../utils/dilutionTable';
import type { DrugId } from '../../store/usePharmacologyStore';
import { DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { usePatientStore } from '../../store/usePatientStore';

const DILUENTS: DiluentType[] = ['SF09', 'D5W', 'Plasmalyte', 'LR'];

const DILUENT_LABEL: Record<DiluentType, string> = {
  SF09:       'SF 0.9%',
  D5W:        'Dx 5%',
  Plasmalyte: 'Plasmalyte',
  LR:         'Ringer Lactato',
};

interface Props {
  drug:    DrugId;
  onClose: () => void;
}

export function DilutionConfigModal({ drug, onClose }: Props) {
  const getPreset     = useDilutionStore(s => s.getPreset);
  const setActive     = useDilutionStore(s => s.setActive);
  const resetToStd    = useDilutionStore(s => s.resetToStandard);
  const weightKg      = usePatientStore(s => s.profile?.weightKg ?? 70);

  const std    = DILUTION_STANDARDS[drug];
  const active = getPreset(drug);

  const drugLabel = DRUG_CATALOG[drug]?.shortName ?? drug;
  const unit      = active?.unit ?? 'mg/mL';

  const [draft, setDraft] = useState<DilutionPreset>(
    active ?? {
      drugId: drug,
      drugAmountMg: std ? std.concentration_mg_mL * std.defaultDiluentVol_mL : 50,
      diluentVolumeMl: std?.defaultDiluentVol_mL ?? 250,
      diluentType: 'SF09',
      concentration_mg_mL: std?.concentration_mg_mL ?? 0.2,
      unit: 'mg/mL',
      source: 'standard',
      notes: std?.notes,
    }
  );

  function updateDraft(partial: Partial<DilutionPreset>) {
    setDraft(prev => {
      const next = { ...prev, ...partial };
      next.concentration_mg_mL = next.drugAmountMg / next.diluentVolumeMl;
      return next;
    });
  }

  const inputUnit = DRUG_CATALOG[drug]?.inputUnit ?? 'mg/h';
  const exampleDose = inputUnit === 'mcg/kg/min' ? 0.20 : 5;
  const exampleCcH  = computeCcHWithPreset(drug, exampleDose, inputUnit as Parameters<typeof computeCcHWithPreset>[2], weightKg, draft);

  const concDisplay = draft.unit === 'mcg/mL'
    ? `${(draft.concentration_mg_mL * 1000).toFixed(1)} mcg/mL`
    : `${draft.concentration_mg_mL.toFixed(3)} mg/mL`;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-[380px] rounded-2xl border border-white/10 shadow-2xl" style={{ background: '#080d1a' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
          <div>
            <div className="text-[0.55rem] font-black uppercase tracking-[0.2em] text-amber-400">Dilución</div>
            <div className="text-[0.65rem] font-bold text-white">{drugLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 cursor-pointer">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* Standard notes */}
          {std?.notes && (
            <div className="bg-amber-950/25 rounded-lg border border-amber-700/30 px-3 py-2 text-[0.44rem] text-amber-300 font-mono">
              Estándar: {std.notes}
            </div>
          )}

          {/* Drug amount */}
          <div className="flex items-center justify-between">
            <span className="text-[0.5rem] text-slate-300">Cantidad de droga (mg)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={draft.drugAmountMg}
                onChange={e => updateDraft({ drugAmountMg: +e.target.value })}
                className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-[0.5rem] font-mono text-slate-200 text-right"
              />
              <span className="text-[0.42rem] text-slate-500">mg</span>
            </div>
          </div>

          {/* Diluent volume */}
          <div className="flex items-center justify-between">
            <span className="text-[0.5rem] text-slate-300">Volumen diluyente (mL)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                step={10}
                value={draft.diluentVolumeMl}
                onChange={e => updateDraft({ diluentVolumeMl: +e.target.value })}
                className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-[0.5rem] font-mono text-slate-200 text-right"
              />
              <span className="text-[0.42rem] text-slate-500">mL</span>
            </div>
          </div>

          {/* Diluent type */}
          <div className="flex items-center justify-between">
            <span className="text-[0.5rem] text-slate-300">Tipo de diluyente</span>
            <div className="flex gap-1">
              {DILUENTS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => updateDraft({ diluentType: d })}
                  className="px-1.5 py-0.5 rounded text-[0.4rem] font-bold cursor-pointer transition-all"
                  style={{
                    background:  draft.diluentType === d ? 'rgba(59,130,246,0.25)' : 'rgba(0,0,0,0.4)',
                    border:      `1px solid ${draft.diluentType === d ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                    color:       draft.diluentType === d ? '#93c5fd' : '#64748b',
                  }}
                >
                  {DILUENT_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Result */}
          <div className="bg-[#0a0f1e] rounded-xl border border-white/5 p-3 space-y-1.5">
            <div className="flex justify-between text-[0.5rem]">
              <span className="text-slate-400">Concentración resultante</span>
              <span className="text-cyan-400 font-mono font-bold">{concDisplay}</span>
            </div>
            <div className="flex justify-between text-[0.5rem]">
              <span className="text-slate-500">Ej. {exampleDose} {inputUnit} en {weightKg}kg</span>
              <span className="text-emerald-400 font-mono font-bold">{exampleCcH.toFixed(1)} cc/h</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { resetToStd(drug); onClose(); }}
              className="flex-1 py-2 rounded-xl border border-white/10 text-slate-400 text-[0.48rem] font-bold cursor-pointer hover:border-white/20 transition-all"
            >
              ↺ Restaurar estándar
            </button>
            <button
              type="button"
              onClick={() => { setActive(drug, { ...draft, source: 'custom' }); onClose(); }}
              className="flex-1 py-2 rounded-xl text-[0.5rem] font-black tracking-wider cursor-pointer transition-all"
              style={{ background: '#f59e0b', color: '#000' }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DilutionConfigModal;
