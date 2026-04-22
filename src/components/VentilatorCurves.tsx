// src/components/VentilatorCurves.tsx
// Renderiza P/Flow/V desde el ring buffer de RespiratoryEngine (sin Zustand).
// Acceso directo al singleton del engine vía useRef + requestAnimationFrame.

import React, { useEffect, useRef, useCallback } from 'react';
import { RespiratoryEngine, type WaveformSample } from '../core/RespiratoryEngine';

// ─── Paleta (igual a VentilatorPanel) ────────────────────────────────────────
const C = {
  bg:       '#0d0d14',
  grid:     '#181822',
  pressure: '#f5c518',
  flow:     '#3ddc84',
  volume:   '#22d3ee',
  dimText:  '#4a4a66',
};

interface CurveConfig {
  key: 'pressure' | 'flow' | 'volume';
  color: string;
  label: string;
  unit: string;
  scaleMin: number;
  scaleMax: number;
}

const CURVES: CurveConfig[] = [
  { key: 'pressure', color: C.pressure, label: 'PRESIÓN',  unit: 'cmH₂O', scaleMin: -2,   scaleMax: 50 },
  { key: 'flow',     color: C.flow,     label: 'FLUJO',    unit: 'L/min',  scaleMin: -80,  scaleMax: 80 },
  { key: 'volume',   color: C.volume,   label: 'VOLUMEN',  unit: 'mL',     scaleMin: 0,    scaleMax: 700 },
];

// ─── Canvas individual ────────────────────────────────────────────────────────

interface WaveCurveProps {
  cfg: CurveConfig;
  height?: number;
}

function WaveCurve({ cfg, height = 90 }: WaveCurveProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const prevLenRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx)  { rafRef.current = requestAnimationFrame(draw); return; }

    const W = canvas.width;
    const H = canvas.height;
    if (W < 2)   { rafRef.current = requestAnimationFrame(draw); return; }

    const engine  = RespiratoryEngine.getInstance();
    const samples = engine.getWaveform() as WaveformSample[];

    if (samples.length === 0 || samples.length === prevLenRef.current) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    prevLenRef.current = samples.length;

    // Mostrar los últimos W muestras (un punto = un pixel)
    const visible = Math.min(samples.length, W);
    const startIdx = samples.length - visible;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Línea de cero para flujo
    const range = Math.max(1, cfg.scaleMax - cfg.scaleMin);
    const zeroNorm = (0 - cfg.scaleMin) / range;
    const zeroY    = Math.round(H - zeroNorm * H * 0.82 - H * 0.09);
    ctx.fillStyle  = C.grid;
    ctx.fillRect(0, Math.max(0, Math.min(H - 1, zeroY)), W, 1);

    ctx.fillStyle = cfg.color;
    let prevY: number | null = null;

    for (let i = 0; i < visible; i++) {
      const s   = samples[startIdx + i];
      const val = s[cfg.key];
      const norm = (val - cfg.scaleMin) / range;
      const y   = Math.round(H - norm * H * 0.82 - H * 0.09);
      const yC  = Math.max(1, Math.min(H - 1, y));
      const x   = i;

      if (prevY !== null) {
        const y1 = Math.min(prevY, yC);
        const y2 = Math.max(prevY, yC);
        ctx.fillRect(x, y1, 2, Math.max(2, y2 - y1 + 1));
      } else {
        ctx.fillRect(x, yC, 2, 2);
      }
      prevY = yC;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [cfg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) {
        canvas.width  = w;
        canvas.height = height;
        prevLenRef.current = 0;
      }
    });
    ro.observe(canvas.parentElement ?? canvas);
    rafRef.current = requestAnimationFrame(draw);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderBottom: `1px solid ${C.grid}` }}>
      <div style={{
        position: 'absolute', top: 4, left: 8, zIndex: 1,
        fontSize: '0.38rem', fontWeight: 700, letterSpacing: '0.13em',
        color: cfg.color, fontFamily: 'monospace',
        textShadow: `0 0 8px ${cfg.color}`,
      }}>
        {cfg.label} <span style={{ color: C.dimText, fontWeight: 400 }}>{cfg.unit}</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', background: C.bg }}
      />
    </div>
  );
}

// ─── Componente público: 3 curvas apiladas ────────────────────────────────────

interface VentilatorCurvesProps {
  height?: number;
}

export default function VentilatorCurves({ height = 90 }: VentilatorCurvesProps) {
  return (
    <>
      {CURVES.map(cfg => (
        <div key={cfg.key} style={{ flex: 1, minHeight: 0 }}>
          <WaveCurve cfg={cfg} height={height} />
        </div>
      ))}
    </>
  );
}
