// src/components/ProceduresPanel.tsx
// Panel de procedimientos invasivos — dentro de InstructorPanel.
// Refs: Robba Lancet Neurol 2021; Lehman Crit Care Med 2013.

import React, { memo } from 'react';
import { usePatientStore }  from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { useLanguage }       from '../i18n/LanguageContext';
import { triggerNIBPNow }    from '../hooks/useNIBPCycle';
import type {
  ArterialSite, CentralSite, ICPDevice, NIBPInterval,
} from '../store/usePatientStore';
import type { CaseCategory } from '../store/usePathologyStore';
import {
  CLINICAL_CATEGORY_META,
  type ClinicalCategory,
} from '../types/ClinicalCategory';

const ARTERIAL_SITES: { value: ArterialSite; label: string }[] = [
  { value: 'radial_left',    label: 'Radial Izq.'  },
  { value: 'radial_right',   label: 'Radial Der.'  },
  { value: 'femoral_left',   label: 'Femoral Izq.' },
  { value: 'femoral_right',  label: 'Femoral Der.' },
  { value: 'brachial',       label: 'Braquial'     },
];

const CENTRAL_SITES: { value: CentralSite; label: string }[] = [
  { value: 'jugular_right',    label: 'Yugular Der.'    },
  { value: 'jugular_left',     label: 'Yugular Izq.'    },
  { value: 'subclavian_right', label: 'Subclavia Der.'  },
  { value: 'subclavian_left',  label: 'Subclavia Izq.'  },
  { value: 'femoral',          label: 'Femoral'         },
];

const ICP_DEVICES: { value: ICPDevice; label: string }[] = [
  { value: 'parenchymal',    label: 'Parenquimatoso (Codman)' },
  { value: 'ventricular_evd',label: 'Ventricular (DVE)' },
];

const CASE_CATEGORIES: { value: CaseCategory; label: string }[] =
  (['general', 'neuro', 'cardio', 'pneumo', 'infecto', 'cirugia', 'trauma', 'quemados'] as ClinicalCategory[])
    .map(c => ({ value: c as CaseCategory, label: CLINICAL_CATEGORY_META[c].label }));

const NIBP_INTERVALS: NIBPInterval[] = [5, 10, 15, 30];

// ─── Toggle row ──────────────────────────────────────────────────────────────

