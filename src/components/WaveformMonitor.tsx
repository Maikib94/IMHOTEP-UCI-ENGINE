import React, { useEffect, useRef } from 'react';
import { usePatientStore } from '../store/usePatientStore';

const NUM_CH     = 5;
const CH_H       = 80;
const CANVAS_H   = NUM_CH * CH_H;
const LABEL_W    = 60;
const SCAN_PX_S  = 80;
const ERASE_W    = 12;
const BG_COLOR   = '#060e1e';
const SEP_COLOR  = '#1a3050';
const GRID_SMALL = '#0a1c32';
const GRID_LARGE = '#0f2844';

const CH = [
  { label: 'ECG',   color: '#00ff88', unit: 'bpm'  },
  { label: 'ART',   color: '#ff4444', unit: 'mmHg' },
  { label: 'PLETH', color: '#00cfff', unit: '%'    },
  { label: 'EtCO2', color: '#ffdd00', unit: 'mmHg' },
  { label: 'RESP',  color: '#aaaaaa', unit: 'br/m' },
];

// ─── Formas de onda ───────────────────────────────────────────────────────────

function waveECG(ph: number): number {
  if (ph >= 0.06 && ph < 0.13)  return 0.5 + 0.10 * Math.sin((ph - 0.06) / 0.07 * Math.PI);
  if (ph >= 0.19 && ph < 0.215) return 0.5 - 0.14 * ((ph - 0.19) / 0.025);
  if (ph >= 0.215 && ph < 0.235)return 0.36 + ((ph - 0.215) / 0.020) * 0.59;
  if (ph >= 0.235 && ph < 0.265)return 0.95 - ((ph - 0.235) / 0.030) * 0.65;
  if (ph >= 0.265 && ph < 0.32) return 0.30 + ((ph - 0.265) / 0.055) * 0.20;
  if (ph >= 0.32  && ph < 0.38) return 0.50;
  if (ph >= 0.38  && ph < 0.60) return 0.5 + 0.18 * Math.sin((ph - 0.38) / 0.22 * Math.PI);
  return 0.50;
}

function waveART(ph: number): number {
  if (ph < 0.13) {
    const t = ph / 0.13;
    return 0.12 + 0.76 * (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2);
  }
  if (ph < 0.20) return 0.88;
  if (ph >= 0.22 && ph < 0.28)
    return 0.62 - 0.08 * Math.sin(((ph - 0.22) / 0.06) * Math.PI);
  const t = Math.max(0, (ph - 0.20) / 0.80);
  return 0.12 + 0.63 * Math.exp(-t * 2.8);
}

// Sin minimo forzado — amplitud baja naturalmente con perfusion
function wavePLETH(ph: number, amp: number): number {
  const a = Math.max(0.04, Math.min(1.5, isFinite(amp) && amp > 0 ? amp : 1.0));
  return 0.12 + Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 2) * 0.76 * a;
}

function waveETCO2(ph: number): number {
  if (ph < 0.05) return 0.10;
  if (ph < 0.12) return 0.10 + ((ph - 0.05) / 0.07) * 0.78;
  if (ph < 0.58) return 0.88;
  if (ph < 0.63) return 0.88 + 0.05 * Math.sin(((ph - 0.58) / 0.05) * Math.PI);
  if (ph < 0.72) return 0.88 - ((ph - 0.63) / 0.09) * 0.78;
  return 0.10;
}

function waveRESP(ph: number): number {
  return 0.5 + 0.38 * Math.sin(ph * 2 * Math.PI);
}

function getAmp(ch: number, phase: number, plethAmp: number): number {
  switch (ch) {
    case 0: return waveECG(phase);
    case 1: return waveART(phase);
    case 2: return wavePLETH(phase, plethAmp);
    case 3: return waveETCO2(phase);
    case 4: return waveRESP(phase);
    default: return 0.5;
  }
}

function ampToY(ch: number, amp: number): number {
  const clamped = Math.max(0.02, Math.min(0.98, amp));
  const margin  = CH_H * 0.08;
  return Math.round(ch * CH_H + margin + (1 - clamped) * (CH_H - margin * 2));
}

