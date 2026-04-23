// src/components/VentilatorPanel.tsx
// ARM Modal — física real de ondas, maniobras y reclutamiento (IMHOTEP UCI)
/* eslint-disable react/forbid-dom-props */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { usePatientStore, VentilatorMode } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import VentilatorCurves from './VentilatorCurves';

// ─── Paleta industrial ────────────────────────────────────────────────────────
const C = {
  bg:         '#0a0a10',
  bgPanel:    '#0d0d14',
  bgCard:     '#14141e',
  bgModal:    '#0b0b12',
  border:     '#222232',
  dimText:    '#4a4a66',
  midText:    '#7878a0',
  brightText: '#c8c8e4',
  lcd:        '#a8ff60',
  lcdWarn:    '#ffcc00',
  lcdAlarm:   '#ff4040',
  pressure:   '#f5c518',
  flow:       '#3ddc84',
  volume:     '#22d3ee',
  grid:       '#181822',
  sep:        '#252535',
  accent:     '#5b6af5',
  accentGlow: 'rgba(91,106,245,0.15)',
  green:      '#34d399',
  orangeWarn: '#f97316',
};

const MODES: { key: VentilatorMode; label: string }[] = [
  { key: 'VC-AC', label: 'VCV' },
  { key: 'PC-AC', label: 'PCV' },
  { key: 'PSV',   label: 'PSV' },
  { key: 'SIMV',  label: 'SIMV' },
  { key: 'CPAP',  label: 'CPAP' },
];

// ─── Física de ondas (Ecuación de Movimiento) ─────────────────────────────────

interface WaveParams {
  mode: VentilatorMode;
  R: number;        // cmH2O·s/L — resistencia de vía aérea
  C_mL: number;     // mL/cmH2O — compliance
  PEEP: number;     // cmH2O
  VT: number;       // mL
  pControl: number; // cmH2O sobre PEEP (PCV/PSV)
  flowRate: number; // L/min (flujo inspiratorio en VCV)
  tI_frac: number;  // fracción inspiratoria del ciclo (0–1)
  T: number;        // período total en segundos
  inspPause: boolean;
  expPause: boolean;
}

function computeWave(
  ph: number,
  type: 'pressure' | 'flow' | 'volume',
  p: WaveParams,
): number {
  const C_L    = p.C_mL / 1000;
  const tau    = Math.max(0.05, p.R * C_L);
  const VT_L   = p.VT / 1000;
  const fl_s   = Math.max(0.05, p.flowRate / 60); // L/s
  const tI     = p.tI_frac * p.T;                  // s inspir.
  const tE_tot = (1 - p.tI_frac) * p.T;            // s espir.

  if (ph < p.tI_frac) {
    // ── FASE INSPIRATORIA ─────────────────────────────────────
    const t = (ph / p.tI_frac) * tI; // tiempo dentro de inspiración (s)

    if (p.mode === 'VC-AC' || p.mode === 'SIMV') {
      // VCV: flujo cuadrado, volumen lineal
      if (type === 'flow')     return fl_s * 60;                       // L/min const.
      if (type === 'volume')   return (ph / p.tI_frac) * p.VT;        // mL lineal
      // Presión = elástica + resistiva + PEEP
      const V = (ph / p.tI_frac) * p.VT;
      return V / p.C_mL + fl_s * p.R + p.PEEP;
    }

    if (p.mode === 'PC-AC') {
      // PCV: presión cuadrada, flujo decelerante exponencial
      const fl_insp = (p.pControl / Math.max(0.5, p.R)) * Math.exp(-t / tau);
      const V       = C_L * p.pControl * (1 - Math.exp(-t / tau)) * 1000;
      if (type === 'pressure') return p.PEEP + p.pControl;  // cuadrada
      if (type === 'flow')     return fl_insp * 60;          // L/min decelerante
      return Math.max(0, V);
    }

    // PSV / CPAP: sinusoide suavizada
    const PS   = p.mode === 'PSV' ? p.pControl : 0;
    const frac = ph / p.tI_frac;
    const V    = p.VT * (1 - Math.cos(Math.PI * frac)) / 2;
    const fl   = (Math.PI * VT_L / tI) * Math.sin(Math.PI * frac);
    if (type === 'flow')     return fl * 60;
    if (type === 'volume')   return Math.max(0, V);
    return p.PEEP + PS * Math.sin(Math.PI * frac);

  } else {
    // ── FASE ESPIRATORIA ──────────────────────────────────────
    const t_exp = (ph - p.tI_frac) * p.T;

    // VT alcanzado (PCV depende de τ)
    let VT_ach = p.VT;
    if (p.mode === 'PC-AC') {
      VT_ach = C_L * p.pControl * (1 - Math.exp(-tI / tau)) * 1000;
    }

    // Pausa inspiratoria: flujo=0, presión = Pplat
    if (p.inspPause && t_exp < 1.8) {
      if (type === 'flow')     return 0;
      if (type === 'volume')   return VT_ach;
      return VT_ach / p.C_mL + p.PEEP;  // Pplat = elastic recoil
    }

    // Pausa espiratoria: al final de E, presión = PEEP total (revela auto-PEEP)
    if (p.expPause && t_exp > tE_tot - 0.3) {
      const V_res = VT_ach * Math.exp(-tE_tot / tau);
      if (type === 'flow')     return 0;
      if (type === 'volume')   return Math.max(0, V_res);
      return Math.max(p.PEEP, V_res / p.C_mL + p.PEEP);
    }

    // Espiración libre: decaimiento exponencial
    const V_exp     = VT_ach * Math.exp(-t_exp / tau);
    const fl_exp_s  = -(VT_ach / 1000 / tau) * Math.exp(-t_exp / tau);

    if (type === 'flow')   return fl_exp_s * 60;          // L/min negativo
    if (type === 'volume') return Math.max(0, V_exp);
    const P = V_exp / p.C_mL + fl_exp_s * p.R + p.PEEP;
    return Math.max(p.PEEP - 1, P);
  }
}

