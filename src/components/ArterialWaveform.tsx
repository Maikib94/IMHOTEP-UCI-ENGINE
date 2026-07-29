// src/components/ArterialWaveform.tsx
//
// Curva arterial continua (línea arterial activa).
// Solo se monta cuando invasiveMonitoringActive === true (gateado por ArterialMonitor).
// Usa canvas cursor-scan a 60 fps con morfología ART escalada a SYS/DIA reales.

import React, { useEffect, useRef } from 'react';
import { usePatientStore } from '../store/usePatientStore';

const BG      = '#060e1a';
const ART_CLR = '#ff4444';
const GRID_CLR = '#0f2040';
const SCAN_PX_S = 80;   // píxeles por segundo real
const ERASE_W   = 10;

// ART morphology 0-1 (same as WaveformMonitor waveART but self-contained)
function waveART(ph: number, sbp: number, dbp: number): number {
  const safeSbp = sbp > 20 ? sbp : 120;
  const safeDbp = dbp > 0  ? dbp : 80;
  const map = (safeSbp + 2 * safeDbp) / 3;
  const pp  = safeSbp - safeDbp;
  const vPP = pp * 1.7;
  const baseline = safeDbp / (safeSbp <= 140 ? 150 : safeSbp <= 190 ? 200 : 300);
  let y: number;
  if      (ph < 0.10)  y = baseline + vPP * 0.05 * (ph / 0.10) / (safeSbp <= 140 ? 150 : 200);
  else if (ph < 0.25)  y = baseline + vPP * (Math.sin((ph - 0.10) / 0.15 * Math.PI)) / (safeSbp <= 140 ? 150 : 200);
  else if (ph < 0.30)  y = baseline + vPP * 0.90 * (1 - (ph - 0.25) / 0.05 * 0.10) / (safeSbp <= 140 ? 150 : 200);
  else if (ph < 0.38)  y = baseline + vPP * (0.80 + 0.15 * Math.sin((ph - 0.30) / 0.08 * Math.PI)) / (safeSbp <= 140 ? 150 : 200);
  else                 y = baseline + vPP * 0.20 * Math.exp(-(ph - 0.38) * 4) / (safeSbp <= 140 ? 150 : 200);
  return Math.max(0, Math.min(1, y + map / (safeSbp <= 140 ? 150 : 200) - 0.5));
}

interface ArterialWaveformProps {
  height?: number;
}

export const ArterialWaveform: React.FC<ArterialWaveformProps> = ({ height = 80 }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stateRef   = useRef({ x: 0, lastTs: 0, hr: 75, sys: 120, dia: 80 });
  const rafRef     = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W   = canvas.width;
    const H   = canvas.height;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Draw horizontal gridlines
    ctx.strokeStyle = GRID_CLR;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = Math.round(H * i / 4) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    stateRef.current.lastTs = performance.now();
    stateRef.current.x      = 0;

    function draw(now: number) {
      const v   = usePatientStore.getState().vitals;
      const hr  = isFinite(v.heartRate) && v.heartRate > 0 ? v.heartRate : 75;
      const sys = isFinite(v.systolicBP) ? v.systolicBP : 120;
      const dia = isFinite(v.diastolicBP) ? v.diastolicBP : 80;
      const st  = stateRef.current;

      const dt  = (now - st.lastTs) / 1000;
      st.lastTs = now;
      st.hr     = hr;
      st.sys    = sys;
      st.dia    = dia;

      const dx = dt * SCAN_PX_S;
      const x0 = Math.floor(st.x);
      const x1 = Math.floor(st.x + dx);

      for (let xi = x0; xi <= x1 && xi < W; xi++) {
        // Erase cursor strip
        ctx!.fillStyle = BG;
        ctx!.fillRect((xi + 1) % W, 0, ERASE_W, H);

        // Draw ART sample
        const t_in_beat  = (xi / (W / (SCAN_PX_S / (hr / 60)))) % 1.0;
        const yNorm = waveART(t_in_beat, sys, dia);
        const yPx   = Math.round((1 - yNorm) * (H - 2)) + 1;

        ctx!.fillStyle = ART_CLR;
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
      <div className="text-[0.4rem] font-black tracking-widest text-[#ff4444] uppercase px-1">ART · Línea Arterial</div>
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
