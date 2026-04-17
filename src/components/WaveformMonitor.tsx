import React, { useEffect, useRef } from 'react';
import { usePatientStore } from '../store/usePatientStore';

// ─── Configuración canvas ─────────────────────────────────────────────────────
const NUM_CH     = 6;
const CH_H       = 80;
const CANVAS_H   = NUM_CH * CH_H;
const LABEL_W    = 60;
const SCAN_PX_S  = 80;
const ERASE_W    = 12;
const BG_COLOR   = '#060e1e';
const SEP_COLOR  = '#1a3050';
const GRID_SMALL = '#0a1c32';
const GRID_LARGE = '#0f2844';

// Escalas de visualización por canal (representa el rango mmHg o % del eje Y)
const ART_DISPLAY_MAX  = 200;  // canvas 0→1 representa 0→200 mmHg ART
const ETCO2_DISPLAY_MAX = 60;  // canvas 0→1 representa 0→60 mmHg EtCO₂
const ICP_DISPLAY_MAX  = 40;   // canvas 0→1 representa 0→40 mmHg PIC

const CH = [
  { label: 'ECG',   color: '#00ff88', unit: 'bpm'  },
  { label: 'ART',   color: '#ff4444', unit: 'mmHg' },
  { label: 'PLETH', color: '#00cfff', unit: '%'    },
  { label: 'EtCO2', color: '#ffdd00', unit: 'mmHg' },
  { label: 'RESP',  color: '#aaaaaa', unit: 'br/m' },
  { label: 'PIC',   color: '#c084fc', unit: 'mmHg' },
];

// ─── Formas de onda — ESCALADAS con valores vitales reales ────────────────────

// ECG: morfología adapta levemente a FC extremas
// Bradicardia < 50 bpm → T-wave más prominente, inicio S más lento
// Taquicardia > 130 bpm → ST comprimido, T-wave reducida
function waveECG(ph: number, hr: number): number {
  const tAmp   = hr < 55 ? 0.21 : hr > 130 ? 0.13 : 0.18;  // T-wave amplitude varía
  const stBase = hr > 130 ? 0.48 : 0.50;                     // ST basline leve shift
  if (ph >= 0.06 && ph < 0.13)  return 0.5 + 0.10 * Math.sin((ph - 0.06) / 0.07 * Math.PI);
  if (ph >= 0.19 && ph < 0.215) return 0.5 - 0.14 * ((ph - 0.19) / 0.025);
  if (ph >= 0.215 && ph < 0.235) return 0.36 + ((ph - 0.215) / 0.020) * 0.59;
  if (ph >= 0.235 && ph < 0.265) return 0.95 - ((ph - 0.235) / 0.030) * 0.65;
  if (ph >= 0.265 && ph < 0.32)  return 0.30 + ((ph - 0.265) / 0.055) * 0.20;
  if (ph >= 0.32  && ph < 0.38)  return stBase;
  if (ph >= 0.38  && ph < 0.60)  return 0.5 + tAmp * Math.sin((ph - 0.38) / 0.22 * Math.PI);
  return 0.50;
}

// ART: amplitud ESCALA con PAS/PAD reales (rango canvas 0-200 mmHg)
// Hipotensión PAS 80 → onda pequeña y baja; HTA PAS 160 → onda alta
// Muesca dicrótica visible y proporcional
function waveART(ph: number, sbp: number, dbp: number): number {
  const safeSbp = isFinite(sbp) && sbp > 20 ? sbp : 120;
  const safeDbp = isFinite(dbp) && dbp > 0  ? dbp : 80;
  const peakNorm   = Math.max(0.08, Math.min(0.95, safeSbp / ART_DISPLAY_MAX));
  const troughNorm = Math.max(0.04, Math.min(0.88, safeDbp / ART_DISPLAY_MAX));
  const range      = Math.max(0.02, peakNorm - troughNorm);

  // Forma original waveART: trough=0.12, peak=0.88, rango=0.76
  // Normalizamos a [0,1] y reescalamos a [troughNorm, peakNorm]
  let origAmp: number;
  if (ph < 0.13) {
    const t = ph / 0.13;
    origAmp = 0.12 + 0.76 * (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2);
  } else if (ph < 0.20) {
    origAmp = 0.88;
  } else if (ph >= 0.22 && ph < 0.28) {
    origAmp = 0.62 - 0.08 * Math.sin(((ph - 0.22) / 0.06) * Math.PI); // muesca dicrótica
  } else {
    const t = Math.max(0, (ph - 0.20) / 0.80);
    origAmp = 0.12 + 0.63 * Math.exp(-t * 2.8);
  }
  const rawNorm = (origAmp - 0.12) / 0.76; // normaliza original a [0,1]
  return troughNorm + rawNorm * range;
}

