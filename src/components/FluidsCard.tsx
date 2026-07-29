// src/components/FluidsCard.tsx
//
// Componente reutilizable de administración de fluidos.
// Extraído de LiveInstructorOverridePanel para ser compartido con QuickAccessPanel.
//
// variant='full'    — Instructor Panel (aspecto original completo).
// variant='compact' — Quick Access Panel (padding reducido, 4 col volumes, sin RESTAURAR).
//
// Estado de selección persistido en localStorage por variant para recordar preset clínico.
// Key: imhotep:fluidsCard:<variant>:lastSelection
//
// Refs clínicas:
//   Ringer Lactato default → SSC Surviving Sepsis Campaign 2021 (evitar hipercloro en sepsis)
//   crystalloidAccum > 30 mL/kg → SSC 2021 alerta reanimación liberal
//   ratio 1:1:1 → PROPPR Holcomb NEJM 2015 (politrauma con coagulopatía)

import React, { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePatientStore, FLUID_CATALOG } from '../store/usePatientStore';
import type { FluidType } from '../store/usePatientStore';

export interface FluidsCardProps {
  variant?: 'compact' | 'full';
  accentColor?: string;
  showRestoreButton?: boolean;  // full=true default; compact=false default
}

const BV_NORMAL = 5000;
const RAISED_SHADOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_4px_10px_rgba(0,0,0,0.7),-2px_-2px_6px_rgba(255,255,255,0.02)]';

// ─── localStorage helpers ─────────────────────────────────────────────────────

interface FluidSelection {
  fluidCat: 'cristaloide' | 'hemo';
  selFluid: FluidType;
  selVolume: number;
}

function loadSelection(variant: string): FluidSelection | null {
  try {
    const raw = localStorage.getItem(`imhotep:fluidsCard:${variant}:lastSelection`);
    if (!raw) return null;
    return JSON.parse(raw) as FluidSelection;
  } catch {
    return null;
  }
}

function saveSelection(variant: string, sel: FluidSelection) {
  try {
    localStorage.setItem(`imhotep:fluidsCard:${variant}:lastSelection`, JSON.stringify(sel));
  } catch { /* quota exceeded — ignore */ }
}

// ─── Componente ──────────────────────────────────────────────────────────────

