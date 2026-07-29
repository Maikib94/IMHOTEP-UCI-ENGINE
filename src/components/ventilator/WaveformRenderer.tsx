// src/components/ventilator/WaveformRenderer.tsx
//
// Canvas-based oscilloscope renderer for ARM waveforms.
// Extracted from VentilatorCurves.tsx — pure presentational, React.memo-wrapped.
//
// Uses ResizeObserver + rAF loop with per-speed FPS throttle.
// Reads directly from RespiratoryEngine (no React state) for zero-latency path.
/* eslint-disable react/forbid-dom-props */

import React, { useEffect, useRef, useCallback, memo } from 'react';
import { RespiratoryEngine } from '../../core/RespiratoryEngine';
import { useTimeStore }      from '../../store/useTimeStore';
import { usePatientStore }   from '../../store/usePatientStore';

// ─── Paleta ──────────────────────────────────────────────────────────────────
export const WAVE_COLORS = {
  bg:       '#0a0a10',
  grid:     '#1a1a28',
  pressure: '#f5c518',
  flow:     '#3ddc84',
  volume:   '#22d3ee',
  dimText:  '#5a5a7a',
  zero:     'rgba(255,255,255,0.12)',
  cursor:   'rgba(255,255,255,0.06)',
} as const;

// ─── Config ───────────────────────────────────────────────────────────────────
const WINDOW_SIM_S = 5;

const FRAME_LIMITS: [number, number][] = [
  [60, 1000 / 15],
  [30, 1000 / 20],
  [10, 1000 / 30],
  [1,  1000 / 60],
];

function minFrameMs(speed: number): number {
  for (const [threshold, ms] of FRAME_LIMITS) {
    if (speed >= threshold) return ms;
  }
  return 1000 / 60;
}

// ─── Public channel type ──────────────────────────────────────────────────────
export type WaveChannel = 'paw' | 'flow' | 'vol';

export interface WaveChannelConfig {
  key:      WaveChannel;
  color:    string;
  label:    string;
  unit:     string;
  minRange: number;
  hasZero:  boolean;
}

export const DEFAULT_CHANNELS: WaveChannelConfig[] = [
  { key: 'paw',  color: WAVE_COLORS.pressure, label: 'PRESIÓN', unit: 'cmH₂O', minRange: 15,  hasZero: false },
  { key: 'flow', color: WAVE_COLORS.flow,     label: 'FLUJO',   unit: 'L/min',  minRange: 30,  hasZero: true  },
  { key: 'vol',  color: WAVE_COLORS.volume,   label: 'VOLUMEN', unit: 'mL',     minRange: 200, hasZero: false },
];

// ─── Single channel renderer ──────────────────────────────────────────────────

interface ChannelProps {
  cfg:     WaveChannelConfig;
  height?: number;
}

