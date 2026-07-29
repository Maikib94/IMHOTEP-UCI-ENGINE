// src/components/header/InfectologyModal.tsx
//
// Drawer-based infectology panel with 4 tabs:
//   SOSPECHA · CULTIVOS · RESISTENCIA · FUENTE
// Replaces the INFECTOLOGÍA accordion in ClinicalControlPanel.

import React, { useState, memo } from 'react';
import { Drawer }              from '../ui/Drawer';
import { useMicrobiologyStore, CULTURE_SITE_CATALOG } from '../../store/useMicrobiologyStore';
import { usePrognosisStore }   from '../../store/usePrognosisStore';
import { useTimeStore }        from '../../store/useTimeStore';
import { usePharmacologyStore, DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { useCRRTStore }        from '../../store/useCRRTStore';
import { DRUG_MAX_DOSES }      from '../../core/PharmacologyEngine';
import CulturePanel            from '../CulturePanel';
import InfusionCardWithDilution from '../clinical/InfusionCardWithDilution';
import { ImagingEngine, MODALITY_LABELS } from '../../core/ImagingEngine';
import type { ImagingModality, ImagingFinding } from '../../core/ImagingEngine';
import type { DrugId } from '../../store/usePharmacologyStore';

type TabId = 'sospecha' | 'cultivos' | 'resistencia' | 'fuente' | 'atb' | 'imaging';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'sospecha',    label: 'Sospecha',    icon: '🔍' },
  { id: 'cultivos',    label: 'Cultivos',    icon: '🧫' },
  { id: 'resistencia', label: 'Resistencia', icon: '🛡' },
  { id: 'fuente',      label: 'Fuente',      icon: '📍' },
  { id: 'atb',         label: 'ATB',         icon: '💊' },
  { id: 'imaging',     label: 'Imagen',      icon: '🔬' },
];

// ─── SOSPECHA tab ─────────────────────────────────────────────────────────────

