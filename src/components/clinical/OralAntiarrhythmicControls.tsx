// src/components/clinical/OralAntiarrhythmicControls.tsx
//
// Amiodarona oral + Digoxina oral con:
//   - SDC display digoxina (verde 0.5-0.9, ámbar 0.9-1.2, rojo >1.2)
//   - Alerta interacción amiodarona→digoxina (↓40% dosis)
//   - Banner ABSORCIÓN GI ALTERADA si NA > 0.3 mcg/kg/min
//
// Refs: Connolly SJ. Circulation 1999; Ahmed A et al. EHJ 2006;
//       Lehnert BJCP 2022; Chen Y Pharmacotherapy 2025;
//       Heyland DK ICM 1996; Adam Pharmaceutics 2023.

import React, { useState } from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { PharmacologyEngine } from '../../core/PharmacologyEngine';
import { DRUG_CATALOG }        from '../../store/usePharmacologyStore';

// ─── Carga/Mantenimiento amiodarona oral ──────────────────────────────────────

const AMIO_DOSES = [
  { doseMg: 200, label: '200 mg' },
  { doseMg: 400, label: '400 mg' },
  { doseMg: 600, label: '600 mg' },
];

const AMIO_INTERVALS = [
  { h: 8,  label: 'c/8h'  },
  { h: 12, label: 'c/12h' },
  { h: 24, label: 'c/24h' },
];

// ─── Digoxina oral dosis presets ──────────────────────────────────────────────

const DIGOXIN_DOSES = [
  { doseMg: 0.25, label: '0.25 mg' },
  { doseMg: 0.125, label: '0.125 mg' },
];

const DIGOXIN_INTERVALS = [
  { h: 6,  label: 'c/6h (carga)' },
  { h: 24, label: 'c/24h (mant)' },
];

// ─── SDC display ─────────────────────────────────────────────────────────────