function ToggleRow({
  label, active, onToggle, children,
}: { label: string; active: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5">
      <div className="flex items-center gap-2 flex-1">
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${active ? 'Desactivar' : 'Activar'} ${label}`}
          className={`w-8 h-4 rounded-full relative transition-colors duration-200 shrink-0 cursor-pointer ${active ? 'bg-cyan-600' : 'bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${active ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className={`text-[0.5rem] font-bold ${active ? 'text-slate-200' : 'text-slate-500'}`}>
          {label}
        </span>
      </div>
      {active && children && (
        <div className="ml-2">{children}</div>
      )}
    </div>
  );
}

function InlineSelect<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      title={label}
      aria-label={label}
      className="bg-slate-800 border border-white/10 rounded px-1.5 py-0.5 text-[0.44rem] text-slate-200 cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const ProceduresPanel = memo(function ProceduresPanel() {
  const p            = usePatientStore(s => s.procedures);
  const setProcedure = usePatientStore(s => s.setProcedure);
  const setInterval  = usePatientStore(s => s.setNIBPInterval);
  const caseCategory = usePathologyStore(s => s.caseCategory);
  const setCaseCat   = usePathologyStore(s => s.setCaseCategory);
  const { t }        = useLanguage();

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      {/* Header */}
      <div className="text-[0.5rem] font-black text-slate-400 uppercase tracking-widest mb-2 pb-1.5 border-b border-white/5">
        Procedimientos Invasivos
      </div>

      {/* Categoría de caso */}
      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
        <span className="text-[0.5rem] font-bold text-slate-400">Categoría de Caso</span>
        <InlineSelect<CaseCategory>
          value={caseCategory}
          options={CASE_CATEGORIES}
          onChange={setCaseCat}
          label="Categoría de Caso"
        />
      </div>

      {/* Línea Arterial */}
      <ToggleRow
        label="Línea Arterial"
        active={p.arterialLine}
        onToggle={() => setProcedure('arterialLine', !p.arterialLine)}
      >
        <InlineSelect<ArterialSite>
          value={p.arterialSite}
          options={ARTERIAL_SITES}
          onChange={v => setProcedure('arterialSite', v)}
          label="Sitio de Línea Arterial"
        />
      </ToggleRow>

      {/* CVC */}
      <ToggleRow
        label="Catéter Venoso Central"
        active={p.centralLine}
        onToggle={() => setProcedure('centralLine', !p.centralLine)}
      >
        <InlineSelect<CentralSite>
          value={p.centralSite}
          options={CENTRAL_SITES}
          onChange={v => setProcedure('centralSite', v)}
          label="Sitio de Catéter Venoso Central"
        />
      </ToggleRow>

      {/* PICC */}
      <ToggleRow
        label="PICC"
        active={p.piccCatheter}
        onToggle={() => setProcedure('piccCatheter', !p.piccCatheter)}
      />

      {/* Monitor PIC */}
      <ToggleRow
        label="Monitor PIC"
        active={p.picMonitor}
        onToggle={() => setProcedure('picMonitor', !p.picMonitor)}
      >
        {p.icpDevice !== 'none' && (
          <InlineSelect<ICPDevice>
            value={p.icpDevice}
            options={ICP_DEVICES}
            onChange={v => setProcedure('icpDevice', v)}
            label="Dispositivo de Monitor PIC"
          />
        )}
      </ToggleRow>

      {/* Sonda vesical */}
      <ToggleRow
        label="Sonda Vesical (Foley)"
        active={p.urinaryCatheter}
        onToggle={() => setProcedure('urinaryCatheter', !p.urinaryCatheter)}
      />

      {/* ECMO (placeholder Fase 3) */}
      <ToggleRow
        label="ECMO"
        active={p.ecmo}
        onToggle={() => setProcedure('ecmo', !p.ecmo)}
      />

      {/* CRRT (placeholder Fase 3) */}
      <ToggleRow
        label="CRRT / TSR"
        active={p.crrt}
        onToggle={() => setProcedure('crrt', !p.crrt)}
      />

      {/* NIBP — solo si NO hay línea arterial */}
      {!p.arterialLine && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="text-[0.46rem] font-bold text-amber-400 uppercase tracking-wider mb-1.5">
            NIBP (sin línea arterial)
          </div>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[0.44rem] text-slate-500 mr-1">Intervalo:</span>
            {NIBP_INTERVALS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setInterval(m)}
                className="px-1.5 py-0.5 rounded text-[0.44rem] font-bold cursor-pointer transition-all"
                style={{
                  background:  p.nibp.intervalMinutes === m ? 'rgba(251,191,36,0.2)' : 'rgba(0,0,0,0.4)',
                  border:      `1px solid ${p.nibp.intervalMinutes === m ? '#fbbf24' : 'rgba(255,255,255,0.08)'}`,
                  color:       p.nibp.intervalMinutes === m ? '#fbbf24' : '#475569',
                }}
              >
                {m}′
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={triggerNIBPNow}
            className="w-full py-1 rounded border border-amber-700/40 bg-amber-900/15 text-amber-400 text-[0.46rem] font-bold cursor-pointer hover:bg-amber-800/25 transition-all"
          >
            Medir Ahora
          </button>
        </div>
      )}

      <div className="text-[0.36rem] text-slate-700 mt-2 leading-relaxed">
        Lehman CCM 2013 · Robba Lancet Neurol 2021 · Meng Hypertension 2018
      </div>
    </div>
  );
});

export default ProceduresPanel;