// ─── WaveCanvas ───────────────────────────────────────────────────────────────

interface ScanRef {
  writeX: number;
  prevY: number | null;
  phase: number;
  lastTime: number;
}

interface WaveCanvasProps {
  type: 'pressure' | 'flow' | 'volume';
  color: string;
  label: string;
  unit: string;
  inspPause: boolean;
  expPause: boolean;
  height?: number;
}

function WaveCanvas({ type, color, label, unit, inspPause, expPause, height = 88 }: WaveCanvasProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stRef      = useRef<ScanRef>({ writeX: 0, prevY: null, phase: 0, lastTime: 0 });
  const rafRef     = useRef<number>(0);
  const pauseRef   = useRef({ insp: inspPause, exp: expPause });

  useEffect(() => { pauseRef.current = { insp: inspPause, exp: expPause }; }, [inspPause, expPause]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    if (W < 2) { rafRef.current = requestAnimationFrame(draw); return; }

    const ts  = performance.now();
    const dt  = Math.min((ts - stRef.current.lastTime) / 1000, 0.05);
    stRef.current.lastTime = ts;

    const vit  = usePatientStore.getState().vitals;
    const vent = usePatientStore.getState().ventilator;

    const rr      = Math.max(4, vit.respiratoryRate || vent.setRR || 14);
    const T       = 60 / rr;
    const tI_frac = vent.ieRatio / (1 + vent.ieRatio);
    const fl_s    = Math.max(0.1, vent.flowRate / 60);

    // Estimar R y C desde vitales actuales
    const R    = Math.max(2, Math.min(40, (vit.ppico - vit.pplat) / fl_s));
    const C_mL = Math.max(10, Math.min(200, vent.vt / Math.max(1, vit.pplat - vent.peep)));
    const C_L  = C_mL / 1000;
    const tau  = Math.max(0.05, R * C_L);

    const params: WaveParams = {
      mode: vent.mode, R, C_mL,
      PEEP: vent.peep, VT: vent.vt,
      pControl: vent.pControl,
      flowRate: vent.flowRate,
      tI_frac, T,
      inspPause: pauseRef.current.insp,
      expPause:  pauseRef.current.exp,
    };

    // Escalas dinámicas
    let scaleMin: number, scaleMax: number;
    if (type === 'pressure') {
      const pPk = vent.mode === 'PC-AC'
        ? vent.peep + vent.pControl
        : Math.max(vit.ppico || 25, 15);
      scaleMin = Math.max(0, vent.peep - 2);
      scaleMax = pPk + 6;
    } else if (type === 'flow') {
      const maxInsp = vent.mode === 'PC-AC'
        ? (vent.pControl / Math.max(0.5, R)) * 60 * 1.3
        : vent.flowRate * 1.2;
      const maxExp  = (vent.vt / 1000 / tau) * 60 * 1.1;
      scaleMin = -Math.max(maxExp, maxInsp * 0.8);
      scaleMax =  maxInsp;
    } else {
      const VT_ach = vent.mode === 'PC-AC'
        ? C_L * vent.pControl * (1 - Math.exp(-(tI_frac * T) / tau)) * 1000
        : vent.vt;
      scaleMin = 0;
      scaleMax = Math.max(50, VT_ach * 1.2);
    }
    const scaleRange = Math.max(1, scaleMax - scaleMin);

    const SCAN_PX_S = 80;
    const freqHz    = 1 / T;
    const pxStep    = Math.max(1, Math.round(SCAN_PX_S * dt));

    for (let i = 0; i < pxStep; i++) {
      stRef.current.phase = (stRef.current.phase + freqHz / SCAN_PX_S) % 1;
      const ph = stRef.current.phase;
      const x  = stRef.current.writeX;

      const eraseX = (x + 10) % W;
      ctx.fillStyle = C.bgPanel;
      ctx.fillRect(eraseX, 0, 12, H);
      // Línea de cero (importante para flujo)
      const zeroNorm = (0 - scaleMin) / scaleRange;
      const zeroY    = Math.round(H - zeroNorm * H * 0.82 - H * 0.09);
      ctx.fillStyle  = C.grid;
      ctx.fillRect(eraseX, Math.max(0, Math.min(H - 1, zeroY)), 12, 1);

      const raw  = computeWave(ph, type, params);
      const norm = (raw - scaleMin) / scaleRange;
      const y    = Math.round(H - norm * H * 0.82 - H * 0.09);
      const yC   = Math.max(1, Math.min(H - 1, y));

      ctx.fillStyle = color;
      if (stRef.current.prevY !== null) {
        const y1 = Math.min(stRef.current.prevY, yC);
        const y2 = Math.max(stRef.current.prevY, yC);
        ctx.fillRect(x, y1, 2, Math.max(2, y2 - y1 + 1));
      } else {
        ctx.fillRect(x, yC, 2, 2);
      }
      stRef.current.prevY  = yC;
      stRef.current.writeX = (x + 1) % W;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [type, color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) {
        canvas.width  = w;
        canvas.height = height;
        stRef.current.prevY = null;
      }
    });
    ro.observe(canvas.parentElement!);
    stRef.current.lastTime = performance.now();
    rafRef.current = requestAnimationFrame(draw);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderBottom: `1px solid ${C.grid}` }}>
      <div style={{
        position: 'absolute', top: 4, left: 8, zIndex: 1,
        fontSize: '0.4rem', fontWeight: 700, letterSpacing: '0.13em',
        color, fontFamily: 'monospace', textShadow: `0 0 10px ${color}`,
      }}>
        {label} <span style={{ color: C.dimText, fontWeight: 400 }}>{unit}</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', background: C.bgPanel }}
      />
    </div>
  );
}

