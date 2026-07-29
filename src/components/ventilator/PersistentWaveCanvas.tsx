// src/components/ventilator/PersistentWaveCanvas.tsx
// Canonical sweep-oscilloscope renderer for a single ARM waveform channel.
// Uses an offscreen canvas for persistence — the visible canvas only adds
// the cursor line. This prevents the large-erase-band flicker at x60 speed.
//
// Time model (FASE 5): wf.t[] stores simTime. xCursor = (simT × pxPerSimSec) % W.
// At any speed, the oscilloscope window shows the last WINDOW_SIM_S sim-seconds.
//
// Refs:
//   Mojoli F et al., Critical Care 2018;22:262 — waveform analysis for async detection.
//   IEC 60601-2-12 — min 4 Hz refresh for respiratory waveforms on ICU monitors.
/* eslint-disable react/forbid-dom-props */

import React, { useEffect, useRef, useCallback, memo } from 'react';
import { RespiratoryEngine } from '../../core/RespiratoryEngine';
import { useTimeStore }      from '../../store/useTimeStore';
import { usePatientStore }   from '../../store/usePatientStore';
import { samplesInRange, autoscaleFromBuffer } from '../../utils/waveInterpolation';

export type WaveChannel = 'paw' | 'flow' | 'vol';

export interface WaveChannelConfig {
  key:      WaveChannel;
  color:    string;
  label:    string;
  unit:     string;
  minRange: number;
  hasZero:  boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WINDOW_SIM_S = 5;
const BG_COLOR     = '#0a0a10';
const ERASE_AHEAD  = 10;   // px — blank band ahead of cursor on offscreen

const FRAME_LIMITS: [number, number][] = [
  [60, 1000 / 20],
  [30, 1000 / 20],
  [10, 1000 / 30],
  [2,  1000 / 45],
  [1,  1000 / 60],
];

function minFrameMs(speed: number): number {
  for (const [threshold, ms] of FRAME_LIMITS) {
    if (speed >= threshold) return ms;
  }
  return 1000 / 60;
}

function makeOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  return el;
}

function get2d(c: OffscreenCanvas | HTMLCanvasElement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return c.getContext('2d') as CanvasRenderingContext2D | null;
}

// ─── Single channel ───────────────────────────────────────────────────────────

interface ChannelProps {
  cfg:     WaveChannelConfig;
  height?: number;
}