const WaveChannel = memo(function WaveChannel({ cfg, height = 100 }: ChannelProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const lastPaintMs   = useRef<number>(0);
  const cursorTimeRef = useRef<number>(-1);
  const xCursorRef    = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx)   { rafRef.current = requestAnimationFrame(draw); return; }

    const W = canvas.width;
    const H = canvas.height;
    if (W < 4) { rafRef.current = requestAnimationFrame(draw); return; }

    const now   = performance.now();
    const speed = useTimeStore.getState().speedMultiplier;
    if (now - lastPaintMs.current < minFrameMs(speed)) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    lastPaintMs.current = now;

    if (!usePatientStore.getState().isVentilatorConnected) {
      ctx.fillStyle = '#030509';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 11px JetBrains Mono, ui-monospace, monospace';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('INICIANDO VENTILACIÓN…', W / 2, H / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const engine = RespiratoryEngine.getInstance().getVentEngine();
    const tNow   = engine.getWaveCursorTime();

    if (engine.getWaveforms().length < 4) {
      ctx.fillStyle = '#030509';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 11px JetBrains Mono, ui-monospace, monospace';
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.fillText('INICIANDO…', W / 2, H / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    if (cursorTimeRef.current < 0) {
      cursorTimeRef.current = tNow;
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const dtWall = tNow - cursorTimeRef.current;
    if (dtWall < 0 || dtWall > 2.0) {
      cursorTimeRef.current = tNow;
      xCursorRef.current    = 0;
      ctx.clearRect(0, 0, W, H);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    if (dtWall < 1e-6) { rafRef.current = requestAnimationFrame(draw); return; }

    const wallWindowS  = WINDOW_SIM_S / Math.max(1, speed);
    const pxPerSecWall = W / wallWindowS;
    const dx           = Math.min(dtWall * pxPerSecWall, W);

    const x0 = xCursorRef.current;
    const x1 = (x0 + dx) % W;

    // Autoscale
    const wf  = engine.getWaveforms();
    const buf = wf[cfg.key] as Float32Array;
    const vis = Math.min(wf.length, W);
    let mn = +Infinity, mx = -Infinity;
    for (let i = 0; i < vis; i++) {
      const idx = (wf.writeIdx - vis + i + buf.length) % buf.length;
      const v   = buf[idx];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!isFinite(mn) || !isFinite(mx)) {
      cursorTimeRef.current = tNow;
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const range  = Math.max(cfg.minRange, mx - mn);
    const pad    = range * 0.12;
    const yMin   = mn - pad;
    const yRange = range + 2 * pad;
    const toY    = (v: number) =>
      Math.max(1, Math.min(H - 1, Math.round(H - ((v - yMin) / yRange) * H)));

    // Erase cursor sweep band
    const eraseW = Math.ceil(dx) + 12;
    ctx.fillStyle = WAVE_COLORS.bg;
    if (x1 >= x0) {
      ctx.fillRect(x0, 0, eraseW, H);
    } else {
      ctx.fillRect(x0, 0, W - x0 + 2, H);
      ctx.fillRect(0,  0, Math.ceil(x1) + 6, H);
    }

    // Cursor line
    ctx.strokeStyle = WAVE_COLORS.cursor;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), 0);
    ctx.lineTo(Math.round(x1), H);
    ctx.stroke();

    // Draw samples
    const samples = engine.getSamplesInRange(cursorTimeRef.current, tNow);
    if (samples.length >= 2) {
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth   = 2;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur  = 5;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      const tStart = samples[0].t;
      const tSpan  = samples[samples.length - 1].t - tStart || 1e-9;
      samples.forEach((s, i) => {
        const frac = (s.t - tStart) / tSpan;
        const sx   = (x0 + frac * dx) % W;
        const sy   = toY(s[cfg.key] as number);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Zero line
    if (cfg.hasZero) {
      const zeroY = toY(0);
      if (zeroY >= 0 && zeroY <= H) {
        ctx.strokeStyle = WAVE_COLORS.zero;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(W, zeroY);
        ctx.stroke();
      }
    }

    xCursorRef.current    = x1;
    cursorTimeRef.current = tNow;
    rafRef.current = requestAnimationFrame(draw);
  }, [cfg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = WAVE_COLORS.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) {
        canvas.width  = w;
        canvas.height = height;
        cursorTimeRef.current = -1;
        xCursorRef.current    = 0;
      }
    });
    ro.observe(canvas.parentElement ?? canvas);
    rafRef.current = requestAnimationFrame(draw);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderBottom: `1px solid ${WAVE_COLORS.grid}` }}>
      <div style={{
        position: 'absolute', top: 6, left: 10, zIndex: 1,
        fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
        color: cfg.color, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        textShadow: `0 0 12px ${cfg.color}88`, pointerEvents: 'none',
      }}>
        {cfg.label}
        <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 4, color: WAVE_COLORS.dimText }}>
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

// ─── Multi-channel panel ──────────────────────────────────────────────────────

interface WaveformRendererProps {
  channels?: WaveChannelConfig[];
  heights?:  number[];
}

const WaveformRenderer = memo(function WaveformRenderer({
  channels = DEFAULT_CHANNELS,
  heights  = [100, 100, 100],
}: WaveformRendererProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: WAVE_COLORS.bg }}>
      {channels.map((cfg, i) => (
        <WaveChannel key={cfg.key} cfg={cfg} height={heights[i] ?? 100} />
      ))}
    </div>
  );
});

export default WaveformRenderer;
