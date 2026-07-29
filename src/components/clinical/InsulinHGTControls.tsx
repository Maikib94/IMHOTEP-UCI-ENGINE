// src/components/clinical/InsulinHGTControls.tsx
//
// Subsección INSULINA Y HGT dentro de FÁRMACOS ESPECIALES.
// Conectada a useGlycemicStore (Fase 5) para HGT continuo y alarmas.
// Mecánica glucémica: GlycemicEngine (Bergman ICING-adaptado).

import React, { useCallback } from 'react';
import { useGlycemicStore, type HGTFrequency } from '../../store/useGlycemicStore';
import { usePatientStore }       from '../../store/usePatientStore';
import { usePharmacologyStore }   from '../../store/usePharmacologyStore';
import { useTimeStore }          from '../../store/useTimeStore';
import { DRUG_MAX_DOSES }        from '../../core/PharmacologyEngine';
import { InfusionControl }       from './drugControls';

// ─── Glucemia badge ───────────────────────────────────────────────────────────

function GlucBadge({ val }: { val: number }) {
  const color = val < 54  ? '#ef4444'
              : val < 70  ? '#f87171'
              : val > 250 ? '#ef4444'
              : val > 180 ? '#fbbf24'
              : val > 140 ? '#fb923c'
              : '#34d399';
  const label = val < 54  ? 'HIPO SEVERA' : val < 70  ? 'HIPOGLICEMIA'
              : val > 250 ? 'HIPER SEVERA' : val > 180 ? 'HIPERGLICEMIA'
              : val > 140 ? '↑ ALERTA' : 'OBJETIVO';
  return (
    <div className="text-center">
      <div className="font-black font-mono text-2xl" style={{ color }}>{val}</div>
      <div className="text-[0.38rem] font-black uppercase tracking-widest" style={{ color }}>{label}</div>
      <div className="text-[0.38rem] text-slate-600">mg/dL</div>
    </div>
  );
}

// ─── Historial mini-line ──────────────────────────────────────────────────────

function HgtHistoryRow({ glucMg, tickAt }: { glucMg: number; tickAt: number }) {
  const h = Math.floor(tickAt / 3600) % 24;
  const m = Math.floor((tickAt % 3600) / 60);
  const col = glucMg < 70 ? '#f87171' : glucMg > 180 ? '#fbbf24' : '#34d399';
  return (
    <div className="flex justify-between text-[0.4rem] font-mono">
      <span className="text-slate-500">{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}</span>
      <span className="font-black" style={{ color: col }}>{glucMg} mg/dL</span>
    </div>
  );
}

