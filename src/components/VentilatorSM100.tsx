// src/components/VentilatorSM100.tsx
//
// ═══════════════════════════════════════════════════════════════════════════════
//  VentilatorSM100 — Simulador SM-100 (interfaz ARM UCI)
//  Dark mode, Glass UI, acentos ciano/verde/rojo.
//  Consume el motor de ventilación vía RespiratoryEngine.getVentEngine().
// ═══════════════════════════════════════════════════════════════════════════════
/* eslint-disable react/forbid-dom-props */

import React, { useEffect, useRef, useState } from 'react';
import { RespiratoryEngine } from '../core/RespiratoryEngine';
import type { VentSettings, VentMode } from '../core/RespiratoryEngine';
import { usePatientStore } from '../store/usePatientStore';
import type { Ventilator } from '../store/usePatientStore';
import { GeometricLung } from './GeometricLung';
import { useShallow } from 'zustand/react/shallow';
import { useTimeStore } from '../store/useTimeStore';
import {
  useManeuverHistoryStore,
  fmtSimTime,
  maneuverInterpInsp,
  maneuverInterpExp,
  maneuverInterpColor,
  type ManeuverRecord,
} from '../store/useManeuverHistoryStore';

// ─── WaveformPanel: canvas scan-line desacoplado de speedMultiplier ──────────
//
//  Mapeo tiempo→pixel basado en simTime absoluto del engine:
//    pxPerSec = width / WINDOW_VISUAL_S (5 s)
//    x(t) = (t × pxPerSec) % width  →  barrido modular UCI
//
//  Throttle FPS por velocidad (5.B):
//    x1   → 60 fps   x2-9 → 30 fps   x10-29 → 15 fps   x30+ → 8 fps
//
//  Overlay PAUSADO cuando isRunning=false (5.C).
//  Badge "MOTOR ACTIVO" cuando speed≥30 (5.D).

const WINDOW_VISUAL_S = 5;
const ERASE_W_PX      = 24;

interface WaveformPanelProps {
  width: number;
  height: number;
  speed: number;
  isRunning: boolean;
}

