// src/components/clinical/HydrationControls.tsx
//
// Plan de hidratación parenteral y bolos de expansión.
// Retención IV 30% (Hahn RG BJA 2018-2021, volume kinetics).

import React from 'react';
import { usePatientStore } from '../../store/usePatientStore';
import type { FluidType } from '../../store/usePatientStore';

const MONO = "[font-family:'JetBrains_Mono',monospace]";

type MaintType = 'ringer_lactato' | 'sf_09' | 'dex5';

const MAINT_OPTIONS: { value: MaintType; label: string }[] = [
  { value: 'ringer_lactato', label: 'Ringer Lactato' },
  { value: 'sf_09',          label: 'SF 0.9%'       },
  { value: 'dex5',           label: 'Dx 5%'         },
];

const RATE_PRESETS = [0, 50, 80, 100, 125, 150];

const BOLUS_OPTIONS: { vol: number; type: FluidType; label: string; color: string }[] = [
  { vol: 250,  type: 'ringer_lactato', label: '250 mL RL',   color: '#38bdf8' },
  { vol: 500,  type: 'ringer_lactato', label: '500 mL RL',   color: '#38bdf8' },
  { vol: 1000, type: 'ringer_lactato', label: '1 L RL',      color: '#22d3ee' },
  { vol: 500,  type: 'sf_09',          label: '500 mL SF',   color: '#7dd3fc' },
  { vol: 300,  type: 'prbc',           label: '1U GRE',      color: '#ef4444' },
  { vol: 250,  type: 'ffp',            label: '1U PFC',      color: '#fbbf24' },
];

export const HydrationControls: React.FC = () => {
  const maintRate  = usePatientStore(s => s.maintenanceFluidRate_mLh);
  const maintType  = usePatientStore(s => s.maintenanceFluidType) as MaintType;
  const maintCumul = usePatientStore(s => s.maintenanceCumulative_mL);
  const bloodVol   = usePatientStore(s => s.bloodVolume);
  const setRate    = usePatientStore(s => s.setMaintenanceFluidRate);
  const setType    = usePatientStore(s => s.setMaintenanceFluidType);
  const admin      = usePatientStore(s => s.administerFluid);

  const volPct = Math.round(Math.min(100, (bloodVol / 5000) * 100));
  const volColor = bloodVol < 3500 ? 'text-red-400'
    : bloodVol < 4200 ? 'text-amber-400'
    : bloodVol > 6500 ? 'text-blue-400'
    : 'text-emerald-400';

  return (
    <div className="p-2 space-y-2">

      {/* Volemia display */}
      <div className={`rounded-lg border border-white/5 bg-black/30 p-2 ${MONO}`}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[0.5rem] text-slate-400 uppercase tracking-widest">Volemia estimada</span>
          <span className={`text-sm font-black ${volColor}`}>{bloodVol} mL</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              bloodVol < 3500 ? 'bg-red-500' :
              bloodVol < 4200 ? 'bg-amber-400' :
              bloodVol > 6500 ? 'bg-blue-400' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, volPct * 1.4)}%` }}
          />
        </div>
        <div className="text-[0.42rem] text-slate-600 mt-0.5">
          Objetivo UCI: 4000-5500 mL · Acum. mant.: {(maintCumul / 1000).toFixed(1)} L
        </div>
      </div>

      {/* Plan de mantenimiento */}
      <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-2">
        <div className="text-cyan-400 font-bold text-[0.55rem] tracking-wider mb-2 uppercase">
          Plan de hidratación (mL/h)
        </div>

        {/* Tipo de fluido */}
        <div className="flex items-center gap-2 mb-2">
          <label className="text-[0.5rem] text-slate-400">Tipo:</label>
          <select
            value={maintType}
            onChange={e => setType(e.target.value as MaintType)}
            className="bg-black/50 border border-white/10 text-cyan-300 text-[0.55rem] rounded px-1 py-0.5 flex-1"
          >
            {MAINT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Rate stepper */}
        <div className="flex items-center gap-1 mb-2">
          <button
            type="button"
            onClick={() => setRate(Math.max(0, maintRate - 10))}
            className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-xs cursor-pointer hover:bg-cyan-800/50 transition-colors"
          >−</button>
          <div className={`flex-1 text-center bg-black/40 rounded py-1 ${MONO}`}>
            <span className="text-cyan-300 font-black text-lg">{maintRate}</span>
            <span className="text-cyan-500 text-[0.5rem] ml-1">mL/h</span>
          </div>
          <button
            type="button"
            onClick={() => setRate(Math.min(500, maintRate + 10))}
            className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-xs cursor-pointer hover:bg-cyan-800/50 transition-colors"
          >+</button>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-6 gap-0.5 mb-1.5">
          {RATE_PRESETS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRate(r)}
              className={`py-0.5 rounded text-[0.45rem] cursor-pointer transition-all font-bold ${
                maintRate === r
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400'
                  : 'bg-black/30 text-slate-500 border border-white/10 hover:border-cyan-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="text-[0.42rem] text-slate-500">
          30% retención IV · {(maintCumul / 1000).toFixed(2)} L acumulado (Hahn BJA 2018)
        </div>
      </div>

      {/* Bolos de expansión */}
      <div className="rounded-lg border border-emerald-500/20 bg-black/30 p-2">
        <div className="text-emerald-400 font-bold text-[0.55rem] tracking-wider mb-2 uppercase">
          Expansión — bolos
        </div>
        <div className="grid grid-cols-3 gap-1">
          {BOLUS_OPTIONS.map(({ vol, type, label, color }) => (
            <button
              key={`${type}-${vol}`}
              type="button"
              onClick={() => admin(type, vol)}
              className="py-1.5 rounded text-[0.5rem] font-bold border cursor-pointer transition-all hover:opacity-90"
              style={{
                background: `${color}18`,
                border: `1px solid ${color}40`,
                color,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[0.4rem] text-slate-600 mt-1">
          SSC 2021: cristaloides balanceados · Meta vol.: evitar sobrecarga
        </div>
      </div>

    </div>
  );
};
