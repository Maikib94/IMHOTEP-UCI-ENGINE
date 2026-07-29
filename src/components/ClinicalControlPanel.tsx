// src/components/ClinicalControlPanel.tsx
// Layout de acordeón vertical — 5 categorías funcionales colapsables.
// Orden: HEMODINAMIA → SOPORTE RESPIRATORIO → SOPORTE NEUROLÓGICO
//        → INFECTOLOGÍA → FÁRMACOS ESPECIALES
// Estado de expansión persistido en usePatientStore.accordionExpanded.

import React, { useState } from 'react';
import { usePharmacologyStore, type DrugId } from '../store/usePharmacologyStore';
import { usePrognosisStore } from '../store/usePrognosisStore';
import { useUIStore } from '../store/useUIStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';
import { useTimeStore } from '../store/useTimeStore';
import { DRUG_CATALOG } from '../store/usePharmacologyStore';
import RespiratorySupportSelector from './RespiratorySupportSelector';
import { useLanguage } from '../i18n/LanguageContext';
import { PharmacyStorePanel } from './PharmacyStorePanel';

import AccordionSection          from './ui/AccordionSection';
import VasopressorControls       from './clinical/VasopressorControls';
import InotropeControls          from './clinical/InotropeControls';
import AntiarrhythmicControls    from './clinical/AntiarrhythmicControls';
import AnalgesiaControls         from './clinical/AnalgesiaControls';
import SedationControls          from './clinical/SedationControls';
import ParalysisControls         from './clinical/ParalysisControls';
import NeuroScalesPanel          from './clinical/NeuroScalesPanel';
import DiureticControls          from './clinical/DiureticControls';
import CorticoidControls         from './clinical/CorticoidControls';
import AerosolControls           from './clinical/AerosolControls';
import InsulinHGTControls        from './clinical/InsulinHGTControls';
import { AntihypertensiveControls }     from './clinical/AntihypertensiveControls';
import { OralAntiarrhythmicControls }   from './clinical/OralAntiarrhythmicControls';
import QuickARMPanel             from './QuickARMPanel';
import CulturePanel              from './CulturePanel';
import SpecialDrugsPanel         from './clinical/SpecialDrugsPanel';

// ─── Badge helper: cuenta drogas activas de una lista ────────────────────────

function useDrugBadge(drugs: DrugId[]): string | undefined {
  const rates  = usePharmacologyStore(s => s.infusionRates);
  const active = drugs.filter(d => (rates[d] ?? 0) > 0).length;
  return active > 0 ? `${active} activa${active > 1 ? 's' : ''}` : undefined;
}

// ─── Agenda unificada de dosis programadas ───────────────────────────────────

function ticksToHM(ticks: number): string {
  const absS = Math.abs(ticks);
  const h    = Math.floor(absS / 3600);
  const m    = Math.floor((absS % 3600) / 60);
  return `${h}h ${m}min`;
}