const WaveformPanel: React.FC<WaveformPanelProps> = ({ width, height, speed, isRunning }) => {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rafRef         = useRef<number>(0);
  const lastSimTRef    = useRef<number>(0);
  const lastPaintMsRef = useRef<number>(0);
  const speedRef       = useRef(speed);
  const isRunningRef   = useRef(isRunning);

  // Keep refs in sync without remounting canvas
  useEffect(() => { speedRef.current = speed; isRunningRef.current = isRunning; }, [speed, isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = width;
    canvas.height = height;

    const engine = RespiratoryEngine.getInstance().getVentEngine();
    const trackH  = height / 3;
    const halfT   = trackH / 2 - 8;

    ctx.fillStyle = '#030509';
    ctx.fillRect(0, 0, width, height);

    const drawSeps = () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, trackH);   ctx.lineTo(width, trackH);   ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 2*trackH); ctx.lineTo(width, 2*trackH); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('Paw cmH₂O',  6, 14);
      ctx.fillText('Flow L/min', 6, trackH + 14);
      ctx.fillText('Vol mL',     6, 2*trackH + 14);
    };
    drawSeps();

    const pxPerSec = width / WINDOW_VISUAL_S;

    // 5.C — Overlay when simulation is paused
    const drawPausedOverlay = () => {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = 'bold 14px JetBrains Mono, ui-monospace, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('SIMULACIÓN PAUSADA', width / 2, height / 2);
      ctx.restore();
    };

    // 5.D — Badge for high-speed frozen mode
    const drawFrozenIndicator = (spd: number) => {
      ctx.save();
      ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
      ctx.font = 'bold 9px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${spd}× · MOTOR ACTIVO`, width - 8, 12);
      ctx.restore();
    };

    const paint = (nowMs: number) => {
      const spd       = speedRef.current;
      const running   = isRunningRef.current;

      // 5.B — FPS throttle
      const targetFps =
          spd >= 30 ? 8
        : spd >= 10 ? 15
        : spd >= 2  ? 30
        : 60;
      const minFrameMs = 1000 / targetFps;

      if (nowMs - lastPaintMsRef.current < minFrameMs) {
        rafRef.current = requestAnimationFrame(paint);
        return;
      }
      lastPaintMsRef.current = nowMs;

      // 5.C — Paused overlay
      if (!running) {
        drawPausedOverlay();
        rafRef.current = requestAnimationFrame(paint);
        return;
      }

      const wf     = engine.getWaveforms();
      const nowSim = engine.getWaveCursorTime();
      const bufLen = wf.paw.length;

      if (wf.length < 4) { rafRef.current = requestAnimationFrame(paint); return; }

      const prevSim = lastSimTRef.current;
      if (nowSim <= prevSim) { rafRef.current = requestAnimationFrame(paint); return; }

      // ── Cursor ───────────────────────────────────────────────────────────
      const scanPx = Math.floor((nowSim * pxPerSec) % width);
      ctx.fillStyle = '#030509';
      for (let i = 0; i < ERASE_W_PX; i++) {
        ctx.fillRect((scanPx + i) % width, 0, 1, height);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scanPx, 0);
      ctx.lineTo(scanPx, height);
      ctx.stroke();
      drawSeps();

      // ── Autoscale sobre ventana visible ──────────────────────────────────
      const windowStart = nowSim - WINDOW_VISUAL_S;
      let mnPaw = 0, mxPaw = 30, mnFlow = -30, mxFlow = 30, mnVol = 0, mxVol = 600;
      for (let j = 0; j < wf.length; j++) {
        const idx = (wf.writeIdx - wf.length + j + bufLen) % bufLen;
        const t = wf.t[idx];
        if (t < windowStart) continue;
        const pa = wf.paw[idx], fl = wf.flow[idx], vo = wf.vol[idx];
        if (pa < mnPaw) mnPaw = pa; if (pa > mxPaw) mxPaw = pa;
        if (fl < mnFlow) mnFlow = fl; if (fl > mxFlow) mxFlow = fl;
        if (vo < mnVol)  mnVol  = vo; if (vo > mxVol)  mxVol  = vo;
      }
      const rPaw  = Math.max(10,  mxPaw  - mnPaw);
      const rFlow = Math.max(20,  mxFlow - mnFlow);
      const rVol  = Math.max(100, mxVol  - mnVol);
      const pad   = 0.1;

      const toY = (v: number, mn: number, r: number, yC: number) =>
        yC + halfT - ((v - mn + r*pad) / (r*(1+2*pad))) * 2*halfT;

      const drawSeg = (buf: Float32Array, mn: number, r: number, yC: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let moved = false;
        for (let j = 0; j < wf.length; j++) {
          const idx = (wf.writeIdx - wf.length + j + bufLen) % bufLen;
          const t = wf.t[idx];
          if (t < prevSim - 0.02) continue;
          if (t > nowSim + 0.01) break;
          const x = (t * pxPerSec) % width;
          const y = toY(buf[idx], mn, r, yC);
          if (!moved) { ctx.moveTo(x, y); moved = true; } else { ctx.lineTo(x, y); }
        }
        if (moved) ctx.stroke();
      };

      drawSeg(wf.paw,  mnPaw,  rPaw,  trackH*0.5, '#22d3ee');
      drawSeg(wf.flow, mnFlow, rFlow, trackH*1.5, '#a3e635');
      drawSeg(wf.vol,  mnVol,  rVol,  trackH*2.5, '#f59e0b');

      // 5.D — Frozen indicator at high speed
      if (spd >= 30) drawFrozenIndicator(spd);

      lastSimTRef.current = nowSim;
      rafRef.current = requestAnimationFrame(paint);
    };

    rafRef.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);  // speed/isRunning read via refs — no canvas remount needed

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: '#030509' }}
    />
  );
};

// ─── ValBox: recuadro dark para métricas digitales ──────────────────────────

const ValBox: React.FC<{
  label: string; value: string | number; unit: string;
  alert?: boolean; accent?: string;
}> = ({ label, value, unit, alert, accent = '#22d3ee' }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8,
      padding: '12px 14px',
      fontFamily: 'ui-monospace, monospace',
      boxShadow: alert ? '0 0 12px rgba(239,68,68,0.35)' : 'inset 0 0 8px rgba(0,0,0,0.5)',
    }}
  >
    <div style={{ fontSize: 12, color: '#cbd5e1', letterSpacing: '0.14em' }}>{label}</div>
    <div style={{
      fontSize: 24, fontWeight: 800, color: alert ? '#ef4444' : accent,
      marginTop: 3,
    }}>{value}</div>
    <div style={{ fontSize: 11, color: '#94a3b8' }}>{unit}</div>
  </div>
);

