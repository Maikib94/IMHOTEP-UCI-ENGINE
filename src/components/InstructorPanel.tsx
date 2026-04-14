import React, { useState, useEffect } from 'react';
import { usePathologyStore } from '../store/usePathologyStore';
import {
  usePatientStore,
  FLUID_CATALOG,
} from '../store/usePatientStore';
import type { FluidType } from '../store/usePatientStore';

const CLASS_HEMORRHAGE_RATES: Record<1|2|3|4, number> = {
  1: 8, 2: 20, 3: 45, 4: 90,
};

const BG     = '#0c1020';
const RAISED = 'inset 0 1px 0 rgba(255,255,255,0.04),4px 4px 10px rgba(0,0,0,0.7),-2px -2px 6px rgba(255,255,255,0.02)';
const MONO   = "'JetBrains Mono', monospace";
const COMPLIANCE_BASE = 50.0;
const BV_NORMAL       = 5000;
const HB_NORMAL       = 14.0;
const MCHC            = HB_NORMAL / 0.45;

const SEPSIS_PRESETS = [
  { label: 'BACTEREMIA', value: 0.15, color: '#34d399', desc: 'SIRS + foco' },
  { label: 'SEPSIS',     value: 0.40, color: '#fbbf24', desc: 'Disfuncion organo' },
  { label: 'SHOCK',      value: 0.70, color: '#f97316', desc: 'PAM<65 / Lac>2' },
  { label: 'MOF',        value: 0.92, color: '#ef4444', desc: 'Multiorganico' },
];

const ARDS_PRESETS = [
  { label: 'LEVE',        value: 0.25, color: '#a3e635', desc: 'S/F 235-315' },
  { label: 'MODERADO',    value: 0.55, color: '#fbbf24', desc: 'S/F 148-235' },
  { label: 'SEVERO',      value: 0.85, color: '#f97316', desc: 'S/F < 148' },
  { label: 'REFRACTARIO', value: 0.96, color: '#ef4444', desc: 'Considerar ECMO' },
];

const HEMORRHAGE_CLASSES = [
  { cls: 1 as const, label: 'CLASE I',   color: '#34d399', desc: '<15% vol.',   hr: '<100 lpm'         },
  { cls: 2 as const, label: 'CLASE II',  color: '#fbbf24', desc: '15-30% vol.', hr: '100-120 lpm'      },
  { cls: 3 as const, label: 'CLASE III', color: '#f97316', desc: '30-40% vol.', hr: '120-140 lpm'      },
  { cls: 4 as const, label: 'CLASE IV',  color: '#ef4444', desc: '>40% vol.',   hr: '>140/bradicardia' },
];

const SEPSIS_PROG = [
  { label: 'LENTO',      value: 0.000005, desc: '~55h sim'   },
  { label: 'NORMAL',     value: 0.00002,  desc: '~14h sim'   },
  { label: 'RAPIDO',     value: 0.0001,   desc: '~2.8h sim'  },
  { label: 'FULMINANTE', value: 0.0005,   desc: '~33min sim' },
];

const ARDS_PROG = [
  { label: 'LENTO',      value: 0.00001, desc: '~28h sim'   },
  { label: 'NORMAL',     value: 0.00003, desc: '~9h sim'    },
  { label: 'RAPIDO',     value: 0.0002,  desc: '~85min sim' },
  { label: 'FULMINANTE', value: 0.001,   desc: '~17min sim' },
];

