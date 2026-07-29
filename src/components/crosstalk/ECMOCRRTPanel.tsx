// src/components/crosstalk/ECMOCRRTPanel.tsx
//
// Drawer izquierdo con controles ECMO VV/VA y CRRT.
// Acoplado a CrosstalkEngine vía useECMOStore + useCRRTStore.
//
// Refs:
//   ECMO: Combes A ICM 2020; Grotberg Crit Care 2023; Rodriguez ECMOVENT 2025.
//   CRRT: KDIGO 2012; Hoff Ann Pharmacother 2020; Roberts ICM 2025.

import React, { useState, memo } from 'react';
import { Drawer }          from '../ui/Drawer';
import { useECMOStore }    from '../../store/useECMOStore';
import { useCRRTStore }    from '../../store/useCRRTStore';
import type { ECMOMode, ECMOCannulation } from '../../store/useECMOStore';
import type { CRRTMode, CRRTAnticoagulation, CRRTDilution } from '../../store/useCRRTStore';

// ─── ECMO Section ─────────────────────────────────────────────────────────────

const CANNULATION_LABELS: Record<ECMOCannulation, string> = {
  femoral_femoral: 'Bifemoral (VV)',
  femoro_jugular:  'Femoro-Yugular (VV)',
  bicaval:         'Bicaval (VV)',
  central:         'Central (VA/VV)',
  femoro_axillar:  'Femoro-Axilar (VA)',
};

