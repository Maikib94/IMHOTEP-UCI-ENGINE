/* eslint-disable react/forbid-dom-props */
import React, { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePathologyStore } from '../store/usePathologyStore';
import ProceduresPanel from './ProceduresPanel';
import {
  usePatientStore,
  FLUID_CATALOG,
} from '../store/usePatientStore';
import type { FluidType, Vitals } from '../store/usePatientStore';

const CLASS_HEMORRHAGE_RATES: Record<1 | 2 | 3 | 4, number> = {
  1: 8, 2: 20, 3: 45, 4: 90,
};

const COMPLIANCE_BASE = 50.0;
const BV_NORMAL = 5000;
const HB_NORMAL = 14.0;
const MCHC = HB_NORMAL / 0.45;

const SEPSIS_PRESETS = [
  { label: 'BACTEREMIA', value: 0.15, color: '#34d399', desc: 'SIRS + foco' },
  { label: 'SEPSIS', value: 0.40, color: '#fbbf24', desc: 'Disfuncion organo' },
  { label: 'SHOCK', value: 0.70, color: '#f97316', desc: 'PAM<65 / Lac>2' },
  { label: 'MOF', value: 0.92, color: '#ef4444', desc: 'Multiorganico' },
];

const ARDS_PRESETS = [
  { label: 'LEVE', value: 0.25, color: '#a3e635', desc: 'P/F 200-300 (S/F ~235-315)' },
  { label: 'MODERADO', value: 0.55, color: '#fbbf24', desc: 'P/F 100-200 (S/F ~148-235)' },
  { label: 'SEVERO', value: 0.85, color: '#f97316', desc: 'P/F < 100 (S/F < 148)' },
  { label: 'REFRACTARIO', value: 0.96, color: '#ef4444', desc: 'Hipoxemia/Hipercapnia refractaria' },
];

const HEMORRHAGE_CLASSES = [
  { cls: 1 as const, label: 'CLASE I', color: '#34d399', desc: '<15% vol.', hr: '<100 lpm' },
  { cls: 2 as const, label: 'CLASE II', color: '#fbbf24', desc: '15-30% vol.', hr: '100-120 lpm' },
  { cls: 3 as const, label: 'CLASE III', color: '#f97316', desc: '30-40% vol.', hr: '120-140 lpm' },
  { cls: 4 as const, label: 'CLASE IV', color: '#ef4444', desc: '>40% vol.', hr: '>140/bradicardia' },
];

const SEPSIS_PROG = [
  { label: 'LENTO', value: 0.000005, desc: '~55h sim' },
  { label: 'NORMAL', value: 0.00002, desc: '~14h sim' },
  { label: 'RAPIDO', value: 0.0001, desc: '~2.8h sim' },
  { label: 'FULMINANTE', value: 0.0005, desc: '~33min sim' },
];

const ARDS_PROG = [
  { label: 'LENTO', value: 0.00001, desc: '~28h sim' },
  { label: 'NORMAL', value: 0.00003, desc: '~9h sim' },
  { label: 'RAPIDO', value: 0.0002, desc: '~85min sim' },
  { label: 'FULMINANTE', value: 0.001, desc: '~17min sim' },
];

function atlasClassFromBV(bv: number): { label: string; color: string; pct: number } {
  const pct = Math.max(0, (BV_NORMAL - bv) / BV_NORMAL * 100);
  if (pct < 15) return { label: 'CLASE I / PRE-SHOCK', color: '#34d399', pct };
  if (pct < 30) return { label: 'CLASE II — COMPENSADO', color: '#fbbf24', pct };
  if (pct < 40) return { label: 'CLASE III — DESCOMPENSANDO', color: '#f97316', pct };
  return { label: 'CLASE IV — COLAPSO', color: '#ef4444', pct };
}

function calcHbLive(rbc: number, bv: number): number {
  if (bv <= 0) return 0;
  return MCHC * (rbc / bv);
}