// ─── MonCard ──────────────────────────────────────────────────────────────────

function MonCard({ label, value, unit, alarm = false, warn = false }: {
  label: string; value: string | number; unit: string;
  alarm?: boolean; warn?: boolean;
}) {
  const col = alarm ? C.lcdAlarm : warn ? C.lcdWarn : C.lcd;
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${alarm ? '#4a1010' : C.border}`,
      borderRadius: 5, padding: '4px 6px',
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <span style={{ fontSize: '0.35rem', fontWeight: 700, letterSpacing: '0.1em', color: C.dimText, fontFamily: 'monospace' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{
          fontSize: '0.95rem', fontWeight: 900, fontFamily: 'monospace',
          color: col, lineHeight: 1,
          textShadow: alarm ? `0 0 10px ${C.lcdAlarm}` : `0 0 6px ${C.lcd}44`,
        }}>
          {value}
        </span>
        <span style={{ fontSize: '0.35rem', color: C.dimText, fontFamily: 'monospace' }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── SpinParam ────────────────────────────────────────────────────────────────

function SpinParam({ label, value, unit, min, max, step, onSet }: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onSet: (v: number) => void;
}) {
  const dec = () => onSet(Math.max(min, Math.round((value - step) / step) * step));
  const inc = () => onSet(Math.min(max, Math.round((value + step) / step) * step));
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: `1px solid ${C.border}`, padding: '4px 0',
    }}>
      <span style={{ fontSize: '0.42rem', color: C.midText, letterSpacing: '0.08em', fontFamily: 'monospace', minWidth: 46 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button type="button" onClick={dec}
          style={{ width: 18, height: 18, background: '#181828', border: `1px solid ${C.border}`, borderRadius: 3, color: C.midText, cursor: 'pointer', fontSize: '0.65rem', lineHeight: 1 }}>
          −
        </button>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.brightText, fontFamily: 'monospace', minWidth: 34, textAlign: 'center' }}>
          {value}
        </span>
        <button type="button" onClick={inc}
          style={{ width: 18, height: 18, background: '#181828', border: `1px solid ${C.border}`, borderRadius: 3, color: C.midText, cursor: 'pointer', fontSize: '0.65rem', lineHeight: 1 }}>
          +
        </button>
        <span style={{ fontSize: '0.36rem', color: C.dimText, fontFamily: 'monospace', minWidth: 24 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VentilatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Componente principal (Modal) ─────────────────────────────────────────────

export default function VentilatorPanel({ isOpen, onClose }: VentilatorPanelProps) {
  const [inspPause,       setInspPause]       = useState(false);
  const [expPause,        setExpPause]         = useState(false);
  const [bottomTab,       setBottomTab]        = useState<'maniobras' | 'reclutamiento'>('maniobras');
  const [recruitActive,   setRecruitActive]    = useState(false);
  const [recruitProgress, setRecruitProgress]  = useState(0);
  const [recruitEffect,   setRecruitEffect]    = useState<'none' | 'applied' | 'fibrotic'>('none');

  const v                     = usePatientStore(s => s.vitals);
  const vent                  = usePatientStore(s => s.ventilator);
  const setVentilatorSettings = usePatientStore(s => s.setVentilatorSettings);
  const setVentMode           = usePatientStore(s => s.setVentMode);
  const toggleVentPause       = usePatientStore(s => s.toggleVentilatorPause);
  const setO2Support          = usePatientStore(s => s.setO2Support);
  const ards                  = usePathologyStore(s => s.ards);
  const modifiers             = usePathologyStore(s => s.modifiers);
  const updateModifiers       = usePathologyStore(s => s.updateModifiers);

  // Controles que se deshabilitan según o2Support
  const isInvasive    = vent.o2Support === 'INVASIVE_ARM';
  const isNIV         = vent.o2Support === 'NIV_CPAP' || vent.o2Support === 'NIV_BIPAP';
  const showVentCtrls = isInvasive || isNIV;
  const showVtPinsp   = isInvasive;    // Vt/Pinsp sólo ARM invasivo

  // Pausar simulación al abrir (vía isPaused), reanudar al cerrar
  useEffect(() => {
    const store = usePatientStore.getState();
    if (isOpen && !store.ventilator.isPaused)  store.toggleVentilatorPause();
    if (!isOpen && store.ventilator.isPaused)  store.toggleVentilatorPause();
  }, [isOpen]);

  // Timer de maniobra de reclutamiento (40 s)
  useEffect(() => {
    if (!recruitActive) return;
    const iv = setInterval(() => {
      setRecruitProgress(prev => {
        if (prev >= 40) {
          clearInterval(iv);
          setRecruitActive(false);
          applyRecruitmentEffect();
          return 40;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitActive]);

  const applyRecruitmentEffect = () => {
    const ardsState = usePathologyStore.getState().ards;
    const vitState  = usePatientStore.getState().vitals;
    const mods      = usePathologyStore.getState().modifiers;

    if (!ardsState.isActive) {
      // Sin ARDS: leve mejora de oxigenación
      usePatientStore.getState().updateVitals({
        paO2: Math.min(110, vitState.paO2 + 8),
      });
      setRecruitEffect('applied');
      return;
    }

    const isFibrotic = ardsState.severity >= 0.75;

    if (isFibrotic) {
      // ARDS fibrótico: sin mejora de compliance, colapso hemodinámico
      usePatientStore.getState().updateVitals({
        meanArterialPressure: Math.max(40, vitState.meanArterialPressure - 16),
        systolicBP:           Math.max(60, vitState.systolicBP  - 22),
        diastolicBP:          Math.max(30, vitState.diastolicBP - 10),
        cardiacOutput:        Math.max(1.0, vitState.cardiacOutput - 0.9),
        cvp:                  Math.min(20, vitState.cvp + 4),
        strokeVolume:         Math.max(20, vitState.strokeVolume - 15),
      });
      setRecruitEffect('fibrotic');
    } else {
      // ARDS exudativo: reclutamiento efectivo
      usePatientStore.getState().updateVitals({
        paO2:    Math.min(200, vitState.paO2  + 22),
        spo2:    Math.min(99,  vitState.spo2  + 4),
        pplat:   Math.max(10,  vitState.pplat - 3),
        ppico:   Math.max(vitState.pplat, vitState.ppico - 2),
        deltaP:  Math.max(5,   vitState.deltaP - 3),
      });
      updateModifiers({
        ...mods,
        complianceMultiplier: Math.min(1.0, mods.complianceMultiplier + 0.22),
        lungShuntFraction:    Math.max(0.05, mods.lungShuntFraction - 0.10),
      });
      setRecruitEffect('applied');
    }
  };

  const handleClose = () => {
    setInspPause(false);
    setExpPause(false);
    onClose();
  };

  if (!isOpen) return null;

  // Valores derivados
  const rr        = Math.round(v.respiratoryRate) || vent.setRR;
  const ppeak     = Math.round(v.ppico)  || 0;
  const pplat     = Math.round(v.pplat)  || 0;
  const deltaP    = Math.round(v.deltaP) || 0;
  const vte       = vent.vt;
  const ve        = ((rr * vte) / 1000).toFixed(1);
  const fio2Pct   = Math.round(vent.fio2 * 100);
  const modeLabel = MODES.find(m => m.key === vent.mode)?.label ?? 'VCV';
  const ppeakAlarm = ppeak > 40;
  const ppeakWarn  = ppeak > 30 && !ppeakAlarm;
  const dpAlarm    = deltaP > 15;

  // ARDS info para reclutamiento
  const ardsActive   = ards.isActive;
  const isFibrotic   = ards.severity >= 0.75;
  const isExudative  = ardsActive && !isFibrotic;
  const ardsLabel    = !ardsActive ? 'Sin ARDS' : isFibrotic ? 'SDRA Fibrótico' : 'SDRA Exudativo';
  const ardsColor    = !ardsActive ? C.midText : isFibrotic ? C.lcdAlarm : C.lcdWarn;

  return (
    // Overlay oscuro
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.80)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Modal panel */}
      <div style={{
        width: '94vw', maxWidth: 1300,
        height: '92vh', maxHeight: 900,
        background: C.bgModal,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'monospace',
        boxShadow: '0 0 60px rgba(0,0,0,0.9), 0 0 120px rgba(0,0,0,0.7)',
      }}>

        {/* ── Header ── */}
        <div style={{
          background: C.bg, flexShrink: 0,
          borderBottom: `1px solid ${C.sep}`,
          padding: '6px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 10px ${C.green}` }} />
            <span style={{ fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.2em', color: C.brightText }}>
              UNIDAD DE RESPIRACIÓN MECÁNICA
            </span>
            <div style={{ background: '#0d1f0d', border: `1px solid #1a4a1a`, borderRadius: 4, padding: '2px 8px', fontSize: '0.5rem', fontWeight: 900, color: C.green }}>
              {modeLabel}
            </div>
            {ppeakAlarm && (
              <div style={{ background: '#3a0a0a', border: `1px solid #8a1a1a`, borderRadius: 4, padding: '2px 8px', fontSize: '0.46rem', fontWeight: 700, color: C.lcdAlarm }}>
                ⚠ ALARMA PRESIÓN
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={toggleVentPause}
              style={{
                background: vent.isPaused ? '#1a1500' : '#001a0a',
                border: `1px solid ${vent.isPaused ? '#f5c518' : C.green}`,
                borderRadius: 5, cursor: 'pointer',
                fontSize: '0.42rem', fontWeight: 900, letterSpacing: '0.12em',
                color: vent.isPaused ? '#f5c518' : C.green,
                padding: '3px 10px', fontFamily: 'monospace',
              }}
            >
              {vent.isPaused ? '⏸ PAUSADO' : '▶ EJECUTANDO'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: '#1a1a2a', border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.midText, cursor: 'pointer',
                fontSize: '0.75rem', padding: '2px 10px', lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Cuerpo principal ── */}
        <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0, overflow: 'hidden' }}>

          {/* ─ IZQUIERDA: Parámetros ─ */}
          <div style={{
            width: 160, flexShrink: 0,
            background: C.bg,
            borderRight: `1px solid ${C.sep}`,
            padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 0,
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '0.36rem', fontWeight: 900, letterSpacing: '0.14em', color: C.dimText, marginBottom: 6 }}>
              PARÁMETROS SETEADOS
            </div>

            {/* Selector de Soporte O₂ (Fase 4) */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.36rem', color: C.dimText, marginBottom: 4, letterSpacing: '0.1em' }}>SOPORTE DE OXÍGENO</div>
              <select
              title="Soporte de oxígeno"
                value={vent.o2Support}
                onChange={e => setO2Support(e.target.value as import('../store/usePatientStore').O2Support)}
                style={{
                  width: '100%', background: '#14141e', border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.brightText, fontSize: '0.38rem',
                  padding: '3px 4px', fontFamily: 'monospace', cursor: 'pointer',
                }}
              >
                <option value="NONE">NONE — Aire ambiente</option>
                <option value="NASAL_CANNULA">Cánula nasal</option>
                <option value="SIMPLE_MASK">Mascarilla simple</option>
                <option value="RESERVOIR_MASK">Mascarilla reservorio</option>
                <option value="HFNC">HFNC</option>
                <option value="NIV_CPAP">NIV — CPAP</option>
                <option value="NIV_BIPAP">NIV — BiPAP</option>
                <option value="INVASIVE_ARM">ARM Invasivo</option>
              </select>
              {!isInvasive && (
                <div style={{ fontSize: '0.32rem', color: C.accent, marginTop: 2 }}>
                  FiO₂ efectiva: {Math.round((vent.fio2Effective ?? 0.21) * 100)}%
                </div>
              )}
            </div>

            {/* Selector de Modo (sólo si es invasivo o NIV) */}
            {showVentCtrls && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.36rem', color: C.dimText, marginBottom: 4, letterSpacing: '0.1em' }}>MODO VENTILATORIO</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {MODES.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setVentMode(m.key)}
                    style={{
                      padding: '2px 6px', fontSize: '0.4rem', fontWeight: 700,
                      fontFamily: 'monospace', cursor: 'pointer', borderRadius: 4,
                      border: `1px solid ${vent.mode === m.key ? C.green : C.border}`,
                      background: vent.mode === m.key ? '#0d2a1a' : '#14141e',
                      color: vent.mode === m.key ? C.green : C.midText,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            )}  {/* fin showVentCtrls — modo ventilatorio */}

            {/* Controles de presión/volumen — sólo ARM invasivo */}
            {showVtPinsp && (
              <>
                <SpinParam label="VT"    value={vent.vt}      unit="mL"     min={200} max={800} step={25}  onSet={v => setVentilatorSettings({ vt: v })} />
                <SpinParam label="FR"    value={vent.setRR}   unit="br/m"   min={4}   max={40}  step={1}   onSet={v => setVentilatorSettings({ setRR: v })} />
                <SpinParam label="PEEP"  value={vent.peep}    unit="cmH₂O" min={0}   max={24}  step={1}   onSet={v => setVentilatorSettings({ peep: v })} />
                <SpinParam label="FLUJO" value={vent.flowRate} unit="L/min" min={20}  max={80}  step={5}   onSet={v => setVentilatorSettings({ flowRate: v })} />
                {(vent.mode === 'PSV' || vent.mode === 'CPAP') && (
                  <SpinParam label="P.SUP" value={vent.pressureSupport} unit="cmH₂O" min={0} max={30} step={2} onSet={v => setVentilatorSettings({ pressureSupport: v })} />
                )}
                {vent.mode === 'PC-AC' && (
                  <SpinParam label="PC"   value={vent.pControl} unit="cmH₂O" min={5} max={40} step={2} onSet={v => setVentilatorSettings({ pControl: v })} />
                )}
              </>
            )}

            {/* PEEP para NIV */}
            {isNIV && (
              <SpinParam label="PEEP/EPAP" value={vent.peep} unit="cmH₂O" min={0} max={20} step={1} onSet={v => setVentilatorSettings({ peep: v })} />
            )}

            {/* FiO₂ — disponible para HFNC, NIV y ARM */}
            {showVentCtrls && (
            <div style={{ borderBottom: `1px solid ${C.border}`, padding: '5px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.42rem', color: C.midText, letterSpacing: '0.08em' }}>FiO₂</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.brightText }}>{fio2Pct}%</span>
              </div>
              <input
                title="FiO₂"
                type="range" min={21} max={100} step={1} value={fio2Pct}
                onChange={e => setVentilatorSettings({ fio2: parseInt(e.target.value) / 100 })}
                style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }}
              />
            </div>
            )}

            {/* I:E — sólo ARM invasivo */}
            {showVtPinsp && (
            <div style={{ borderBottom: `1px solid ${C.border}`, padding: '5px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.42rem', color: C.midText, letterSpacing: '0.08em' }}>I:E</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {([0.5, 0.33, 1.0] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setVentilatorSettings({ ieRatio: r })}
                      style={{
                        padding: '1px 5px', fontSize: '0.38rem', fontWeight: 700,
                        cursor: 'pointer', borderRadius: 3, fontFamily: 'monospace',
                        border: `1px solid ${vent.ieRatio === r ? '#f5c518' : C.border}`,
                        background: vent.ieRatio === r ? '#1a1500' : '#14141e',
                        color: vent.ieRatio === r ? '#f5c518' : C.midText,
                      }}
                    >
                      {r === 0.5 ? '1:2' : r === 0.33 ? '1:3' : '1:1'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* ─ CENTRO: Curvas dinámicas (engine ring buffer) ─ */}
          <div style={{
            flex: 1, minWidth: 0,
            background: C.bgPanel,
            display: 'flex', flexDirection: 'column',
            borderRight: `1px solid ${C.sep}`,
            overflow: 'hidden',
          }}>
            <VentilatorCurves height={88} />
          </div>

          {/* ─ DERECHA: Monitoreo ─ */}
          <div style={{
            width: 165, flexShrink: 0,
            background: C.bg,
            padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 5,
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '0.36rem', fontWeight: 900, letterSpacing: '0.14em', color: C.dimText }}>
              MONITOREO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <MonCard label="FR TOTAL" value={rr}       unit="br/m" />
              <MonCard label="VTE"      value={vte}      unit="mL" />
              <MonCard label="PPICO"    value={ppeak}    unit="cmH₂O" alarm={ppeakAlarm} warn={ppeakWarn} />
              <MonCard label="PPLAT"    value={pplat}    unit="cmH₂O" />
              <MonCard label="Ve"       value={ve}       unit="L/m" />
              <MonCard label="ΔP"       value={deltaP}   unit="cmH₂O" alarm={dpAlarm} />
              <MonCard label="FiO₂"     value={`${fio2Pct}%`} unit="" />
              <MonCard label="PEEP"     value={vent.peep} unit="cmH₂O" />
            </div>

            {deltaP > 0 && (
              <div style={{ marginTop: 2 }}>
                <div style={{ fontSize: '0.33rem', color: C.dimText, marginBottom: 2, letterSpacing: '0.1em' }}>ΔP RISK</div>
                <div style={{ height: 5, background: '#1a1a26', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min(100, (deltaP / 25) * 100)}%`,
                    background: deltaP > 20 ? '#ff4040' : deltaP > 15 ? '#ffcc00' : '#34d399',
                    transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: '0.3rem', color: C.dimText, marginTop: 1 }}>
                  {deltaP <= 12 ? 'ÓPTIMO' : deltaP <= 15 ? 'ACEPTABLE' : deltaP <= 20 ? '⚠ ELEVADO' : '✕ CRÍTICO'}
                </div>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 5, marginTop: 2 }}>
              <div style={{ fontSize: '0.33rem', color: C.dimText, letterSpacing: '0.1em' }}>POTENCIA MECÁNICA</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{
                  fontSize: '0.85rem', fontWeight: 900, fontFamily: 'monospace',
                  color: v.mechanicalPower > 17 ? C.lcdAlarm : v.mechanicalPower > 12 ? C.lcdWarn : C.lcd,
                }}>
                  {(v.mechanicalPower || 0).toFixed(1)}
                </span>
                <span style={{ fontSize: '0.33rem', color: C.dimText }}>J/min</span>
              </div>
            </div>

            {/* R y C estimados */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 5, marginTop: 2 }}>
              <div style={{ fontSize: '0.33rem', color: C.dimText, letterSpacing: '0.1em', marginBottom: 3 }}>MECÁNICA PULMONAR</div>
              {(() => {
                const fl_s = Math.max(0.1, vent.flowRate / 60);
                const R_est = Math.max(2, Math.min(40, (v.ppico - v.pplat) / fl_s));
                const C_est = Math.max(10, Math.min(200, vent.vt / Math.max(1, v.pplat - vent.peep)));
                const tau_est = (R_est * C_est / 1000).toFixed(2);
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 5px' }}>
                      <div style={{ fontSize: '0.3rem', color: C.dimText }}>R</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: C.brightText, fontFamily: 'monospace' }}>{R_est.toFixed(0)}</div>
                      <div style={{ fontSize: '0.28rem', color: C.dimText }}>cmH₂O·s/L</div>
                    </div>
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 5px' }}>
                      <div style={{ fontSize: '0.3rem', color: C.dimText }}>C</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: C.brightText, fontFamily: 'monospace' }}>{C_est.toFixed(0)}</div>
                      <div style={{ fontSize: '0.28rem', color: C.dimText }}>mL/cmH₂O</div>
                    </div>
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 5px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '0.3rem', color: C.dimText }}>τ = R×C</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: C.accent, fontFamily: 'monospace' }}>{tau_est} s</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Sección inferior: tabs MANIOBRAS / RECLUTAMIENTO ── */}
        <div style={{ flexShrink: 0, borderTop: `2px solid ${C.sep}`, background: C.bg }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.sep}` }}>
            {(['maniobras', 'reclutamiento'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setBottomTab(tab)}
                style={{
                  padding: '5px 18px',
                  fontSize: '0.4rem', fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: bottomTab === tab ? `2px solid ${C.accent}` : '2px solid transparent',
                  color: bottomTab === tab ? C.brightText : C.dimText,
                  marginBottom: -1,
                  fontFamily: 'monospace',
                }}
              >
                {tab === 'maniobras' ? 'MANIOBRAS DE RESPIRACIÓN' : 'RECLUTAMIENTO ALVEOLAR'}
              </button>
            ))}

            {/* Botón cerrar / guardar al final */}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleClose}
              style={{
                margin: '4px 10px', padding: '3px 16px',
                background: '#14201a', border: `1px solid ${C.green}`,
                borderRadius: 5, color: C.green,
                fontSize: '0.42rem', fontWeight: 900, letterSpacing: '0.12em',
                cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              GUARDAR Y REANUDAR
            </button>
          </div>

          {/* Tab content */}
          <div style={{ padding: '10px 16px', minHeight: 100, maxHeight: 140, overflow: 'hidden' }}>

            {/* ─── MANIOBRAS ─── */}
            {bottomTab === 'maniobras' && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                {/* Pausa Inspiratoria */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', minWidth: 120 }}>
                  <button
                    type="button"
                    onMouseDown={() => setInspPause(true)}
                    onMouseUp={() => setInspPause(false)}
                    onTouchStart={() => setInspPause(true)}
                    onTouchEnd={() => setInspPause(false)}
                    style={{
                      padding: '8px 16px',
                      background: inspPause ? '#1a1500' : '#14141e',
                      border: `2px solid ${inspPause ? '#f5c518' : C.border}`,
                      borderRadius: 7, cursor: 'pointer',
                      fontSize: '0.48rem', fontWeight: 900, letterSpacing: '0.1em',
                      color: inspPause ? '#f5c518' : C.midText,
                      fontFamily: 'monospace',
                      boxShadow: inspPause ? '0 0 15px rgba(245,197,24,0.3)' : 'none',
                      transition: 'all 0.1s',
                      minWidth: 110,
                    }}
                  >
                    {inspPause ? '⏸ EN PAUSA' : '⏸ PAUSA INSP'}
                  </button>
                  <div style={{ fontSize: '0.34rem', color: C.dimText, textAlign: 'center', lineHeight: 1.4 }}>
                    Mantener presionado<br />
                    Flujo→0 · Revela <span style={{ color: '#f5c518' }}>Pplat</span>
                  </div>
                  {inspPause && (
                    <div style={{ background: '#1a1500', border: '1px solid #f5c51866', borderRadius: 4, padding: '2px 8px', fontSize: '0.38rem', color: '#f5c518' }}>
                      Pplat ≈ {Math.round(v.pplat)} cmH₂O
                    </div>
                  )}
                </div>

                <div style={{ width: 1, height: 80, background: C.sep }} />

                {/* Pausa Espiratoria */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', minWidth: 120 }}>
                  <button
                    type="button"
                    onMouseDown={() => setExpPause(true)}
                    onMouseUp={() => setExpPause(false)}
                    onTouchStart={() => setExpPause(true)}
                    onTouchEnd={() => setExpPause(false)}
                    style={{
                      padding: '8px 16px',
                      background: expPause ? '#001220' : '#14141e',
                      border: `2px solid ${expPause ? C.volume : C.border}`,
                      borderRadius: 7, cursor: 'pointer',
                      fontSize: '0.48rem', fontWeight: 900, letterSpacing: '0.1em',
                      color: expPause ? C.volume : C.midText,
                      fontFamily: 'monospace',
                      boxShadow: expPause ? `0 0 15px ${C.volume}44` : 'none',
                      transition: 'all 0.1s',
                      minWidth: 110,
                    }}
                  >
                    {expPause ? '⏸ EN PAUSA' : '⏸ PAUSA ESP'}
                  </button>
                  <div style={{ fontSize: '0.34rem', color: C.dimText, textAlign: 'center', lineHeight: 1.4 }}>
                    Mantener presionado<br />
                    Flujo→0 · Revela <span style={{ color: C.volume }}>Auto-PEEP</span>
                  </div>
                  {expPause && (
                    <div style={{ background: '#001218', border: `1px solid ${C.volume}44`, borderRadius: 4, padding: '2px 8px', fontSize: '0.38rem', color: C.volume }}>
                      PEEP total ≈ {Math.round(vent.peep)} cmH₂O
                    </div>
                  )}
                </div>

                <div style={{ width: 1, height: 80, background: C.sep }} />

                {/* Leyenda Ecuación de Movimiento */}
                <div style={{ flex: 1, fontSize: '0.34rem', color: C.dimText, lineHeight: 1.8, fontFamily: 'monospace' }}>
                  <div style={{ fontWeight: 700, color: C.midText, marginBottom: 4, fontSize: '0.36rem', letterSpacing: '0.1em' }}>
                    ECUACIÓN DE MOVIMIENTO PULMONAR
                  </div>
                  <div>P<sub>aw</sub>(t) = V(t) / <span style={{ color: C.volume }}>C</span> + <span style={{ color: C.flow }}>V̇(t)</span> × <span style={{ color: C.pressure }}>R</span> + PEEP</div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ color: C.pressure }}>R</span> = (Ppico−Pplat) / Flujo·s⁻¹
                    &nbsp;·&nbsp;
                    <span style={{ color: C.volume }}>C</span> = VT / (Pplat−PEEP)
                  </div>
                  <div style={{ marginTop: 2 }}>
                    τ = <span style={{ color: C.accent }}>R×C</span> = constante de tiempo espiratoria
                  </div>
                </div>
              </div>
            )}

            {/* ─── RECLUTAMIENTO ─── */}
            {bottomTab === 'reclutamiento' && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                {/* Botón de maniobra */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', minWidth: 140 }}>
                  <button
                    type="button"
                    disabled={recruitActive}
                    onClick={() => {
                      setRecruitProgress(0);
                      setRecruitEffect('none');
                      setRecruitActive(true);
                    }}
                    style={{
                      padding: '8px 14px',
                      background: recruitActive ? '#0a1a0a' : '#0e1a0e',
                      border: `2px solid ${recruitActive ? C.green : '#1a4a1a'}`,
                      borderRadius: 7, cursor: recruitActive ? 'not-allowed' : 'pointer',
                      fontSize: '0.44rem', fontWeight: 900, letterSpacing: '0.08em',
                      color: recruitActive ? C.green : '#2a7a2a',
                      fontFamily: 'monospace', minWidth: 130,
                    }}
                  >
                    {recruitActive ? `MANIOBRA ${recruitProgress}/40s` : 'INICIAR RECLUT.'}
                  </button>
                  {/* Barra de progreso */}
                  {(recruitActive || recruitProgress > 0) && (
                    <div style={{ width: 130, height: 5, background: '#1a1a26', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${(recruitProgress / 40) * 100}%`,
                        background: C.green, transition: 'width 0.8s',
                      }} />
                    </div>
                  )}
                  <div style={{ fontSize: '0.32rem', color: C.dimText, textAlign: 'center', lineHeight: 1.4 }}>
                    40 cmH₂O × 40 segundos
                  </div>
                </div>

                <div style={{ width: 1, height: 80, background: C.sep }} />

                {/* Estado ARDS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                  <div style={{ fontSize: '0.34rem', color: C.dimText, letterSpacing: '0.1em', fontWeight: 700 }}>ESTADO PATOLÓGICO</div>
                  <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 8px' }}>
                    <div style={{ fontSize: '0.36rem', fontWeight: 700, color: ardsColor, marginBottom: 2 }}>{ardsLabel}</div>
                    {ardsActive && (
                      <div style={{ fontSize: '0.32rem', color: C.dimText }}>
                        Severidad: {Math.round(ards.severity * 100)}%<br/>
                        {isFibrotic ? 'Fase fibrótica avanzada' : 'Fase exudativa'}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ width: 1, height: 80, background: C.sep }} />

                {/* Resultado predicho */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '0.34rem', color: C.dimText, letterSpacing: '0.1em', fontWeight: 700 }}>RESPUESTA ESPERADA</div>
                  {recruitEffect === 'none' ? (
                    <div style={{ fontSize: '0.34rem', color: C.dimText, lineHeight: 1.6, fontFamily: 'monospace' }}>
                      {isExudative && (
                        <span style={{ color: C.lcdWarn }}>
                          SDRA exudativo: ↑Compliance +20% · ↑PaO₂/FiO₂<br/>Apertura de unidades alveolares colapsadas
                        </span>
                      )}
                      {isFibrotic && (
                        <span style={{ color: C.lcdAlarm }}>
                          SDRA fibrótico: Compliance sin cambio<br/>Riesgo: ↓PAM · ↓GC por ↑presión intratorácica
                        </span>
                      )}
                      {!ardsActive && (
                        <span style={{ color: C.midText }}>Sin ARDS activo — efecto mínimo esperado</span>
                      )}
                    </div>
                  ) : recruitEffect === 'applied' ? (
                    <div style={{ background: '#0a1a0a', border: `1px solid ${C.green}44`, borderRadius: 5, padding: '5px 8px' }}>
                      <div style={{ fontSize: '0.38rem', fontWeight: 700, color: C.green }}>✓ RECLUTAMIENTO EFECTIVO</div>
                      <div style={{ fontSize: '0.32rem', color: '#6adf9a', marginTop: 2 }}>
                        PaO₂ ↑22 mmHg · Compliance ↑20%<br/>Shunt pulmonar reducido
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#1a0a0a', border: `1px solid ${C.lcdAlarm}44`, borderRadius: 5, padding: '5px 8px' }}>
                      <div style={{ fontSize: '0.38rem', fontWeight: 700, color: C.lcdAlarm }}>✕ COMPROMISO HEMODINÁMICO</div>
                      <div style={{ fontSize: '0.32rem', color: '#ff9090', marginTop: 2 }}>
                        PAM ↓16 mmHg · GC ↓0.9 L/min<br/>Retorno venoso comprometido por ↑P.intratorácica
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>{/* fin modal panel */}
    </div>
  );
}