function SdcDisplay({ cpRatio }: { cpRatio: number }) {
  // Digoxina: ventana terapéutica 0.5-0.9 ng/mL (Ahmed EHJ 2006)
  // cpRatio → ng/mL equiv: cpRatio 1.0 ≈ 2.0 ng/mL (max rate = 0.01 mg/h)
  // Rango seguro: cpRatio 0.25-0.45 ≈ 0.5-0.9 ng/mL
  const ngPerML = cpRatio * 2.0;
  const color  = ngPerML < 0.01 ? 'text-slate-500'
    : ngPerML < 0.5  ? 'text-amber-400'     // sub-terapéutico
    : ngPerML <= 0.9 ? 'text-emerald-400'   // terapéutico óptimo
    : ngPerML <= 1.2 ? 'text-amber-400'     // zona superior
    : 'text-red-400';                         // tóxico >1.2
  const label  = ngPerML < 0.01 ? '—'
    : ngPerML < 0.5  ? '↓ SUB'
    : ngPerML <= 0.9 ? 'ÓPTIMO'
    : ngPerML <= 1.2 ? 'ALTO'
    : '⚠ TÓXICO';

  return (
    <div className="flex items-center gap-1 text-[0.48rem] font-mono">
      <span className="text-slate-500">SDC:</span>
      <span className={`font-black ${color}`}>{ngPerML < 0.01 ? '—' : ngPerML.toFixed(2)} ng/mL</span>
      <span className={`px-1 rounded text-[0.4rem] font-bold border ${
        ngPerML > 1.2 ? 'bg-red-900/20 border-red-700/40 text-red-400' :
        ngPerML >= 0.5 && ngPerML <= 0.9 ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400' :
        'bg-amber-900/20 border-amber-700/40 text-amber-400'
      }`}>{label}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const OralAntiarrhythmicControls: React.FC = () => {
  const infusionRates = usePharmacologyStore(s => s.infusionRates);
  const plasmaConc    = usePharmacologyStore(s => s.plasmaConcentrations);
  const setRate       = usePharmacologyStore(s => s.setInfusionRate);
  const scheduleDose  = usePharmacologyStore(s => s.scheduleDose);
  const cancelDose    = usePharmacologyStore(s => s.cancelScheduledDose);
  const scheduled     = usePharmacologyStore(s => s.scheduledDoses);

  const [amioDose,     setAmioDose]     = useState(400);
  const [amioInterval, setAmioInterval] = useState(12);
  const [digDose,      setDigDose]      = useState(0.25);
  const [digInterval,  setDigInterval]  = useState(24);

  // Tasas actuales
  const amioOralRate = infusionRates['amiodarone_oral'] ?? 0;
  const digOralRate  = infusionRates['digoxin_oral'] ?? 0;
  const naPressRate  = infusionRates['noradrenaline'] ?? 0;

  // Concentraciones plasmáticas
  const amioCp = plasmaConc['amiodarone_oral'] ?? 0;
  const digCp  = plasmaConc['digoxin_oral']    ?? 0;

  // Interacción amiodarona → digoxina
  const amioActive = amioOralRate > 0 || (plasmaConc['amiodarone'] ?? 0) > 0.1;
  const digActive  = digOralRate  > 0;

  // Vasopresores altos → absorción GI reducida (Heyland ICM 1996)
  const highVasopressor = naPressRate > 0.3;

  const amioScheduled = scheduled.filter(s => s.drug === 'amiodarone_oral' && s.active);
  const digScheduled  = scheduled.filter(s => s.drug === 'digoxin_oral'    && s.active);

  const queueAmioOralBolus = (mg: number) => {
    const F = DRUG_CATALOG['amiodarone_oral'].oralBioavailability ?? 0.43;
    PharmacologyEngine.getInstance().queueSlowBolus('amiodarone_oral', mg * F, 1800); // 30 min
  };
  const queueDigOralBolus = (mg: number) => {
    const F = DRUG_CATALOG['digoxin_oral'].oralBioavailability ?? 0.70;
    PharmacologyEngine.getInstance().queueSlowBolus('digoxin_oral', mg * F, 3600); // absorción ~1h
  };

  return (
    <div className="p-2 space-y-2">

      {/* Banner absorción GI alterada */}
      {highVasopressor && (
        <div className="rounded-lg px-2 py-1.5 bg-orange-900/25 border border-orange-600/40 text-orange-300 text-[0.48rem] font-bold">
          ⚠ ABSORCIÓN GI ALTERADA — NA &gt; 0.3 mcg/kg/min activo.
          Biodisponibilidad oral reducida (Heyland ICM 1996; Adam Pharmaceutics 2023).
        </div>
      )}

      {/* ── Amiodarona oral ──────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.52rem] font-black uppercase tracking-widest text-amber-400">
            Amiodarona oral
          </span>
          <div className="flex items-center gap-1 text-[0.42rem] font-mono text-slate-500">
            <span>F=0.40 · t½=30-40d</span>
            {amioCp > 0.01 && (
              <span className="text-amber-400 ml-1">Cp activo</span>
            )}
          </div>
        </div>

        {/* Alerta interacción con digoxina */}
        {amioActive && digActive && (
          <div className="mb-1.5 px-1.5 py-1 rounded bg-red-900/20 border border-red-700/30 text-red-300 text-[0.44rem] font-bold">
            ⚠ INTERACCIÓN: Amiodarona inhibe P-gp → ↑ digoxina +72% AUC.
            Reducir dosis digoxina ~40%. (Chen Y. Pharmacotherapy 2025)
          </div>
        )}

        {/* Selector dosis + intervalo */}
        <div className="flex gap-1 mb-1">
          {AMIO_DOSES.map(d => (
            <button key={d.doseMg} type="button"
              onClick={() => setAmioDose(d.doseMg)}
              className={`flex-1 py-0.5 rounded text-[0.48rem] font-bold cursor-pointer transition-all ${
                amioDose === d.doseMg
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 mb-1.5">
          {AMIO_INTERVALS.map(i => (
            <button key={i.h} type="button"
              onClick={() => setAmioInterval(i.h)}
              className={`flex-1 py-0.5 rounded text-[0.44rem] cursor-pointer transition-all ${
                amioInterval === i.h
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              {i.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <button type="button"
            onClick={() => { queueAmioOralBolus(amioDose); scheduleDose('amiodarone_oral', amioDose, amioInterval); }}
            className="flex-1 py-1 bg-amber-700/40 border border-amber-500/50 text-amber-200 rounded text-[0.5rem] font-bold cursor-pointer hover:bg-amber-700/60">
            PROGRAMAR {amioDose}mg c/{amioInterval}h
          </button>
          <button type="button"
            onClick={() => { queueAmioOralBolus(200); setRate('amiodarone_oral', 200/24); }}
            className="px-2 py-1 bg-slate-700/50 border border-slate-600/40 text-slate-300 rounded text-[0.44rem] cursor-pointer hover:bg-slate-700/80">
            200mg/24h
          </button>
        </div>

        {amioScheduled.map(s => (
          <div key={s.id} className="flex justify-between items-center mt-1 bg-amber-900/10 rounded px-1.5 py-0.5">
            <span className="text-[0.48rem] text-amber-300 font-mono">{s.doseMg}mg c/{s.intervalH}h</span>
            <button type="button" onClick={() => cancelDose(s.id)} className="text-red-400 text-[0.5rem] cursor-pointer">✕</button>
          </div>
        ))}

        <div className="text-[0.38rem] text-slate-600 mt-1">
          Carga 800-1600 mg/d × 7-10d → mant. 200 mg/d (Connolly Circulation 1999).
          Inhibe CYP3A4, CYP2C9, P-gp (Lehnert BJCP 2022).
        </div>
      </div>

      {/* ── Digoxina oral ──────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.52rem] font-black uppercase tracking-widest text-teal-400">
            Digoxina oral
          </span>
          <SdcDisplay cpRatio={digCp} />
        </div>

        {/* Alerta interacción con amiodarona */}
        {digActive && amioActive && (
          <div className="mb-1.5 px-1.5 py-1 rounded bg-red-900/20 border border-red-700/30 text-red-300 text-[0.44rem] font-bold">
            ⚠ Reducir dosis 40% por amiodarona concomitante (P-gp inhibición).
          </div>
        )}

        <div className="flex gap-1 mb-1">
          {DIGOXIN_DOSES.map(d => (
            <button key={d.doseMg} type="button"
              onClick={() => setDigDose(d.doseMg)}
              className={`flex-1 py-0.5 rounded text-[0.48rem] font-bold cursor-pointer transition-all ${
                digDose === d.doseMg
                  ? 'bg-teal-500/30 text-teal-200 border border-teal-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 mb-1.5">
          {DIGOXIN_INTERVALS.map(i => (
            <button key={i.h} type="button"
              onClick={() => setDigInterval(i.h)}
              className={`flex-1 py-0.5 rounded text-[0.44rem] cursor-pointer transition-all ${
                digInterval === i.h
                  ? 'bg-teal-500/30 text-teal-200 border border-teal-400'
                  : 'bg-black/50 text-slate-400 border border-white/10'
              }`}>
              {i.label}
            </button>
          ))}
        </div>

        <button type="button"
          onClick={() => { queueDigOralBolus(digDose); scheduleDose('digoxin_oral', digDose, digInterval); }}
          className="w-full py-1 bg-teal-700/40 border border-teal-500/50 text-teal-200 rounded text-[0.5rem] font-bold cursor-pointer hover:bg-teal-700/60">
          PROGRAMAR {digDose}mg c/{digInterval}h
        </button>

        {digScheduled.map(s => (
          <div key={s.id} className="flex justify-between items-center mt-1 bg-teal-900/10 rounded px-1.5 py-0.5">
            <span className="text-[0.48rem] text-teal-300 font-mono">{s.doseMg}mg c/{s.intervalH}h</span>
            <button type="button" onClick={() => cancelDose(s.id)} className="text-red-400 text-[0.5rem] cursor-pointer">✕</button>
          </div>
        ))}

        <div className="text-[0.38rem] text-slate-600 mt-1">
          Ventana terapéutica 0.5-0.9 ng/mL (Ahmed EHJ 2006). F=0.65-0.75 (Goodman&Gilman 13ª).
        </div>
      </div>

    </div>
  );
};
