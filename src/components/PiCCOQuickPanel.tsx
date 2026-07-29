// src/components/PiCCOQuickPanel.tsx
//
// Mini-panel flotante PiCCO — 4 parámetros accionables.
// Visible permanentemente cuando PiCCO activo + snapshot disponible.
// Se actualiza automáticamente con cada nueva termodilución.

import React from 'react';
import { useMonitoringStore } from '../store/useMonitoringStore';
import type { PiCCOSnapshot } from '../store/useMonitoringStore';

const MONO = "[font-family:'JetBrains_Mono',monospace]";

type Range = [number, number];  // [lo_normal, hi_normal]

function valueColor(v: number, [lo, hi]: Range): string {
  return v < lo || v > hi ? 'text-amber-400' : 'text-emerald-400';
}

interface ItemProps {
  label: string;
  value: string;
  unit:  string;
  cls:   string;
}

const Item: React.FC<ItemProps> = ({ label, value, unit, cls }) => (
  <div className="bg-black/30 rounded p-1.5">
    <div className="text-[0.5rem] text-slate-500 tracking-wider uppercase">{label}</div>
    <div className={`text-base font-black leading-none mt-0.5 ${MONO} ${cls}`}>{value}</div>
    <div className="text-[0.45rem] text-slate-600 mt-0.5">{unit}</div>
  </div>
);

function snapRows(snap: PiCCOSnapshot): ItemProps[] {
  return [
    {
      label: 'CI',
      value: snap.ci.toFixed(1),
      unit:  'L/min/m²',
      cls:   valueColor(snap.ci,   [3.0, 5.0]),
    },
    {
      label: 'GEDI',
      value: String(Math.round(snap.gedi)),
      unit:  'mL/m²',
      cls:   valueColor(snap.gedi, [680, 800]),
    },
    {
      label: 'ELWI',
      value: snap.evlwi.toFixed(1),
      unit:  'mL/kg',
      cls:   valueColor(snap.evlwi, [3, 7]),
    },
    {
      label: 'SVV',
      value: String(Math.round(snap.svv)),
      unit:  '%',
      cls:   valueColor(snap.svv,  [0, 12]),
    },
  ];
}

export const PiCCOQuickPanel: React.FC = () => {
  const active = useMonitoringStore(s => s.invasiveMode === 'picco');
  const snap   = useMonitoringStore(s => s.piccoSnapshot);

  if (!active || !snap) return null;

  const rows = snapRows(snap);

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-[#0b1120]/95 border border-violet-500/40 rounded-lg p-3 shadow-xl backdrop-blur-sm w-56">
      <div className="flex justify-between items-center mb-2 border-b border-violet-500/30 pb-1">
        <span className={`text-violet-400 font-black text-[0.6rem] tracking-wider ${MONO}`}>
          PiCCO SM1 · LIVE
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
      </div>
      <div className={`grid grid-cols-2 gap-2 ${MONO}`}>
        {rows.map(r => <Item key={r.label} {...r} />)}
      </div>
    </div>
  );
};
