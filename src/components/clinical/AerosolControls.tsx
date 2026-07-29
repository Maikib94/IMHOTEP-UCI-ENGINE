// src/components/clinical/AerosolControls.tsx
//
// Subsección AEROSOLES dentro de FÁRMACOS ESPECIALES.
// Salbutamol: bolos nebulización 2.5/5 mg + selector frecuencia.
// Ipratropio: bolo 0.5 mg.
//
// Efectos modelados (pd declarado en DRUG_CATALOG):
//   Salbutamol: beta2=1.5 → ↓Raw bronquial; hrDirect=8 → taquicardia β2
//   Ipratropio: beta2=0.3 → broncodilatación anticolinérgica; vagolytic=0.25
//   Sinergia: ambos activos → efecto combinado acumulativo
//
// Indicación clínica: EPOC activo, asma, broncoespasmo post-intubación.
// Ref: GINA 2024; GOLD 2024.

import React, { useState, useEffect, useRef } from 'react';
import { usePatientStore }      from '../../store/usePatientStore';
import { usePharmacologyStore }  from '../../store/usePharmacologyStore';
import { PharmacologyEngine }   from '../../core/PharmacologyEngine';
import { DRUG_CATALOG }         from '../../store/usePharmacologyStore';

// ─── Tipo frecuencia nebulización ────────────────────────────────────────────

type NebFreq = 'q4h' | 'q6h' | 'q8h' | 'prn';

const FREQ_LABELS: Record<NebFreq, string> = {
  q4h: 'c/4h', q6h: 'c/6h', q8h: 'c/8h', prn: 'SOS',
};

// ─── Botón de nebulización (slow bolus con F aplicada) ───────────────────────

type NebDrugId = 'salbutamol_neb' | 'ipratropium_neb' | 'nac_neb' | 'adrenaline_neb';

function nebDose(drug: NebDrugId, doseMg: number) {
  const def = DRUG_CATALOG[drug];
  const F   = def.oralBioavailability ?? 0.15;  // absorción sistémica desde nebulización
  PharmacologyEngine.getInstance().queueSlowBolus(drug, doseMg * F, 600);
}

// ─── Card de fármaco aerosol ──────────────────────────────────────────────────

interface AerosolCardProps {
  title:    string;
  subtitle: string;
  accent:   string;
  cpRatio:  number;
  children: React.ReactNode;
}