const PersistentWaveCanvas = memo(function PersistentWaveCanvas({
  cfg, height = 100,
}: ChannelProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const offRef       = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const lastPaintMs  = useRef<number>(0);
  const lastSimTRef  = useRef<number>(-1);
  const lastXRef     = useRef<number>(0);
  const autoscaleRef = useRef<{ min: number; max: number; updatedMs: number }>({ min: 0, max: cfg.minRange, updatedMs: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx)  { requestAnimationFrame(draw); return; }

    const W = canvas.width;
    const H = canvas.height;
    if (W < 4) { requestAnimationFrame(draw); return; }

    const now   = performance.now();
    const speed = useTimeStore.getState().speedMultiplier;

    if (now - lastPaintMs.current < minFrameMs(speed)) {
      requestAnimationFrame(draw); return;
    }
    lastPaintMs.current = now;

    // ── Ensure offscreen canvas exists and matches dimensions ─────────────────
    if (!offRef.current || offRef.current.width !== W || offRef.current.height !== H) {
      offRef.current = makeOffscreen(W, H);
      const ctxOff = get2d(offRef.current);
      if (ctxOff) { ctxOff.fillStyle = BG_COLOR; ctxOff.fillRect(0, 0, W, H); }
      lastSimTRef.current = -1;
      lastXRef.current    = 0;
    }

    const ctxOff = get2d(offRef.current!);
    if (!ctxOff) { requestAnimationFrame(draw); return; }

    // ── Gate: ventilator connected ─────────────────────────────────────────────
    if (!usePatientStore.getState().isVentilatorConnected) {
      ctxOff.fillStyle = BG_COLOR; ctxOff.fillRect(0, 0, W, H);
      ctx.drawImage(offRef.current!, 0, 0);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INICIANDO VENTILACIÓN…', W / 2, H / 2);
      lastSimTRef.current = -1;
      requestAnimationFrame(draw); return;
    }

    // ── Gate: paused ──────────────────────────────────────────────────────────
    if (!useTimeStore.getState().isRunning) {
      ctx.drawImage(offRef.current!, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SIMULACIÓN PAUSADA', W / 2, H / 2);
      requestAnimationFrame(draw); return;
    }

    const engine = RespiratoryEngine.getInstance().getVentEngine();
    const simT   = engine.getWaveCursorTime();   // = simTime (FASE 5 fix)

    if (engine.getWaveforms().length < 4) {
      ctx.fillStyle = BG_COLOR; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INICIANDO…', W / 2, H / 2);
      lastSimTRef.current = -1;
      requestAnimationFrame(draw); return;
    }

    // ── First frame or reset ──────────────────────────────────────────────────
    const pxPerSimSec = W / WINDOW_SIM_S;
    const xNow = Math.floor(((simT * pxPerSimSec) % W + W) % W);

    if (lastSimTRef.current < 0 || simT < lastSimTRef.current || simT - lastSimTRef.current > WINDOW_SIM_S) {
      ctxOff.fillStyle = BG_COLOR; ctxOff.fillRect(0, 0, W, H);
      lastSimTRef.current = simT;
      lastXRef.current    = xNow;
      requestAnimationFrame(draw); return;
    }

    const prevSimT = lastSimTRef.current;
    const prevX    = lastXRef.current;

    // ── Sweep band delta ──────────────────────────────────────────────────────
    let dxRaw = xNow - prevX;
    if (dxRaw < 0) dxRaw += W;
    const dx = Math.min(dxRaw, W - 1);

    // ── Erase future band on offscreen ────────────────────────────────────────
    ctxOff.fillStyle = BG_COLOR;
    if (xNow > prevX) {
      ctxOff.fillRect(prevX, 0, dx + ERASE_AHEAD, H);
    } else {
      // wraparound
      ctxOff.fillRect(prevX, 0, W - prevX, H);
      ctxOff.fillRect(0, 0, xNow + ERASE_AHEAD, H);
    }

    // ── Autoscale (every 250 ms wall) ─────────────────────────────────────────
    if (now - autoscaleRef.current.updatedMs > 250) {
      const wf = engine.getWaveforms();
      const sc = autoscaleFromBuffer(wf, cfg.key, simT - WINDOW_SIM_S, simT, cfg.minRange);
      autoscaleRef.current = { ...sc, updatedMs: now };
    }
    const { min: yMin, max: yMax } = autoscaleRef.current;
    const yRange = yMax - yMin || cfg.minRange;
    const toY = (v: number) =>
      Math.max(1, Math.min(H - 1, Math.round(H - 1 - ((v - yMin) / yRange) * (H - 4) - 1)));

    // ── Draw samples on offscreen ─────────────────────────────────────────────
    const wf      = engine.getWaveforms();
    const samples = samplesInRange(wf, prevSimT, simT);

    if (samples.length >= 2) {
      ctxOff.strokeStyle = cfg.color;
      ctxOff.lineWidth   = 1.8;
      ctxOff.lineJoin    = 'round';
      ctxOff.lineCap     = 'round';
      ctxOff.shadowColor = cfg.color;
      ctxOff.shadowBlur  = 4;
      ctxOff.beginPath();
      let moved = false;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const sx = Math.floor(((s.t * pxPerSimSec) % W + W) % W);
        const sy = toY(s[cfg.key] as number);
        // detect wrap in x between consecutive samples
        if (i > 0) {
          const prevSx = Math.floor(((samples[i - 1].t * pxPerSimSec) % W + W) % W);
          if (Math.abs(sx - prevSx) > W / 2) {
            // wrap — close current path and start new
            ctxOff.stroke();
            ctxOff.beginPath();
            moved = false;
          }
        }
        if (!moved) { ctxOff.moveTo(sx, sy); moved = true; }
        else ctxOff.lineTo(sx, sy);
      }
      ctxOff.stroke();
      ctxOff.shadowBlur = 0;
    }

    // ── Composite offscreen → visible ─────────────────────────────────────────
    ctx.drawImage(offRef.current!, 0, 0);

    // ── Cursor line on visible (not accumulated) ──────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(xNow, 0);
    ctx.lineTo(xNow, H);
    ctx.stroke();

    // ── Zero line on visible ──────────────────────────────────────────────────
    if (cfg.hasZero) {
      const zeroY = toY(0);
      if (zeroY > 0 && zeroY < H) {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(W, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Speed badge at high velocity ─────────────────────────────────────────
    if (speed >= 10) {
      ctx.fillStyle = 'rgba(251,146,60,0.85)';
      ctx.font      = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${speed}×`, W - 6, 12);
    }

    lastSimTRef.current = simT;
    lastXRef.current    = xNow;
    requestAnimationFrame(draw);
  }, [cfg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = BG_COLOR; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && w !== canvas.width) {
        canvas.width  = w;
        canvas.height = height;
        // offscreen will be recreated in draw() on next frame
        offRef.current   = null;
        lastSimTRef.current = -1;
        lastXRef.current    = 0;
      }
    });
    ro.observe(canvas.parentElement ?? canvas);
    const raf = requestAnimationFrame(draw);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [draw, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderBottom: '1px solid #1a1a28' }}>
      <div style={{
        position: 'absolute', top: 6, left: 10, zIndex: 1,
        fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
        color: cfg.color,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        textShadow: `0 0 12px ${cfg.color}88`,
        pointerEvents: 'none',
      }}>
        {cfg.label}
        <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 4, color: '#5a5a7a' }}>
          {cfg.unit}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label={`${cfg.label} waveform`}
      />
    </div>
  );
});

export { PersistentWaveCanvas };
export default PersistentWaveCanvas;
