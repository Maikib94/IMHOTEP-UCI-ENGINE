// src/components/QuickAccessPanel.tsx
//
// Panel Quick Access lateral — acceso rápido a controles críticos sin abrir modales.
// Estructura (top → bottom):
//   1. BARRA SDRA (condicional)
//   2. Selector soporte respiratorio escalado
//   3. Estado ARM + botón consola SM100 (si ventilador conectado)
//   4. Sliders rápidos ARM (si conectado)
//   5. Grid 2×3 de DrugCardLinks
//   6. FluidsCard variant='compact' (bolos cristaloides + hemoproductos)
//
// Alt+F: foco en FluidsCard (fluidos críticos inmediatos).
// DrugCardLink → expande el acordeón correspondiente en ClinicalControlPanel.

import React, { useEffect, useRef } from 'react';
import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useUIStore, SECTION_TO_ACCORDION_ID, type ControlPanelSection } from '../store/useUIStore';
import RespiratorySupportSelector from './RespiratorySupportSelector';
import QuickARMPanel from './QuickARMPanel';
import { FluidsCard } from './FluidsCard';

// ─── HidratacionBasal card ────────────────────────────────────────────────────
// Mantenimiento IV continuo (Hahn RG BJA 2018-2021: 30% retención IV).

const MAINTENANCE_PRESETS = [0, 50, 80, 100, 125, 150, 250];
const FLUID_LABELS: Record<string, string> = {
  ringer_lactato: 'Ringer Lactato',
  sf_09: 'SF 0.9%',
  dex5: 'Dextrosa 5%',
};