function atlasClassFromBV(bv: number): { label: string; color: string; pct: number } {
  const pct = Math.max(0, (BV_NORMAL - bv) / BV_NORMAL * 100);
  if (pct < 15) return { label: 'CLASE I / PRE-SHOCK',        color: '#34d399', pct };
  if (pct < 30) return { label: 'CLASE II — COMPENSADO',      color: '#fbbf24', pct };
  if (pct < 40) return { label: 'CLASE III — DESCOMPENSANDO', color: '#f97316', pct };
  return             { label: 'CLASE IV — COLAPSO',           color: '#ef4444', pct };
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
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#6b7a99', fontFamily: MONO, fontSize: '0.42rem' }}>{label}</span>
        <span style={{ color, fontFamily: MONO, fontSize: '0.42rem', fontWeight: 700 }}>{value.toFixed(2)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: `linear-gradient(90deg,${color}88,${color})`, transition: 'width 0.4s ease' }} />
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
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
        {presets.map((p) => (
          <button key={p.label} onClick={() => onSelect(p.value)} title={p.desc} style={{
            padding: '5px 4px', borderRadius: 6,
            border: `1px solid ${p.color}44`, background: 'rgba(0,0,0,0.3)',
            color: p.color, fontFamily: MONO, fontSize: '0.45rem', fontWeight: 700,
            cursor: 'pointer', boxShadow: RAISED, textAlign: 'center',
          }}>
            <div>{p.label}</div>
            <div style={{ fontSize: '0.38rem', opacity: 0.6, fontWeight: 400 }}>{p.desc}</div>
          </button>
        ))}
      </div>
      {active && (
        <>
          <div style={{ color: '#6b7a99', fontSize: '0.4rem', marginBottom: 4 }}>VELOCIDAD PROGRESION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
            {progPresets.map((p) => {
              const isActive = Math.abs(activeProg - p.value) / p.value < 0.1;
              return (
                <button key={p.label} onClick={() => onProgSelect(p.value)} style={{
                  padding: '4px', borderRadius: 5,
                  border: `1px solid ${isActive ? '#38bdf8' : 'rgba(255,255,255,0.06)'}`,
                  background: isActive ? 'rgba(56,189,248,0.12)' : 'rgba(0,0,0,0.3)',
                  color: isActive ? '#38bdf8' : '#6b7a99',
                  fontFamily: MONO, fontSize: '0.4rem', fontWeight: 700,
                  cursor: 'pointer', boxShadow: RAISED, textAlign: 'center',
                }}>
                  <div>{p.label}</div>
                  <div style={{ fontSize: '0.35rem', opacity: 0.6, fontWeight: 400 }}>{p.desc}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export const InstructorPanel: React.FC = () => {
  const [open, setOpen]           = useState(false);
  const [section, setSection]     = useState<'sepsis' | 'ards' | 'trauma'>('sepsis');
  const [fluidCat, setFluidCat]   = useState<'cristaloide' | 'hemo'>('cristaloide');
  const [selFluid, setSelFluid]   = useState<FluidType>('ringer_lactato');
  const [selVolume, setSelVolume] = useState<number>(500);

  const sepsis                     = usePathologyStore((s) => s.sepsis);
  const ards                       = usePathologyStore((s) => s.ards);
  const hemorrhagicShock           = usePathologyStore((s) => s.hemorrhagicShock);
  const modifiers                  = usePathologyStore((s) => s.modifiers);
  const activateSepsis             = usePathologyStore((s) => s.activateSepsis);
  const deactivateSepsis           = usePathologyStore((s) => s.deactivateSepsis);
  const setSepsisSev               = usePathologyStore((s) => s.setSepsisSeverity);
  const setSepsisRate              = usePathologyStore((s) => s.setSepsisProgRate);
  const activateArds               = usePathologyStore((s) => s.activateArds);
  const deactivateArds             = usePathologyStore((s) => s.deactivateArds);
  const setArdsSev                 = usePathologyStore((s) => s.setArdsSeverity);
  const setArdsRate                = usePathologyStore((s) => s.setArdsProgRate);
  const toggleProne                = usePathologyStore((s) => s.toggleProne);
  const activateHemorrhagicShock   = usePathologyStore((s) => s.activateHemorrhagicShock);
  const deactivateHemorrhagicShock = usePathologyStore((s) => s.deactivateHemorrhagicShock);
  const setHemorrhageClass         = usePathologyStore((s) => s.setHemorrhageClass);
  const applyTourniquet            = usePathologyStore((s) => s.applyTourniquet);
  const releaseTourniquet          = usePathologyStore((s) => s.releaseTourniquet);
  const resetAll                   = usePathologyStore((s) => s.resetAllPathologies);

  const vent               = usePatientStore((s) => s.ventilator);
  const vitals             = usePatientStore((s) => s.vitals);
  const bv                 = usePatientStore((s) => s.bloodVolume);
  const rbc                = usePatientStore((s) => s.redBloodCellMass);
  const crystalloidAccum   = usePatientStore((s) => s.crystalloidAccumulated);
  const prbcUnits          = usePatientStore((s) => s.prbcUnitsGiven);
  const ffpUnits           = usePatientStore((s) => s.ffpUnitsGiven);
  const setBloodVol        = usePatientStore((s) => s.setBloodVolume);
  const administerFluid    = usePatientStore((s) => s.administerFluid);
  const resetFluidTracking = usePatientStore((s) => s.resetFluidTracking);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    const vols = FLUID_CATALOG[selFluid].volumes;
    if (!vols.includes(selVolume)) setSelVolume(vols[0]);
  }, [selFluid]);

  useEffect(() => {
    const firstInCat = (Object.keys(FLUID_CATALOG) as FluidType[])
      .find(k => FLUID_CATALOG[k].category === fluidCat);
    if (firstInCat) setSelFluid(firstInCat);
  }, [fluidCat]);

  const anyActive   = sepsis.isActive || ards.isActive || hemorrhagicShock.isActive;
  const anyCritical = (sepsis.isActive && sepsis.severity > 0.65)
                   || (ards.isActive && ards.severity > 0.65)
                   || (hemorrhagicShock.isActive && bv < 3000);
  const tabColor = anyCritical ? '#ef4444' : anyActive ? '#f97316' : '#38bdf8';

  const sepsisColor = sepsis.severity < 0.30 ? '#34d399'
                    : sepsis.severity < 0.55 ? '#fbbf24'
                    : sepsis.severity < 0.80 ? '#f97316' : '#ef4444';
  const ardsColor   = ards.severity < 0.30 ? '#a3e635'
                    : ards.severity < 0.55 ? '#fbbf24'
                    : ards.severity < 0.80 ? '#f97316' : '#ef4444';

  const compliance     = COMPLIANCE_BASE * modifiers.complianceMultiplier;
  const vt             = vent.vt ?? 500;
  const fr             = (vitals as any).respiratoryRate ?? 14;
  const deltaP         = compliance > 0 ? vt / compliance : 0;
  const pplat          = vent.peep + deltaP;
  const ppico          = pplat + 5;
  const mp             = 0.098 * fr * (vt / 1000) * (ppico - deltaP / 2);
  const sigma          = 1.0 / (1.0 + Math.exp(-(vent.peep - 12) / 2.5));
  const peepRecruitPct = ards.isActive ? (sigma * 0.20 * ards.severity * 100).toFixed(1) : '0.0';

  const { label: atlasLabel, color: atlasColor, pct: pctLoss } = atlasClassFromBV(bv);
  const bvLost = Math.max(0, BV_NORMAL - bv);
  const hbLive = calcHbLive(rbc ?? (bv * 0.45), bv);

  const acidosisAlarm  = vitals.lactate > 4 || vitals.pH < 7.20 || vitals.baseExcess < -6;
  const hemoDilAlarm   = hbLive < 8;
  const critVolAlarm   = bv < 2500;
  const anyTraumaAlarm = acidosisAlarm || hemoDilAlarm || critVolAlarm;
  const ratio11Needed  = prbcUnits > 0 && prbcUnits > ffpUnits + 1;

  const sepsisTag = sepsis.isActive           ? `S${Math.round(sepsis.severity * 100)}` : '';
  const ardsTag   = ards.isActive             ? `A${Math.round(ards.severity * 100)}`   : '';
  const traumaTag = hemorrhagicShock.isActive ? `H${hemorrhagicShock.activeClass}`      : '';
  const tags      = [sepsisTag, ardsTag, traumaTag].filter(Boolean).join('/');
  const tabLabel  = tags || 'INSTR';

  const selFluidDef = FLUID_CATALOG[selFluid];
  const fluidsInCat = (Object.keys(FLUID_CATALOG) as FluidType[])
    .filter(k => FLUID_CATALOG[k].category === fluidCat);

  const tabBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Panel Instructor (F2)"
      style={{
        position: 'fixed', right: open ? 280 : 0, top: '50%',
        transform: 'translateY(-50%)', zIndex: 2000,
        width: 22, height: 80,
        background: BG, border: `1px solid ${tabColor}44`,
        borderRadius: '6px 0 0 6px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '-3px 0 10px rgba(0,0,0,0.5)',
        transition: 'right 0.25s ease',
      }}
    >
      <span style={{
        color: tabColor, fontFamily: MONO, fontSize: '0.38rem', fontWeight: 700,
        writingMode: 'vertical-rl', textOrientation: 'mixed',
        letterSpacing: '0.1em', transform: 'rotate(180deg)',
      }}>
        {tabLabel}
      </span>
    </button>
  );

  if (!open) return tabBtn;

  const tabStyleFn = (sec: 'sepsis' | 'ards' | 'trauma') => {
    const colors = { sepsis: '#f97316', ards: '#38bdf8', trauma: '#ef4444' };
    const c = colors[sec];
    const active = section === sec;
    return {
      flex: 1, padding: '5px 0', borderRadius: 5,
      border: `1px solid ${active ? c : 'rgba(255,255,255,0.06)'}`,
      background: active ? `${c}22` : 'rgba(0,0,0,0.3)',
      color: active ? c : '#6b7a99',
      fontFamily: MONO, fontSize: '0.42rem', fontWeight: 700,
      cursor: 'pointer', boxShadow: RAISED,
    };
  };

  return (
    <>
      {tabBtn}
      <div style={{
        position: 'fixed', right: 0, top: 0, width: 280, height: '100vh',
        background: BG, borderLeft: '1px solid rgba(56,189,248,0.12)',
        zIndex: 1999, overflowY: 'auto', padding: '12px 14px',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.6)', fontFamily: MONO,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
          <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.12em' }}>
            INSTRUCTOR PANEL
          </div>
          <div style={{ color: '#334155', fontSize: '0.38rem', marginTop: 2 }}>F2 para cerrar</div>
        </div>

        {/* Estado live */}
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px',
          border: `1px solid ${anyActive ? tabColor + '44' : 'rgba(255,255,255,0.05)'}`,
          boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 2 }}>
            <span style={{ color: '#6b7a99', fontSize: '0.42rem' }}>ESTADO</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sepsis.isActive           && <span style={{ color: sepsisColor, fontWeight: 700, fontSize: '0.42rem' }}>SEP {Math.round(sepsis.severity * 100)}%</span>}
              {ards.isActive             && <span style={{ color: ardsColor,   fontWeight: 700, fontSize: '0.42rem' }}>SDRA {Math.round(ards.severity * 100)}%</span>}
              {hemorrhagicShock.isActive && <span style={{ color: atlasColor,  fontWeight: 700, fontSize: '0.42rem' }}>H.CL.{hemorrhagicShock.activeClass}</span>}
              {!anyActive                && <span style={{ color: '#334155',   fontWeight: 700, fontSize: '0.42rem' }}>INACTIVO</span>}
            </div>
          </div>
          {anyActive && (
            <>
              <ModifierBar label="SVR x"          value={modifiers.svrMultiplier}        min={0.4}  max={1.65} color="#38bdf8" />
              <ModifierBar label="Fuga capilar"   value={modifiers.capillaryLeakRate}    min={0}    max={10}   color="#a78bfa" />
              <ModifierBar label="Hiperd. factor" value={modifiers.hyperdynamicFactor}   min={0.45} max={2.0}  color="#fbbf24" />
              <ModifierBar label="Shunt"          value={modifiers.lungShuntFraction}    min={0.05} max={0.85} color="#f472b6" />
              <ModifierBar label="Compliance x"   value={modifiers.complianceMultiplier} min={0.3}  max={1.0}  color="#a3e635" />
            </>
          )}
          {ards.isActive && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { label: 'ΔP',         value: `${deltaP.toFixed(1)} cmH2O`, alert: deltaP > 14 },
                { label: 'Pplat',      value: `${pplat.toFixed(1)} cmH2O`,  alert: pplat > 30  },
                { label: 'MP',         value: `${mp.toFixed(1)} J/min`,     alert: mp > 17     },
                { label: 'Reclu.PEEP', value: `-${peepRecruitPct}%`,        alert: false       },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: '3px 6px', borderRadius: 4,
                  background: item.alert ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${item.alert ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <div style={{ color: '#6b7a99', fontSize: '0.37rem' }}>{item.label}</div>
                  <div style={{ color: item.alert ? '#ef4444' : '#a3e635', fontWeight: 700, fontSize: '0.42rem' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {hemorrhagicShock.isActive && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { label: 'BV actual', value: `${Math.round(bv)} mL`,                              alert: bv < 3000            },
                { label: 'Perdida',   value: `${Math.round(pctLoss)}% / ${Math.round(bvLost)}mL`, alert: pctLoss > 30         },
                { label: 'Hb live',   value: `${hbLive.toFixed(1)} g/dL`,                         alert: hbLive < 8           },
                { label: 'Sangrado',  value: hemorrhagicShock.tourniquetApplied
                    ? 'DETENIDO'
                    : `${hemorrhagicShock.hemorrhageRate}mL/min`,                                  alert: !hemorrhagicShock.tourniquetApplied },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: '3px 6px', borderRadius: 4,
                  background: item.alert ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${item.alert ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <div style={{ color: '#6b7a99', fontSize: '0.37rem' }}>{item.label}</div>
                  <div style={{ color: item.alert ? '#ef4444' : '#34d399', fontWeight: 700, fontSize: '0.38rem' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 3 }}>
          <button onClick={() => setSection('sepsis')} style={tabStyleFn('sepsis')}>
            SEP{sepsis.isActive ? ` ${Math.round(sepsis.severity * 100)}%` : ''}
          </button>
          <button onClick={() => setSection('ards')} style={tabStyleFn('ards')}>
            SDRA{ards.isActive ? ` ${Math.round(ards.severity * 100)}%` : ''}
          </button>
          <button onClick={() => setSection('trauma')} style={tabStyleFn('trauma')}>
            TRAUMA{hemorrhagicShock.isActive ? ` CL.${hemorrhagicShock.activeClass}` : ''}{anyTraumaAlarm ? ' ⚠' : ''}
          </button>
        </div>

        {/* ── SEPSIS ── */}
        {section === 'sepsis' && (
          <div>
            <div style={{ color: '#6b7a99', fontSize: '0.42rem', marginBottom: 6 }}>CASO 001 — SHOCK SÉPTICO</div>
            <PresetsGrid
              presets={SEPSIS_PRESETS}
              onSelect={(v) => activateSepsis(v)}
              progPresets={SEPSIS_PROG}
              activeProg={sepsis.progressionRate}
              onProgSelect={setSepsisRate}
              active={sepsis.isActive}
            />
            {sepsis.isActive && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#6b7a99', fontSize: '0.4rem' }}>Severidad manual</span>
                  <span style={{ color: sepsisColor, fontSize: '0.4rem', fontWeight: 700 }}>{Math.round(sepsis.severity * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(sepsis.severity * 100)}
                  onChange={(e) => setSepsisSev(Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: sepsisColor, cursor: 'pointer' }}
                />
              </div>
            )}
            {!sepsis.isActive
              ? (
                <button onClick={() => activateSepsis(0.15)} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.12)', color: '#f97316', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  INYECTAR SEPSIS
                </button>
              ) : (
                <button onClick={deactivateSepsis} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  DETENER SEPSIS
                </button>
              )
            }
          </div>
        )}

        {/* ── SDRA ── */}
        {section === 'ards' && (
          <div>
            <div style={{ color: '#6b7a99', fontSize: '0.42rem', marginBottom: 4 }}>CASO 002 — SDRA (Berlin 2012)</div>
            <div style={{ background: 'rgba(163,230,53,0.06)', border: '1px solid rgba(163,230,53,0.15)', borderRadius: 5, padding: '5px 8px', marginBottom: 8 }}>
              <span style={{ color: '#a3e635', fontSize: '0.38rem', lineHeight: 1.5 }}>
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
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#6b7a99', fontSize: '0.4rem' }}>Severidad manual</span>
                    <span style={{ color: ardsColor, fontSize: '0.4rem', fontWeight: 700 }}>{Math.round(ards.severity * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={Math.round(ards.severity * 100)}
                    onChange={(e) => setArdsSev(Number(e.target.value) / 100)}
                    style={{ width: '100%', accentColor: ardsColor, cursor: 'pointer' }}
                  />
                </div>
                <button onClick={toggleProne} style={{ width: '100%', padding: '8px 0', borderRadius: 6, marginBottom: 8, border: `1px solid ${ards.proneActive ? 'rgba(163,230,53,0.6)' : 'rgba(163,230,53,0.3)'}`, background: ards.proneActive ? 'rgba(163,230,53,0.20)' : 'rgba(163,230,53,0.06)', color: '#a3e635', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  {ards.proneActive ? '⬆ REVERTIR A SUPINO' : '⬇ POSICION PRONO'}
                  <div style={{ fontSize: '0.38rem', opacity: 0.65, fontWeight: 400, marginTop: 2 }}>
                    {ards.proneActive ? 'Activo: −35% shunt, +15% compliance' : 'PROSEVA 2013 · ATS 2024 recom. fuerte'}
                  </div>
                </button>
              </>
            )}
            {!ards.isActive
              ? (
                <button onClick={() => activateArds(0.15)} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.10)', color: '#38bdf8', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  INYECTAR SDRA
                </button>
              ) : (
                <button onClick={deactivateArds} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  DETENER SDRA
                </button>
              )
            }
          </div>
        )}

        {/* ── TRAUMA ── */}
        {section === 'trauma' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ATLS live */}
            <div style={{ background: `${atlasColor}10`, border: `1px solid ${atlasColor}44`, borderRadius: 6, padding: '7px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: atlasColor, fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700 }}>{atlasLabel}</span>
                <span style={{ color: atlasColor, fontFamily: MONO, fontSize: '0.42rem' }}>{Math.round(pctLoss)}% perdida</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span style={{ color: '#6b7a99', fontFamily: MONO, fontSize: '0.38rem' }}>BV: {Math.round(bv)}/{BV_NORMAL} mL</span>
                <span style={{ color: '#6b7a99', fontFamily: MONO, fontSize: '0.38rem' }}>Hb: {hbLive.toFixed(1)} g/dL</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.4)', marginTop: 5, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(2, (bv / BV_NORMAL) * 100).toFixed(1)}%`,
                  height: '100%', borderRadius: 3,
                  background: `linear-gradient(90deg,${atlasColor}88,${atlasColor})`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* Nota pedagogica */}
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 5, padding: '5px 8px' }}>
              <span style={{ color: '#fbbf24', fontSize: '0.37rem', lineHeight: 1.5 }}>
                CLASE II: PAM normal por SVR alto. Reconocer TAQUICARDIA como signo de shock. (ATLS 11a Ed.)
              </span>
            </div>

            {/* Alarmas Trauma */}
            {anyTraumaAlarm && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.42rem', marginBottom: 4 }}>
                  ALARMAS TRAUMA
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {acidosisAlarm && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#ef4444', fontSize: '0.38rem' }}>ACIDOSIS</span>
                      <span style={{ color: '#ef4444', fontSize: '0.38rem', opacity: 0.8 }}>
                        Lac {vitals.lactate.toFixed(1)} pH {vitals.pH.toFixed(2)} BE {vitals.baseExcess.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {hemoDilAlarm && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f97316', fontSize: '0.38rem' }}>HEMODILUSION</span>
                      <span style={{ color: '#f97316', fontSize: '0.38rem', opacity: 0.8 }}>
                        Hb {hbLive.toFixed(1)} g/dL
                      </span>
                    </div>
                  )}
                  {critVolAlarm && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#ef4444', fontSize: '0.38rem' }}>VOL CRITICO</span>
                      <span style={{ color: '#ef4444', fontSize: '0.38rem', opacity: 0.8 }}>
                        BV {Math.round(bv)} mL ({Math.round(pctLoss)}% perdida)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clases hemorragia */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {HEMORRHAGE_CLASSES.map((cls) => {
                const isActive = hemorrhagicShock.isActive && hemorrhagicShock.activeClass === cls.cls;
                return (
                  <button
                    key={cls.cls}
                    onClick={() => hemorrhagicShock.isActive
                      ? setHemorrhageClass(cls.cls)
                      : activateHemorrhagicShock(cls.cls)
                    }
                    style={{
                      padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${isActive ? cls.color : cls.color + '44'}`,
                      background: isActive ? `${cls.color}20` : 'rgba(0,0,0,0.3)',
                      color: cls.color, fontFamily: MONO, fontSize: '0.43rem',
                      fontWeight: 700, boxShadow: RAISED, textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.48rem' }}>{cls.label}</div>
                    <div style={{ fontSize: '0.37rem', opacity: 0.7, marginTop: 1 }}>{cls.desc}</div>
                    <div style={{ fontSize: '0.34rem', opacity: 0.55, marginTop: 1 }}>{CLASS_HEMORRHAGE_RATES[cls.cls]} mL/min</div>
                    <div style={{ fontSize: '0.33rem', opacity: 0.50 }}>{cls.hr}</div>
                  </button>
                );
              })}
            </div>

            {/* Torniquete */}
            {hemorrhagicShock.isActive && (
              <button
                onClick={() => hemorrhagicShock.tourniquetApplied ? releaseTourniquet() : applyTourniquet()}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 6,
                  border: `1px solid ${hemorrhagicShock.tourniquetApplied ? 'rgba(163,230,53,0.6)' : 'rgba(239,68,68,0.5)'}`,
                  background: hemorrhagicShock.tourniquetApplied ? 'rgba(163,230,53,0.18)' : 'rgba(239,68,68,0.12)',
                  color: hemorrhagicShock.tourniquetApplied ? '#a3e635' : '#ef4444',
                  fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700,
                  cursor: 'pointer', boxShadow: RAISED,
                }}
              >
                {hemorrhagicShock.tourniquetApplied ? 'TORNIQUETE ACTIVO — Liberar' : 'CONTROL DAÑOS / TORNIQUETE'}
                <div style={{ fontSize: '0.37rem', opacity: 0.65, fontWeight: 400, marginTop: 2 }}>
                  {hemorrhagicShock.tourniquetApplied
                    ? 'Sangrado detenido · BV ' + Math.round(bv) + ' mL'
                    : 'Activo: ' + hemorrhagicShock.hemorrhageRate + ' mL/min'}
                </div>
              </button>
            )}

            {/* Panel Fluidos */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(56,189,248,0.15)' }}>
              <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.44rem', marginBottom: 6 }}>
                FLUIDOS
              </div>

              {ratio11Needed && (
                <div style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.4)', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>
                  <div style={{ color: '#f97316', fontSize: '0.38rem', fontWeight: 700 }}>
                    Protocolo 1:1:1 — GRE:{prbcUnits}U PFC:{ffpUnits}U
                  </div>
                  <div style={{ color: '#f97316', fontSize: '0.35rem', opacity: 0.8, marginTop: 1 }}>
                    Agregar PFC (PROPPR 2015)
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                {(['cristaloide', 'hemo'] as const).map((cat) => {
                  const active = fluidCat === cat;
                  return (
                    <button key={cat} onClick={() => setFluidCat(cat)} style={{
                      flex: 1, padding: '4px 0', borderRadius: 4,
                      border: `1px solid ${active ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                      background: active ? 'rgba(56,189,248,0.15)' : 'rgba(0,0,0,0.3)',
                      color: active ? '#38bdf8' : '#6b7a99',
                      fontFamily: MONO, fontSize: '0.38rem', fontWeight: 700, cursor: 'pointer',
                    }}>
                      {cat === 'cristaloide' ? 'CRISTALOIDES' : 'HEMOCOMP.'}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: fluidCat === 'cristaloide' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 4, marginBottom: 6 }}>
                {fluidsInCat.map((fk) => {
                  const fd  = FLUID_CATALOG[fk];
                  const sel = selFluid === fk;
                  return (
                    <button key={fk} onClick={() => setSelFluid(fk)} title={fd.desc} style={{
                      padding: '5px 3px', borderRadius: 5, cursor: 'pointer',
                      border: `1px solid ${sel ? fd.color : fd.color + '33'}`,
                      background: sel ? `${fd.color}18` : 'rgba(0,0,0,0.3)',
                      color: sel ? fd.color : fd.color + 'aa',
                      fontFamily: MONO, fontSize: '0.42rem', fontWeight: 700,
                      textAlign: 'center', boxShadow: RAISED,
                    }}>
                      <div style={{ fontSize: '0.48rem' }}>{fd.shortLabel}</div>
                      <div style={{ fontSize: '0.34rem', opacity: 0.65, marginTop: 1 }}>{fd.label.split(' ')[0]}</div>
                    </button>
                  );
                })}
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 5, padding: '4px 8px', marginBottom: 6 }}>
                <div style={{ color: selFluidDef.color, fontWeight: 700, fontSize: '0.42rem' }}>{selFluidDef.label}</div>
                <div style={{ color: '#6b7a99', fontSize: '0.35rem', marginTop: 1 }}>{selFluidDef.desc}</div>
              </div>

              <div style={{ color: '#6b7a99', fontSize: '0.38rem', marginBottom: 3 }}>{selFluidDef.volumeUnit}</div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
                {selFluidDef.volumes.map((vol) => {
                  const sel = selVolume === vol;
                  return (
                    <button key={vol} onClick={() => setSelVolume(vol)} style={{
                      padding: '4px 8px', borderRadius: 4,
                      border: `1px solid ${sel ? selFluidDef.color : 'rgba(255,255,255,0.1)'}`,
                      background: sel ? `${selFluidDef.color}20` : 'rgba(0,0,0,0.3)',
                      color: sel ? selFluidDef.color : '#6b7a99',
                      fontFamily: MONO, fontSize: '0.42rem', fontWeight: sel ? 700 : 400,
                      cursor: 'pointer',
                    }}>
                      {vol >= 1000 ? `${vol / 1000}L` : `${vol}mL`}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => administerFluid(selFluid, selVolume)}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 6,
                  border: `1px solid ${selFluidDef.color}88`,
                  background: `${selFluidDef.color}18`,
                  color: selFluidDef.color,
                  fontFamily: MONO, fontSize: '0.52rem', fontWeight: 700,
                  cursor: 'pointer', boxShadow: RAISED,
                }}
              >
                {selVolume >= 1000 ? `${selVolume / 1000}L` : `${selVolume}mL`} {selFluidDef.shortLabel}
                <div style={{ fontSize: '0.36rem', opacity: 0.65, fontWeight: 400, marginTop: 2 }}>
                  {Math.round(bv)} mL + {selVolume}mL
                </div>
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '3px 6px' }}>
                  <div style={{ color: '#6b7a99', fontSize: '0.36rem' }}>Cristaloides</div>
                  <div style={{ color: crystalloidAccum > 3000 ? '#f97316' : '#34d399', fontWeight: 700, fontSize: '0.42rem' }}>
                    {(crystalloidAccum / 1000).toFixed(1)} L{crystalloidAccum > 3000 ? ' aviso' : ''}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '3px 6px' }}>
                  <div style={{ color: '#6b7a99', fontSize: '0.36rem' }}>GRE / PFC</div>
                  <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.42rem' }}>
                    {prbcUnits}U / {ffpUnits}U
                  </div>
                </div>
              </div>
            </div>

            {!hemorrhagicShock.isActive
              ? (
                <button onClick={() => activateHemorrhagicShock(2)} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.10)', color: '#ef4444', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  INICIAR HEMORRAGIA (Clase II)
                </button>
              ) : (
                <button onClick={deactivateHemorrhagicShock} style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}>
                  TERMINAR ESCENARIO HEMORRAGIA
                </button>
              )
            }
          </div>
        )}

        {/* Acciones Globales */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ color: '#6b7a99', fontSize: '0.4rem', letterSpacing: '0.08em' }}>ACCIONES INSTRUCTOR</div>
          <button
            onClick={() => { setBloodVol(BV_NORMAL); resetFluidTracking(); }}
            style={{ padding: '5px 0', borderRadius: 5, border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399', fontFamily: MONO, fontSize: '0.45rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}
          >
            RESTAURAR VOLEMIA + FLUIDOS
          </button>
          <button
            onClick={() => {
              resetAll();
              usePatientStore.getState().setHemorrhageRate(0);
              resetFluidTracking();
              import('../core/RespiratoryEngine').then(({ RespiratoryEngine }) =>
                RespiratoryEngine.getInstance().reset()
              );
            }}
            style={{ padding: '5px 0', borderRadius: 5, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', fontFamily: MONO, fontSize: '0.45rem', fontWeight: 700, cursor: 'pointer', boxShadow: RAISED }}
          >
            RESET TODAS LAS PATOLOGIAS
          </button>
        </div>

        {/* Referencias */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ color: '#334155', fontSize: '0.36rem', lineHeight: 1.6 }}>
            ATLS 11a Ed. ACS 2018 · Cannon NEJM 2018{'\n'}
            EAST 2023 · PROPPR Trial 2015{'\n'}
            Berlin 2012 · PROSEVA 2013 · ATS 2024{'\n'}
            Grieco 2026 · SSC 2025
          </div>
        </div>

      </div>
    </>
  );
};

export default InstructorPanel;