const HGT_FREQS: HGTFrequency[] = ['1h','2h','4h','6h','12h','off'];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InsulinHGTControls() {
  const ticks         = useTimeStore(s => s.ticks);
  const setRate       = usePharmacologyStore(s => s.setInfusionRate);
  const queueBolus    = usePharmacologyStore(s => s.queueBolusRatio);
  const regularRate   = usePharmacologyStore(s => s.infusionRates['insulin_regular_iv'] ?? 0);

  const bgDisplayed   = useGlycemicStore(s => s.bgDisplayed);
  const hgtHistory    = useGlycemicStore(s => s.hgtHistory);
  const hgtFreq       = useGlycemicStore(s => s.hgtFrequency);
  const hypoAlert     = useGlycemicStore(s => s.hypoAlert);
  const hyperAlert    = useGlycemicStore(s => s.hyperAlert);
  const severHypo     = useGlycemicStore(s => s.severHypoAlert);
  const severHyper    = useGlycemicStore(s => s.severHyperAlert);
  const corticoidTip  = useGlycemicStore(s => s.corticoidHGTSuggestion);
  const setFreq       = useGlycemicStore(s => s.setHgtFrequency);
  const triggerHgt    = useGlycemicStore(s => s.triggerManualHgt);
  const clearTip      = useGlycemicStore(s => s.setCorticoidSuggestion);

  const medirAhora = useCallback(() => {
    const rec = triggerHgt('manual');
    rec.tickAt  = ticks;
    rec.simTimeS = ticks;
  }, [triggerHgt, ticks]);

  // Bolo insulina rápida
  const [bolusDose, setBolusDose] = React.useState(4);
  const adminBolus = (doseUI: number) => {
    const maxRate   = DRUG_MAX_DOSES['insulin_regular_iv'] ?? 10;
    const halfLifeH = 5 / 60;
    const ratio = Math.min(doseUI / (maxRate * halfLifeH), 3.0);
    queueBolus('insulin_regular_iv', ratio);
  };

  const nphStep     = 5 / 24;
  const regularStep = 0.5;

  const alertColor = severHypo || severHyper ? '#ef4444' : '#fbbf24';

  return (
    <div className="p-3 space-y-3">

      {/* ── Corticoid HGT tip (5.E) ──────────────────────────────────── */}
      {corticoidTip && (
        <div className="bg-amber-950/40 rounded-lg border border-amber-700/40 p-2 flex items-start justify-between gap-2">
          <div>
            <div className="text-[0.44rem] font-black text-amber-400 uppercase tracking-wider mb-0.5">
              ⚠ Corticoides activos
            </div>
            <div className="text-[0.38rem] text-amber-600">
              Considere HGT c/4h las primeras 24h — corticoides elevan glicemia
            </div>
          </div>
          <button
            type="button"
            onClick={() => clearTip(false)}
            className="text-amber-700 hover:text-amber-400 text-xs cursor-pointer shrink-0"
          >✕</button>
        </div>
      )}

      {/* ── HGT Panel ────────────────────────────────────────────────── */}
      <div
        className="bg-[#0f172a] rounded-lg border p-3"
        style={{
          borderColor: severHypo || severHyper
            ? '#ef4444'
            : hypoAlert || hyperAlert
              ? '#fbbf24'
              : 'rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-amber-400">
            HGT — Glucemia
          </div>
          <div className="text-[0.38rem] text-slate-600">Objetivo UCI: 140-180 mg/dL (NICE-SUGAR)</div>
        </div>

        {/* Alerta severa parpadeante */}
        {(severHypo || severHyper) && (
          <div
            className="text-center text-[0.48rem] font-black uppercase tracking-widest py-0.5 rounded mb-2 animate-pulse"
            style={{ color: alertColor, background: `${alertColor}18`, border: `1px solid ${alertColor}40` }}
          >
            {severHypo ? '⚠ HIPOGLICEMIA SEVERA < 54 mg/dL — TRATAR URGENTE' : '⚠ HIPERGLICEMIA SEVERA > 250 mg/dL'}
          </div>
        )}

        <div className="flex items-center gap-4 mb-3">
          <GlucBadge val={bgDisplayed} />
          <div className="flex-1 max-h-24 overflow-y-auto space-y-0.5">
            {hgtHistory.length > 0
              ? [...hgtHistory].reverse().slice(0, 8).map(r => (
                  <HgtHistoryRow key={r.id} glucMg={r.glucoseMg} tickAt={r.tickAt} />
                ))
              : <div className="text-[0.4rem] text-slate-600 italic">Sin mediciones registradas</div>
            }
          </div>
        </div>

        {/* Frecuencia */}
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[0.4rem] text-slate-500 shrink-0 w-14">Frecuencia:</span>
          {HGT_FREQS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFreq(f)}
              className="flex-1 py-0.5 text-[0.38rem] font-bold rounded border transition-all cursor-pointer"
              style={{
                borderColor: hgtFreq === f ? '#fbbf24' : 'rgba(255,255,255,0.08)',
                color:        hgtFreq === f ? '#fbbf24' : '#475569',
                background:   hgtFreq === f ? 'rgba(251,191,36,0.08)' : 'transparent',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={medirAhora}
          className="w-full py-1 text-[0.44rem] font-black rounded border border-amber-600/50 text-amber-400 hover:bg-amber-900/20 uppercase tracking-wider cursor-pointer transition-all"
        >
          ◉ MEDIR AHORA
        </button>
      </div>

      {/* ── Insulina Regular IV ──────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-blue-400">
            Insulina Regular IV
          </div>
          <div className="text-[0.38rem] text-slate-600 font-mono">t½=5min · protocolo continuo</div>
        </div>
        <InfusionControl label="Regular IV" drug="insulin_regular_iv" unit="UI/h" step={regularStep} colorTheme="blue" />
        <div className="flex items-center gap-1 mt-1">
          {[1, 2, 4, 6, 8, 10].map(r => (
            <button key={r} type="button" onClick={() => setRate('insulin_regular_iv', r)}
              className="flex-1 py-0.5 text-[0.38rem] font-bold rounded border border-blue-800/40 text-blue-500 hover:bg-blue-900/20 cursor-pointer">
              {r}
            </button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">UI/h preset · 1-10 UI/h protocolo UCI</div>
      </div>

      {/* ── Bolo Insulina ────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="text-[0.48rem] font-black uppercase tracking-widest text-cyan-400 mb-1.5">
          Bolo Insulina
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[0.42rem] text-slate-400 w-12 shrink-0">Dosis</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setBolusDose(d => Math.max(1, d - 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[0.6rem] cursor-pointer">▼</button>
            <div className="w-10 text-center font-mono text-sm font-black text-cyan-300">{bolusDose}</div>
            <button type="button" onClick={() => setBolusDose(d => Math.min(20, d + 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[0.6rem] cursor-pointer">▲</button>
          </div>
          <span className="text-[0.42rem] text-slate-500">UI</span>
          <button type="button" onClick={() => adminBolus(bolusDose)}
            className="flex-1 py-0.5 text-[0.44rem] font-black rounded border border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/20 uppercase tracking-wider cursor-pointer">
            ↑ {bolusDose} UI
          </button>
        </div>
        <div className="flex gap-1">
          {[4, 8, 12].map(d => (
            <button key={d} type="button" onClick={() => adminBolus(d)}
              className="flex-1 py-0.5 text-[0.38rem] font-bold rounded border border-cyan-800/40 text-cyan-600 hover:bg-cyan-900/20 cursor-pointer">
              {d} UI
            </button>
          ))}
        </div>
      </div>

      {/* ── Insulina NPH basal SC ────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-purple-400">
            Insulina NPH (basal SC)
          </div>
          <div className="text-[0.38rem] text-slate-600 font-mono">t½=14h · SC · 8am/8pm</div>
        </div>
        <InfusionControl label="NPH basal" drug="insulin_nph" unit="UI/h" step={nphStep} colorTheme="violet" />
        <div className="text-[0.38rem] text-slate-600 mt-1">
          p.ej. 20 UI/12h → 1.67 UI/h
        </div>
      </div>

    </div>
  );
}