function ECMOSection() {
  const ecmo      = useECMOStore();
  const co2Removal = ((ecmo.sweepFlowLmin * 0.45) * 1000).toFixed(0);

  return (
    <div className="p-4 space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[0.6rem] font-black uppercase tracking-wider text-red-400">ECMO</div>
          <div className="text-[0.42rem] text-slate-500">Oxigenación Membrana Extracorpórea</div>
        </div>
        <button
          type="button"
          onClick={() => ecmo.setActive(!ecmo.active)}
          className="px-3 py-1.5 rounded-lg text-[0.5rem] font-black tracking-wider cursor-pointer transition-all"
          style={{
            background:  ecmo.active ? '#dc2626' : 'rgba(255,255,255,0.05)',
            borderWidth: 1, borderStyle: 'solid',
            borderColor: ecmo.active ? '#991b1b' : 'rgba(255,255,255,0.1)',
            color:       ecmo.active ? '#fff' : '#64748b',
          }}
        >
          {ecmo.active ? '● ACTIVO' : 'INICIAR'}
        </button>
      </div>

      {/* Driving Pressure Alert */}
      {ecmo.active && ecmo.drivingPressureAlert && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[0.46rem] text-amber-300 font-bold">
          ⚠ DRIVING PRESSURE ELEVADO CON ECMO — riesgo VILI
          <div className="text-[0.38rem] text-amber-500/80 mt-0.5">
            Meta ΔP ≤ 8 cmH₂O (Rodriguez ECMOVENT 2025)
          </div>
        </div>
      )}

      {/* Mode */}
      <div>
        <div className="text-[0.44rem] text-slate-400 uppercase tracking-wider mb-1">Modo</div>
        <div className="flex gap-2">
          {(['vv', 'va'] as ECMOMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => ecmo.configure({ mode: m })}
              disabled={!ecmo.active}
              className="flex-1 py-1.5 rounded text-[0.5rem] font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-40"
              style={{
                background:  ecmo.mode === m ? (m === 'vv' ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)') : 'rgba(0,0,0,0.4)',
                border:      `1px solid ${ecmo.mode === m ? (m === 'vv' ? '#3b82f6' : '#ef4444') : 'rgba(255,255,255,0.08)'}`,
                color:       ecmo.mode === m ? (m === 'vv' ? '#93c5fd' : '#fca5a5') : '#475569',
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">
          {ecmo.mode === 'vv' ? 'VV: soporte respiratorio — no modifica CO nativo' : 'VA: soporte cardiorrespiratorio — riesgo síndrome Arlequín'}
        </div>
      </div>

      {/* Blood Flow */}
      <label className="flex items-center justify-between">
        <div>
          <div className="text-[0.48rem] text-slate-300">Flujo Sangre (L/min)</div>
          <div className="text-[0.38rem] text-slate-600">Combes EOLIA 2020: objetivo 3-5 L/min</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={1.0} max={7.0} step={0.5} value={ecmo.bloodFlowLmin} disabled={!ecmo.active}
            onChange={e => ecmo.configure({ bloodFlowLmin: +e.target.value })}
            className="w-24 accent-red-400" />
          <span className="text-[0.5rem] font-mono text-red-300 w-8">{ecmo.bloodFlowLmin.toFixed(1)}</span>
        </div>
      </label>

      {/* Sweep Gas */}
      <label className="flex items-center justify-between">
        <div>
          <div className="text-[0.48rem] text-slate-300">Sweep Gas (L/min)</div>
          <div className="text-[0.38rem] text-slate-600">Guervilly 2022: ↑ sweep → ↓ PaCO₂</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={0.5} max={10} step={0.5} value={ecmo.sweepFlowLmin} disabled={!ecmo.active}
            onChange={e => ecmo.configure({ sweepFlowLmin: +e.target.value })}
            className="w-24 accent-cyan-400" />
          <span className="text-[0.5rem] font-mono text-cyan-300 w-8">{ecmo.sweepFlowLmin.toFixed(1)}</span>
        </div>
      </label>

      {/* Membrane FiO2 */}
      <label className="flex items-center justify-between">
        <div><div className="text-[0.48rem] text-slate-300">FiO₂ membrana</div></div>
        <div className="flex items-center gap-2">
          <input type="range" min={0.21} max={1.0} step={0.01} value={ecmo.membraneFiO2} disabled={!ecmo.active}
            onChange={e => ecmo.configure({ membraneFiO2: +e.target.value })}
            className="w-24 accent-amber-400" />
          <span className="text-[0.5rem] font-mono text-amber-300 w-10">{(ecmo.membraneFiO2 * 100).toFixed(0)}%</span>
        </div>
      </label>

      {/* CO2 Removal estimate */}
      {ecmo.active && (
        <div className="bg-black/30 rounded-lg border border-cyan-800/30 px-3 py-2">
          <div className="flex justify-between text-[0.46rem]">
            <span className="text-slate-400">Extracción CO₂ estimada</span>
            <span className="text-cyan-400 font-mono font-bold">{co2Removal} mL/min</span>
          </div>
          <div className="flex justify-between text-[0.44rem] mt-0.5">
            <span className="text-slate-500">Cánula</span>
            <span className="text-slate-400">{CANNULATION_LABELS[ecmo.cannulation]}</span>
          </div>
        </div>
      )}

      <div className="text-[0.38rem] text-slate-700">
        Araos BJA 2021 · Rodriguez ECMOVENT 2025 · Guervilly Crit Care 2022
      </div>
    </div>
  );
}

// ─── CRRT Section ─────────────────────────────────────────────────────────────

function CRRTSection() {
  const crrt = useCRRTStore();

  return (
    <div className="p-4 space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[0.6rem] font-black uppercase tracking-wider text-violet-400">CRRT</div>
          <div className="text-[0.42rem] text-slate-500">Terapia Renal Continua</div>
        </div>
        <button
          type="button"
          onClick={() => crrt.setActive(!crrt.active)}
          className="px-3 py-1.5 rounded-lg text-[0.5rem] font-black tracking-wider cursor-pointer transition-all"
          style={{
            background:  crrt.active ? '#7c3aed' : 'rgba(255,255,255,0.05)',
            borderWidth: 1, borderStyle: 'solid',
            borderColor: crrt.active ? '#5b21b6' : 'rgba(255,255,255,0.1)',
            color:       crrt.active ? '#fff' : '#64748b',
          }}
        >
          {crrt.active ? '● ACTIVO' : 'INICIAR'}
        </button>
      </div>

      {/* ATB Adjust Alert */}
      {crrt.active && crrt.atbAdjustAlert && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[0.44rem] text-amber-300">
          ⚠ Considere ajustar dosis ATB por CRRT
          <div className="text-amber-500/80 mt-0.5 font-mono">{crrt.atbAlertDrugs.join(', ')}</div>
          <div className="text-amber-600/70 text-[0.38rem] mt-0.5">Roberts ICM 2025; Hoff Ann Pharmacother 2020</div>
        </div>
      )}

      {/* Mode */}
      <div>
        <div className="text-[0.44rem] text-slate-400 uppercase tracking-wider mb-1">Modo</div>
        <div className="flex gap-1">
          {(['CVVH', 'CVVHD', 'CVVHDF'] as CRRTMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => crrt.configure({ mode: m })}
              disabled={!crrt.active}
              className="flex-1 py-1 rounded text-[0.44rem] font-bold uppercase cursor-pointer transition-all disabled:opacity-40"
              style={{
                background:  crrt.mode === m ? 'rgba(139,92,246,0.25)' : 'rgba(0,0,0,0.4)',
                border:      `1px solid ${crrt.mode === m ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
                color:       crrt.mode === m ? '#c4b5fd' : '#475569',
              }}
            >{m}</button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">
          {crrt.mode === 'CVVH' ? 'Convección pura' : crrt.mode === 'CVVHD' ? 'Difusión pura' : 'Convección + difusión (recomendado sepsis)'}
        </div>
      </div>

      {/* Dose */}
      <label className="flex items-center justify-between">
        <div>
          <div className="text-[0.48rem] text-slate-300">Dosis (mL/kg/h)</div>
          <div className="text-[0.38rem] text-slate-600">KDIGO: 20-25 mL/kg/h estándar</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={15} max={40} step={1} value={crrt.dose_mLkgh} disabled={!crrt.active}
            onChange={e => crrt.configure({ dose_mLkgh: +e.target.value })}
            className="w-24 accent-violet-400" />
          <span className="text-[0.5rem] font-mono text-violet-300 w-8">{crrt.dose_mLkgh}</span>
        </div>
      </label>

      {/* Anticoagulation */}
      <div>
        <div className="text-[0.44rem] text-slate-400 uppercase tracking-wider mb-1">Anticoagulación</div>
        <div className="flex gap-1">
          {(['citrate', 'heparin', 'none'] as CRRTAnticoagulation[]).map(a => (
            <button key={a} type="button"
              onClick={() => crrt.configure({ anticoagulation: a })}
              disabled={!crrt.active}
              className="flex-1 py-1 rounded text-[0.42rem] font-bold cursor-pointer transition-all disabled:opacity-40"
              style={{
                background:  crrt.anticoagulation === a ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.4)',
                border:      `1px solid ${crrt.anticoagulation === a ? '#7c3aed' : 'rgba(255,255,255,0.08)'}`,
                color:       crrt.anticoagulation === a ? '#c4b5fd' : '#475569',
              }}
            >{a === 'citrate' ? 'Citrato' : a === 'heparin' ? 'HNF' : 'Sin AntiC'}</button>
          ))}
        </div>
      </div>

      {/* Effluent composition */}
      <div className="bg-black/30 rounded-lg border border-white/5 p-3 space-y-2">
        <div className="text-[0.44rem] font-bold text-slate-400 uppercase tracking-wider">Composición Reposición</div>

        {[
          { label: 'Na⁺ (mEq/L)', key: 'effluentNa_mEqL', min: 130, max: 150 },
          { label: 'K⁺ (mEq/L)', key: 'effluentK_mEqL', min: 0, max: 5 },
          { label: 'HCO₃ (mmol/L)', key: 'effluentBicarb_mmolL', min: 20, max: 38 },
        ].map(({ label, key, min, max }) => {
          type NumKey = 'effluentNa_mEqL' | 'effluentK_mEqL' | 'effluentBicarb_mmolL';
          const val = crrt[key as NumKey];
          return (
            <label key={key} className="flex items-center justify-between">
              <span className="text-[0.46rem] text-slate-400">{label}</span>
              <div className="flex items-center gap-2">
                <input type="range" min={min} max={max} step={1}
                  value={val}
                  disabled={!crrt.active}
                  onChange={e => crrt.configure({ [key]: +e.target.value })}
                  className="w-20 accent-violet-400" />
                <span className="text-[0.46rem] font-mono text-violet-300 w-6">{val}</span>
              </div>
            </label>
          );
        })}
      </div>

      <div className="text-[0.38rem] text-slate-700">
        KDIGO AKI 2012 · Roberts JA ICM 2025 · Hoff BM Ann Pharmacother 2020
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type PanelTab = 'ecmo' | 'crrt';

// ─── Main panel ───────────────────────────────────────────────────────────────

interface ECMOCRRTPanelProps {
  open:    boolean;
  onClose: () => void;
}

const ECMOCRRTPanel = memo(function ECMOCRRTPanel({ open, onClose }: ECMOCRRTPanelProps) {
  const [tab, setTab] = useState<PanelTab>('ecmo');
  const ecmoActive = useECMOStore(s => s.active);
  const crrtActive = useCRRTStore(s => s.active);

  return (
    <Drawer open={open} onClose={onClose} side="left" width={380}>
      {/* Custom header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="text-[0.55rem] font-black uppercase tracking-[0.18em] text-slate-300">
          Soporte Extracorpóreo
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 cursor-pointer">✕</button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/5 shrink-0">
        {([['ecmo', 'ECMO', ecmoActive, '#ef4444'], ['crrt', 'CRRT', crrtActive, '#8b5cf6']] as const).map(([id, label, active, color]) => (
          <button key={id} type="button" onClick={() => setTab(id as PanelTab)}
            className="flex-1 py-2 text-[0.5rem] font-black uppercase tracking-wider cursor-pointer transition-all border-b-2"
            style={{
              color:       tab === id ? '#e2e8f0' : '#475569',
              borderColor: tab === id ? color : 'transparent',
              background:  'transparent',
            }}
          >
            {active && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'ecmo' && <ECMOSection />}
        {tab === 'crrt' && <CRRTSection />}
      </div>
    </Drawer>
  );
});

export default ECMOCRRTPanel;