export const FluidsCard: React.FC<FluidsCardProps> = ({
  variant = 'full',
  accentColor = '#22d3ee',
  showRestoreButton,
}) => {
  const showRestore = showRestoreButton ?? (variant === 'full');
  const isCompact   = variant === 'compact';

  // ── State local con restore desde localStorage ────────────────────────────
  const [fluidCat, setFluidCat] = useState<'cristaloide' | 'hemo'>(() => {
    return loadSelection(variant)?.fluidCat ?? 'cristaloide';
  });
  const [selFluid, setSelFluid] = useState<FluidType>(() => {
    const saved = loadSelection(variant);
    if (saved && FLUID_CATALOG[saved.selFluid]) return saved.selFluid;
    return 'ringer_lactato';
  });
  const [selVolume, setSelVolume] = useState<number>(() => {
    const saved = loadSelection(variant);
    if (saved && FLUID_CATALOG[saved.selFluid]?.volumes.includes(saved.selVolume)) return saved.selVolume;
    return 500;
  });

  // Persistir en localStorage cada cambio de selección
  useEffect(() => {
    saveSelection(variant, { fluidCat, selFluid, selVolume });
  }, [variant, fluidCat, selFluid, selVolume]);

  // ── Store ─────────────────────────────────────────────────────────────────
  const { bv, crystalloidAccum, prbcUnits, ffpUnits, administerFluid, setBloodVol, resetFluidTracking } =
    usePatientStore(useShallow(s => ({
      bv: s.bloodVolume,
      crystalloidAccum: s.crystalloidAccumulated,
      prbcUnits: s.prbcUnitsGiven,
      ffpUnits: s.ffpUnitsGiven,
      administerFluid: s.administerFluid,
      setBloodVol: s.setBloodVolume,
      resetFluidTracking: s.resetFluidTracking,
    })));

  const ratio11Needed = prbcUnits > 0 && prbcUnits > ffpUnits + 1;
  const overloadWarning = crystalloidAccum > 0 && (crystalloidAccum / (bv / 70 * 70)) > 30 * 70; // > 30 mL/kg approx
  const selFluidDef   = FLUID_CATALOG[selFluid];
  const fluidsInCat   = (Object.keys(FLUID_CATALOG) as FluidType[])
    .filter(k => FLUID_CATALOG[k].category === fluidCat);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFluidCategoryChange = useCallback((cat: 'cristaloide' | 'hemo') => {
    setFluidCat(cat);
    const first = (Object.keys(FLUID_CATALOG) as FluidType[]).find(k => FLUID_CATALOG[k].category === cat);
    if (first) { setSelFluid(first); setSelVolume(FLUID_CATALOG[first].volumes[0]); }
  }, []);

  const handleFluidSelect = useCallback((fluid: FluidType) => {
    setSelFluid(fluid);
    setSelVolume(FLUID_CATALOG[fluid].volumes[0]);
  }, []);

  const handleAdminister = useCallback(() => {
    administerFluid(selFluid, selVolume);
  }, [administerFluid, selFluid, selVolume]);

  // ── Compact volumes: prioritise common sizes first ─────────────────────────
  const volumeList = isCompact
    ? [...selFluidDef.volumes].sort((a, b) => {
        const preferred = fluidCat === 'cristaloide' ? [250, 500, 1000, 2000] : [1, 2, 4, 6].map(n => n * (fluidCat === 'hemo' && selFluid === 'prbc' ? 300 : fluidCat === 'hemo' && selFluid === 'ffp' ? 250 : 300));
        const ai = preferred.indexOf(a);
        const bi = preferred.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a - b;
      })
    : selFluidDef.volumes;

  const pad       = isCompact ? 'p-2'   : 'p-2.5';
  const hdrSize   = isCompact ? 'text-[0.5rem]' : 'text-[0.55rem]';
  const tabSize   = isCompact ? 'text-[0.48rem] py-0.5' : 'text-[0.55rem] py-1';
  const btnSize   = isCompact ? 'text-[0.48rem] p-0.5'  : 'text-[0.55rem] p-1';
  const adminH    = isCompact ? 'py-2.5' : 'py-2';

  return (
    <div className={`bg-black/25 rounded-lg ${pad} border`} style={{ borderColor: `${accentColor}25` }}>

      {/* Header */}
      <div className={`font-black ${hdrSize} tracking-[0.06em] mb-1.5`} style={{ color: accentColor }}>
        FLUIDOS
      </div>

      {/* Protocolo 1:1:1 banner */}
      {ratio11Needed && (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded p-1.5 mb-1.5 animate-pulse">
          <div className="text-orange-500 text-[0.55rem] tracking-[0.04em] font-black">
            Protocolo 1:1:1 — GRE:{prbcUnits}U PFC:{ffpUnits}U
          </div>
          <div className="text-orange-500 text-[0.48rem] tracking-[0.04em] opacity-80 mt-0.5">
            Agregar PFC (PROPPR NEJM 2015)
          </div>
        </div>
      )}

      {/* Sobrecarga alerta */}
      {overloadWarning && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-1 mb-1.5">
          <div className="text-amber-500 text-[0.48rem] font-black">
            Cristaloides: {(crystalloidAccum/1000).toFixed(1)} L — SSC 2021: cuidado con sobrecarga
          </div>
        </div>
      )}

      {/* Tabs CRISTALOIDES / HEMOCOMP */}
      <div className="flex gap-1 mb-1.5">
        {(['cristaloide', 'hemo'] as const).map(cat => {
          const active = fluidCat === cat;
          return (
            <button key={cat} type="button" onClick={() => handleFluidCategoryChange(cat)}
              className={`flex-1 rounded-md font-mono font-black cursor-pointer ${tabSize} ${active ? 'border' : 'border border-white/10 bg-black/30 text-slate-500'}`}
              style={active ? { border: `1px solid ${accentColor}`, background: `${accentColor}18`, color: accentColor } : undefined}>
              {cat === 'cristaloide' ? 'CRISTALOIDES' : 'HEMOCOMP.'}
            </button>
          );
        })}
      </div>

      {/* Grid fluidos */}
      <div className={`grid gap-1 mb-1.5 ${fluidCat === 'cristaloide' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {fluidsInCat.map(fk => {
          const fd  = FLUID_CATALOG[fk];
          const sel = selFluid === fk;
          return (
            <button key={fk} type="button" onClick={() => handleFluidSelect(fk)} title={fd.desc}
              className={`rounded-md cursor-pointer font-mono font-black text-center ${RAISED_SHADOW} ${btnSize}`}
              style={{
                border: `1px solid ${sel ? fd.color : `${fd.color}33`}`,
                background: sel ? `${fd.color}18` : 'rgba(0,0,0,0.3)',
                color: sel ? fd.color : `${fd.color}aa`,
                minHeight: 36,
              }}>
              <div className="text-[0.55rem] tracking-[0.08em]">{fd.shortLabel}</div>
              <div className="text-[0.48rem] tracking-[0.04em] opacity-65 mt-0.5 leading-tight">{fd.label.split(' ')[0]}</div>
            </button>
          );
        })}
      </div>

      {/* Descripción fluido seleccionado */}
      {!isCompact && (
        <div className="bg-black/20 rounded-md p-2 mb-1.5">
          <div className="font-black text-[0.55rem] tracking-[0.06em]" style={{ color: selFluidDef.color }}>{selFluidDef.label}</div>
          <div className="text-slate-500 text-[0.5rem] tracking-[0.04em] mt-0.5">{selFluidDef.desc}</div>
        </div>
      )}

      {/* Selector de volumen */}
      <div className="text-slate-500 text-[0.48rem] tracking-[0.04em] mb-1">{selFluidDef.volumeUnit}</div>
      <div className={`grid gap-1 mb-2 ${isCompact ? 'grid-cols-4' : 'flex flex-wrap'}`}>
        {volumeList.map(vol => {
          const sel = selVolume === vol;
          return (
            <button key={vol} type="button" onClick={() => setSelVolume(vol)}
              className={`${isCompact ? '' : 'px-2'} py-1 rounded-md font-mono text-[0.55rem] tracking-[0.06em] cursor-pointer ${sel ? 'font-bold' : 'font-normal'} ${isCompact ? 'min-h-[36px]' : ''}`}
              style={{
                border: `1px solid ${sel ? selFluidDef.color : 'rgba(255,255,255,0.1)'}`,
                background: sel ? `${selFluidDef.color}20` : 'rgba(0,0,0,0.3)',
                color: sel ? selFluidDef.color : '#6b7a99',
              }}>
              {vol >= 1000 ? `${vol/1000}L` : `${vol}mL`}
            </button>
          );
        })}
      </div>

      {/* Botón ADMINISTRAR */}
      <button type="button" onClick={handleAdminister}
        className={`w-full ${adminH} rounded-md font-mono text-[0.65rem] tracking-[0.1em] font-black cursor-pointer ${RAISED_SHADOW}`}
        style={{ border: `1px solid ${selFluidDef.color}88`, background: `${selFluidDef.color}18`, color: selFluidDef.color, minHeight: 40 }}>
        ADMINISTRAR {selVolume >= 1000 ? `${selVolume/1000}L` : `${selVolume}mL`} {selFluidDef.shortLabel}
        <div className="text-[0.48rem] tracking-[0.04em] opacity-65 font-normal mt-0.5">
          BV: {Math.round(bv)} mL + {selVolume} mL = {Math.round(bv + selVolume)} mL
        </div>
      </button>

      {/* Contadores acumulados */}
      <div className="grid grid-cols-2 gap-1 mt-1.5">
        <div className="bg-black/20 rounded p-1">
          <div className="text-slate-500 text-[0.48rem] tracking-[0.04em]">Cristaloides</div>
          <div className={`font-black text-[0.5rem] tracking-[0.06em] ${crystalloidAccum > 3000 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {(crystalloidAccum/1000).toFixed(1)} L{crystalloidAccum > 3000 ? ' ⚠' : ''}
          </div>
        </div>
        <div className="bg-black/20 rounded p-1">
          <div className="text-slate-500 text-[0.48rem] tracking-[0.04em]">GRE / PFC</div>
          <div className="text-red-500 font-black text-[0.5rem] tracking-[0.06em]">
            {prbcUnits}U / {ffpUnits}U
          </div>
        </div>
      </div>

      {/* Botón RESTAURAR (solo variant full o cuando se pide explícitamente) */}
      {showRestore && (
        <button type="button"
          onClick={() => { setBloodVol(BV_NORMAL); resetFluidTracking(); }}
          className={`w-full py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-mono text-[0.5rem] tracking-[0.08em] font-black cursor-pointer mt-1.5 ${RAISED_SHADOW}`}>
          RESTAURAR VOLEMIA + FLUIDOS
        </button>
      )}
    </div>
  );
};

export default FluidsCard;
