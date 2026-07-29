// src/components/ICPWaveform.tsx
//
// Curva PIC pulsátil de alta resolución con morfología P1/P2/P3 fisiológica.
//
// Morfología (Ziółkowski 2023 Front Physiol; de Moraes 2022 Neurocrit Care):
//   P1 (percussion): pico ~150 ms, σ ~45 ms — contracción sistólica
//   P2 (tidal):      pico ~280 ms, σ ~50 ms — compliance cerebral
//   P3 (dicrotic):   pico ~430 ms, σ ~55 ms — cierre válvula aórtica
//   Normal:   P1 > P2 > P3 (compliance preservada)
//   HIC:      P2/P1 ≥ 1.2 + TTP > 0.25 s (compliance perdida)
//
// complianceLoss = clamp(0,1, (icp/22 - 0.5) × 1.5)
// Render: canvas 100 Hz efectivo, rAF a 60 fps reales (throttle)

import React, { useEffect, useRef } from 'react';
import { usePatientStore } from '../store/usePatientStore';

const BG      = '#060e1a';
const CLR     = '#f59e0b';   // ámbar ICP
const GRID    = '#1a1200';
const SCAN_PX_S = 80;
const ERASE_W   = 10;

const PEAK_CONFIG = [
  { mu: 0.15, sigma: 0.045, ampBase: 3.0 },  // P1 percussion
  { mu: 0.28, sigma: 0.050, ampBase: 2.5 },  // P2 tidal
  { mu: 0.43, sigma: 0.055, ampBase: 1.8 },  // P3 dicrotic
] as const;

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

// ICP pulse morphology — t in [0, RR_s), icpMean in mmHg, complianceLoss in [0,1]
function icpPulse(t: number, icpMean: number, complianceLoss: number): number {
  const A1 = PEAK_CONFIG[0].ampBase * (1 - 0.30 * complianceLoss);
  const A2 = PEAK_CONFIG[1].ampBase * (1 + 0.70 * complianceLoss);
  const A3 = PEAK_CONFIG[2].ampBase;
  const amps = [A1, A2, A3];
  let pulse = 0;
  for (let i = 0; i < 3; i++) {
    const { mu, sigma } = PEAK_CONFIG[i];
    const z = (t - mu) / sigma;
    pulse += amps[i] * Math.exp(-z * z);
  }
  return icpMean + pulse;
}

interface ICPWaveformProps {
  height?: number;
}

export const ICPWaveform: React.FC<ICPWaveformProps> = ({ height = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef({ x: 0, lastTs: 0 });
  const rafRef    = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W   = canvas.width;
    const H   = canvas.height;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Gridlines at 10 and 20 mmHg reference lines
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 0.5;
    // ICP display range 0-40 mmHg; gridlines at 10/20/30
    for (const ref of [10, 20, 30]) {
      const yPx = Math.round(H * (1 - ref / 40)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yPx); ctx.lineTo(W, yPx); ctx.stroke();
    }

    stateRef.current.lastTs = performance.now();
    stateRef.current.x      = 0;

    function draw(now: number) {
      const v   = usePatientStore.getState().vitals;
      const hr  = isFinite(v.heartRate) && v.heartRate > 20 ? v.heartRate : 75;
      const icp = isFinite(v.icp) ? v.icp : 12;
      const rrS = 60 / hr;  // RR in seconds

      // complianceLoss: 0 normal (icp<11), 1 HIC severa (icp>22)
      const complianceLoss = clamp01((icp / 22 - 0.5) * 1.5);

      const st  = stateRef.current;
      const dt  = (now - st.lastTs) / 1000;
      st.lastTs = now;

      const dx = dt * SCAN_PX_S;
      const x0 = Math.floor(st.x);
      const x1 = Math.floor(st.x + dx);

      for (let xi = x0; xi <= x1 && xi < W; xi++) {
        // Erase ahead of cursor
        ctx!.fillStyle = BG;
        ctx!.fillRect((xi + 1) % W, 0, ERASE_W, H);

        // t within current cardiac cycle (seconds)
        const tInCycle = ((xi / SCAN_PX_S) % rrS);

        // Only draw within systolic+diastolic window (0 to RR)
        const tNorm  = tInCycle / rrS;  // 0-1 within beat
        const icpVal = icpPulse(tNorm, icp, complianceLoss);

        // Map to canvas: 0-40 mmHg range
        const yNorm = clamp01(icpVal / 40);
        const yPx   = Math.round((1 - yNorm) * (H - 2)) + 1;

        // Color shifts orange→red as P2>P1 (HIC)
        const r = Math.round(245 + 10 * complianceLoss);
        const g = Math.round(158 - 130 * complianceLoss);
        const b = Math.round(11  - 11  * complianceLoss);
        ctx!.fillStyle = `rgb(${r},${g},${b})`;
        ctx!.fillRect(xi % W, yPx, 1, 2);
      }

      st.x = (st.x + dx) % W;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="w-full flex flex-col gap-0.5">
      <div className="text-[0.4rem] font-black tracking-widest text-amber-500 uppercase px-1">
        PIC · P1/P2/P3
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={height}
        className="w-full rounded"
        style={{ background: BG, display: 'block' }}
      />
    </div>
  );
};