function buildGrid(W: number): HTMLCanvasElement {
  const gc  = document.createElement('canvas');
  gc.width  = W;
  gc.height = CANVAS_H;
  const ctx = gc.getContext('2d');
  if (!ctx) return gc;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, CANVAS_H);
  ctx.strokeStyle = GRID_SMALL; ctx.lineWidth = 0.5;
  for (let x = LABEL_W; x <= W; x += 4) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
  for (let y = 0; y <= CANVAS_H; y += 4) { ctx.beginPath(); ctx.moveTo(LABEL_W,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.strokeStyle = GRID_LARGE; ctx.lineWidth = 1;
  for (let x = LABEL_W; x <= W; x += 20) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
  for (let y = 0; y <= CANVAS_H; y += 20) { ctx.beginPath(); ctx.moveTo(LABEL_W,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.strokeStyle = SEP_COLOR; ctx.lineWidth = 1;
  for (let i = 1; i < NUM_CH; i++) { ctx.beginPath(); ctx.moveTo(0,i*CH_H); ctx.lineTo(W,i*CH_H); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(LABEL_W,0); ctx.lineTo(LABEL_W,CANVAS_H); ctx.stroke();
  return gc;
}

type VS = ReturnType<typeof usePatientStore.getState>['vitals'];

// ─── Logica sensor SpO2 ───────────────────────────────────────────────────────
// NORMAL:    PI >= 0.30 Y PAM >= 55 → valor real
// ARTEFACTO: PI 0.12-0.29 O PAM 40-55 → valor errático (estasis venosa)
// FALLO:     PI < 0.12 O PAM < 40   → "---" parpadeante

type SensorState = 'normal' | 'artifact' | 'fail';

function getSensorState(pi: number, map: number): SensorState {
  if (pi < 0.12 || map < 40)  return 'fail';
  if (pi < 0.30 || map < 55)  return 'artifact';
  return 'normal';
}

// Calcula el artefacto venoso sin estado React — solo usa timestamp
// Modelo: caida base + oscilacion senoidal lenta (ciclo ~7s) + microruido
// Resultado: lecturas como 94→88→91→86→93, no ruido blanco puro
function computeVenousArtifact(pi: number, map: number, nowMs: number): number {
  // Factor hipoperfusion 0→1 (0 en pi=0.30/map=55, 1 en pi=0.12/map=40)
  const piFactor  = pi  < 0.30 ? Math.max(0, (0.30 - pi)  / 0.18) : 0;
  const mapFactor = map < 55   ? Math.max(0, (55   - map)  / 15)   : 0;
  const factor    = Math.min(1.0, Math.max(piFactor, mapFactor));

  // Caida base: hasta -10 puntos en factor=1.0
  const baseDrop = factor * 10;

  // Oscilacion senoidal lenta (~7s ciclo) — simula busqueda de pulso
  const slowSin  = Math.sin(nowMs * 0.0009) * 4 * factor;

  // Microoscilacion rapida (~1.5s ciclo) — simula jitter del algoritmo
  const fastSin  = Math.sin(nowMs * 0.004 + 1.2) * 2 * factor;

  return baseDrop + slowSin + fastSin;
}

function drawLabels(ctx: CanvasRenderingContext2D, W: number, v: VS): void {
  const spo2Real = (typeof v.spo2 === 'number' && isFinite(v.spo2)) ? Math.round(v.spo2) : 97;
  const pi       = typeof v.plethAmplitude === 'number' && isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0;
  const map      = typeof v.meanArterialPressure === 'number' && isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
  const sensor   = getSensorState(pi, map);
  const nowMs    = performance.now();
  const blink    = Math.floor(nowMs / 700) % 2 === 0;

  let spo2Display: string;
  let spo2Unit:    string;
  let spo2Color:   string;

  if (sensor === 'fail') {
    spo2Display = blink ? '---' : '   ';
    spo2Unit    = 'SIN SENAL';
    spo2Color   = '#ef4444';
  } else if (sensor === 'artifact') {
    // Valor erratico: spo2 real - artefacto venoso (clampeado 70-99)
    const artifact     = computeVenousArtifact(pi, map, nowMs);
    const spo2Artifact = Math.round(Math.max(70, Math.min(99, spo2Real - artifact)));
    spo2Display = '~' + spo2Artifact;
    spo2Unit    = 'ARTEFACTO';
    spo2Color   = '#fbbf24';
  } else {
    spo2Display = String(spo2Real);
    spo2Unit    = '%';
    spo2Color   = CH[2].color;
  }

  const vals   = [
    isFinite(v.heartRate)       ? String(Math.round(v.heartRate))                             : '--',
    isFinite(v.systolicBP)      ? Math.round(v.systolicBP) + '/' + Math.round(v.diastolicBP) : '--/--',
    spo2Display,
    isFinite(v.etco2)           ? String(Math.round(v.etco2))                                 : '--',
    isFinite(v.respiratoryRate) ? String(Math.round(v.respiratoryRate))                       : '--',
  ];
  const units  = [CH[0].unit, CH[1].unit, spo2Unit, CH[3].unit, CH[4].unit];
  const colors = [CH[0].color, CH[1].color, spo2Color, CH[3].color, CH[4].color];

  for (let i = 0; i < NUM_CH; i++) {
    const top = i * CH_H;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, top, LABEL_W - 1, CH_H);
    ctx.fillStyle = colors[i];
    ctx.font      = 'bold 10px monospace';
    ctx.fillText(CH[i].label, 4, top + 15);
    ctx.fillStyle = colors[i];
    // Fuente mas pequena si el display es largo (artefacto o fail)
    const isLong = vals[i].length > 4;
    ctx.font      = isLong ? 'bold 11px monospace' : 'bold 13px monospace';
    ctx.fillText(vals[i], 2, top + 37);
    ctx.fillStyle = (i === 2 && sensor !== 'normal') ? spo2Color : '#446688';
    ctx.font      = (i === 2 && sensor !== 'normal') ? 'bold 7px monospace' : '9px monospace';
    ctx.fillText(units[i], 2, top + 51);
    if (i === 2) {
      ctx.fillStyle = '#2a3a4a';
      ctx.font      = '8px monospace';
      ctx.fillText('PI:' + (isFinite(pi) ? pi.toFixed(2) : '--'), 2, top + 63);
    }
  }

  ctx.strokeStyle = SEP_COLOR; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, CANVAS_H);
  ctx.stroke();
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props { width?: number; }

const WaveformMonitor: React.FC<Props> = ({ width: widthProp }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);

  const stRef = useRef({
    writeX:     0,
    lastTime:   0,
    phases:     [0, 0, 0, 0, 0] as number[],
    prevY:      new Array(NUM_CH).fill(null) as (number | null)[],
    labelTimer: 0,
    canvasW:    widthProp ?? 800,
    gridCanvas: null as HTMLCanvasElement | null,
  });

  useEffect(() => {
    const canvas  = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const initCanvas = (W: number): void => {
      if (W <= LABEL_W + 20) return;
      stRef.current.canvasW    = W;
      stRef.current.writeX     = 0;
      stRef.current.prevY      = new Array(NUM_CH).fill(null);
      stRef.current.gridCanvas = buildGrid(W);
      canvas.width  = W;
      canvas.height = CANVAS_H;
      ctx.drawImage(stRef.current.gridCanvas, 0, 0);
      drawLabels(ctx, W, usePatientStore.getState().vitals);
    };

    const initialW = widthProp ?? Math.max(400, wrapper.clientWidth || 800);
    initCanvas(initialW);

    const ro = new ResizeObserver((entries) => {
      if (widthProp) return;
      const W = Math.floor(entries[0].contentRect.width);
      if (W > 0 && Math.abs(W - stRef.current.canvasW) > 4) initCanvas(W);
    });
    ro.observe(wrapper);

    const loop = (timestamp: number): void => {
      const st = stRef.current;
      const dt = Math.min((timestamp - st.lastTime) / 1000, 0.05);
      st.lastTime = timestamp;

      if (dt > 0 && st.gridCanvas) {
        const W     = st.canvasW;
        const drawW = W - LABEL_W;
        if (drawW < 1) { rafRef.current = requestAnimationFrame(loop); return; }

        const { vitals } = usePatientStore.getState();
        const hrHz  = Math.max(0.2, (isFinite(vitals.heartRate)       ? vitals.heartRate       : 75) / 60);
        const rrHz  = Math.max(0.1, (isFinite(vitals.respiratoryRate) ? vitals.respiratoryRate : 14) / 60);
        const freqs = [hrHz, hrHz, hrHz, rrHz, rrHz];
        const pxStep = Math.max(1, Math.round(SCAN_PX_S * dt));

        for (let px = 0; px < pxStep; px++) {
          const xIdx    = Math.floor(st.writeX + px) % drawW;
          const canvasX = LABEL_W + xIdx;
          if (xIdx === 0) { st.prevY = new Array(NUM_CH).fill(null); }

          const eraseX = LABEL_W + (xIdx + ERASE_W) % drawW;
          const slice  = Math.min(ERASE_W, W - eraseX);
          if (slice > 0) {
            ctx.drawImage(st.gridCanvas, eraseX, 0, slice, CANVAS_H, eraseX, 0, slice, CANVAS_H);
          }

          for (let ch = 0; ch < NUM_CH; ch++) {
            st.phases[ch] = (st.phases[ch] + freqs[ch] / SCAN_PX_S) % 1;
            let amp = getAmp(ch, st.phases[ch], vitals.plethAmplitude);
            if (!isFinite(amp)) amp = 0.5;
            const curY = ampToY(ch, amp);
            ctx.fillStyle = CH[ch].color;
            if (st.prevY[ch] !== null) {
              const y1 = Math.min(st.prevY[ch]!, curY);
              const y2 = Math.max(st.prevY[ch]!, curY);
              ctx.fillRect(canvasX, y1, 2, Math.max(2, y2 - y1 + 2));
            } else {
              ctx.fillRect(canvasX, curY, 2, 2);
            }
            st.prevY[ch] = curY;
          }
        }

        st.writeX = (st.writeX + pxStep) % drawW;

        // Labels cada 0.25s para que el artefacto sea visiblemente erratico
        st.labelTimer += dt;
        if (st.labelTimer >= 0.25) {
          st.labelTimer = 0;
          drawLabels(ctx, W, vitals);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    stRef.current.lastTime = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [widthProp]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', lineHeight: 0, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          display:         'block',
          backgroundColor: BG_COLOR,
          borderRadius:    '4px',
          width:           '100%',
          height:          `${CANVAS_H}px`,
          pointerEvents:   'none',
        }}
      />
    </div>
  );
};

export default WaveformMonitor;
export { WaveformMonitor };