function DoseAgendaOverview() {
  const infusionRates   = usePharmacologyStore(s => s.infusionRates);
  const scheduled       = usePharmacologyStore(s => s.scheduledDoses);
  const cancelScheduled = usePharmacologyStore(s => s.cancelScheduledDose);
  const bolusHistory    = usePharmacologyStore(s => s.bolusHistory);
  const currentTick     = useTimeStore(s => s.ticks);

  const activeInfusions = Object.entries(infusionRates)
    .filter(([, r]) => r > 0)
    .sort(([a], [b]) => a.localeCompare(b)) as [DrugId, number][];

  const activeDoses = scheduled.filter(s => s.active);

  const lastDayTick = currentTick - 24 * 3600;
  const recentBoluses = bolusHistory.filter(b => b.tickAt >= lastDayTick).slice(-30).reverse();

  return (
    <div className="p-2 space-y-3">

      {/* ── INFUSIONES ACTIVAS ────────────────────────────────────────── */}
      {activeInfusions.length > 0 && (
        <div>
          <div className="text-[0.44rem] font-black text-cyan-400 uppercase tracking-widest mb-1">
            Infusiones activas ({activeInfusions.length})
          </div>
          <div className="space-y-0.5">
            {activeInfusions.map(([drug, rate]) => (
              <div key={drug} className="flex justify-between items-center px-2 py-0.5 rounded bg-cyan-900/10 border border-cyan-800/20 text-[0.44rem]">
                <span className="font-mono text-cyan-300">{DRUG_CATALOG[drug]?.shortName ?? drug}</span>
                <span className="font-mono text-slate-300">{rate.toFixed(2)} {DRUG_CATALOG[drug]?.inputUnit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PROGRAMADAS (próximas 24h) ─────────────────────────────────── */}
      {activeDoses.length > 0 && (
        <div>
          <div className="text-[0.44rem] font-black text-violet-400 uppercase tracking-widest mb-1">
            📅 Programadas ({activeDoses.length})
          </div>
          <div className="space-y-0.5">
            {activeDoses.map(s => {
              const drugLabel = DRUG_CATALOG[s.drug]?.shortName ?? s.drug;
              const ticksLeft = s.nextTickAt - currentTick;
              const overdue   = ticksLeft < 0;
              return (
                <div key={s.id} className={`flex justify-between items-center px-2 py-1 rounded text-[0.44rem] border ${
                  overdue ? 'bg-amber-900/15 border-amber-700/30' : 'bg-slate-800/40 border-white/5'
                }`}>
                  <span className="font-mono text-slate-200 truncate">
                    {drugLabel} {s.doseMg}mg c/{s.intervalH}h
                  </span>
                  <span className={`font-mono shrink-0 ml-2 ${overdue ? 'text-amber-400' : 'text-slate-400'}`}>
                    {overdue ? `+${ticksToHM(-ticksLeft)} tarde` : `→${ticksToHM(ticksLeft)}`}
                  </span>
                  <button type="button" onClick={() => cancelScheduled(s.id)}
                    className="text-red-400 text-[0.44rem] cursor-pointer ml-1.5 shrink-0">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HISTORIAL últimas 24h ──────────────────────────────────────── */}
      {recentBoluses.length > 0 && (
        <div>
          <div className="text-[0.44rem] font-black text-slate-400 uppercase tracking-widest mb-1">
            Historial 24h ({recentBoluses.length})
          </div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {recentBoluses.map((b, i) => {
              const ageH = Math.round((currentTick - b.tickAt) / 3600);
              return (
                <div key={i} className="flex justify-between items-center px-2 py-0.5 rounded bg-black/20 border border-white/5 text-[0.42rem]">
                  <span className="font-mono text-slate-400">{DRUG_CATALOG[b.drug]?.shortName ?? b.drug}</span>
                  <span className="font-mono text-slate-500">{b.doseMg}mg {b.route}</span>
                  <span className="font-mono text-slate-600">-{ageH}h</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeInfusions.length === 0 && activeDoses.length === 0 && recentBoluses.length === 0 && (
        <div className="text-[0.44rem] text-slate-600 italic text-center py-2">Sin actividad farmacológica</div>
      )}
    </div>
  );
}

// ─── Sección INFECTOLOGÍA (ISDA + cultivos) ──────────────────────────────────

function InfectoLabSection() {
  const prognosisActive   = usePrognosisStore(s => s.isActive);
  const sofaScore         = usePrognosisStore(s => s.sofaScore);
  const apacheII          = usePrognosisStore(s => s.apacheII);
  const outcome           = usePrognosisStore(s => s.outcome);
  const activatePrognosis   = usePrognosisStore(s => s.activate);
  const deactivatePrognosis = usePrognosisStore(s => s.deactivate);
  const orderCulture       = useMicrobiologyStore(s => s.orderCulture);
  const cultures           = useMicrobiologyStore(s => s.cultures);
  const simElapsed         = useTimeStore(s => s.simulatedElapsed);
  const urinePending = cultures.some(
    c => (c.siteType === 'urine_catheter' || c.siteType === 'urine_midstream') && c.status === 'pending'
  );
  const urineResult = cultures.find(
    c => (c.siteType === 'urine_catheter' || c.siteType === 'urine_midstream') && c.result !== null
  );

  return (
    <div className="p-3 space-y-3">
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

      {/* ── UROCULTIVOS ──────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] rounded-xl border border-white/5 p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.5rem] font-black text-amber-400 uppercase tracking-widest">
            🧪 Urocultivos
          </div>
          {urineResult?.result?.isPositive && (
            <span className="text-[0.42rem] text-emerald-400 font-mono font-bold">
              ✓ {urineResult.result.pathogenName}
            </span>
          )}
        </div>
        {urinePending ? (
          <div className="text-[0.48rem] text-amber-300 font-mono animate-pulse">
            ⏳ Procesando… (24-48h sim)
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => orderCulture('urine_catheter', simElapsed)}
              className="flex-1 py-1 rounded text-[0.48rem] font-bold cursor-pointer border border-amber-600/40 bg-amber-900/20 text-amber-300 hover:bg-amber-800/30 transition-all"
            >
              Sonda Foley
            </button>
            <button
              type="button"
              onClick={() => orderCulture('urine_midstream', simElapsed)}
              className="flex-1 py-1 rounded text-[0.48rem] font-bold cursor-pointer border border-amber-600/40 bg-amber-900/20 text-amber-300 hover:bg-amber-800/30 transition-all"
            >
              Chorro Medio
            </button>
          </div>
        )}
        <div className="text-[0.38rem] text-slate-600 mt-1">
          Wen Y et al. PLoS ONE 2025 — E. coli 51.6%, K. pneumoniae 11.9%
        </div>
      </div>

      <div className="h-[280px] min-h-0">
        <CulturePanel />
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ClinicalControlPanelProps {
  onOpenVent?: () => void;
}

export default function ClinicalControlPanel({ onOpenVent }: ClinicalControlPanelProps) {
  const [showPharmacy, setShowPharmacy] = useState(false);
  const { doseDisplayMode, setDoseDisplayMode } = useLanguage();

  // ── Badges por grupo de drogas ──────────────────────────────────────────────
  const hemoBadge  = useDrugBadge(['noradrenaline','adrenaline','vasopressin','methylene_blue',
                                    'dobutamine','dopamine','milrinone','levosimendan',
                                    'amiodarone','digoxin','esmolol','metoprolol_iv','diltiazem_iv']);
  const neuroBadge = useDrugBadge(['morphine','fentanyl','remifentanil',
                                    'propofol','midazolam','ketamine','dexmedetomidine','thiopental',
                                    'rocuronium','cisatracurium','atracurium','pancuronium']);
  const farmBadge  = useDrugBadge(['furosemide_iv','furosemide_oral',
                                    'hydrocortisone','methylprednisolone','dexamethasone',
                                    'salbutamol_neb','ipratropium_neb',
                                    'insulin_regular_iv','insulin_nph','insulin_glargine']);

  const unitDisplay    = useUIStore(s => s.unitDisplay);
  const toggleUnit     = useUIStore(s => s.toggleUnitDisplay);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden rounded-xl">

      {/* ── Header con toggle de unidades y botón Farmacia ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 shrink-0 gap-1">
        <span className="text-[0.45rem] font-black text-slate-500 tracking-widest uppercase shrink-0">Panel Clínico</span>

        {/* Botón Farmacia */}
        <button
          type="button"
          onClick={() => setShowPharmacy(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-violet-700/40 bg-violet-900/15 text-violet-400 text-[0.42rem] font-bold cursor-pointer hover:bg-violet-800/25 transition-all shrink-0"
          title="Calculador de diluciones"
        >
          <span>💊</span>
          <span>Farmacia</span>
        </button>

        {/* Toggle unidades: nativa / ambas / cc/h */}
        <button
          type="button"
          onClick={() => {
            const next = doseDisplayMode === 'native' ? 'both' : doseDisplayMode === 'both' ? 'cch' : 'native';
            setDoseDisplayMode(next);
            toggleUnit(); // keep UIStore in sync
          }}
          title="Alternar modo display: nativo → ambos → cc/h"
          className="flex items-center gap-1 cursor-pointer shrink-0"
        >
          <span className={`text-[0.42rem] font-bold transition-colors ${doseDisplayMode === 'native' ? 'text-cyan-300' : 'text-slate-500'}`}>MÉD</span>
          <div className="relative w-7 h-3.5 rounded-full bg-slate-700">
            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 transition-all duration-200 ${
              doseDisplayMode === 'cch' ? 'left-[14px]' : doseDisplayMode === 'both' ? 'left-[7px]' : 'left-0.5'
            }`} />
          </div>
          <span className={`text-[0.42rem] font-bold transition-colors ${doseDisplayMode === 'cch' ? 'text-cyan-300' : 'text-slate-500'}`}>CC/H</span>
        </button>
      </div>

      {/* Pharmacy modal */}
      <PharmacyStorePanel open={showPharmacy} onClose={() => setShowPharmacy(false)} />

      {/* ── Acordeón de secciones clínicas ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* 1. HEMODINAMIA — vasopresores + inotrópicos + antiarrítmicos */}
        <AccordionSection
          id="hemodynamics"
          title="HEMODINAMIA"
          badge={hemoBadge}
          dotColor="#ef4444"
          accentColor="#f87171"
          defaultExpanded
        >
          <AccordionSection id="drugs-vasopressors" title="VASOPRESORES"
            dotColor="#dc2626" accentColor="#ef4444">
            <VasopressorControls />
          </AccordionSection>

          <AccordionSection id="drugs-inotropes" title="INOTRÓPICOS"
            dotColor="#f97316" accentColor="#fb923c">
            <InotropeControls />
          </AccordionSection>

          <AccordionSection id="drugs-antiarrhythmics" title="ANTIARRÍTMICOS"
            dotColor="#8b5cf6" accentColor="#a78bfa">
            <AntiarrhythmicControls />
          </AccordionSection>
        </AccordionSection>

        {/* 2. SOPORTE RESPIRATORIO — justo debajo de HEMODINAMIA */}
        <AccordionSection
          id="resp-support"
          title="SOPORTE RESPIRATORIO"
          dotColor="#34d399"
          accentColor="#6ee7b7"
          defaultExpanded
        >
          <RespiratorySupportSelector onOpenVent={onOpenVent} />
          <AccordionSection id="arm-quick" title="ACCESO RÁPIDO ARM"
            dotColor="#34d399" accentColor="#6ee7b7">
            <QuickARMPanel />
          </AccordionSection>
        </AccordionSection>

        {/* 3. SOPORTE NEUROLÓGICO — analgesia + sedación + BNM + neuro */}
        <AccordionSection
          id="neuro-support"
          title="SOPORTE NEUROLÓGICO"
          badge={neuroBadge}
          dotColor="#eab308"
          accentColor="#facc15"
        >
          <AccordionSection id="drugs-analgesia" title="ANALGESIA"
            dotColor="#3b82f6" accentColor="#60a5fa">
            <AnalgesiaControls />
          </AccordionSection>

          <AccordionSection id="drugs-sedation" title="SEDACIÓN"
            dotColor="#eab308" accentColor="#facc15">
            <SedationControls />
          </AccordionSection>

          <AccordionSection id="drugs-bnm" title="PARÁLISIS BNM"
            dotColor="#10b981" accentColor="#34d399">
            <ParalysisControls />
          </AccordionSection>

          <AccordionSection id="clinical-neuro" title="MONITOREO NEURO"
            dotColor="#22d3ee" accentColor="#67e8f9">
            <NeuroScalesPanel />
          </AccordionSection>
        </AccordionSection>

        {/* 5. FÁRMACOS ESPECIALES — diuréticos + corticoides + aerosoles + insulina */}
        <AccordionSection
          id="farmacos-especiales"
          title="FÁRMACOS ESPECIALES"
          badge={farmBadge}
          dotColor="#06b6d4"
          accentColor="#22d3ee"
        >
          <AccordionSection id="farmacos-diureticos" title="DIURÉTICOS"
            dotColor="#22d3ee" accentColor="#67e8f9">
            <DiureticControls />
          </AccordionSection>

          <AccordionSection id="farmacos-corticoides" title="CORTICOIDES"
            dotColor="#f59e0b" accentColor="#fbbf24">
            <CorticoidControls />
          </AccordionSection>

          <AccordionSection id="farmacos-aerosoles" title="AEROSOLES"
            dotColor="#34d399" accentColor="#6ee7b7">
            <AerosolControls />
          </AccordionSection>

          <AccordionSection id="farmacos-insulina" title="INSULINA Y HGT"
            dotColor="#a78bfa" accentColor="#c4b5fd">
            <InsulinHGTControls />
          </AccordionSection>

          <AccordionSection id="farmacos-hiperosmolar" title="HIPEROSMOLAR / ESPECIALES"
            dotColor="#a78bfa" accentColor="#c4b5fd">
            <SpecialDrugsPanel />
          </AccordionSection>

          <AccordionSection id="farmacos-antihipertensivos" title="ANTIHIPERTENSIVOS VO"
            dotColor="#38bdf8" accentColor="#7dd3fc">
            <AntihypertensiveControls />
          </AccordionSection>

          <AccordionSection id="farmacos-antiarrit-oral" title="ANTIARRÍTMICOS VO"
            dotColor="#f59e0b" accentColor="#fbbf24">
            <OralAntiarrhythmicControls />
          </AccordionSection>

          <AccordionSection id="farmacos-agenda" title="AGENDA DE DOSIS"
            dotColor="#a78bfa" accentColor="#c4b5fd">
            <DoseAgendaOverview />
          </AccordionSection>
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
