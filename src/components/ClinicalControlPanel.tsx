// src/components/ClinicalControlPanel.tsx
// Layout de acordeón vertical — todas las categorías clínicas colapsables.
// Estado de expansión persistido en usePatientStore.UIState.

import React from 'react';
import { usePharmacologyStore, type DrugId } from '../store/usePharmacologyStore';
import { usePatientStore, type RespiratorySupport } from '../store/usePatientStore';
import { usePrognosisStore } from '../store/usePrognosisStore';

import AccordionSection          from './ui/AccordionSection';
import VasopressorControls        from './clinical/VasopressorControls';
import InotropeControls           from './clinical/InotropeControls';
import AntiarrhythmicControls     from './clinical/AntiarrhythmicControls';
import AnalgesiaControls          from './clinical/AnalgesiaControls';
import SedationControls           from './clinical/SedationControls';
import ParalysisControls          from './clinical/ParalysisControls';
import NeuroScalesPanel           from './clinical/NeuroScalesPanel';
import QuickARMPanel              from './QuickARMPanel';
import CulturePanel               from './CulturePanel';

// ─── Badge helper: cuenta drogas activas de una lista ────────────────────────

function useDrugBadge(drugs: DrugId[]): string | undefined {
  const rates = usePharmacologyStore(s => s.infusionRates);
  const active = drugs.filter(d => (rates[d] ?? 0) > 0).length;
  return active > 0 ? `${active} activa${active > 1 ? 's' : ''}` : undefined;
}

// ─── Sección INFECTO/LAB (ISDA + cultivos) ───────────────────────────────────