// ─── Slider con etiqueta ────────────────────────────────────────────────────

const VentSlider: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; accent?: string;
}> = ({ label, value, min, max, step, unit, onChange, accent = '#22d3ee' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontFamily: 'ui-monospace, monospace',
    }}>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>{label}</span>
      <span style={{ fontSize: 16, color: accent, fontWeight: 700 }}>
        {value.toFixed(step < 1 ? 2 : 0)} {unit}
      </span>
    </div>
    <input type="range"
      title={label}
      min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ accentColor: accent, width: '100%' }}
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export const VentilatorSM100: React.FC = () => {
  const engine = RespiratoryEngine.getInstance();

  // Mirror del state del ventilador → re-render cuando cambian settings
  const [settings, setSettings] = useState<VentSettings>(() => engine.getVentSettings());
  // Breath metrics mirror (polling cada 250ms)
  const [metrics, setMetrics] = useState(() => engine.getVentEngine().getLastBreath());

  // Tab state: CONTROLES | HISTORIAL
  const [tab, setTab] = useState<'controls' | 'history'>('controls');
  const [confirmClear, setConfirmClear] = useState(false);

  // Gas exchange + pause results desde el store (granular para evitar re-renders innecesarios)
  const { paO2, paCO2, pH, spo2, ardsActive, ardsSeverityLevel } = usePatientStore(
    useShallow(s => ({
      paO2: s.vitals.paO2,
      paCO2: s.vitals.paCO2,
      pH: s.vitals.pH,
      spo2: s.vitals.spo2,
      ardsActive: s.vitals.ardsActive,
      ardsSeverityLevel: s.vitals.ardsSeverityLevel,
    }))
  );
  const { measuredCstat, measuredAutoPeep, pauseManeuver } = usePatientStore(
    useShallow(s => ({
      measuredCstat: s.ventilator.measuredCstat,
      measuredAutoPeep: s.ventilator.measuredAutoPeepInspPause,
      pauseManeuver: s.ventilator.pauseManeuver,
    }))
  );
  const triggerPauseManeuver = usePatientStore(s => s.triggerPauseManeuver);
  const ticks      = useTimeStore(s => s.ticks);
  const speed      = useTimeStore(s => s.speedMultiplier);
  const isRunning  = useTimeStore(s => s.isRunning);
  const { records, addRecord, clearHistory } = useManeuverHistoryStore();

  // ── Watch: pause transitions non-NONE → NONE → record ManeuverRecord ─────
  const prevPauseRef = useRef(pauseManeuver);
  const settingsRef  = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const prev = prevPauseRef.current;
    prevPauseRef.current = pauseManeuver;
    if (prev === 'NONE' || pauseManeuver !== 'NONE') return;

    const s = settingsRef.current;
    const ardsSevNum = ardsSeverityLevel === 'SEVERE' ? 1.0
      : ardsSeverityLevel === 'MODERATE' ? 0.67
      : ardsSeverityLevel === 'MILD' ? 0.33
      : 0;

    const base: Omit<ManeuverRecord, 'id' | 'type' | 'values' | 'interpretation'> = {
      simulatedTick: ticks,
      clockTime: fmtSimTime(ticks),
      context: {
        mode:         s.mode,
        vt:           s.vtTarget,
        peepSet:      s.peep,
        rr:           s.rrSet,
        fio2:         s.fio2,
        ardsSeverity: ardsSevNum,
      },
    };

    if (prev === 'INSPIRATORY') {
      const cStat   = measuredCstat > 0 ? measuredCstat : metrics.cStatMeasured;
      const drivingP = cStat > 0 ? Math.round((s.vtTarget / cStat) * 10) / 10 : metrics.drivingPressure;
      const pPlat   = Math.round((drivingP + s.peep) * 10) / 10;
      addRecord({
        ...base,
        type: 'insp_pause',
        values: { pPlat, cStat: Math.round(cStat), drivingP },
        interpretation: maneuverInterpInsp(drivingP, drivingP),
      });
    } else if (prev === 'EXPIRATORY') {
      const autoPEEP  = Math.round((measuredAutoPeep > 0 ? measuredAutoPeep : metrics.autoPeep) * 10) / 10;
      const totalPEEP = Math.round((s.peep + autoPEEP) * 10) / 10;
      addRecord({
        ...base,
        type: 'exp_pause',
        values: { autoPEEP, totalPEEP },
        interpretation: maneuverInterpExp(autoPEEP, autoPEEP),
      });
    }
  }, [pauseManeuver]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(engine.getVentEngine().getLastBreath());
    }, 250);
    return () => clearInterval(id);
  }, [engine]);

  const patch = (p: Partial<VentSettings>) => {
    engine.patchVent(p);
    setSettings({ ...engine.getVentSettings() });

    // Sync params que RespiratoryEngine.update() lee del store y sobreescribiría
    // en el siguiente tick (línea 284: sv800Settings.fio2 = effectiveFiO2).
    // Sin este sync, el slider de FiO2 en el ventilador no persiste.
    const storeUpdate: Partial<Ventilator> = {};
    if (p.fio2 !== undefined) storeUpdate.fio2 = p.fio2;
    if (p.peep !== undefined) storeUpdate.peep = p.peep;
    if (p.vtTarget !== undefined) storeUpdate.vt = p.vtTarget;
    if (p.rrSet !== undefined) storeUpdate.setRR = p.rrSet;
    if (p.pSupport !== undefined) storeUpdate.pressureSupport = p.pSupport;
    if (p.tInspSet !== undefined) storeUpdate.iTime = p.tInspSet;
    if (p.pInspSet !== undefined) storeUpdate.pControl = p.pInspSet;
    if (Object.keys(storeUpdate).length > 0) {
      usePatientStore.getState().setVentilatorSettings(storeUpdate);
    }
  };

  const modes: VentMode[] = ['VCV', 'PCV', 'PRVC', 'PSV', 'AMV'];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: 12,
      background: '#060a12',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#e2e8f0',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      gap: 10,
    }}>

      {/* ─── TAB BAR ─── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {(['controls', 'history'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{
              padding: '7px 20px',
              background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid #22d3ee' : '2px solid transparent',
              color: tab === t ? '#22d3ee' : '#64748b',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'ui-monospace, monospace', marginBottom: -1,
            }}
          >
            {t === 'controls' ? 'CONTROLES' : `HISTORIAL (${records.length})`}
          </button>
        ))}
      </div>

      {/* ─── HISTORIAL TAB ─── */}
      {tab === 'history' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>
              MANIOBRAS DE PAUSA — ÚLTIMAS {records.length}/20
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {!confirmClear ? (
                <button type="button" onClick={() => setConfirmClear(true)}
                  style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 5, fontFamily: 'ui-monospace, monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                  LIMPIAR HISTORIAL
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => { clearHistory(); setConfirmClear(false); }}
                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 5, fontFamily: 'ui-monospace, monospace', background: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5' }}>
                    ¿CONFIRMAR LIMPIAR?
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)}
                    style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 5, fontFamily: 'ui-monospace, monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {records.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
              Sin registros — realice una maniobra de pausa inspiratoria o espiratoria
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', fontSize: 10 }}>HH:MM:SS</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', color: '#475569', fontWeight: 700, fontSize: 10 }}>TIPO</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#475569', fontWeight: 700, fontSize: 10 }}>VALORES</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontWeight: 700, fontSize: 10 }}>INTERPRETACIÓN</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontWeight: 700, fontSize: 10 }}>CONTEXTO</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r: ManeuverRecord) => {
                    const chipColor = maneuverInterpColor(r.interpretation);
                    const isInsp = r.type === 'insp_pause';
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{r.clockTime}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 900,
                            background: isInsp ? 'rgba(245,197,24,0.12)' : 'rgba(34,211,238,0.10)',
                            color: isInsp ? '#f5c518' : '#22d3ee',
                            border: `1px solid ${isInsp ? 'rgba(245,197,24,0.3)' : 'rgba(34,211,238,0.25)'}`,
                          }}>
                            {isInsp ? 'INSP' : 'ESP'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#e2e8f0' }}>
                          {isInsp ? (
                            <span>
                              Pplat <b style={{ color: '#f5c518' }}>{r.values.pPlat}</b>&nbsp;
                              ΔP <b style={{ color: chipColor }}>{r.values.drivingP}</b>&nbsp;
                              Cstat <b style={{ color: '#a3e635' }}>{r.values.cStat}</b>
                            </span>
                          ) : (
                            <span>
                              auto-PEEP <b style={{ color: chipColor }}>{r.values.autoPEEP}</b>&nbsp;
                              total <b style={{ color: '#94a3b8' }}>{r.values.totalPEEP}</b>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: `${chipColor}18`, color: chipColor,
                            border: `1px solid ${chipColor}40`,
                          }}>
                            {r.interpretation}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 10 }}>
                          {r.context.mode} · Vt {r.context.vt} · PEEP {r.context.peepSet} · RR {r.context.rr} · FiO₂ {Math.round(r.context.fio2 * 100)}%
                          {r.context.ardsSeverity > 0 && (
                            <span style={{ color: '#fb923c', marginLeft: 4 }}>
                              [SDRA {Math.round(r.context.ardsSeverity * 100)}%]
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── CONTROLES TAB: existing 3-column layout ─── */}
      {tab === 'controls' && <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 360px',
        gap: 10,
      }}>
      {/* ─── COLUMNA IZQUIERDA: controles ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(34,211,238,0.02))',
          border: '1px solid rgba(34,211,238,0.25)', borderRadius: 10,
        }}>
          <span style={{
            color: '#22d3ee', fontWeight: 800, letterSpacing: '0.1em',
            fontStyle: 'italic', fontSize: 18,
          }}>Simulador SM-100</span>
          <span style={{
            background: 'rgba(163,230,53,0.12)', color: '#a3e635',
            padding: '3px 8px', borderRadius: 6,
            fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700,
          }}>{settings.mode}</span>
        </div>

        {/* Selector de modo */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
        }}>
          {modes.map(m => (
            <button type="button" key={m} onClick={() => patch({ mode: m })}
              style={{
                padding: '11px 0',
                background: settings.mode === m
                  ? 'rgba(34,211,238,0.18)'
                  : 'rgba(255,255,255,0.02)',
                color: settings.mode === m ? '#22d3ee' : '#94a3b8',
                border: `1px solid ${settings.mode === m
                  ? 'rgba(34,211,238,0.5)'
                  : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6, fontSize: 13, fontWeight: 700,
                letterSpacing: '0.05em', cursor: 'pointer',
                fontFamily: 'ui-monospace, monospace',
              }}
            >{m}</button>
          ))}
        </div>

        <div style={{
          padding: 10, background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            fontSize: 10, color: '#a3e635', letterSpacing: '0.15em', fontWeight: 700,
          }}>VENTILATOR SETTINGS</div>

          <VentSlider label="FiO₂" value={settings.fio2}
            min={0.21} max={1.0} step={0.01} unit=""
            onChange={v => patch({ fio2: v })} />
          <VentSlider label="PEEP" value={settings.peep}
            min={0} max={25} step={1} unit="cmH₂O"
            onChange={v => patch({ peep: v })} />
          <VentSlider label="V_T target" value={settings.vtTarget}
            min={200} max={800} step={10} unit="mL"
            onChange={v => patch({ vtTarget: v })} />
          <VentSlider label="RR" value={settings.rrSet}
            min={6} max={40} step={1} unit="rpm"
            onChange={v => patch({ rrSet: v })} />
          <VentSlider label="T_insp" value={settings.tInspSet}
            min={0.4} max={3.0} step={0.1} unit="s"
            onChange={v => patch({ tInspSet: v })} />
          {/* 5.C — Patrón de flujo VCV (sólo visible en modo VCV) */}
          {settings.mode === 'VCV' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                Patrón flujo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {(['square', 'decelerating'] as const).map(pat => (
                  <button
                    type="button"
                    key={pat}
                    onClick={() => patch({ flowPatternVCV: pat })}
                    style={{
                      padding: '7px 4px',
                      background: settings.flowPatternVCV === pat
                        ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.02)',
                      color: settings.flowPatternVCV === pat ? '#22d3ee' : '#64748b',
                      border: `1px solid ${settings.flowPatternVCV === pat
                        ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 6, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.04em', cursor: 'pointer',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {pat === 'square' ? '▬ CUADRADO' : '◿ DECELERANTE'}
                  </button>
                ))}
              </div>
              {settings.flowPatternVCV === 'decelerating' && (
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
                  ↓Ppico 15–25% · mismo VT
                </div>
              )}
            </div>
          )}
          {settings.mode === 'PCV' && (
            <VentSlider label="P_insp" value={settings.pInspSet}
              min={5} max={40} step={1} unit="cmH₂O"
              onChange={v => patch({ pInspSet: v })} />
          )}
          {(settings.mode === 'PSV') && (
            <VentSlider label="P_support" value={settings.pSupport}
              min={0} max={30} step={1} unit="cmH₂O"
              onChange={v => patch({ pSupport: v })} />
          )}
          {settings.mode === 'PRVC' && (
            <VentSlider label="P_alarm MAX" value={settings.pMaxAlarm}
              min={25} max={60} step={1} unit="cmH₂O"
              onChange={v => patch({ pMaxAlarm: v })} accent="#f59e0b" />
          )}
          {settings.mode === 'AMV' && (
            <>
              <VentSlider label="MV target" value={settings.amvMinuteVentTarget}
                min={4} max={14} step={0.5} unit="L/min"
                onChange={v => patch({ amvMinuteVentTarget: v })} accent="#e879f9" />
              <VentSlider label="PBW" value={settings.amvWeightKg}
                min={40} max={120} step={1} unit="kg"
                onChange={v => patch({ amvWeightKg: v })} accent="#e879f9" />
            </>
          )}
        </div>

        {/* Panel ATRC */}
        <div style={{
          padding: 10, background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${settings.atrcEnabled
            ? 'rgba(163,230,53,0.4)' : 'rgba(255,255,255,0.05)'}`,
          borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontSize: 10, color: '#a3e635', letterSpacing: '0.15em', fontWeight: 700,
            }}>ATRC — ROHRER</span>
            <button type="button" onClick={() => patch({ atrcEnabled: !settings.atrcEnabled })}
              style={{
                background: settings.atrcEnabled
                  ? 'rgba(163,230,53,0.2)' : 'rgba(255,255,255,0.03)',
                color: settings.atrcEnabled ? '#a3e635' : '#64748b',
                border: `1px solid ${settings.atrcEnabled
                  ? 'rgba(163,230,53,0.45)' : 'rgba(255,255,255,0.08)'}`,
                padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'ui-monospace, monospace',
              }}
            >{settings.atrcEnabled ? 'ON' : 'OFF'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
            {([6.5, 7.0, 7.5, 8.0, 8.5, 9.0] as const).map(d => (
              <button type="button" key={d} onClick={() => patch({ atrcTubeId: d })}
                style={{
                  padding: 4, fontSize: 9,
                  background: settings.atrcTubeId === d
                    ? 'rgba(163,230,53,0.2)' : 'rgba(255,255,255,0.02)',
                  color: settings.atrcTubeId === d ? '#a3e635' : '#64748b',
                  border: `1px solid ${settings.atrcTubeId === d
                    ? 'rgba(163,230,53,0.35)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 4, cursor: 'pointer',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >{d}</button>
            ))}
          </div>
          <VentSlider label="Compensación" value={settings.atrcCompensation}
            min={0} max={1} step={0.05} unit=""
            onChange={v => patch({ atrcCompensation: v })} accent="#a3e635" />
        </div>

        {/* Panel Trigger */}
        <div style={{
          padding: 10, background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            fontSize: 10, color: '#22d3ee', letterSpacing: '0.15em', fontWeight: 700,
          }}>TRIGGER</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(['flow', 'pressure'] as const).map(t => (
              <button type="button" key={t} onClick={() => patch({ triggerType: t })}
                style={{
                  padding: 4, fontSize: 10, fontFamily: 'ui-monospace, monospace',
                  background: settings.triggerType === t
                    ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.02)',
                  color: settings.triggerType === t ? '#22d3ee' : '#64748b',
                  border: `1px solid ${settings.triggerType === t
                    ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >{t.toUpperCase()}</button>
            ))}
          </div>
          {settings.triggerType === 'flow' ? (
            <VentSlider label="Flow trigger" value={settings.flowTriggerLpm}
              min={0.5} max={15} step={0.5} unit="L/min"
              onChange={v => patch({ flowTriggerLpm: v })} />
          ) : (
            <VentSlider label="P trigger" value={settings.pressTriggerCmH2O}
              min={0.5} max={20} step={0.5} unit="cmH₂O"
              onChange={v => patch({ pressTriggerCmH2O: v })} />
          )}
        </div>
      </div>

      {/* ─── COLUMNA CENTRAL: waveforms + monitor digital ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <WaveformPanel width={640} height={340} speed={speed} isRunning={isRunning} />
        {/* Monitor digital — Métricas vent + gases + pausas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          <ValBox label="PPEAK" value={metrics.pPeak.toFixed(1)}
            unit="cmH₂O" alert={metrics.pPeak > 35} accent="#22d3ee" />
          <ValBox label="PPLAT" value={metrics.pPlat.toFixed(1)}
            unit="cmH₂O" alert={metrics.pPlat > 30} accent="#22d3ee" />
          <ValBox label="ΔP" value={metrics.drivingPressure.toFixed(1)}
            unit="cmH₂O" alert={metrics.drivingPressure > 15} accent="#f59e0b" />
          <ValBox label="PMEAN" value={metrics.pMean.toFixed(1)}
            unit="cmH₂O" accent="#34d399" />
          <ValBox label="CSTAT" value={metrics.cStatMeasured.toFixed(0)}
            unit="mL/cmH₂O" alert={metrics.cStatMeasured < 25 && metrics.cStatMeasured > 0}
            accent="#a3e635" />
          <ValBox label="RAW" value={metrics.rAwMeasured.toFixed(1)}
            unit="cmH₂O/L/s" alert={metrics.rAwMeasured > 15} accent="#a3e635" />

          <ValBox label="VT" value={metrics.vtInsp.toFixed(0)}
            unit="mL" accent="#22d3ee" />
          <ValBox label="MV" value={metrics.minVol.toFixed(1)}
            unit="L/min" accent="#22d3ee" />
          <ValBox label="AUTOPEEP" value={metrics.autoPeep.toFixed(1)}
            unit="cmH₂O" alert={metrics.autoPeep > 2} accent="#f59e0b" />
          <ValBox label="MP" value={metrics.mechPowerJmin.toFixed(1)}
            unit="J/min" alert={metrics.mechPowerJmin > 17} accent="#e879f9" />
          <ValBox label="I:E" value={`1:${(1 / Math.max(0.01, metrics.ieRatio)).toFixed(1)}`}
            unit="" accent="#34d399" />
          <ValBox label={settings.mode === 'PRVC' ? 'P_insp' : 'P_TRACH'}
            value={settings.mode === 'PRVC'
              ? metrics.pInspTarget.toFixed(1)
              : metrics.pTrachPeak.toFixed(1)}
            unit="cmH₂O"
            accent={settings.mode === 'PRVC' ? '#e879f9' : '#22d3ee'} />
        </div>

        {/* ── Gases arteriales en vivo ─────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6,
          padding: '8px 0 0 0',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <ValBox label="PaO₂" value={paO2.toFixed(0)}
            unit="mmHg" alert={paO2 < 60} accent="#22d3ee" />
          <ValBox label="PaCO₂" value={paCO2.toFixed(0)}
            unit="mmHg" alert={paCO2 > 50} accent="#f59e0b" />
          <ValBox label="pH" value={pH.toFixed(3)}
            unit="" alert={pH < 7.25 || pH > 7.55} accent="#a3e635" />
          <ValBox label="SpO₂" value={spo2.toFixed(0)}
            unit="%" alert={spo2 < 90} accent="#34d399" />
          {/* Cstat medida por pausa — disponible sólo tras maniobra */}
          <ValBox label="Cstat★" value={measuredCstat > 0 ? measuredCstat.toFixed(0) : '—'}
            unit="mL/cmH₂O" alert={measuredCstat > 0 && measuredCstat < 25}
            accent={measuredCstat > 0 ? '#a3e635' : '#475569'} />
          {/* AutoPEEP medido por pausa espiratoria */}
          <ValBox label="aPEEP★" value={measuredAutoPeep > 0 ? measuredAutoPeep.toFixed(1) : '—'}
            unit="cmH₂O" alert={measuredAutoPeep > 3}
            accent={measuredAutoPeep > 0 ? '#f59e0b' : '#475569'} />
        </div>

        {/* ── Botones de Maniobra de Pausa ────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '6px 0 0 0',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'ui-monospace,monospace' }}>
            MANIOBRAS:
          </span>
          {(['INSPIRATORY', 'EXPIRATORY'] as const).map(type => {
            const isActive = pauseManeuver === type;
            const label = type === 'INSPIRATORY' ? 'Pausa Insp (2s)' : 'Pausa Esp (3s)';
            return (
              <button
                key={type}
                type="button"
                onClick={() => triggerPauseManeuver(isActive ? 'NONE' : type)}
                style={{
                  padding: '5px 14px',
                  background: isActive
                    ? 'rgba(251,146,60,0.2)'
                    : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#fb923c' : '#94a3b8',
                  border: `1px solid ${isActive ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6, fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'ui-monospace, monospace',
                  transition: 'all 0.15s',
                }}
              >
                {isActive ? '⏸ ' : ''}{label}
              </button>
            );
          })}
          {ardsActive && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 700,
              padding: '3px 10px', borderRadius: 5,
              background: ardsSeverityLevel === 'SEVERE' ? 'rgba(239,68,68,0.2)' : 'rgba(251,146,60,0.15)',
              color: ardsSeverityLevel === 'SEVERE' ? '#ef4444' : '#fb923c',
              border: `1px solid ${ardsSeverityLevel === 'SEVERE' ? 'rgba(239,68,68,0.4)' : 'rgba(251,146,60,0.3)'}`,
              fontFamily: 'ui-monospace, monospace',
            }}>
              ⚠ SDRA {ardsSeverityLevel}
            </span>
          )}
        </div>

        {/* Log PRVC */}
        {(settings.mode === 'PRVC' || settings.mode === 'AMV') && (
          <div style={{
            padding: 10, background: 'rgba(232,121,249,0.04)',
            border: '1px solid rgba(232,121,249,0.2)', borderRadius: 8,
            fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#e879f9',
          }}>
            <div style={{ fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
              PRVC CONTROLLER [breath #{metrics.breathId}]
            </div>
            <div>P_insp target: {metrics.pInspTarget.toFixed(1)} cmH₂O &nbsp;
              | Δ último ajuste: {metrics.prvcDelta >= 0 ? '+' : ''}{metrics.prvcDelta.toFixed(2)} cmH₂O
              &nbsp; | V_T entregado: {metrics.vtInsp.toFixed(0)}/{settings.vtTarget} mL</div>
            {metrics.acpFlag && (
              <div style={{ color: '#ef4444', marginTop: 4, fontWeight: 700 }}>
                ⚠ ACP RISK — Pplat &gt; 27 cmH₂O en patología severa
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── COLUMNA DERECHA: GeometricLung + alerts hemodinámicos ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <GeometricLung width={360} height={360} />
        <div style={{
          padding: 10, background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
          fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace',
          lineHeight: 1.5,
        }}>
          <div style={{
            color: '#22d3ee', letterSpacing: '0.15em', fontWeight: 700,
            marginBottom: 6,
          }}>HEMO COUPLING</div>
          <div>Ppl mean: <span style={{ color: '#e2e8f0' }}>
            {metrics.pplMean.toFixed(1)} cmH₂O</span></div>
          <div>Ppl swing: <span style={{ color: '#e2e8f0' }}>
            {metrics.pplSwing.toFixed(1)} cmH₂O</span></div>
          <div>TPP peak: <span style={{ color: '#e2e8f0' }}>
            {metrics.pTPPeak.toFixed(1)} cmH₂O</span></div>
          <div style={{ marginTop: 6, fontSize: 9, color: '#64748b' }}>
            Vieillard-Baron ICM 2016 · Berger AJP 2016
          </div>
        </div>
      </div>
    </div>}
  </div>
  );
};

export default VentilatorSM100;