function HidratacionBasal() {
  const rate       = usePatientStore(s => s.maintenanceFluidRate_mLh);
  const fluidType  = usePatientStore(s => s.maintenanceFluidType);
  const cumul      = usePatientStore(s => s.maintenanceCumulative_mL);
  const setRate    = usePatientStore(s => s.setMaintenanceFluidRate);
  const setType    = usePatientStore(s => s.setMaintenanceFluidType);

  const isActive   = rate > 0;
  const cumul24h   = Math.round(rate * 24);  // proyección 24h

  return (
    <div
      className="rounded-xl border p-2 transition-all"
      style={{ borderColor: isActive ? '#22d3ee44' : 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.48rem] font-black uppercase tracking-widest text-cyan-400">
          HIDRATACIÓN BASAL
        </span>
        {isActive && (
          <span className="text-[0.4rem] font-mono text-cyan-500 animate-pulse">● ACTIVA</span>
        )}
      </div>

      {/* Selector de fluido */}
      <div className="flex gap-1 mb-1.5">
        {(['ringer_lactato', 'sf_09', 'dex5'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="flex-1 py-0.5 rounded text-[0.38rem] font-black cursor-pointer transition-all"
            style={{
              border: `1px solid ${fluidType === t ? '#22d3ee' : 'rgba(255,255,255,0.08)'}`,
              background: fluidType === t ? 'rgba(34,211,238,0.1)' : 'transparent',
              color: fluidType === t ? '#22d3ee' : '#475569',
            }}
          >
            {FLUID_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tasa con ▼▲ */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <button type="button" onClick={() => setRate(Math.max(0, rate - 5))}
          className="w-5 h-5 flex items-center justify-center rounded border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[0.6rem] cursor-pointer">▼</button>
        <div className="flex-1 text-center font-mono font-black text-sm" style={{ color: isActive ? '#22d3ee' : '#475569' }}>
          {rate}
          <span className="text-[0.42rem] font-normal text-slate-500 ml-0.5">mL/h</span>
        </div>
        <button type="button" onClick={() => setRate(Math.min(500, rate + 5))}
          className="w-5 h-5 flex items-center justify-center rounded border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[0.6rem] cursor-pointer">▲</button>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {MAINTENANCE_PRESETS.map(p => (
          <button key={p} type="button" onClick={() => setRate(p)}
            className="py-0.5 rounded text-[0.36rem] font-bold cursor-pointer"
            style={{
              border: `1px solid ${rate === p ? '#22d3ee' : 'rgba(255,255,255,0.08)'}`,
              background: rate === p ? 'rgba(34,211,238,0.1)' : 'rgba(0,0,0,0.3)',
              color: rate === p ? '#22d3ee' : '#4b5563',
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* Acumulado y proyección */}
      <div className="flex justify-between text-[0.4rem] font-mono text-slate-500">
        <span>Acumulado: <span className="text-slate-300 font-bold">{Math.round(cumul)} mL</span></span>
        {isActive && <span>24h: <span className="text-cyan-600 font-bold">{cumul24h} mL</span></span>}
      </div>
    </div>
  );
}

// ─── Tipos DrugCardLink ───────────────────────────────────────────────────────

export type DrugCardTarget =
  | 'antiarritmicos'
  | 'analgesia'
  | 'sedacion'
  | 'paralisis_bnm'
  | 'monitoreo_neuro';

interface DrugCardConfig {
  label:       string;
  accent:      string;
  ledDrugs:    string[];        // DrugIds que encienden el LED
  ledCondition?: () => boolean; // override para condición custom
}

const DRUG_CARD_CONFIG: Record<DrugCardTarget, DrugCardConfig> = {
  antiarritmicos: {
    label: 'ANTIARRÍT.',
    accent: '#f97316',
    ledDrugs: ['amiodarone', 'digoxin', 'esmolol', 'metoprolol_iv', 'diltiazem_iv'],
  },
  analgesia: {
    label: 'ANALGESIA',
    accent: '#60a5fa',
    ledDrugs: ['morphine', 'fentanyl', 'remifentanil'],
  },
  sedacion: {
    label: 'SEDACIÓN',
    accent: '#fbbf24',
    ledDrugs: ['propofol', 'midazolam', 'ketamine', 'dexmedetomidine', 'thiopental'],
  },
  paralisis_bnm: {
    label: 'PARÁL. BNM',
    accent: '#34d399',
    ledDrugs: ['rocuronium', 'cisatracurium', 'atracurium', 'pancuronium'],
  },
  monitoreo_neuro: {
    label: 'NEURO',
    accent: '#e2e8f0',
    ledDrugs: [],
  },
};

// ─── DrugCardLink ─────────────────────────────────────────────────────────────

interface DrugCardLinkProps {
  target: DrugCardTarget;
}

function DrugCardLink({ target }: DrugCardLinkProps) {
  const cfg        = DRUG_CARD_CONFIG[target];
  const rates      = usePharmacologyStore(s => s.infusionRates);
  const openPanel  = useUIStore(s => s.openControlPanel);
  const setAccordion = usePatientStore(s => s.setAccordionExpanded);

  const activeDrugs = cfg.ledDrugs.filter(d => (rates[d as keyof typeof rates] ?? 0) > 0);
  const hasActive  = activeDrugs.length > 0;

  const handleClick = () => {
    const accordionId = SECTION_TO_ACCORDION_ID[target as ControlPanelSection];
    // Expand the accordion in ClinicalControlPanel via persisted state
    setAccordion(accordionId, true);
    // Also notify via UIStore for any modal/drawer listener
    openPanel({ section: target as ControlPanelSection });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center justify-center rounded-xl border transition-all cursor-pointer gap-1"
      style={{
        minHeight: 60,
        border: `1px solid ${hasActive ? cfg.accent : 'rgba(255,255,255,0.08)'}`,
        background: hasActive ? `${cfg.accent}12` : 'rgba(0,0,0,0.35)',
      }}
      title={`Abrir ${cfg.label}`}
    >
      {/* LED indicator */}
      <div className="flex items-center gap-1">
        <div
          className="rounded-full"
          style={{
            width: 6, height: 6,
            background: hasActive ? cfg.accent : 'rgba(255,255,255,0.12)',
            boxShadow: hasActive ? `0 0 6px ${cfg.accent}` : 'none',
          }}
        />
        <span
          className="text-[0.42rem] font-black uppercase tracking-widest"
          style={{ color: hasActive ? cfg.accent : '#475569' }}
        >
          {cfg.label}
        </span>
      </div>
      {hasActive && (
        <span
          className="text-[0.38rem] font-mono"
          style={{ color: `${cfg.accent}bb` }}
        >
          {activeDrugs.length} activa{activeDrugs.length > 1 ? 's' : ''}
        </span>
      )}
    </button>
  );
}

// ─── ARM status bar ──────────────────────────────────────────────────────────

function ARMStatusBar({ onOpenConsole }: { onOpenConsole: () => void }) {
  const mode    = usePatientStore(s => s.ventilator.mode);
  const fio2    = usePatientStore(s => s.ventilator.fio2);
  const peep    = usePatientStore(s => s.ventilator.peep);
  const spo2    = usePatientStore(s => s.vitals.spo2);
  const spo2Color = spo2 >= 95 ? '#34d399' : spo2 >= 90 ? '#fbbf24' : '#f87171';

  return (
    <div className="bg-[#030708] rounded-xl border border-emerald-900/40 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse" />
          <span className="text-[0.44rem] font-black uppercase tracking-widest text-emerald-400">ARM SM100 CONECTADO</span>
        </div>
        <button
          type="button"
          onClick={onOpenConsole}
          className="text-[0.4rem] font-black px-1.5 py-0.5 rounded border border-emerald-700/50 text-emerald-500 hover:bg-emerald-900/30 cursor-pointer uppercase tracking-wider"
        >
          ▶ CONSOLA
        </button>
      </div>
      <div className="flex gap-2 text-[0.42rem] font-mono">
        <span className="text-slate-500">{mode}</span>
        <span className="text-slate-400">FiO₂ {Math.round(fio2 * 100)}%</span>
        <span className="text-slate-400">PEEP {peep}</span>
        <span className="font-bold" style={{ color: spo2Color }}>SpO₂ {spo2}%</span>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface QuickAccessPanelProps {
  onOpenVent?: () => void;
}

export default function QuickAccessPanel({ onOpenVent }: QuickAccessPanelProps) {
  const ardsDx        = usePathologyStore(s => s.ards.diagnosis);
  const isVentConn    = usePatientStore(s => s.isVentilatorConnected);
  const fluidsRef     = useRef<HTMLDivElement>(null);

  // C.3 — Alt+F shortcut: focus FluidsCard grid
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        fluidsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Focus the first button inside FluidsCard
        const firstBtn = fluidsRef.current?.querySelector('button') as HTMLButtonElement | null;
        firstBtn?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

      {/* 1. BARRA SDRA — solo si diagnóstico activo */}
      {ardsDx !== 'none' && (
        <div className="rounded-lg border border-red-800/30 bg-red-950/20 px-2 py-1.5">
          <div className="text-[0.42rem] font-black uppercase tracking-widest text-red-400">
            SDRA {ardsDx.toUpperCase()}
          </div>
        </div>
      )}

      {/* 2. Selector soporte respiratorio */}
      <RespiratorySupportSelector onOpenVent={onOpenVent} />

      {/* 3. ARM status + consola */}
      {isVentConn && <ARMStatusBar onOpenConsole={onOpenVent ?? (() => {})} />}

      {/* 4. Sliders rápidos ARM */}
      {isVentConn && (
        <div className="rounded-xl border border-white/5 bg-[#030708] overflow-hidden">
          <QuickARMPanel />
        </div>
      )}

      {/* 5. Grid 2×3 DrugCardLinks */}
      <div className="grid grid-cols-2 gap-1.5">
        <DrugCardLink target="antiarritmicos" />
        <DrugCardLink target="analgesia" />
        <DrugCardLink target="sedacion" />
        <DrugCardLink target="paralisis_bnm" />
        <DrugCardLink target="monitoreo_neuro" />
        {/* Slot vacío */}
        <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 opacity-30" style={{ minHeight: 60 }}>
          <span className="text-2xl text-white/20">+</span>
        </div>
      </div>

      {/* 6. Hidratación de Mantenimiento — encima de FluidsCard */}
      <HidratacionBasal />

      {/* 7. FluidsCard compact — acceso inmediato a bolos y hemocomponentes */}
      <div ref={fluidsRef}>
        <FluidsCard variant="compact" accentColor="#22d3ee" />
      </div>

    </div>
  );
}