function InfectoLabSection() {
  const prognosisActive   = usePrognosisStore(s => s.isActive);
  const sofaScore         = usePrognosisStore(s => s.sofaScore);
  const apacheII          = usePrognosisStore(s => s.apacheII);
  const outcome           = usePrognosisStore(s => s.outcome);
  const activatePrognosis   = usePrognosisStore(s => s.activate);
  const deactivatePrognosis = usePrognosisStore(s => s.deactivate);

  return (
    <div className="p-3 space-y-3">
      {/* Motor ISDA */}
      <div className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
        <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${prognosisActive ? 'bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'bg-slate-600'}`} />
            <div className={`text-[0.52rem] font-black tracking-widest ${prognosisActive ? 'text-red-400' : 'text-slate-500'}`}>
              COMPLICACIONES ISDA
            </div>
          </div>
          <button type="button"
            onClick={() => prognosisActive ? deactivatePrognosis() : activatePrognosis()}
            className={`px-2 py-1 text-[0.45rem] font-black rounded border uppercase tracking-widest cursor-pointer transition-all ${
              prognosisActive
                ? 'bg-red-900/60 border-red-600 text-red-400 hover:bg-red-900'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
            }`}
          >
            {prognosisActive ? 'DESACTIVAR' : 'ACTIVAR'}
          </button>
        </div>

        {prognosisActive && (
          <div className="space-y-2">
            <div className="bg-[#060a12] rounded-lg p-2 border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[0.5rem] font-black text-slate-400 tracking-wider">SOFA 2.0</span>
                <span className={`text-sm font-black font-mono ${sofaScore >= 11 ? 'text-red-400' : sofaScore >= 7 ? 'text-orange-400' : sofaScore >= 4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {sofaScore}/24
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${sofaScore >= 11 ? 'bg-red-500' : sofaScore >= 7 ? 'bg-orange-500' : sofaScore >= 4 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                  style={{ width: `${(sofaScore / 24) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-[#060a12] rounded-lg p-2 border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[0.5rem] font-black text-slate-400 tracking-wider">APACHE II</span>
                <span className={`text-sm font-black font-mono ${apacheII >= 25 ? 'text-red-400' : apacheII >= 15 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {apacheII}/71
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${apacheII >= 25 ? 'bg-red-500' : apacheII >= 15 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                  style={{ width: `${(apacheII / 71) * 100}%` }}
                />
              </div>
            </div>

            {outcome !== 'ongoing' && (
              <div className={`rounded-lg p-2 border text-center ${
                outcome === 'death'         ? 'bg-red-950/40 border-red-800 text-red-400' :
                outcome === 'discharge'     ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400' :
                                              'bg-amber-950/40 border-amber-700 text-amber-400'
              }`}>
                <div className="text-[0.55rem] font-black uppercase tracking-widest">
                  {outcome === 'death'           ? '⚠ ÓBITO' :
                   outcome === 'discharge'       ? '✓ ALTA UCI' :
                   outcome === 'late_discharge'  ? 'ALTA TARDÍA' :
                                                   'TRAQUEOSTOMÍA + ALTA TARDÍA'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel de cultivos */}
      <div className="h-[280px] min-h-0">
        <CulturePanel />
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ClinicalControlPanel() {
  const respiratoryDevice     = usePatientStore(s => s.respiratoryDevice);
  const setRespiratorySupport = usePatientStore(s => s.setRespiratorySupport);
  const setRespiratoryDevice  = usePatientStore(s => s.setRespiratoryDevice);
  const currentSupport = respiratoryDevice.support;

  // Badges por categoría de droga
  const vasoBadge = useDrugBadge(['noradrenaline', 'adrenaline', 'vasopressin', 'methylene_blue']);
  const inoBadge  = useDrugBadge(['dobutamine', 'dopamine', 'milrinone', 'levosimendan']);
  const antiBadge = useDrugBadge(['amiodarone', 'digoxin']);
  const analgBadge = useDrugBadge(['morphine', 'fentanyl', 'remifentanil']);
  const sedBadge  = useDrugBadge(['propofol', 'midazolam', 'ketamine', 'dexmedetomidine', 'thiopental']);
  const bnmBadge  = useDrugBadge(['rocuronium', 'cisatracurium', 'atracurium', 'pancuronium']);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden rounded-xl">

      {/* ── Soporte Respiratorio Escalonado (fijo, no acordeón) ── */}
      <div className="shrink-0 px-3 pt-2 pb-1 space-y-1.5 border-b border-white/5">
        <div className="text-[0.42rem] font-black text-slate-500 tracking-widest uppercase mb-1">Soporte Respiratorio</div>
        {([
          { key: 'room_air',      label: 'Aire Ambiental',          color: 'text-slate-400',   border: 'border-slate-700',  bg: 'bg-slate-800/40'   },
          { key: 'nasal_cannula', label: 'Cánula Nasal',            color: 'text-sky-400',     border: 'border-sky-700',    bg: 'bg-sky-900/30'     },
          { key: 'simple_mask',   label: 'Máscara Simple',          color: 'text-blue-400',    border: 'border-blue-700',   bg: 'bg-blue-900/30'    },
          { key: 'venturi',       label: 'Máscara Venturi',         color: 'text-indigo-400',  border: 'border-indigo-700', bg: 'bg-indigo-900/30'  },
          { key: 'hfnc',          label: 'CNAF (Alto Flujo)',       color: 'text-violet-400',  border: 'border-violet-700', bg: 'bg-violet-900/30'  },
          { key: 'arm',           label: 'ARM (Ventilación Mec.)', color: 'text-emerald-400', border: 'border-emerald-600', bg: 'bg-emerald-900/40' },
        ] as { key: RespiratorySupport; label: string; color: string; border: string; bg: string }[]).map(({ key, label, color, border, bg }) => {
          const isActive = currentSupport === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRespiratorySupport(key)}
              className={`w-full py-1.5 px-2.5 rounded-lg font-bold text-[0.5rem] tracking-wider uppercase transition-all duration-200 border flex items-center gap-2 ${
                isActive ? `${bg} ${border} ${color} shadow-sm` : 'bg-slate-900/30 border-slate-800 text-slate-600 hover:text-slate-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-current animate-pulse' : 'bg-slate-700'}`} />
              {label}
            </button>
          );
        })}

        {/* Controles específicos del dispositivo */}
        {currentSupport === 'nasal_cannula' && (
          <div className="bg-sky-900/20 border border-sky-800/50 rounded-lg p-2 mt-1">
            <div className="text-[0.42rem] text-sky-400 font-bold mb-1">FLUJO CÁNULA</div>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={6} step={1} value={respiratoryDevice.cannulaFlow}
                title="Flujo cánula nasal"
                onChange={e => setRespiratoryDevice({ cannulaFlow: Number(e.target.value) })}
                className="flex-1" style={{ accentColor: '#38bdf8' }} />
              <span className="text-sky-300 font-mono text-xs font-bold w-8">{respiratoryDevice.cannulaFlow} L</span>
            </div>
            <div className="text-[0.38rem] text-sky-700 mt-0.5">
              FiO₂ ≈ {Math.round((0.21 + 0.04 * respiratoryDevice.cannulaFlow) * 100)}%
            </div>
          </div>
        )}
        {currentSupport === 'venturi' && (
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-lg p-2 mt-1">
            <div className="text-[0.42rem] text-indigo-400 font-bold mb-1.5">FiO₂ VENTURI</div>
            <div className="flex flex-wrap gap-1">
              {[0.24, 0.28, 0.31, 0.35, 0.40, 0.60].map(fio2 => (
                <button key={fio2} type="button"
                  onClick={() => setRespiratoryDevice({ venturiFiO2: fio2 })}
                  className={`px-1.5 py-0.5 text-[0.42rem] font-bold rounded border font-mono cursor-pointer ${
                    respiratoryDevice.venturiFiO2 === fio2
                      ? 'bg-indigo-700 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >{Math.round(fio2 * 100)}%</button>
              ))}
            </div>
          </div>
        )}
        {currentSupport === 'hfnc' && (
          <div className="bg-violet-900/20 border border-violet-800/50 rounded-lg p-2 mt-1 space-y-1.5">
            <div className="text-[0.42rem] text-violet-400 font-bold">CNAF — PARÁMETROS</div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.38rem] text-violet-400">Flujo</span>
                <span className="text-[0.42rem] text-violet-300 font-mono font-bold">{respiratoryDevice.hfncFlow} L/min</span>
              </div>
              <input type="range" min={20} max={60} step={5} value={respiratoryDevice.hfncFlow}
                title="Flujo CNAF"
                onChange={e => setRespiratoryDevice({ hfncFlow: Number(e.target.value) })}
                className="w-full" style={{ accentColor: '#a78bfa' }} />
            </div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.38rem] text-violet-400">FiO₂</span>
                <span className="text-[0.42rem] text-violet-300 font-mono font-bold">{Math.round(respiratoryDevice.hfncFiO2 * 100)}%</span>
              </div>
              <input type="range" min={21} max={100} step={1} value={Math.round(respiratoryDevice.hfncFiO2 * 100)}
                title="FiO2 CNAF"
                onChange={e => setRespiratoryDevice({ hfncFiO2: Number(e.target.value) / 100 })}
                className="w-full" style={{ accentColor: '#a78bfa' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Acordeón de secciones clínicas ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        <AccordionSection id="drugs-vasopressors" title="VASOPRESORES"
          badge={vasoBadge} dotColor="#dc2626" accentColor="#ef4444">
          <VasopressorControls />
        </AccordionSection>

        <AccordionSection id="drugs-inotropes" title="INOTRÓPICOS"
          badge={inoBadge} dotColor="#f97316" accentColor="#fb923c">
          <InotropeControls />
        </AccordionSection>

        <AccordionSection id="drugs-antiarrhythmics" title="ANTIARRÍTMICOS"
          badge={antiBadge} dotColor="#8b5cf6" accentColor="#a78bfa">
          <AntiarrhythmicControls />
        </AccordionSection>

        <AccordionSection id="drugs-analgesia" title="ANALGESIA"
          badge={analgBadge} dotColor="#3b82f6" accentColor="#60a5fa">
          <AnalgesiaControls />
        </AccordionSection>

        <AccordionSection id="drugs-sedation" title="SEDACIÓN"
          badge={sedBadge} dotColor="#eab308" accentColor="#facc15">
          <SedationControls />
        </AccordionSection>

        <AccordionSection id="drugs-bnm" title="PARÁLISIS BNM"
          badge={bnmBadge} dotColor="#10b981" accentColor="#34d399">
          <ParalysisControls />
        </AccordionSection>

        <AccordionSection id="clinical-neuro" title="MONITOREO NEURO"
          dotColor="#22d3ee" accentColor="#67e8f9">
          <NeuroScalesPanel />
        </AccordionSection>

        <AccordionSection id="infecto-lab" title="INFECTO / LAB"
          dotColor="#f43f5e" accentColor="#fb7185">
          <InfectoLabSection />
        </AccordionSection>

        <AccordionSection id="arm-quick" title="ACCESO RÁPIDO ARM"
          dotColor="#34d399" accentColor="#6ee7b7">
          <QuickARMPanel />
        </AccordionSection>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}} />
    </div>
  );
}