function ModifierBar({ label, value, min, max, color }: {
  label: string; value: number; min: number; max: number; color: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
  return (
    <div className="mb-1.5">
      <div className="flex justify-between mb-0.5">
        <span className="text-slate-500 font-mono text-[0.55rem] tracking-[0.06em]">{label}</span>
        <span className="font-mono text-[0.55rem] tracking-[0.06em] font-black" style={{ color }}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1 rounded-sm bg-black/50 overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
    </div>
  );
}

function PresetsGrid({ presets, onSelect, progPresets, activeProg, onProgSelect, active }: {
  presets: typeof ARDS_PRESETS;
  onSelect: (v: number) => void;
  progPresets: typeof ARDS_PROG;
  activeProg: number;
  onProgSelect: (v: number) => void;
  active: boolean;
}) {
  const RAISED_SHADOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_4px_10px_rgba(0,0,0,0.7),-2px_-2px_6px_rgba(255,255,255,0.02)]';
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onSelect(p.value)}
            title={p.desc}
            className={`p-1 rounded-md bg-black/30 font-mono text-[0.7rem] tracking-[0.08em] font-black cursor-pointer text-center ${RAISED_SHADOW}`}
            style={{ border: `1px solid ${p.color}44`, color: p.color }}
          >
            <div>{p.label}</div>
            <div className="text-[0.65rem] tracking-[0.04em] opacity-60 font-normal">{p.desc}</div>
          </button>
        ))}
      </div>
      {active && (
        <>
          <div className="text-slate-500 text-[0.4rem] mb-1">VELOCIDAD PROGRESION</div>
          <div className="grid grid-cols-2 gap-1 mb-1.5">
            {progPresets.map((p) => {
              const isActive = Math.abs(activeProg - p.value) / p.value < 0.1;
              return (
                <button
                  key={p.label}
                  onClick={() => onProgSelect(p.value)}
                  className={`p-1 rounded-md font-mono text-[0.35rem] font-black cursor-pointer text-center ${RAISED_SHADOW} ${isActive ? 'border border-cyan-500 bg-cyan-500/10 text-cyan-500' : 'border border-white/10 bg-black/30 text-slate-500'}`}
                >
                  <div>{p.label}</div>
                  <div className="text-[0.65rem] tracking-[0.04em] opacity-60 font-normal">{p.desc}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

const FluidAdministrationPanel: React.FC<{
  fluidCat: 'cristaloide' | 'hemo';
  selFluid: FluidType;
  selVolume: number;
  bv: number;
  crystalloidAccum: number;
  prbcUnits: number;
  ffpUnits: number;
  ratio11Needed: boolean;
  onFluidCategoryChange: (cat: 'cristaloide' | 'hemo') => void;
  onFluidSelect: (fluid: FluidType) => void;
  onVolumeSelect: (vol: number) => void;
  onAdminister: () => void;
}> = ({
  fluidCat, selFluid, selVolume, bv, ratio11Needed, prbcUnits, ffpUnits,
  onFluidCategoryChange, onFluidSelect, onVolumeSelect, onAdminister
}) => {
    const RAISED_SHADOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_4px_10px_rgba(0,0,0,0.7),-2px_-2px_6px_rgba(255,255,255,0.02)]';
    const selFluidDef = FLUID_CATALOG[selFluid];
    const fluidsInCat = (Object.keys(FLUID_CATALOG) as FluidType[])
      .filter(k => FLUID_CATALOG[k].category === fluidCat);

    return (
      <div className="bg-black/25 rounded-lg p-2.5 border border-cyan-500/15">
        <div className="text-cyan-500 font-black text-[0.55rem] tracking-[0.06em] mb-1.5">
          FLUIDOS
        </div>

        {ratio11Needed && (
          <div className="bg-orange-500/10 border border-orange-500/40 rounded p-2 mb-1.5">
            <div className="text-orange-500 text-[0.65rem] tracking-[0.04em] font-black">
              Protocolo 1:1:1 — GRE:{prbcUnits}U PFC:{ffpUnits}U
            </div>
            <div className="text-orange-500 text-[0.55rem] tracking-[0.04em] opacity-80 mt-0.5">
              Agregar PFC
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-1.5">
          {(['cristaloide', 'hemo'] as const).map((cat) => {
            const active = fluidCat === cat;
            return (
              <button
                key={cat}
                onClick={() => onFluidCategoryChange(cat)}
                className={`flex-1 py-1 rounded-md font-mono text-[0.55rem] tracking-[0.04em] font-black cursor-pointer ${active ? 'border border-cyan-500 bg-cyan-500/15 text-cyan-500' : 'border border-white/10 bg-black/30 text-slate-500'}`}
              >
                {cat === 'cristaloide' ? 'CRISTALOIDES' : 'HEMOCOMP.'}
              </button>
            );
          })}
        </div>

        <div className={`grid gap-1 mb-1.5 ${fluidCat === 'cristaloide' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {fluidsInCat.map((fk) => {
            const fd = FLUID_CATALOG[fk];
            const sel = selFluid === fk;
            return (
              <button
                key={fk}
                onClick={() => onFluidSelect(fk)}
                title={fd.desc}
                className={`p-1 rounded-md cursor-pointer font-mono text-[0.55rem] tracking-[0.06em] font-black text-center ${RAISED_SHADOW}`}
                style={{
                  border: `1px solid ${sel ? fd.color : `${fd.color}33`}`,
                  background: sel ? `${fd.color}18` : 'rgba(0,0,0,0.3)',
                  color: sel ? fd.color : `${fd.color}aa`,
                }}
              >
                <div className="text-[0.55rem] tracking-[0.08em]">{fd.shortLabel}</div>
                <div className="text-[0.55rem] tracking-[0.04em] opacity-65 mt-0.5">{fd.label.split(' ')[0]}</div>
              </button>
            );
          })}
        </div>

        <div className="bg-black/20 rounded-md p-2 mb-1.5">
          <div className="font-black text-[0.55rem] tracking-[0.06em]" style={{ color: selFluidDef.color }}>{selFluidDef.label}</div>
          <div className="text-slate-500 text-[0.55rem] tracking-[0.04em] mt-0.5">{selFluidDef.desc}</div>
        </div>

        <div className="text-slate-500 text-[0.55rem] tracking-[0.04em] mb-1">{selFluidDef.volumeUnit}</div>
        <div className="flex gap-1 flex-wrap mb-2">
          {selFluidDef.volumes.map((vol) => {
            const sel = selVolume === vol;
            return (
              <button
                key={vol}
                onClick={() => onVolumeSelect(vol)}
                className={`px-2 py-1 rounded-md font-mono text-[0.55rem] tracking-[0.06em] cursor-pointer ${sel ? 'font-bold' : 'font-normal'}`}
                style={{
                  border: `1px solid ${sel ? selFluidDef.color : 'rgba(255,255,255,0.1)'}`,
                  background: sel ? `${selFluidDef.color}20` : 'rgba(0,0,0,0.3)',
                  color: sel ? selFluidDef.color : '#6b7a99',
                }}
              >
                {vol >= 1000 ? `${vol / 1000}L` : `${vol}mL`}
              </button>
            );
          })}
        </div>

        <button
          onClick={onAdminister}
          className={`w-full py-2 rounded-md font-mono text-[0.65rem] tracking-[0.1em] font-black cursor-pointer ${RAISED_SHADOW}`}
          style={{
            border: `1px solid ${selFluidDef.color}88`,
            background: `${selFluidDef.color}18`,
            color: selFluidDef.color,
          }}
        >
          {selVolume >= 1000 ? `${selVolume / 1000}L` : `${selVolume}mL`} {selFluidDef.shortLabel}
          <div className="text-[0.55rem] tracking-[0.04em] opacity-65 font-normal mt-0.5">
            {Math.round(bv)} mL + {selVolume}mL
          </div>
        </button>
      </div>
    );
  };

export const InstructorPanel: React.FC = () => {
  const RAISED_SHADOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_4px_10px_rgba(0,0,0,0.7),-2px_-2px_6px_rgba(255,255,255,0.02)]';

  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'sepsis' | 'ards' | 'trauma'>('sepsis');
  const [fluidCat, setFluidCat] = useState<'cristaloide' | 'hemo'>('cristaloide');
  const [selFluid, setSelFluid] = useState<FluidType>('ringer_lactato');
  const [selVolume, setSelVolume] = useState<number>(500);

  const {
    sepsis, ards, hemorrhagicShock, modifiers,
    activateSepsis, deactivateSepsis, setSepsisSev, setSepsisRate,
    activateArds, deactivateArds, setArdsSev, setArdsRate, toggleProne,
    activateHemorrhagicShock, deactivateHemorrhagicShock, setHemorrhageClass,
    applyTourniquet, releaseTourniquet, resetAll,
  } = usePathologyStore(useShallow(s => ({
    sepsis: s.sepsis, ards: s.ards, hemorrhagicShock: s.hemorrhagicShock, modifiers: s.modifiers,
    activateSepsis: s.activateSepsis, deactivateSepsis: s.deactivateSepsis, setSepsisSev: s.setSepsisSeverity, setSepsisRate: s.setSepsisProgRate,
    activateArds: s.activateArds, deactivateArds: s.deactivateArds, setArdsSev: s.setArdsSeverity, setArdsRate: s.setArdsProgRate, toggleProne: s.toggleProne,
    activateHemorrhagicShock: s.activateHemorrhagicShock, deactivateHemorrhagicShock: s.deactivateHemorrhagicShock, setHemorrhageClass: s.setHemorrhageClass,
    applyTourniquet: s.applyTourniquet, releaseTourniquet: s.releaseTourniquet, resetAll: s.resetAllPathologies,
  })));

  const {
    vent, vitals, bv, rbc, crystalloidAccum, prbcUnits, ffpUnits,
    setBloodVol, administerFluid, resetFluidTracking,
  } = usePatientStore(useShallow(s => ({
    vent: s.ventilator, vitals: s.vitals, bv: s.bloodVolume, rbc: s.redBloodCellMass,
    crystalloidAccum: s.crystalloidAccumulated, prbcUnits: s.prbcUnitsGiven, ffpUnits: s.ffpUnitsGiven,
    setBloodVol: s.setBloodVolume, administerFluid: s.administerFluid, resetFluidTracking: s.resetFluidTracking,
  })));

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const anyActive = sepsis.isActive || ards.isActive || hemorrhagicShock.isActive;
  const anyCritical = (sepsis.isActive && sepsis.severity > 0.65)
    || (ards.isActive && ards.severity > 0.65)
    || (hemorrhagicShock.isActive && bv < 3000);
  const tabColor = anyCritical ? '#ef4444' : anyActive ? '#f97316' : '#38bdf8';

  const sepsisColor = sepsis.severity < 0.30 ? '#34d399'
    : sepsis.severity < 0.55 ? '#fbbf24'
      : sepsis.severity < 0.80 ? '#f97316' : '#ef4444';

  const ardsColor = ards.severity < 0.30 ? '#a3e635'
    : ards.severity < 0.55 ? '#fbbf24'
      : ards.severity < 0.80 ? '#f97316' : '#ef4444';

  type VitalsWithLabs = Vitals & {
    respiratoryRate?: number;
    lactate: number;
    pH: number;
    baseExcess: number;
  };
  const typedVitals = vitals as VitalsWithLabs;

  const respiratoryMechanics = useMemo(() => {
    const compliance = COMPLIANCE_BASE * modifiers.complianceMultiplier;
    const vt = vent.vt ?? 500;
    const fr = typedVitals.respiratoryRate ?? 14;
    const deltaP = compliance > 0 ? vt / compliance : 0;
    const pplat = vent.peep + deltaP;
    const ppico = pplat + 5;
    const mp = 0.098 * fr * (vt / 1000) * (ppico - deltaP / 2);
    const sigma = 1.0 / (1.0 + Math.exp(-(vent.peep - 12) / 2.5));
    const peepRecruitPct = ards.isActive ? (sigma * 0.20 * ards.severity * 100).toFixed(1) : '0.0';
    return { deltaP, pplat, mp, peepRecruitPct };
  }, [modifiers.complianceMultiplier, vent.vt, vent.peep, typedVitals.respiratoryRate, ards.isActive, ards.severity]);

  const traumaStatus = useMemo(() => {
    const { label: atlasLabel, color: atlasColor, pct: pctLoss } = atlasClassFromBV(bv);
    const bvLost = Math.max(0, BV_NORMAL - bv);
    const hbLive = calcHbLive(rbc ?? (bv * 0.45), bv);
    return { atlasLabel, atlasColor, pctLoss, bvLost, hbLive };
  }, [bv, rbc]);

  const acidosisAlarm = typedVitals.lactate > 4 || typedVitals.pH < 7.20 || typedVitals.baseExcess < -6;
  const hemoDilAlarm = traumaStatus.hbLive < 8;
  const critVolAlarm = bv < 2500;
  const anyTraumaAlarm = acidosisAlarm || hemoDilAlarm || critVolAlarm;
  const ratio11Needed = prbcUnits > 0 && prbcUnits > ffpUnits + 1;

  const handleFluidCategoryChange = (cat: 'cristaloide' | 'hemo') => {
    setFluidCat(cat);
    const firstInCat = (Object.keys(FLUID_CATALOG) as FluidType[])
      .find(k => FLUID_CATALOG[k].category === cat);
    if (firstInCat) {
      setSelFluid(firstInCat);
      setSelVolume(FLUID_CATALOG[firstInCat].volumes[0]);
    }
  };

  const handleFluidSelect = (fluid: FluidType) => {
    setSelFluid(fluid);
    setSelVolume(FLUID_CATALOG[fluid].volumes[0]);
  };

  const sepsisTag = sepsis.isActive ? `S${Math.round(sepsis.severity * 100)}` : '';
  const ardsTag = ards.isActive ? `A${Math.round(ards.severity * 100)}` : '';
  const traumaTag = hemorrhagicShock.isActive ? `H${hemorrhagicShock.activeClass}` : '';
  const tags = [sepsisTag, ardsTag, traumaTag].filter(Boolean).join('/');
  const tabLabel = tags || 'INSTR';

  const tabBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Panel Instructor (F2)"
      className={`fixed top-10 z-[2000] w-[38px] h-[20px] bg-[#0c1020] rounded-b-md cursor-pointer flex items-center justify-center shadow-lg transition-all duration-250 ${open ? 'right-[280px]' : 'right-[12px]'}`}
      style={{ border: `1px solid ${tabColor}88` }}
    >
      <span className="font-mono text-[0.45rem] font-black tracking-[0.05em]" style={{ color: tabColor }}>
        {tabLabel}
      </span>
    </button>
  );

  if (!open) return tabBtn;

  const getTabProps = (sec: 'sepsis' | 'ards' | 'trauma') => {
    const colors = { sepsis: '#f97316', ards: '#38bdf8', trauma: '#ef4444' };
    const c = colors[sec];
    const active = section === sec;
    const className = `flex-1 py-1.5 rounded-md font-mono text-[0.65rem] tracking-[0.06em] font-black cursor-pointer ${RAISED_SHADOW}`;
    const style = {
      border: `1px solid ${active ? c : 'rgba(255,255,255,0.06)'}`,
      background: active ? `${c}22` : 'rgba(0,0,0,0.3)',
      color: active ? c : '#6b7a99',
    };
    return { className, style };
  };

  return (
    <>
      {tabBtn}
      <div className="fixed right-0 top-0 w-[280px] h-screen bg-[#0c1020] border-l border-cyan-500/10 z-[1999] overflow-y-auto p-3 shadow-2xl font-mono flex flex-col gap-2.5">

        {/* Header */}
        <div className="text-center border-b border-white/5 pb-2">
          <div className="text-cyan-500 font-black text-[0.6rem] tracking-[0.12em]">
            INSTRUCTOR PANEL
          </div>
          <div className="text-slate-700 text-[0.8rem] tracking-[0.04em] mt-0.5">F2 para cerrar</div>
        </div>

        {/* Estado live */}
        <div
          className="bg-black/30 rounded-lg p-2.5 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.5)]"
          style={{ border: `1px solid ${anyActive ? tabColor + '44' : 'rgba(255,255,255,0.05)'}` }}
        >
          <div className="flex justify-between mb-1.5 flex-wrap gap-0.5">
            <span className="text-slate-500 text-[0.55rem] tracking-[0.06em]">ESTADO</span>
            <div className="flex gap-1 flex-wrap">
              {sepsis.isActive && <span className="font-black text-[0.55rem] tracking-[0.06em]" style={{ color: sepsisColor }}>SEP {Math.round(sepsis.severity * 100)}%</span>}
              {ards.isActive && <span className="font-black text-[0.55rem] tracking-[0.06em]" style={{ color: ardsColor }}>SDRA {Math.round(ards.severity * 100)}%</span>}
              {hemorrhagicShock.isActive && <span className="font-black text-[0.55rem] tracking-[0.06em]" style={{ color: traumaStatus.atlasColor }}>H.CL.{hemorrhagicShock.activeClass}</span>}
              {!anyActive && <span className="text-slate-700 font-black text-[0.55rem] tracking-[0.06em]">INACTIVO</span>}
            </div>
          </div>
          {anyActive && (
            <>
              <ModifierBar label="SVR x" value={modifiers.svrMultiplier} min={0.4} max={1.65} color="#38bdf8" />
              <ModifierBar label="Fuga capilar" value={modifiers.capillaryLeakRate} min={0} max={10} color="#a78bfa" />
              <ModifierBar label="Hiperd. factor" value={modifiers.hyperdynamicFactor} min={1.0} max={1.4} color="#fbbf24" />
              <ModifierBar label="Shunt" value={modifiers.lungShuntFraction} min={0.05} max={0.85} color="#f472b6" />
              <ModifierBar label="Compliance x" value={modifiers.complianceMultiplier} min={0.3} max={1.0} color="#a3e635" />
            </>
          )}
          {ards.isActive && (
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {[
                { label: 'ΔP', value: `${respiratoryMechanics.deltaP.toFixed(1)} cmH2O`, alert: respiratoryMechanics.deltaP > 14 },
                { label: 'Pplat', value: `${respiratoryMechanics.pplat.toFixed(1)} cmH2O`, alert: respiratoryMechanics.pplat > 30 },
                { label: 'MP', value: `${respiratoryMechanics.mp.toFixed(1)} J/min`, alert: respiratoryMechanics.mp > 17 },
                { label: 'Reclu.PEEP', value: `-${respiratoryMechanics.peepRecruitPct}%`, alert: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`px-1.5 py-1 rounded-md ${item.alert ? 'bg-red-500/10 border-red-500/30' : 'bg-black/20 border-white/5'} border`}
                >
                  <div className="text-slate-500 text-[0.65rem] tracking-[0.04em]">{item.label}</div>
                  <div className={`font-black text-[0.55rem] tracking-[0.06em] ${item.alert ? 'text-red-500' : 'text-lime-400'}`}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {hemorrhagicShock.isActive && (
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {[
                { label: 'BV actual', value: `${Math.round(bv)} mL`, alert: bv < 3000 },
                { label: 'Perdida', value: `${Math.round(traumaStatus.pctLoss)}% / ${Math.round(traumaStatus.bvLost)}mL`, alert: traumaStatus.pctLoss > 30 },
                { label: 'Hb live', value: `${traumaStatus.hbLive.toFixed(1)} g/dL`, alert: traumaStatus.hbLive < 8 },
                { label: 'Sangrado', value: hemorrhagicShock.tourniquetApplied ? 'DETENIDO' : `${hemorrhagicShock.hemorrhageRate}mL/min`, alert: !hemorrhagicShock.tourniquetApplied },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`px-1.5 py-1 rounded-md ${item.alert ? 'bg-red-500/10 border-red-500/30' : 'bg-black/20 border-white/5'} border`}
                >
                  <div className="text-slate-500 text-[0.65rem] tracking-[0.04em]">{item.label}</div>
                  <div className={`font-black text-[0.65rem] tracking-[0.04em] ${item.alert ? 'text-red-500' : 'text-emerald-500'}`}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button onClick={() => setSection('sepsis')} {...getTabProps('sepsis')}>
            SEP{sepsis.isActive ? ` ${Math.round(sepsis.severity * 100)}%` : ''}
          </button>
          <button onClick={() => setSection('ards')} {...getTabProps('ards')}>
            SDRA{ards.isActive ? ` ${Math.round(ards.severity * 100)}%` : ''}
          </button>
          <button onClick={() => setSection('trauma')} {...getTabProps('trauma')}>
            TRAUMA{hemorrhagicShock.isActive ? ` CL.${hemorrhagicShock.activeClass}` : ''}{anyTraumaAlarm ? ' ⚠' : ''}
          </button>
        </div>

        {/* ── SEPSIS ── */}
        {section === 'sepsis' && (
          <div>
            <div className="text-slate-500 text-[0.65rem] tracking-[0.06em] mb-1.5">CASO 001 — SHOCK SÉPTICO</div>
            <PresetsGrid
              presets={SEPSIS_PRESETS}
              onSelect={(v) => activateSepsis(v)}
              progPresets={SEPSIS_PROG}
              activeProg={sepsis.progressionRate}
              onProgSelect={setSepsisRate}
              active={sepsis.isActive}
            />
            {sepsis.isActive && (
              <div className="mb-2">
                <div className="flex justify-between mb-1">
                  <label htmlFor="sepsis-severity-slider" className="text-slate-500 text-[0.4rem] cursor-pointer">Severidad manual</label>
                  <span className="text-[0.4rem] font-black" style={{ color: sepsisColor }}>{Math.round(sepsis.severity * 100)}%</span>
                </div>
                <input
                  id="sepsis-severity-slider"
                  type="range" min={0} max={100} step={1}
                  value={Math.round(sepsis.severity * 100)}
                  onChange={(e) => setSepsisSev(Number(e.target.value) / 100)}
                  aria-label="Ajustar severidad de sepsis"
                  title="Ajustar severidad de sepsis"
                  className="w-full cursor-pointer"
                  style={{ accentColor: sepsisColor }}
                />
              </div>
            )}
            {!sepsis.isActive ? (
              <button onClick={() => activateSepsis(0.15)} className={`w-full py-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-500 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW}`}>
                INYECTAR SEPSIS
              </button>
            ) : (
              <button onClick={deactivateSepsis} className={`w-full py-1.5 rounded-md border border-red-500/50 bg-red-500/15 text-red-500 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW}`}>
                DETENER SEPSIS
              </button>
            )
            }
          </div>
        )}

        {/* ── SDRA ── */}
        {section === 'ards' && (
          <div>
            <div className="text-slate-500 text-[0.65rem] tracking-[0.06em] mb-1">CASO 002 — SDRA</div>
            <div className="bg-lime-500/5 border border-lime-500/15 rounded-md p-2 mb-2">
              <span className="text-lime-400 text-[0.65rem] tracking-[0.04em] leading-relaxed">
                PEEP &gt; 12: reclutamiento sigmoide activo. FiO2 sola no resuelve el shunt.
              </span>
            </div>
            <PresetsGrid
              presets={ARDS_PRESETS}
              onSelect={(v) => activateArds(v)}
              progPresets={ARDS_PROG}
              activeProg={ards.progressionRate}
              onProgSelect={setArdsRate}
              active={ards.isActive}
            />
            {ards.isActive && (
              <>
                <div className="mb-2">
                  <div className="flex justify-between mb-1">
                    <label htmlFor="ards-severity-slider" className="text-slate-500 text-[0.4rem] cursor-pointer">Severidad manual</label>
                    <span className="text-[0.4rem] font-black" style={{ color: ardsColor }}>{Math.round(ards.severity * 100)}%</span>
                  </div>
                  <input
                    id="ards-severity-slider"
                    type="range" min={0} max={100} step={1}
                    value={Math.round(ards.severity * 100)}
                    onChange={(e) => setArdsSev(Number(e.target.value) / 100)}
                    aria-label="Ajustar severidad de SDRA"
                    title="Ajustar severidad de SDRA"
                    className="w-full cursor-pointer"
                    style={{ accentColor: ardsColor }}
                  />
                </div>
                <button onClick={toggleProne} className={`w-full py-2 rounded-md mb-2 text-lime-400 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW} ${ards.proneActive ? 'border border-lime-400/60 bg-lime-400/20' : 'border border-lime-400/30 bg-lime-400/5'}`}>
                  {ards.proneActive ? '⬆ REVERTIR A SUPINO' : '⬇ PRONAR PACIENTE'}
                  {ards.proneActive && (
                    <div className="text-[0.45rem] tracking-[0.04em] opacity-65 font-normal mt-0.5">
                      Activo: −35% shunt, +15% compliance
                    </div>
                  )}
                </button>
              </>
            )}
            {!ards.isActive ? (
              <button onClick={() => activateArds(0.15)} className={`w-full py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-500 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW}`}>
                INYECTAR SDRA
              </button>
            ) : (
              <button onClick={deactivateArds} className={`w-full py-1.5 rounded-md border border-red-500/50 bg-red-500/15 text-red-500 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW}`}>
                DETENER SDRA
              </button>
            )
            }
          </div>
        )}

        {/* ── TRAUMA ── */}
        {section === 'trauma' && (
          <div className="flex flex-col gap-2">

            {/* ATLS live */}
            <div className="rounded-md p-2" style={{ background: `${traumaStatus.atlasColor}10`, border: `1px solid ${traumaStatus.atlasColor}44` }}>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[0.45rem] font-black" style={{ color: traumaStatus.atlasColor }}>{traumaStatus.atlasLabel}</span>
                <span className="font-mono text-[0.55rem] tracking-[0.06em]" style={{ color: traumaStatus.atlasColor }}>{Math.round(traumaStatus.pctLoss)}% perdida</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-500 font-mono text-[0.65rem] tracking-[0.04em]">BV: {Math.round(bv)}/{BV_NORMAL} mL</span>
                <span className="text-slate-500 font-mono text-[0.65rem] tracking-[0.04em]">Hb: {traumaStatus.hbLive.toFixed(1)} g/dL</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/40 mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(2, (bv / BV_NORMAL) * 100).toFixed(1)}%`,
                    background: `linear-gradient(90deg,${traumaStatus.atlasColor}88,${traumaStatus.atlasColor})`,
                  }}
                />
              </div>
            </div>

            {/* Alarmas Trauma */}
            {anyTraumaAlarm && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2.5">
                <div className="text-red-500 font-black text-[0.65rem] tracking-[0.06em] mb-1">
                  ALARMAS TRAUMA
                </div>
                <div className="flex flex-col gap-1">
                  {acidosisAlarm && (
                    <div className="flex justify-between text-red-500 text-[0.65rem] tracking-[0.04em]">
                      <span>ACIDOSIS</span>
                      <span className="opacity-80">
                        Lac {typedVitals.lactate.toFixed(1)} pH {typedVitals.pH.toFixed(2)} BE {typedVitals.baseExcess.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {hemoDilAlarm && (
                    <div className="flex justify-between text-orange-500 text-[0.65rem] tracking-[0.04em]">
                      <span>HEMODILUSION</span>
                      <span className="opacity-80">
                        Hb {traumaStatus.hbLive.toFixed(1)} g/dL
                      </span>
                    </div>
                  )}
                  {critVolAlarm && (
                    <div className="flex justify-between text-red-500 text-[0.65rem] tracking-[0.04em]">
                      <span>VOL CRITICO</span>
                      <span className="opacity-80">
                        BV {Math.round(bv)} mL ({Math.round(traumaStatus.pctLoss)}% perdida)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clases hemorragia */}
            <div className="grid grid-cols-2 gap-1.5">
              {HEMORRHAGE_CLASSES.map((cls) => {
                const isActive = hemorrhagicShock.isActive && hemorrhagicShock.activeClass === cls.cls;
                return (
                  <button
                    key={cls.cls}
                    onClick={() => hemorrhagicShock.isActive
                      ? setHemorrhageClass(cls.cls)
                      : activateHemorrhagicShock(cls.cls)
                    }
                    className={`p-1.5 rounded-md cursor-pointer font-mono text-[0.65rem] tracking-[0.06em] font-black text-center ${RAISED_SHADOW}`}
                    style={{
                      border: `1px solid ${isActive ? cls.color : `${cls.color}44`}`,
                      background: isActive ? `${cls.color}20` : 'rgba(0,0,0,0.3)',
                      color: cls.color,
                    }}
                  >
                    <div className="text-[0.7rem] tracking-[0.08em]">{cls.label}</div>
                    <div className="text-[0.65rem] tracking-[0.04em] opacity-70 mt-0.5">{cls.desc}</div>
                    <div className="text-[0.65rem] tracking-[0.04em] opacity-50 mt-0.5">{CLASS_HEMORRHAGE_RATES[cls.cls]} mL/min</div>
                    <div className="text-[0.65rem] tracking-[0.04em] opacity-50">{cls.hr}</div>
                  </button>
                );
              })}
            </div>

            {/* Torniquete */}
            {hemorrhagicShock.isActive && (
              <button
                onClick={() => hemorrhagicShock.tourniquetApplied ? releaseTourniquet() : applyTourniquet()}
                className={`w-full py-2 rounded-md font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW} ${hemorrhagicShock.tourniquetApplied
                  ? 'border border-lime-400/60 bg-lime-400/20 text-lime-400'
                  : 'border border-red-500/50 bg-red-500/10 text-red-500'
                  }`}
              >
                {hemorrhagicShock.tourniquetApplied ? 'TORNIQUETE ACTIVO — Liberar' : 'CONTROL DAÑOS / TORNIQUETE'}
                <div className="text-[0.65rem] tracking-[0.04em] opacity-65 font-normal mt-0.5">
                  {hemorrhagicShock.tourniquetApplied
                    ? 'Sangrado detenido · BV ' + Math.round(bv) + ' mL'
                    : 'Activo: ' + hemorrhagicShock.hemorrhageRate + ' mL/min'}
                </div>
              </button>
            )}

            {/* Panel Fluidos */}
            <FluidAdministrationPanel
              fluidCat={fluidCat}
              selFluid={selFluid}
              selVolume={selVolume}
              bv={bv}
              crystalloidAccum={crystalloidAccum}
              prbcUnits={prbcUnits}
              ffpUnits={ffpUnits}
              ratio11Needed={ratio11Needed}
              onFluidCategoryChange={handleFluidCategoryChange}
              onFluidSelect={handleFluidSelect}
              onVolumeSelect={setSelVolume}
              onAdminister={() => administerFluid(selFluid, selVolume)}
            />

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                <div className="bg-black/20 rounded p-1">
                  <div className="text-slate-500 text-[0.55rem] tracking-[0.04em]">Cristaloides</div>
                  <div className={`font-black text-[0.55rem] tracking-[0.06em] ${crystalloidAccum > 3000 ? 'text-orange-500' : 'text-emerald-500'}`}>
                    {(crystalloidAccum / 1000).toFixed(1)} L{crystalloidAccum > 3000 ? ' aviso' : ''}
                  </div>
                </div>
                <div className="bg-black/20 rounded p-1">
                  <div className="text-slate-500 text-[0.55rem] tracking-[0.04em]">GRE / PFC</div>
                  <div className="text-red-500 font-black text-[0.55rem] tracking-[0.06em]">
                    {prbcUnits}U / {ffpUnits}U
                  </div>
                </div>
              </div>
            </div>

            {hemorrhagicShock.isActive && (
              <button
                onClick={deactivateHemorrhagicShock}
                className={`w-full py-1.5 rounded-md border border-violet-400/40 bg-violet-400/10 text-violet-400 font-mono text-[0.5rem] font-black cursor-pointer ${RAISED_SHADOW}`}>
                TERMINAR ESCENARIO HEMORRAGIA
              </button>
            )}
          </div>
        )}

        {/* Procedimientos Invasivos */}
        <ProceduresPanel />

        {/* Acciones Globales */}
        <div className="border-t border-white/5 pt-2 flex flex-col gap-1.5">
          <div className="text-slate-500 text-[0.35rem] tracking-[0.08em]">ACCIONES INSTRUCTOR</div>
          <button
            onClick={() => { setBloodVol(BV_NORMAL); resetFluidTracking(); }}
            className={`w-full py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-mono text-[0.55rem] tracking-[0.08em] font-black cursor-pointer ${RAISED_SHADOW}`}
          >
            RESTAURAR VOLEMIA + FLUIDOS
          </button>
          <button
            onClick={() => {
              resetAll();
              import('../core/RespiratoryEngine').then(({ RespiratoryEngine }) =>
                RespiratoryEngine.getInstance().reset()
              );
            }}
            className={`w-full py-1.5 rounded-md border border-violet-400/30 bg-violet-400/10 text-violet-400 font-mono text-[0.55rem] tracking-[0.08em] font-black cursor-pointer ${RAISED_SHADOW}`}
          >
            RESET TODAS LAS PATOLOGIAS
          </button>
        </div>

      </div>
    </>
  );
};

export default InstructorPanel;