function AerosolCard({ title, subtitle, accent, cpRatio, children }: AerosolCardProps) {
  const isActive = cpRatio > 0.01;
  return (
    <div
      className="bg-[#0f172a] rounded-lg border p-2 transition-all"
      style={{ borderColor: isActive ? accent : 'rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[0.48rem] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
          <div className="text-[0.38rem] text-slate-600 font-mono">{subtitle}</div>
        </div>
        {isActive && (
          <div
            className="text-[0.4rem] font-black px-1.5 py-0.5 rounded border animate-pulse"
            style={{ color: accent, borderColor: accent }}
          >
            ACTIVO
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AerosolControls() {
  const salbCp  = usePharmacologyStore(s => s.plasmaConcentrations['salbutamol_neb'] ?? 0);
  const ipraCp  = usePharmacologyStore(s => s.plasmaConcentrations['ipratropium_neb'] ?? 0);
  const nacCp   = usePharmacologyStore(s => s.plasmaConcentrations['nac_neb'] ?? 0);
  const adrNebCp = usePharmacologyStore(s => s.plasmaConcentrations['adrenaline_neb'] ?? 0);
  const pd      = usePharmacologyStore(s => s.systemicEffects);

  const [salbFreq, setSalbFreq] = useState<NebFreq>('q6h');
  const [iprFreq,  setIprFreq]  = useState<NebFreq>('q6h');

  // Cooldown timers (sim-time entre dosis programadas)
  const [salbCd, setSalbCd] = useState(0);  // segundos hasta próxima dosis
  const [iprCd,  setIprCd]  = useState(0);
  const ticks = usePatientStore(s => s.vitals.heartRate);  // reactivity trigger

  // Computed effects display
  const beta2Effect = Math.min(1, pd.beta2 ?? 0);
  const hasSinergia = salbCp > 0.05 && ipraCp > 0.05;

  return (
    <div className="p-3 space-y-3">

      {/* ── Effect indicator ──────────────────────────────────────────── */}
      {beta2Effect > 0.05 && (
        <div className="bg-[#0f172a] rounded-lg border border-emerald-800/30 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.44rem] font-black uppercase tracking-widest text-emerald-400">
              Broncodilatación β₂ {hasSinergia && '+ sinergia anticolinérgica'}
            </span>
            <span className="text-[0.5rem] font-mono font-black text-emerald-300">
              {Math.round(beta2Effect * 100)}%
            </span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${Math.min(100, beta2Effect * 100)}%` }}
            />
          </div>
          {hasSinergia && (
            <div className="text-[0.38rem] text-emerald-700 mt-0.5">
              Sinergia salbutamol + ipratropio → ↓Raw combinado (GOLD 2024)
            </div>
          )}
        </div>
      )}

      {/* ── Salbutamol ────────────────────────────────────────────────── */}
      <AerosolCard
        title="Salbutamol nebulizado"
        subtitle="β₂ agonista · t½=5h · F-sist=15%"
        accent="#34d399"
        cpRatio={salbCp}
      >
        <div className="flex gap-1 mb-1.5">
          <button
            type="button"
            onClick={() => nebDose('salbutamol_neb', 2.5)}
            className="flex-1 py-1 text-[0.44rem] font-black rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20 uppercase tracking-wider cursor-pointer"
          >
            ↑ DOSIS NEB 2.5mg
          </button>
          <button
            type="button"
            onClick={() => nebDose('salbutamol_neb', 5)}
            className="flex-1 py-1 text-[0.44rem] font-black rounded border border-emerald-600 text-emerald-300 hover:bg-emerald-800/20 uppercase tracking-wider cursor-pointer"
          >
            ↑ DOSIS ALTA 5mg
          </button>
        </div>
        {/* Frecuencia */}
        <div className="flex items-center gap-1">
          <span className="text-[0.4rem] text-slate-500 w-14 shrink-0">Frecuencia:</span>
          {(Object.keys(FREQ_LABELS) as NebFreq[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setSalbFreq(f)}
              className="flex-1 py-0.5 text-[0.38rem] font-bold rounded border transition-all cursor-pointer"
              style={{
                borderColor: salbFreq === f ? '#34d399' : 'rgba(255,255,255,0.08)',
                color:        salbFreq === f ? '#34d399' : '#475569',
                background:   salbFreq === f ? 'rgba(52,211,153,0.08)' : 'transparent',
              }}
            >
              {FREQ_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">
          β₂: ↓Raw · FC +8-15 bpm · K⁺ ↓0.4 mEq/L intracel. (GINA 2024)
        </div>
      </AerosolCard>

      {/* ── Ipratropio ───────────────────────────────────────────────── */}
      <AerosolCard
        title="Ipratropio nebulizado"
        subtitle="anticolinérgico M3 · t½=1.5h · F-sist=5%"
        accent="#a78bfa"
        cpRatio={ipraCp}
      >
        <div className="flex gap-1 mb-1.5">
          <button
            type="button"
            onClick={() => nebDose('ipratropium_neb', 0.5)}
            className="flex-1 py-1 text-[0.44rem] font-black rounded border border-violet-700/50 text-violet-400 hover:bg-violet-900/20 uppercase tracking-wider cursor-pointer"
          >
            ↑ DOSIS NEB 0.5mg
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[0.4rem] text-slate-500 w-14 shrink-0">Frecuencia:</span>
          {(Object.keys(FREQ_LABELS) as NebFreq[]).map(f => (
            <button key={f} type="button" onClick={() => setIprFreq(f)}
              className="flex-1 py-0.5 text-[0.38rem] font-bold rounded border transition-all cursor-pointer"
              style={{
                borderColor: iprFreq === f ? '#a78bfa' : 'rgba(255,255,255,0.08)',
                color:        iprFreq === f ? '#a78bfa' : '#475569',
                background:   iprFreq === f ? 'rgba(167,139,250,0.08)' : 'transparent',
              }}
            >{FREQ_LABELS[f]}</button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600 mt-1">
          Sin taquicardia β₂ · sinergia con salbutamol (GOLD 2024)
        </div>
      </AerosolCard>

      {/* ── N-Acetilcisteína ──────────────────────────────────────────── */}
      <AerosolCard
        title="N-Acetilcisteína neb."
        subtitle="mucolítico · 300-600 mg/dosis · F-sist=10%"
        accent="#fbbf24"
        cpRatio={nacCp}
      >
        <div className="flex gap-1 mb-1">
          {[300, 600].map(d => (
            <button key={d} type="button"
              onClick={() => nebDose('nac_neb', d)}
              className="flex-1 py-1 text-[0.44rem] font-black rounded border border-amber-700/50 text-amber-400 hover:bg-amber-900/20 uppercase tracking-wider cursor-pointer"
            >
              ↑ {d}mg
            </button>
          ))}
        </div>
        <div className="text-[0.38rem] text-slate-600">
          Mucolítico selectivo — EPOC con tapones mucosos (Grandjean ERJ 2000)
        </div>
      </AerosolCard>

      {/* ── Adrenalina nebulizada ────────────────────────────────────── */}
      <AerosolCard
        title="Adrenalina nebulizada"
        subtitle="laringitis/estridor post-ext. · 5 mg · F-sist≈18%"
        accent="#f87171"
        cpRatio={adrNebCp}
      >
        <div className="flex gap-1 mb-1">
          <button type="button"
            onClick={() => nebDose('adrenaline_neb', 5)}
            className="flex-1 py-1 text-[0.44rem] font-black rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 uppercase tracking-wider cursor-pointer"
          >
            ↑ DOSIS ÚNICA 5mg
          </button>
        </div>
        <div className="text-[0.38rem] text-slate-600">
          Edema glótico/estridor post-ext. — repetir en 20 min si necesario (Bjornsson EHJ 2001)
        </div>
      </AerosolCard>

    </div>
  );
}
