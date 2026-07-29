// src/components/launcher/O2StrategyPicker.tsx
//
// Modal de selección de estrategia O2 antes de iniciar caso.
// Muestra la sugerencia automática y permite override antes de confirmar.

import React, { useState } from 'react';
import type { O2Strategy, LauncherConfig } from '../../core/SimulationLauncher';
import { O2_STRATEGY_META } from '../../core/SimulationLauncher';

const STRATEGY_ORDER: O2Strategy[] = [
  'room_air',
  'nasal_cannula',
  'simple_mask',
  'reservoir_mask',
  'hfnc',
  'niv_cpap',
  'niv_bipap',
  'arm',
];

interface Props {
  suggested: O2Strategy;
  scenarioName: string;
  onConfirm: (config: LauncherConfig) => void;
  onCancel: () => void;
}

export default function O2StrategyPicker({ suggested, scenarioName, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<O2Strategy>(suggested);
  const [fiO2, setFiO2]         = useState(0.40);
  const [flow, setFlow]         = useState(40);
  const [peep, setPeep]         = useState(5);

  const meta = O2_STRATEGY_META[selected];
  const needsFlow = selected === 'nasal_cannula' || selected === 'hfnc';
  const needsFiO2 = selected === 'hfnc' || selected === 'arm' || selected === 'niv_cpap' || selected === 'niv_bipap';
  const needsPeep = selected === 'arm' || selected === 'niv_cpap' || selected === 'niv_bipap';

  function handleConfirm() {
    onConfirm({
      strategy: selected,
      fiO2:    needsFiO2 ? fiO2 : undefined,
      flowLpm: needsFlow ? (selected === 'nasal_cannula' ? Math.min(flow, 6) : flow) : undefined,
      peep:    needsPeep ? peep : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: '#0a0f1e' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-400">Soporte O₂ inicial</div>
            <div className="text-[0.7rem] font-bold text-white mt-0.5 truncate">{scenarioName}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-300 text-lg cursor-pointer transition-colors"
          >✕</button>
        </div>

        {/* Strategy grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-2">
          {STRATEGY_ORDER.map(s => {
            const m = O2_STRATEGY_META[s];
            const isSel  = selected === s;
            const isSugg = suggested === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelected(s)}
                className="relative text-left rounded-xl border p-3 transition-all cursor-pointer"
                style={{
                  background:   isSel ? `${m.color}18` : 'rgba(0,0,0,0.4)',
                  borderColor:  isSel ? m.color : 'rgba(255,255,255,0.07)',
                  boxShadow:    isSel ? `0 0 12px ${m.color}30` : 'none',
                }}
              >
                {isSugg && !isSel && (
                  <span
                    className="absolute top-1.5 right-1.5 text-[0.36rem] font-black uppercase tracking-wider px-1 py-0.5 rounded"
                    style={{ background: `${m.color}25`, color: m.color }}
                  >sugerido</span>
                )}
                {isSugg && isSel && (
                  <span
                    className="absolute top-1.5 right-1.5 text-[0.36rem] font-black uppercase tracking-wider px-1 py-0.5 rounded"
                    style={{ background: `${m.color}40`, color: m.color }}
                  >✓ sugerido</span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: m.color, boxShadow: isSel ? `0 0 6px ${m.color}` : 'none' }}
                  />
                  <span
                    className="text-[0.52rem] font-black uppercase tracking-wider"
                    style={{ color: isSel ? m.color : '#94a3b8' }}
                  >
                    {m.abbrev}
                  </span>
                  {m.invasive && (
                    <span className="text-[0.36rem] text-red-400 font-bold uppercase tracking-wider ml-auto">invasivo</span>
                  )}
                </div>
                <div className="text-[0.48rem] font-semibold" style={{ color: isSel ? '#e2e8f0' : '#64748b' }}>
                  {m.label}
                </div>
                <div className="text-[0.4rem] text-slate-600 mt-0.5 leading-relaxed">
                  {m.description}
                </div>
                <div className="text-[0.38rem] font-mono mt-1" style={{ color: `${m.color}90` }}>
                  FiO₂ {m.fiO2Range}
                </div>
              </button>
            );
          })}
        </div>

        {/* Parameter overrides */}
        {(needsFlow || needsFiO2 || needsPeep) && (
          <div className="mx-5 mb-3 rounded-xl border border-white/5 bg-black/30 p-3 space-y-2">
            <div className="text-[0.46rem] font-black uppercase tracking-wider text-slate-400 mb-2">
              Parámetros iniciales
            </div>

            {needsFlow && (
              <label className="flex items-center justify-between">
                <span className="text-[0.48rem] text-slate-400">
                  {selected === 'nasal_cannula' ? 'Flujo cánula' : 'Flujo HFNC'} (L/min)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={selected === 'nasal_cannula' ? 1 : 20}
                    max={selected === 'nasal_cannula' ? 6 : 60}
                    step={selected === 'nasal_cannula' ? 1 : 5}
                    value={selected === 'nasal_cannula' ? Math.min(flow, 6) : flow}
                    onChange={e => setFlow(Number(e.target.value))}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[0.5rem] font-mono text-cyan-400 w-8 text-right">
                    {selected === 'nasal_cannula' ? Math.min(flow, 6) : flow}
                  </span>
                </div>
              </label>
            )}

            {needsFiO2 && (
              <label className="flex items-center justify-between">
                <span className="text-[0.48rem] text-slate-400">FiO₂ inicial</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.21}
                    max={1.00}
                    step={0.01}
                    value={fiO2}
                    onChange={e => setFiO2(Number(e.target.value))}
                    className="w-24 accent-amber-400"
                  />
                  <span className="text-[0.5rem] font-mono text-amber-400 w-8 text-right">
                    {(fiO2 * 100).toFixed(0)}%
                  </span>
                </div>
              </label>
            )}

            {needsPeep && (
              <label className="flex items-center justify-between">
                <span className="text-[0.48rem] text-slate-400">PEEP (cmH₂O)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={peep}
                    onChange={e => setPeep(Number(e.target.value))}
                    className="w-24 accent-violet-400"
                  />
                  <span className="text-[0.5rem] font-mono text-violet-400 w-8 text-right">
                    {peep}
                  </span>
                </div>
              </label>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 rounded-xl font-mono font-black text-[0.75rem] tracking-[0.15em] uppercase cursor-pointer transition-all"
            style={{
              background:  meta.color,
              color:       meta.invasive ? '#fff' : '#000',
              boxShadow:   `0 0 20px ${meta.color}50`,
            }}
          >
            {meta.abbrev} — INICIAR CASO →
          </button>
          <div className="text-center text-slate-600 text-[0.4rem] font-mono mt-2">
            {meta.label} · FiO₂ {meta.fiO2Range}
          </div>
        </div>
      </div>
    </div>
  );
}