// PLETH: amplitud por perfusión periférica (plethAmplitude del engine)
function wavePLETH(ph: number, amp: number): number {
  const a = Math.max(0.04, Math.min(1.5, isFinite(amp) && amp > 0 ? amp : 1.0));
  return 0.12 + Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 2) * 0.76 * a;
}

// EtCO₂: AMPLITUD ESCALA con valor de etco2 real (0-60 mmHg)
// Apnea/etco2=0 → línea PLANA en baseline (crítico para verificar sedación)
// Normal etco2=38 → plateau completo; hipocapnia etco2=20 → plateau bajo
function waveETCO2(ph: number, etco2: number): number {
  const safeEtco2  = isFinite(etco2) && etco2 >= 0 ? etco2 : 38;
  const amplitude  = Math.max(0, Math.min(1, safeEtco2 / ETCO2_DISPLAY_MAX));
  const baseline   = 0.08;
  const plateauTop = baseline + amplitude * 0.80; // 0 = flat, 1 = full 0.88

  if (amplitude < 0.01) return baseline; // apnea → línea plana
  if (ph < 0.05)  return baseline;
  if (ph < 0.12)  return baseline + ((ph - 0.05) / 0.07) * (plateauTop - baseline); // subida exp
  if (ph < 0.58)  return plateauTop;   // fase alveolar (plateau)
  if (ph < 0.63)  return plateauTop + 0.03 * Math.sin(((ph - 0.58) / 0.05) * Math.PI); // alpha angle
  if (ph < 0.72)  return plateauTop - ((ph - 0.63) / 0.09) * (plateauTop - baseline); // caída insp
  return baseline;
}

// RESP: PLANA cuando FR = 0 (apnea); amplitud proporcional a esfuerzo
function waveRESP(ph: number, fr: number): number {
  if (!isFinite(fr) || fr <= 0) return 0.5; // apnea → flat line
  return 0.5 + 0.38 * Math.sin(ph * 2 * Math.PI);
}