function SospechaTab() {
  const prognosisActive   = usePrognosisStore(s => s.isActive);
  const sofaScore         = usePrognosisStore(s => s.sofaScore);
  const apacheII          = usePrognosisStore(s => s.apacheII);
  const outcome           = usePrognosisStore(s => s.outcome);
  const activate          = usePrognosisStore(s => s.activate);
  const deactivate        = usePrognosisStore(s => s.deactivate);
  const revealedGerm      = useMicrobiologyStore(s => s.revealedGerm);
  const cultures          = useMicrobiologyStore(s => s.cultures);

  const positives = cultures.filter(c => c.status === 'positive');

  return (
    <div className="p-4 space-y-3">

      {/* Prognosis toggle */}
      <div className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
        <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${prognosisActive ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className={`text-[0.52rem] font-black tracking-widest ${prognosisActive ? 'text-red-400' : 'text-slate-500'}`}>
              COMPLICACIONES ISDA
            </span>
          </div>
          <button type="button"
            onClick={() => prognosisActive ? deactivate() : activate()}
            className={`px-2 py-1 text-[0.45rem] font-black rounded border uppercase tracking-widest cursor-pointer transition-all ${
              prognosisActive
                ? 'bg-red-900/60 border-red-600 text-red-400'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
            }`}
          >
            {prognosisActive ? 'DESACTIVAR' : 'ACTIVAR'}
          </button>
        </div>

        {prognosisActive && (
          <div className="space-y-2">
            {/* SOFA */}
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

            {/* APACHE II */}
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
                outcome === 'death'        ? 'bg-red-950/40 border-red-800 text-red-400' :
                outcome === 'discharge'    ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400' :
                                             'bg-amber-950/40 border-amber-700 text-amber-400'
              }`}>
                <div className="text-[0.55rem] font-black uppercase tracking-widest">
                  {outcome === 'death'           ? '⚠ ÓBITO' :
                   outcome === 'discharge'       ? '✓ ALTA UCI' :
                   outcome === 'late_discharge'  ? 'ALTA TARDÍA' : 'TRAQUEOSTOMÍA'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Revealed germ */}
      {revealedGerm && (
        <div className="bg-red-950/30 rounded-xl border border-red-700/40 p-3">
          <div className="text-[0.48rem] font-black text-red-400 uppercase tracking-wider mb-1">
            Patógeno Identificado
          </div>
          <div className="text-[0.65rem] font-mono font-bold text-red-200">{revealedGerm}</div>
        </div>
      )}

      {/* Positive cultures summary */}
      {positives.length > 0 && (
        <div className="space-y-1">
          <div className="text-[0.46rem] font-black text-slate-400 uppercase tracking-wider">
            Cultivos positivos ({positives.length})
          </div>
          {positives.map(c => (
            <div key={c.id} className="flex justify-between items-center bg-emerald-950/25 rounded-lg border border-emerald-700/30 px-2.5 py-1.5">
              <span className="text-[0.46rem] text-emerald-400 font-mono">
                {CULTURE_SITE_CATALOG[c.siteType]?.displayName ?? c.siteType}
              </span>
              <span className="text-[0.44rem] font-bold text-emerald-300">
                {c.result?.pathogenName ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CULTIVOS tab ─────────────────────────────────────────────────────────────

function CultivosTab() {
  const orderCulture  = useMicrobiologyStore(s => s.orderCulture);
  const cultures      = useMicrobiologyStore(s => s.cultures);
  const simElapsed    = useTimeStore(s => s.simulatedElapsed);

  const urinePending = cultures.some(
    c => (c.siteType === 'urine_catheter' || c.siteType === 'urine_midstream') && c.status === 'pending'
  );
  const urineResult = cultures.find(
    c => (c.siteType === 'urine_catheter' || c.siteType === 'urine_midstream') && c.result !== null
  );

  return (
    <div className="p-4 space-y-3">
      {/* Urocultivos */}
      <div className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.52rem] font-black text-amber-400 uppercase tracking-widest">
            🧪 Urocultivos
          </div>
          {urineResult?.result?.isPositive && (
            <span className="text-[0.42rem] text-emerald-400 font-mono font-bold">
              ✓ {urineResult.result.pathogenName}
            </span>
          )}
        </div>
        {urinePending ? (
          <div className="text-[0.48rem] text-amber-300 font-mono animate-pulse">⏳ Procesando… (24h sim)</div>
        ) : (
          <div className="flex gap-1.5">
            <button type="button"
              onClick={() => orderCulture('urine_catheter', simElapsed)}
              className="flex-1 py-1.5 rounded text-[0.48rem] font-bold cursor-pointer border border-amber-600/40 bg-amber-900/20 text-amber-300 hover:bg-amber-800/30 transition-all"
            >
              Sonda Foley
            </button>
            <button type="button"
              onClick={() => orderCulture('urine_midstream', simElapsed)}
              className="flex-1 py-1.5 rounded text-[0.48rem] font-bold cursor-pointer border border-amber-600/40 bg-amber-900/20 text-amber-300 hover:bg-amber-800/30 transition-all"
            >
              Chorro Medio
            </button>
          </div>
        )}
        <div className="text-[0.38rem] text-slate-600 mt-1">
          Wen Y et al. PLoS ONE 2025 — E. coli 51.6%, K. pneumoniae 11.9%
        </div>
      </div>

      {/* Main culture panel */}
      <CulturePanel />
    </div>
  );
}

// ─── RESISTENCIA tab ─────────────────────────────────────────────────────────

function ResistenciaTab() {
  const cultures  = useMicrobiologyStore(s => s.cultures);
  const positives = cultures.filter(c => c.result?.sensitivities && Object.keys(c.result.sensitivities).length > 0);

  return (
    <div className="p-4 space-y-2">
      {positives.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-[0.5rem]">
          Sin resultados con antibiograma disponible.
        </div>
      ) : positives.map(c => (
        <div key={c.id} className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
          <div className="text-[0.52rem] font-black text-slate-300 mb-2">
            {CULTURE_SITE_CATALOG[c.siteType]?.displayName ?? c.siteType}
            <span className="ml-2 text-emerald-400 font-mono">{c.result?.pathogenName}</span>
          </div>
          {c.result?.sensitivities && (
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(c.result.sensitivities).map(([atb, sens]) => (
                <div key={atb}
                  className={`px-1.5 py-1 rounded text-center text-[0.4rem] font-bold border ${
                    sens === 'S' ? 'text-emerald-400 border-emerald-700/40 bg-emerald-950/30' :
                    sens === 'R' ? 'text-red-400 border-red-700/40 bg-red-950/30' :
                                   'text-amber-400 border-amber-700/40 bg-amber-950/30'
                  }`}
                >
                  <div className="truncate">{atb}</div>
                  <div className="font-black mt-0.5">{String(sens)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── FUENTE tab ───────────────────────────────────────────────────────────────

function FuenteTab() {
  const cultures   = useMicrobiologyStore(s => s.cultures);
  const byCategory = cultures.reduce<Record<string, typeof cultures>>((acc, c) => {
    const cat = CULTURE_SITE_CATALOG[c.siteType]?.category ?? 'other';
    (acc[cat] ??= []).push(c);
    return acc;
  }, {});

  const STATUS_COLOR: Record<string, string> = {
    pending:     '#fbbf24',
    in_progress: '#60a5fa',
    ready:       '#a78bfa',
    positive:    '#4ade80',
    negative:    '#475569',
  };

  return (
    <div className="p-4 space-y-3">
      {Object.keys(byCategory).length === 0 && (
        <div className="text-center py-8 text-slate-600 text-[0.5rem]">
          Sin cultivos solicitados.
        </div>
      )}
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat} className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
          <div className="text-[0.48rem] font-black uppercase tracking-widest text-slate-400 mb-2">{cat}</div>
          <div className="space-y-1.5">
            {items.map(c => {
              const color = STATUS_COLOR[c.status] ?? '#94a3b8';
              return (
                <div key={c.id} className="flex items-center justify-between">
                  <span className="text-[0.48rem] text-slate-300 font-mono">
                    {CULTURE_SITE_CATALOG[c.siteType]?.displayName ?? c.siteType}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[0.42rem] font-bold uppercase" style={{ color }}>
                      {c.status}
                    </span>
                    {c.result?.pathogenName && (
                      <span className="text-[0.42rem] text-emerald-400 font-mono ml-1">
                        {c.result.pathogenName}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ATB Tab ─────────────────────────────────────────────────────────────────

const ATB_DRUGS: { drugId: DrugId; label: string; doses: string; color: string }[] = [
  { drugId: 'meropenem_iv',         label: 'Meropenem',          doses: '1g c/8h · 2g c/8h ext', color: '#60a5fa' },
  { drugId: 'piperacillin_tazo_iv', label: 'Pip-Tazo',           doses: '4.5g c/6h · infusión',  color: '#34d399' },
  { drugId: 'vancomycin_iv',        label: 'Vancomicina',        doses: 'AUC-guided · 25-35',    color: '#fbbf24' },
  { drugId: 'cefepime_iv',          label: 'Cefepime',           doses: '2g c/8h',               color: '#a78bfa' },
  { drugId: 'levofloxacin_iv',      label: 'Levofloxacino',      doses: '750mg c/24h',           color: '#fb923c' },
  { drugId: 'linezolid_iv',         label: 'Linezolid',          doses: '600mg c/12h',           color: '#f87171' },
  { drugId: 'fluconazole_iv',       label: 'Fluconazol',         doses: '400mg c/24h',           color: '#e879f9' },
  { drugId: 'caspofungin_iv',       label: 'Caspofungina',       doses: '70mg D1 → 50mg/d',     color: '#38bdf8' },
];

const ATBTab = memo(function ATBTab() {
  const rates      = usePharmacologyStore(s => s.infusionRates);
  const setRate    = usePharmacologyStore(s => s.setInfusionRate);
  const crrtActive = useCRRTStore(s => s.active);
  const crrtAlert  = useCRRTStore(s => s.atbAdjustAlert);
  const alertDrugs = useCRRTStore(s => s.atbAlertDrugs);

  return (
    <div className="p-4 space-y-3">
      {/* CRRT adjustment alert */}
      {crrtActive && crrtAlert && alertDrugs.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2.5">
          <div className="text-[0.5rem] font-black text-amber-400 uppercase tracking-wider mb-1">
            ⚠ Considere ajustar dosis ATB por CRRT
          </div>
          <div className="text-[0.44rem] text-amber-300 font-mono">{alertDrugs.join(' · ')}</div>
          <div className="text-[0.38rem] text-amber-700 mt-0.5">Roberts JA ICM 2025; Hoff BM Ann Pharmacother 2020</div>
        </div>
      )}

      {/* Active infusions count */}
      {crrtActive && (
        <div className="text-[0.42rem] text-slate-500 font-mono">
          CRRT activo — clearance aumentado para fármacos con dializabilidad &gt; 0.5
        </div>
      )}

      {/* Drug cards */}
      {ATB_DRUGS.map(({ drugId, label, doses, color }) => {
        const rate    = rates[drugId] ?? 0;
        const maxRate = DRUG_MAX_DOSES[drugId] ?? 100;
        const dial    = DRUG_CATALOG[drugId]?.dialyzability ?? 0;
        const crrtFlag = crrtActive && dial >= 0.5;

        return (
          <div key={drugId} className="rounded-xl border border-white/5 bg-[#0b1020] p-2">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-[0.52rem] font-black" style={{ color }}>{label}</span>
                {crrtFlag && (
                  <span className="ml-2 text-[0.36rem] font-bold text-amber-400 border border-amber-700/40 px-1 rounded">
                    CRRT ↑ dial {(dial * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <span className="text-[0.38rem] text-slate-600 font-mono">{doses}</span>
            </div>
            <InfusionCardWithDilution
              drugId={drugId}
              rate={rate}
              onRateChange={r => setRate(drugId, r)}
              step={maxRate * 0.05}
              colorTheme="cyan"
              decimals={1}
              showDilutionTrigger
            />
          </div>
        );
      })}
    </div>
  );
});

// ─── Imaging Tab ─────────────────────────────────────────────────────────────

const IMAGING_QUICK: ImagingModality[] = [
  'cxr', 'us_lung', 'us_focused_cardiac', 'us_abdominal',
  'ct_brain', 'ct_thorax', 'ct_abdomen', 'tte', 'doppler_tcd',
];

function ImagingTab() {
  const [pending, setPending]     = useState<Set<ImagingModality>>(new Set());
  const [results, setResults]     = useState<ImagingFinding[]>([]);
  const engine = ImagingEngine.getInstance();

  function request(mod: ImagingModality) {
    if (pending.has(mod)) return;
    setPending(p => new Set([...p, mod]));
    engine.requestStudy(mod).then(f => {
      setPending(p => { const n = new Set(p); n.delete(mod); return n; });
      setResults(r => [f, ...r.slice(0, 19)]);
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-[0.44rem] font-black text-slate-400 uppercase tracking-wider">
        Solicitar Estudio
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {IMAGING_QUICK.map(mod => {
          const isPending = pending.has(mod);
          return (
            <button key={mod} type="button"
              onClick={() => request(mod)}
              disabled={isPending}
              className="px-2 py-1.5 rounded-lg border text-left cursor-pointer transition-all disabled:opacity-60"
              style={{
                background:   isPending ? 'rgba(96,165,250,0.1)' : 'rgba(0,0,0,0.4)',
                borderColor:  isPending ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="text-[0.46rem] font-bold" style={{ color: isPending ? '#93c5fd' : '#94a3b8' }}>
                {isPending ? '⏳ ' : ''}{MODALITY_LABELS[mod]}
              </div>
            </button>
          );
        })}
      </div>

      {results.length > 0 && (
        <>
          <div className="text-[0.44rem] font-black text-slate-400 uppercase tracking-wider mt-3">
            Resultados ({results.length})
          </div>
          <div className="space-y-2">
            {results.map(f => (
              <div key={f.id} className="bg-[#0f172a] rounded-xl border border-white/5 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.5rem] font-bold text-cyan-400">{MODALITY_LABELS[f.modality]}</span>
                  {f.pertinentToActivePathology && (
                    <span className="text-[0.38rem] text-amber-400 font-bold border border-amber-700/40 px-1 rounded">RELEVANTE</span>
                  )}
                </div>
                <p className="text-[0.44rem] text-slate-300 leading-relaxed">{f.description}</p>
                {f.pathologyTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.pathologyTags.map(t => (
                      <span key={t} className="text-[0.36rem] bg-slate-800/60 text-slate-500 px-1.5 py-0.5 rounded">
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
}

export default function InfectologyModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('sospecha');

  return (
    <Drawer open={open} onClose={onClose} title="Infectología" side="right" width={460}>
      {/* Tab bar */}
      <div className="flex border-b border-white/5 shrink-0 px-2 pt-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 text-[0.46rem] font-black uppercase tracking-wider cursor-pointer transition-all border-b-2"
            style={{
              color:       tab === t.id ? '#e2e8f0' : '#475569',
              borderColor: tab === t.id ? '#60a5fa' : 'transparent',
              background:  'transparent',
            }}
          >
            <span className="block text-[0.6rem]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'sospecha'    && <SospechaTab />}
        {tab === 'cultivos'    && <CultivosTab />}
        {tab === 'resistencia' && <ResistenciaTab />}
        {tab === 'fuente'      && <FuenteTab />}
        {tab === 'atb'         && <ATBTab />}
        {tab === 'imaging'     && <ImagingTab />}
      </div>
    </Drawer>
  );
}
