// src/components/clinical/AntihypertensiveControls.tsx
//
// Antihipertensivos orales en UCI — enalapril, losartán, amlodipino, atenolol, carvedilol.
// IECA/ARA-II: en shock séptico → suspender si PAM < 65 (alerta).
// Betabloqueantes: interacción con vasopresores activos.
//
// Refs: JNC 8 (James PA JAMA 2014); ESC/ESH 2023 (Mancia EHJ 2023).

import React from 'react';
import { usePatientStore } from '../../store/usePatientStore';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { useUIStore } from '../../store/useUIStore';
import { DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { PharmacologyEngine, DRUG_MAX_DOSES } from '../../core/PharmacologyEngine';
import { doseToCcH } from '../../utils/dilutionTable';
import type { DrugId } from '../../store/usePharmacologyStore';

const MONO = "[font-family:'JetBrains_Mono',monospace]";

interface AHTDrug {
  id: DrugId;
  name: string;
  doses: number[];   // mg
  intervalH: number; // h
  note: string;
  color: string;
}

const AHT_DRUGS: AHTDrug[] = [
  {
    id: 'enalapril_oral', name: 'Enalapril',
    doses: [5, 10, 20], intervalH: 12,
    note: 'IECA — F=0.60, t½ 11h. Contraindicado en shock.',
    color: '#38bdf8',
  },
  {
    id: 'losartan_oral', name: 'Losartán',
    doses: [50, 100], intervalH: 24,
    note: 'ARA-II — F=0.33, t½ 2h (met. activo 6-9h).',
    color: '#67e8f9',
  },
  {
    id: 'amlodipine_oral', name: 'Amlodipino',
    doses: [5, 10], intervalH: 24,
    note: 'BCC dihidropiridina — t½ 35-50h. Seguro en HF-rEF.',
    color: '#a78bfa',
  },
  {
    id: 'atenolol_oral', name: 'Atenolol',
    doses: [50, 100], intervalH: 24,
    note: 'β1 selectivo — t½ 6-9h. Ajustar si TFG < 35.',
    color: '#fb923c',
  },
  {
    id: 'carvedilol_oral', name: 'Carvedilol',
    doses: [3.125, 6.25, 12.5, 25], intervalH: 12,
    note: 'α+β no selectivo — t½ 7-10h. Primera línea HFrEF.',
    color: '#f59e0b',
  },
];

export const AntihypertensiveControls: React.FC = () => {
  const map          = usePatientStore(s => s.vitals.meanArterialPressure);
  const weight       = usePatientStore(s => s.vitals.weight ?? 70);
  const setRate      = usePharmacologyStore(s => s.setInfusionRate);
  const infusionRates = usePharmacologyStore(s => s.infusionRates);
  const scheduleDose = usePharmacologyStore(s => s.scheduleDose);
  const cancelScheduled = usePharmacologyStore(s => s.cancelScheduledDose);
  const scheduled    = usePharmacologyStore(s => s.scheduledDoses);
  const unitDisplay  = useUIStore(s => s.unitDisplay);

  const shockWarning = map < 65;

  return (
    <div className="p-2 space-y-2">
      {shockWarning && (
        <div className="rounded px-2 py-1 bg-red-900/40 border border-red-600/40 text-red-300 text-[0.48rem] font-bold">
          ⚠ PAM &lt; 65 mmHg — Suspender IECA/ARA-II. Evaluar β-bloqueante.
        </div>
      )}

      {AHT_DRUGS.map(drug => {
        const rate  = infusionRates[drug.id] ?? 0;
        const maxRate = DRUG_MAX_DOSES[drug.id] ?? 1;
        const step  = maxRate * 0.1;
        const activeDoses = scheduled.filter(s => s.drug === drug.id && s.active);
        const def = DRUG_CATALOG[drug.id];
        const F   = def.oralBioavailability ?? 1;

        const displayVal = unitDisplay === 'cc_h'
          ? `${doseToCcH(drug.id, rate, 'mg/h', weight).toFixed(1)} cc/h`
          : `${rate.toFixed(2)} mg/h`;

        return (
          <div key={drug.id} className="bg-[#0f172a] rounded-lg border border-white/5 p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[0.48rem] font-black uppercase tracking-widest" style={{ color: drug.color }}>
                {drug.name}
              </span>
              <span className="text-[0.38rem] text-slate-600 font-mono">F={F.toFixed(2)}</span>
            </div>

            {/* Dosis a horario (bolus oral) */}
            <div className="flex gap-1 mb-1">
              {drug.doses.map(d => (
                <button key={d} type="button"
                  onClick={() => {
                    PharmacologyEngine.getInstance().queueSlowBolus(drug.id, d * F, 60);
                    scheduleDose(drug.id, d, drug.intervalH);
                  }}
                  className="flex-1 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all border bg-transparent hover:bg-white/5"
                  style={{ borderColor: drug.color, color: drug.color }}
                >
                  {d}mg
                </button>
              ))}
            </div>

            {/* Infusión opcional (para algunos orales que pueden darse IV) */}
            <div className="flex items-center gap-1.5 mb-1">
              <input
                type="range"
                min={0} max={Math.max(rate, maxRate) * 1.5} step={step}
                value={rate}
                title={`Infusión ${drug.name}`}
                onChange={e => setRate(drug.id, parseFloat(e.target.value))}
                className="flex-1 h-1"
                style={{ accentColor: drug.color }}
              />
              <span className={`text-[0.48rem] font-mono w-20 text-right ${MONO}`} style={{ color: drug.color }}>
                {displayVal}
              </span>
              {rate > 0 && (
                <button type="button" onClick={() => setRate(drug.id, 0)}
                  className="text-[0.4rem] px-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 cursor-pointer">
                  ✕
                </button>
              )}
            </div>

            {/* Dosis programadas activas */}
            {activeDoses.map(s => (
              <div key={s.id} className="flex justify-between items-center bg-slate-800/40 rounded px-1.5 py-0.5 mb-0.5">
                <span className="text-[0.44rem] font-mono text-slate-300">{s.doseMg}mg c/{s.intervalH}h</span>
                <button type="button" onClick={() => cancelScheduled(s.id)}
                  className="text-red-400 text-[0.44rem] cursor-pointer">✕</button>
              </div>
            ))}

            <div className="text-[0.38rem] text-slate-600 leading-tight">{drug.note}</div>
          </div>
        );
      })}

      <div className="text-[0.38rem] text-slate-600 px-1">
        Heyland ICM 1996; Adam Pharmaceutics 2023 — absorción GI alterada con NA &gt; 0.3 mcg/kg/min
      </div>
    </div>
  );
};