// ─── PIC (Monroe-Kelly) — Onda de PIC 3 picos ────────────────────────────────
//
// MORFOLOGÍA CLÍNICA de la onda de PIC (Kirkness CJ et al., Heart Lung 2000):
//   P1 (Percusión): pulsación arterial directa (carótida → plexos coroideos)
//   P2 (Tidal):     refleja compliance intracraneal (↑ cuando compliancia ↓)
//   P3 (Dicrótica): cierre de válvula aórtica (dicrotic notch vascular)
//
// CAMBIO DIAGNÓSTICO (Lundberg / Monroe-Kelly):
//   PIC normal (≤15 mmHg):  P1 > P2 > P3 (amortiguación normal de LCR)
//   PIC elevada (15-25 mmHg): P2 → P1 (pérdida amortiguación LCR)
//   PIC crítica (>25 mmHg): P2 > P1 (onda "redondeada", compliance abolida)
//   PIC muy alta (>35 mmHg): onda casi monofásica (herniación inminente)
//
// Ref: Kirkness CJ et al. Intracranial pressure waveform analysis. Heart Lung 2000.
//      Robba C et al. Noninvasive ICP estimation. Neurocrit Care 2020.
//      Marmarou A et al. Intracranial pressure: Monroe-Kelly doctrine. J Neurosurg 1978.
//
function waveICP(ph: number, icp: number): number {
  const safeIcp   = isFinite(icp) && icp >= 0 ? icp : 12;
  const baseline  = Math.max(0.04, Math.min(0.85, safeIcp / ICP_DISPLAY_MAX));

  // Amplitud de pulso: 3-6 mmHg en condiciones normales
  const pulseP1 = 0.080; // P1 constante (pulsación arterial directa)

  // P2/P1 ratio: indicador de compliance (Monroe-Kelly)
  // Normal PIC=12: P2/P1 ≈ 0.55; PIC=20: ≈1.0 (P2=P1); PIC=30: ≈1.35 (P2>P1)
  const p2p1Ratio = Math.min(1.5, Math.max(0.40, safeIcp / 18));
  const pulseP2   = pulseP1 * p2p1Ratio;
  const pulseP3   = pulseP1 * 0.30; // dicrótica siempre más pequeña

  // Forma "monofásica" en PIC crítica (>35 mmHg) — compliance abolida
  const monophasicBlend = Math.max(0, Math.min(1, (safeIcp - 30) / 10)); // 0 normal, 1 herniación

  if (ph < 0.05 || ph > 0.86) return baseline;

  // P1: onda de percusión (0.05–0.20)
  if (ph < 0.22) {
    const t = (ph - 0.05) / 0.17;
    const p1 = pulseP1 * Math.sin(Math.min(t, 1) * Math.PI);
    // En PIC crítica: P1 y P2 se fusionan (onda única)
    return baseline + p1 * (1 - monophasicBlend * 0.5);
  }

  // Nadir P1–P2
  if (ph < 0.27) return baseline + pulseP1 * 0.12;

  // P2: onda tidal (0.27–0.47) — el DIAGNÓSTICO clave de Monroe-Kelly
  if (ph < 0.49) {
    const t = (ph - 0.27) / 0.22;
    return baseline + pulseP2 * Math.sin(Math.min(t, 1) * Math.PI);
  }

  // Nadir P2–P3
  if (ph < 0.53) return baseline + pulseP2 * 0.08;

  // P3: onda dicrótica (0.53–0.67)
  if (ph < 0.68) {
    const t = (ph - 0.53) / 0.15;
    return baseline + pulseP3 * Math.sin(Math.min(t, 1) * Math.PI) * (1 - monophasicBlend * 0.6);
  }

  // Descenso diastólico (0.68–0.86)
  const tDesc = (ph - 0.68) / 0.18;
  return baseline + pulseP3 * (1 - tDesc) * 0.12;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
type VS = ReturnType<typeof usePatientStore.getState>['vitals'];

function getAmp(ch: number, phase: number, v: VS): number {
  switch (ch) {
    case 0: return waveECG(phase,  isFinite(v.heartRate)       ? v.heartRate       : 75);
    case 1: return waveART(phase,  isFinite(v.systolicBP)      ? v.systolicBP      : 120,
                                   isFinite(v.diastolicBP)     ? v.diastolicBP     : 80);
    case 2: return wavePLETH(phase, isFinite(v.plethAmplitude) ? v.plethAmplitude  : 1.0);
    case 3: return waveETCO2(phase, isFinite(v.etco2)          ? v.etco2           : 38);
    case 4: return waveRESP(phase,  isFinite(v.respiratoryRate)? v.respiratoryRate : 14);
    case 5: return waveICP(phase,   isFinite(v.icp)            ? v.icp             : 12);
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

// ─── Lógica sensor SpO2 ───────────────────────────────────────────────────────
type SensorState = 'normal' | 'artifact' | 'fail';

function getSensorState(pi: number, map: number): SensorState {
  if (pi < 0.12 || map < 40)  return 'fail';
  if (pi < 0.30 || map < 55)  return 'artifact';
  return 'normal';
}

function computeVenousArtifact(pi: number, map: number, nowMs: number): number {
  const piFactor  = pi  < 0.30 ? Math.max(0, (0.30 - pi)  / 0.18) : 0;
  const mapFactor = map < 55   ? Math.max(0, (55   - map)  / 15)   : 0;
  const factor    = Math.min(1.0, Math.max(piFactor, mapFactor));
  const baseDrop  = factor * 10;
  const slowSin   = Math.sin(nowMs * 0.0009) * 4 * factor;
  const fastSin   = Math.sin(nowMs * 0.004 + 1.2) * 2 * factor;
  return baseDrop + slowSin + fastSin;
}

// ─── drawLabels — Panel izquierdo con valores numéricos por canal ─────────────
function drawLabels(ctx: CanvasRenderingContext2D, W: number, v: VS): void {
  const spo2Real = (typeof v.spo2 === 'number' && isFinite(v.spo2)) ? Math.round(v.spo2) : 97;
  const pi       = typeof v.plethAmplitude === 'number' && isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0;
  const map      = typeof v.meanArterialPressure === 'number' && isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
  const icp      = typeof v.icp === 'number' && isFinite(v.icp) ? Math.round(v.icp) : 12;
  const cpp      = Math.round(map - icp); // Presión de Perfusión Cerebral
  const sensor   = getSensorState(pi, map);
  const nowMs    = performance.now();
  const blink    = Math.floor(nowMs / 700) % 2 === 0;

  // SpO2
  let spo2Display: string;
  let spo2Unit:    string;
  let spo2Color:   string;
  if (sensor === 'fail') {
    spo2Display = blink ? '---' : '   ';
    spo2Unit    = 'SIN SENAL';
    spo2Color   = '#ef4444';
  } else if (sensor === 'artifact') {
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

  // ICP: color segun PIC y CPP
  const icpColor  = icp > 30 ? '#ef4444' : icp > 20 ? '#f97316' : CH[5].color;
  const cppColor  = cpp < 50 ? '#ef4444' : cpp < 60 ? '#f97316' : '#a3e635';

  const vals   = [
    isFinite(v.heartRate)       ? String(Math.round(v.heartRate))                               : '--',
    isFinite(v.systolicBP)      ? Math.round(v.systolicBP) + '/' + Math.round(v.diastolicBP)   : '--/--',
    spo2Display,
    isFinite(v.etco2)           ? String(Math.round(v.etco2))                                   : '--',
    isFinite(v.respiratoryRate) ? String(Math.round(v.respiratoryRate))                         : '--',
    String(icp),
  ];
  const units  = [CH[0].unit, CH[1].unit, spo2Unit, CH[3].unit, CH[4].unit, `CPP:${cpp}`];
  const colors = [CH[0].color, CH[1].color, spo2Color, CH[3].color, CH[4].color, icpColor];

  for (let i = 0; i < NUM_CH; i++) {
    const top = i * CH_H;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, top, LABEL_W - 1, CH_H);
    ctx.fillStyle = colors[i];
    ctx.font      = 'bold 10px monospace';
    ctx.fillText(CH[i].label, 4, top + 15);
    ctx.fillStyle = colors[i];
    const isLong = vals[i].length > 4;
    ctx.font      = isLong ? 'bold 11px monospace' : 'bold 13px monospace';
    ctx.fillText(vals[i], 2, top + 37);

    // Segunda línea: unidad / suplemento
    if (i === 2) {
      // SpO2: unit + PI
      ctx.fillStyle = (sensor !== 'normal') ? spo2Color : '#446688';
      ctx.font      = (sensor !== 'normal') ? 'bold 7px monospace' : '9px monospace';
      ctx.fillText(units[i], 2, top + 51);
      ctx.fillStyle = '#2a3a4a';
      ctx.font      = '8px monospace';
      ctx.fillText('PI:' + (isFinite(pi) ? pi.toFixed(2) : '--'), 2, top + 63);
    } else if (i === 5) {
      // PIC: CPP en color segun criticalidad
      ctx.fillStyle = cppColor;
      ctx.font      = 'bold 8px monospace';
      ctx.fillText(units[i], 2, top + 51);
      // Indicar P2>P1 si PIC > 20 (Monroe-Kelly pathological)
      if (icp > 20) {
        ctx.fillStyle = icpColor;
        ctx.font      = '7px monospace';
        ctx.fillText('P2>P1', 2, top + 63);
      }
    } else {
      ctx.fillStyle = '#446688';
      ctx.font      = '9px monospace';
      ctx.fillText(units[i], 2, top + 51);
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
    phases:     [0, 0, 0, 0, 0, 0] as number[],  // 6 canales
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
        // [ECG, ART, PLETH, EtCO2, RESP, PIC]
        // PIC pulsa con el corazón (igual que ECG y ART)
        const freqs = [hrHz, hrHz, hrHz, rrHz, rrHz, hrHz];
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
            let amp = getAmp(ch, st.phases[ch], vitals);
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

        // Labels cada 0.25s
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
    <div ref={wrapperRef} className="w-full leading-[0] relative">
      {/* h-[480px] = NUM_CH (6) × CH_H (80) — actualizar si cambian las constantes */}
      <canvas
        ref={canvasRef}
        className="block bg-[#060e1e] rounded w-full h-[480px] pointer-events-none"
      />
    </div>
  );
};

export default WaveformMonitor;
export { WaveformMonitor };