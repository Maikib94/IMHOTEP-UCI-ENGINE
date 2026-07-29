import React, { useEffect, useRef, useMemo } from 'react';
import { usePatientStore }  from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import type { ProceduresState } from '../store/usePatientStore';
import type { CaseCategory }    from '../store/usePathologyStore';

// ─── Configuración canvas ─────────────────────────────────────────────────────
const CH_H = 80;
const LABEL_W = 60;
const SCAN_PX_S = 80;
const ERASE_W = 12;
const BG_COLOR = '#060e1e';
const SEP_COLOR = '#1a3050';
const GRID_SMALL = '#0a1c32';
const GRID_LARGE = '#0f2844';

// Escalas de visualización por canal
const ART_DISPLAY_MAX  = 200;
const ETCO2_DISPLAY_MAX = 60;
const ICP_DISPLAY_MAX  = 40;

interface ChannelDef { id: string; label: string; color: string; unit: string; }

function buildVisibleChannels(
  procedures: ProceduresState,
  caseCategory: CaseCategory,
): ChannelDef[] {
  const channels: ChannelDef[] = [
    { id: 'ECG',   label: 'ECG',   color: '#00ff88', unit: 'bpm'   },
  ];
  if (procedures.arterialLine) {
    channels.push({ id: 'ART', label: 'ART', color: '#ff4444', unit: 'mmHg' });
  }
  channels.push({ id: 'PLETH', label: 'PLETH', color: '#00cfff', unit: '%'    });
  channels.push({ id: 'EtCO2', label: 'EtCO₂', color: '#ffdd00', unit: 'mmHg' });
  channels.push({ id: 'RESP',  label: 'RESP',  color: '#aaaaaa', unit: 'br/m' });
  if (procedures.picMonitor || caseCategory === 'neuro') {
    channels.push({ id: 'PIC', label: 'PIC', color: '#c084fc', unit: 'mmHg' });
  }
  return channels;
}

// Legacy static array — kept only for drawLabels / getAmp index references.
// Dynamic channels are now computed in the component via buildVisibleChannels.
const CH_STATIC = [
  { label: 'ECG', color: '#00ff88', unit: 'bpm'   },
  { label: 'ART', color: '#ff4444', unit: 'mmHg'  },
  { label: 'PLETH',color: '#00cfff', unit: '%'    },
  { label: 'EtCO2',color: '#ffdd00', unit: 'mmHg' },
  { label: 'RESP', color: '#aaaaaa', unit: 'br/m' },
  { label: 'PIC',  color: '#c084fc', unit: 'mmHg' },
];

// ─── Formas de onda — ESCALADAS con valores vitales reales ────────────────────

// ECG: morfología adapta levemente a FC extremas
// Bradicardia < 50 bpm → T-wave más prominente, inicio S más lento
// Taquicardia > 130 bpm → ST comprimido, T-wave reducida
function waveECG(ph: number, hr: number): number {
  const tAmp = hr < 55 ? 0.21 : hr > 130 ? 0.13 : 0.18;  // T-wave amplitude varía
  const stBase = hr > 130 ? 0.48 : 0.50;                 // ST basline leve shift
  if (ph >= 0.06 && ph < 0.13) return 0.5 + 0.10 * Math.sin((ph - 0.06) / 0.07 * Math.PI);
  if (ph >= 0.19 && ph < 0.215) return 0.5 - 0.14 * ((ph - 0.19) / 0.025);
  if (ph >= 0.215 && ph < 0.235) return 0.36 + ((ph - 0.215) / 0.020) * 0.59;
  if (ph >= 0.235 && ph < 0.265) return 0.95 - ((ph - 0.235) / 0.030) * 0.65;
  if (ph >= 0.265 && ph < 0.32) return 0.30 + ((ph - 0.265) / 0.055) * 0.20;
  if (ph >= 0.32 && ph < 0.38) return stBase;
  if (ph >= 0.38 && ph < 0.60) return 0.5 + tAmp * Math.sin((ph - 0.38) / 0.22 * Math.PI);
  return 0.50;
}

// ART: amplitud ESCALA con PAS/PAD reales (rango canvas 0-200 mmHg)
// Hipotensión PAS 80 → onda pequeña y baja; HTA PAS 160 → onda alta
// Muesca dicrótica visible y proporcional
function waveART(ph: number, sbp: number, dbp: number): number {
  const safeSbp = isFinite(sbp) && sbp > 20 ? sbp : 120;
  const safeDbp = isFinite(dbp) && dbp > 0 ? dbp : 80;
  // Auto-escala dinámica para la curva ART
  const displayMax = safeSbp <= 140 ? 150 : (safeSbp <= 190 ? 200 : 300);

  // Amplificación visual de la presión de pulso para no verse plana
  const map = (safeSbp + 2 * safeDbp) / 3;
  const pp = safeSbp - safeDbp;
  const visualPp = pp * 1.7; // Amplificador

  const visualSbp = Math.min(displayMax, map + visualPp * 0.45);
  const visualDbp = Math.max(0, map - visualPp * 0.55);

  const peakNorm = Math.max(0.08, Math.min(0.95, visualSbp / displayMax));
  const troughNorm = Math.max(0.04, Math.min(0.88, visualDbp / displayMax));
  const range = Math.max(0.02, peakNorm - troughNorm);

  // Forma original waveART: trough=0.12, peak=0.88, rango=0.76
  // Normalizamos a [0,1] y reescalamos a [troughNorm, peakNorm]
  let origAmp: number;
  if (ph < 0.13) {
    const t = ph / 0.13;
    origAmp = 0.12 + 0.76 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
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

// PLETH: Amplitud por perfusión periférica, modificada para reflejar shock y hipoxemia.
function wavePLETH(ph: number, v: VS): number {
  const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
  const spo2 = isFinite(v.spo2) ? v.spo2 : 98;
  const baseAmp = isFinite(v.plethAmplitude) && v.plethAmplitude > 0 ? v.plethAmplitude : 1.0;

  // BUG 1, FIX 1: Vincular amplitud del pletismógrafo a perfusión/PAM
  if (map < 45) {
    // "Loss of Signal" para PAM < 45 mmHg
    return 0.5 + (Math.random() - 0.5) * 0.05; // Flatline con ruido de bajo voltaje
  }

  let perfusionModifier = 1.0;
  if (map < 55) {
    // Amplitud cae drásticamente si PAM < 55 mmHg. Escala lineal de 1.0 a 0.1 entre 55 y 45.
    perfusionModifier = 0.1 + ((map - 45) / 10) * 0.9;
  }

  const finalAmp = baseAmp * perfusionModifier;
  const a = Math.max(0.01, Math.min(1.5, finalAmp));
  let waveValue = 0.12 + Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 2) * 0.76 * a;

  // BUG 1, FIX 2: Vincular forma de onda a desaturación
  if (spo2 < 88) {
    // Curva se vuelve errática si SpO2 < 88%
    const erraticFactor = Math.min(0.1, (88 - spo2) / 18 * 0.1);
    waveValue += (Math.random() - 0.5) * erraticFactor;
  }

  return waveValue;
}

// EtCO₂: AMPLITUD ESCALA con valor de etco2 real (0-60 mmHg)
// Apnea/etco2=0 → línea PLANA en baseline (crítico para verificar sedación)
// Normal etco2=38 → plateau completo; hipocapnia etco2=20 → plateau bajo
function waveETCO2(ph: number, etco2: number): number {
  const safeEtco2 = isFinite(etco2) && etco2 >= 0 ? etco2 : 38;
  const amplitude = Math.max(0, Math.min(1, safeEtco2 / ETCO2_DISPLAY_MAX));
  const baseline = 0.08;
  const plateauTop = baseline + amplitude * 0.80; // 0 = flat, 1 = full 0.88

  if (amplitude < 0.01) return baseline; // apnea → línea plana
  if (ph < 0.05) return baseline;
  if (ph < 0.12) return baseline + ((ph - 0.05) / 0.07) * (plateauTop - baseline); // subida exp
  if (ph < 0.58) return plateauTop; // fase alveolar (plateau)
  if (ph < 0.63) return plateauTop + 0.03 * Math.sin(((ph - 0.58) / 0.05) * Math.PI); // alpha angle
  if (ph < 0.72) return plateauTop - ((ph - 0.63) / 0.09) * (plateauTop - baseline); // caída insp
  return baseline;
}

// RESP: PLANA cuando FR = 0 (apnea); amplitud proporcional a esfuerzo
function waveRESP(ph: number, fr: number): number {
  if (!isFinite(fr) || fr <= 0) return 0.5; // apnea → flat line
  return 0.5 + 0.38 * Math.sin(ph * 2 * Math.PI);
}

// ─── PIC (Monroe-Kelly) — Onda de PIC 3 picos ────────────────────────────────
function waveICP(ph: number, icp: number): number {
  const safeIcp = isFinite(icp) && icp >= 0 ? icp : 12;

  // Auto-escala dinámica para PIC
  const displayMax = safeIcp <= 20 ? 30 : (safeIcp <= 40 ? 60 : 100);
  const baseline = Math.max(0.04, Math.min(0.85, safeIcp / displayMax));

  // Amplitud de pulso amplificada visualmente para distinguir morfología (P1, P2, P3)
  const basePulse = 4 + (safeIcp * 0.15);
  const pulseP1 = Math.max(0.08, Math.min(0.45, (basePulse / displayMax) * 2.0));

  // P2/P1 ratio: indicador de compliance (Monroe-Kelly)
  const p2p1Ratio = Math.min(1.5, Math.max(0.40, safeIcp / 18));
  const pulseP2 = pulseP1 * p2p1Ratio;
  const pulseP3 = pulseP1 * 0.30; // dicrótica siempre más pequeña

  // Forma "monofásica" en PIC crítica (>35 mmHg) — compliance abolida
  const monophasicBlend = Math.max(0, Math.min(1, (safeIcp - 30) / 10)); // 0 normal, 1 herniación

  if (ph < 0.05 || ph > 0.86) return baseline;

  // P1: onda de percusión (0.05–0.20)
  if (ph < 0.22) {
    const t = (ph - 0.05) / 0.17;
    const p1 = pulseP1 * Math.sin(Math.min(t, 1) * Math.PI);
    return baseline + p1 * (1 - monophasicBlend * 0.5);
  }

  // Nadir P1–P2
  if (ph < 0.27) return baseline + pulseP1 * 0.12;

  // P2: onda tidal (0.27–0.47)
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
function getAmpById(channelId: string, phase: number, v: VS): number {
  switch (channelId) {
    case 'ECG':   return waveECG(phase, isFinite(v.heartRate) ? v.heartRate : 75);
    case 'ART':   return waveART(phase, isFinite(v.systolicBP) ? v.systolicBP : 120, isFinite(v.diastolicBP) ? v.diastolicBP : 80);
    case 'PLETH': return wavePLETH(phase, v);
    case 'EtCO2': return waveETCO2(phase, isFinite(v.etco2) ? v.etco2 : 38);
    case 'RESP':  return waveRESP(phase, isFinite(v.respiratoryRate) ? v.respiratoryRate : 14);
    case 'PIC':   return waveICP(phase, isFinite(v.icp) ? v.icp : 12);
    default:      return 0.5;
  }
}

// Legacy index-based wrapper — used internally during canvas render
function getAmp(ch: number, phase: number, v: VS): number {
  const ids = ['ECG','ART','PLETH','EtCO2','RESP','PIC'];
  return getAmpById(ids[ch] ?? 'ECG', phase, v);
}

function ampToY(ch: number, amp: number): number {
  const clamped = Math.max(0.02, Math.min(0.98, amp));
  const margin = CH_H * 0.08;
  return Math.round(ch * CH_H + margin + (1 - clamped) * (CH_H - margin * 2));
}

function buildGrid(W: number, numCh: number): HTMLCanvasElement {
  const canvasH = numCh * CH_H;
  const gc = document.createElement('canvas');
  gc.width = W;
  gc.height = canvasH;
  const ctx = gc.getContext('2d');
  if (!ctx) return gc;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, canvasH);
  ctx.strokeStyle = GRID_SMALL; ctx.lineWidth = 0.5;
  for (let x = LABEL_W; x <= W; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); }
  for (let y = 0; y <= canvasH; y += 4) { ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(W, y); ctx.stroke(); }

  ctx.strokeStyle = GRID_LARGE; ctx.lineWidth = 1;
  for (let x = LABEL_W; x <= W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); }
  for (let y = 0; y <= canvasH; y += 20) { ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(W, y); ctx.stroke(); }

  ctx.strokeStyle = SEP_COLOR; ctx.lineWidth = 1;
  for (let i = 1; i < numCh; i++) { ctx.beginPath(); ctx.moveTo(0, i * CH_H); ctx.lineTo(W, i * CH_H); ctx.stroke(); }

  ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, canvasH); ctx.stroke();
  return gc;
}

// ─── Lógica sensor SpO2 ───────────────────────────────────────────────────────
type SensorState = 'normal' | 'artifact' | 'fail';

function getSensorState(pi: number, map: number): SensorState {
  if (pi < 0.12 || map < 40) return 'fail';
  if (pi < 0.30 || map < 55) return 'artifact';
  return 'normal';
}

const getVitalStatus = (
  value: number,
  normalColor: string,
  thresholds: { crit_low?: number; warn_low?: number; warn_high?: number; crit_high?: number; }
): { color: string; level: 'none' | 'warning' | 'critical' } => {
  if (value < 0) return { color: normalColor, level: 'none' };

  if (thresholds.crit_low !== undefined && value < thresholds.crit_low) return { color: '#ef4444', level: 'critical' };
  if (thresholds.crit_high !== undefined && value > thresholds.crit_high) return { color: '#ef4444', level: 'critical' };
  if (thresholds.warn_low !== undefined && value < thresholds.warn_low) return { color: '#f97316', level: 'warning' };
  if (thresholds.warn_high !== undefined && value > thresholds.warn_high) return { color: '#f97316', level: 'warning' };

  return { color: normalColor, level: 'none' };
};

function computeVenousArtifact(pi: number, map: number, nowMs: number): number {
  const piFactor = pi < 0.30 ? Math.max(0, (0.30 - pi) / 0.18) : 0;
  const mapFactor = map < 55 ? Math.max(0, (55 - map) / 15) : 0;
  const factor = Math.min(1.0, Math.max(piFactor, mapFactor));
  const baseDrop = factor * 10;
  const slowSin = Math.sin(nowMs * 0.0009) * 4 * factor;
  const fastSin = Math.sin(nowMs * 0.004 + 1.2) * 2 * factor;
  return baseDrop + slowSin + fastSin;
}

// ─── drawLabels ───────────────────────────────────────────────────────────────
function drawLabels(
  ctx: CanvasRenderingContext2D,
  W: number, v: VS,
  audioCriticalRef: React.RefObject<HTMLAudioElement | null>,
  audioWarningRef: React.RefObject<HTMLAudioElement | null>,
  stRef: React.MutableRefObject<{ alarmLevel: 'none' | 'warning' | 'critical';[key: string]: any; }>
): void {
  const hr = isFinite(v.heartRate) ? Math.round(v.heartRate) : -1;
  const sbp = isFinite(v.systolicBP) ? Math.round(v.systolicBP) : -1;
  const dbp = isFinite(v.diastolicBP) ? Math.round(v.diastolicBP) : -1;
  const map = typeof v.meanArterialPressure === 'number' && isFinite(v.meanArterialPressure) ? v.meanArterialPressure : -1;
  const spo2Real = (typeof v.spo2 === 'number' && isFinite(v.spo2)) ? Math.round(v.spo2) : -1;
  const etco2 = isFinite(v.etco2) ? Math.round(v.etco2) : -1;
  const rr = isFinite(v.respiratoryRate) ? Math.round(v.respiratoryRate) : -1;
  const icp = typeof v.icp === 'number' && isFinite(v.icp) ? Math.round(v.icp) : -1;
  const pi = typeof v.plethAmplitude === 'number' && isFinite(v.plethAmplitude) ? v.plethAmplitude : 1.0;
  const cpp = (map !== -1 && icp !== -1) ? Math.round(map - icp) : -1;

  const sensor = getSensorState(pi, map);
  const nowMs = performance.now();
  const blink = Math.floor(nowMs / 600) % 2 === 0;

  let spo2Display: string;
  let spo2Unit: string;
  let spo2SensorColor: string;

  if (sensor === 'fail') {
    spo2Display = blink ? '---' : '   ';
    spo2Unit = 'SIN SENAL';
    spo2SensorColor = '#ef4444';
  } else if (sensor === 'artifact') {
    const artifact = computeVenousArtifact(pi, map, nowMs);
    const spo2Artifact = Math.round(Math.max(70, Math.min(99, spo2Real - artifact)));
    spo2Display = '~' + spo2Artifact;
    spo2Unit = 'ARTEFACTO';
    spo2SensorColor = '#fbbf24';
  } else {
    spo2Display = spo2Real !== -1 ? String(spo2Real) : '--';
    spo2Unit = '%';
    spo2SensorColor = CH_STATIC[2].color;
  }

  const hrStatus   = getVitalStatus(hr,      CH_STATIC[0].color, { crit_low: 40, warn_low: 55, warn_high: 120, crit_high: 140 });
  const artStatus  = getVitalStatus(map,     CH_STATIC[1].color, { crit_low: 65, warn_high: 110, crit_high: 130 });
  const spo2Status = getVitalStatus(spo2Real,spo2SensorColor,    { crit_low: 88, warn_low: 92 });
  const etco2Status= getVitalStatus(etco2,   CH_STATIC[3].color, { crit_low: 25, warn_low: 35, warn_high: 50, crit_high: 65 });
  const rrStatus   = getVitalStatus(rr,      CH_STATIC[4].color, { crit_low: 8, warn_low: 12, warn_high: 28, crit_high: 35 });
  const icpStatus  = getVitalStatus(icp,     CH_STATIC[5].color, { warn_high: 20, crit_high: 30 });
  const cppColor = cpp < 50 ? '#ef4444' : cpp < 60 ? '#f97316' : '#a3e635';

  if (sensor !== 'normal') {
    spo2Status.color = spo2SensorColor;
  }

  // Build per-channel display data by channel ID
  const chData: { val: string; unit: string; color: string; blink: boolean; extra?: string }[] = [];

  for (const ch of (stRef.current as any).visibleChs as ChannelDef[]) {
    switch (ch.id) {
      case 'ECG':
        chData.push({ val: hr !== -1 ? String(hr) : '--', unit: ch.unit, color: hrStatus.color, blink: hrStatus.level === 'critical' });
        break;
      case 'ART':
        chData.push({ val: sbp !== -1 && dbp !== -1 ? `${sbp}/${dbp}` : '--/--', unit: map !== -1 ? `(${Math.round(map)})` : '', color: artStatus.color, blink: artStatus.level === 'critical' });
        break;
      case 'PLETH':
        chData.push({ val: spo2Display, unit: spo2Unit, color: spo2Status.color, blink: spo2Status.level === 'critical' || sensor === 'fail', extra: 'PI:' + (isFinite(pi) ? pi.toFixed(2) : '--') });
        break;
      case 'EtCO2':
        chData.push({ val: etco2 !== -1 ? String(etco2) : '--', unit: ch.unit, color: etco2Status.color, blink: etco2Status.level === 'critical' });
        break;
      case 'RESP':
        chData.push({ val: rr !== -1 ? String(rr) : '--', unit: ch.unit, color: rrStatus.color, blink: rrStatus.level === 'critical' });
        break;
      case 'PIC':
        chData.push({ val: icp !== -1 ? String(icp) : '--', unit: cpp !== -1 ? `CPP:${cpp}` : 'CPP:--', color: icpStatus.color, blink: icpStatus.level === 'critical', extra: icp > 20 && icp !== -1 ? 'P2>P1' : undefined });
        break;
      default:
        chData.push({ val: '--', unit: '', color: '#446688', blink: false });
    }
  }

  let highestAlarmLevel: 'none' | 'warning' | 'critical' = 'none';
  const statuses = [hrStatus, artStatus, spo2Status, etco2Status, rrStatus, icpStatus];
  if (chData.some(d => d.blink)) highestAlarmLevel = 'critical';
  else if (statuses.some(s => s.level === 'warning')) highestAlarmLevel = 'warning';

  const audioCriticalEl = audioCriticalRef.current;
  const audioWarningEl  = audioWarningRef.current;
  if (highestAlarmLevel !== stRef.current.alarmLevel) {
    if (audioCriticalEl) { audioCriticalEl.pause(); audioCriticalEl.currentTime = 0; }
    if (audioWarningEl)  { audioWarningEl.pause();  audioWarningEl.currentTime  = 0; }
    if (highestAlarmLevel === 'critical' && audioCriticalEl)
      audioCriticalEl.play().catch(e => console.warn('alarm:', e));
    else if (highestAlarmLevel === 'warning' && audioWarningEl)
      audioWarningEl.play().catch(e => console.warn('alarm:', e));
    stRef.current.alarmLevel = highestAlarmLevel;
  }

  const vChs = (stRef.current as any).visibleChs as ChannelDef[];
  const canvasH = vChs.length * CH_H;

  for (let i = 0; i < vChs.length; i++) {
    const ch = vChs[i];
    const d  = chData[i];
    const top = i * CH_H;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, top, LABEL_W - 1, CH_H);

    ctx.fillStyle = d.color;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(ch.label, 4, top + 15);

    const valueColor = (d.blink && blink) ? BG_COLOR : d.color;
    ctx.fillStyle = valueColor;
    const isLong = d.val.length > 4;
    ctx.font = `bold ${isLong ? '11px' : '13px'} "JetBrains Mono", monospace`;
    ctx.fillText(d.val, 2, top + 37);

    if (ch.id === 'PIC') {
      ctx.fillStyle = cppColor;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.fillText(d.unit, 2, top + 51);
      if (d.extra) { ctx.fillStyle = icpStatus.color; ctx.font = '7px "JetBrains Mono", monospace'; ctx.fillText(d.extra, 2, top + 63); }
    } else if (ch.id === 'PLETH') {
      ctx.fillStyle = sensor !== 'normal' ? spo2SensorColor : '#446688';
      ctx.font = `bold ${sensor !== 'normal' ? '7px' : '9px'} "JetBrains Mono", monospace`;
      ctx.fillText(d.unit, 2, top + 51);
      if (d.extra) { ctx.fillStyle = '#2a3a4a'; ctx.font = '8px "JetBrains Mono", monospace'; ctx.fillText(d.extra, 2, top + 63); }
    } else {
      ctx.fillStyle = '#446688';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(d.unit, 2, top + 51);
    }
  }

  ctx.strokeStyle = SEP_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, canvasH);
  ctx.stroke();
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props { width?: number; }

const WaveformMonitor: React.FC<Props> = ({ width: widthProp }) => {
  // ── Dynamic channel visibility ────────────────────────────────────────────
  const procedures   = usePatientStore(s => s.procedures);
  const caseCategory = usePathologyStore(s => s.caseCategory);

  const visibleChs = useMemo(
    () => buildVisibleChannels(procedures, caseCategory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [procedures.arterialLine, procedures.picMonitor, caseCategory]
  );
  const numCh = visibleChs.length;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCriticalRef = useRef<HTMLAudioElement>(null);
  const audioWarningRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);

  const stRef = useRef({
    writeX: 0,
    lastTime: 0,
    phases: new Array(numCh).fill(0) as number[],
    alarmLevel: 'none' as 'none' | 'warning' | 'critical',
    prevY: new Array(numCh).fill(null) as (number | null)[],
    labelTimer: 0,
    canvasW: widthProp ?? 800,
    gridCanvas: null as HTMLCanvasElement | null,
    visibleChs,  // stored for drawLabels access
  });

  // Sync visibleChs into stRef on each render
  stRef.current.visibleChs = visibleChs;

  const gridCanvas = useMemo(
    () => buildGrid(stRef.current.canvasW, numCh),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stRef.current.canvasW, numCh]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const initCanvas = (W: number): void => {
      if (W <= LABEL_W + 20) return;
      const nch = stRef.current.visibleChs.length;
      const canvasH = nch * CH_H;
      stRef.current.canvasW = W;
      stRef.current.writeX  = 0;
      stRef.current.prevY   = new Array(nch).fill(null);
      stRef.current.phases  = new Array(nch).fill(0);
      stRef.current.gridCanvas = buildGrid(W, nch);
      canvas.width  = W;
      canvas.height = canvasH;
      ctx.drawImage(stRef.current.gridCanvas, 0, 0);
      drawLabels(ctx, W, usePatientStore.getState().vitals, audioCriticalRef, audioWarningRef, stRef);
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
        const W = st.canvasW;
        const drawW = W - LABEL_W;
        if (drawW < 1) { rafRef.current = requestAnimationFrame(loop); return; }

        const { vitals } = usePatientStore.getState();
        const vChs  = st.visibleChs;
        const nch   = vChs.length;
        const canvasH = nch * CH_H;
        const hrHz  = Math.max(0.2, (isFinite(vitals.heartRate) ? vitals.heartRate : 75) / 60);
        const rrHz  = Math.max(0.1, (isFinite(vitals.respiratoryRate) ? vitals.respiratoryRate : 14) / 60);
        // Frequency per channel by ID
        const freqs = vChs.map(ch => ch.id === 'RESP' || ch.id === 'EtCO2' ? rrHz : hrHz);
        const pxStep = Math.max(1, Math.round(SCAN_PX_S * dt));

        for (let px = 0; px < pxStep; px++) {
          const xIdx   = Math.floor(st.writeX + px) % drawW;
          const canvasX = LABEL_W + xIdx;

          if (xIdx === 0) {
            st.prevY = new Array(nch).fill(null);
          }

          const eraseX = LABEL_W + (xIdx + ERASE_W) % drawW;
          const slice  = Math.min(ERASE_W, W - eraseX);
          if (slice > 0) {
            ctx.drawImage(st.gridCanvas, eraseX, 0, slice, canvasH, eraseX, 0, slice, canvasH);
          }

          for (let ch = 0; ch < nch; ch++) {
            st.phases[ch] = ((st.phases[ch] ?? 0) + freqs[ch] / SCAN_PX_S) % 1;
            let amp = getAmpById(vChs[ch].id, st.phases[ch], vitals);
            if (!isFinite(amp)) amp = 0.5;
            const curY = ampToY(ch, amp);
            ctx.fillStyle = vChs[ch].color;

            // FIX: Condición robusta para evitar el efecto telaraña al hacer wrap-around
            if (st.prevY[ch] !== null && canvasX > LABEL_W + pxStep) {
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
        st.labelTimer += dt;
        if (st.labelTimer >= 0.25) {
          st.labelTimer = 0;
          drawLabels(ctx, W, vitals, audioCriticalRef, audioWarningRef, stRef);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    stRef.current.lastTime = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [widthProp, gridCanvas]);

  // Re-init canvas when number of visible channels changes
  useEffect(() => {
    const canvas  = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = stRef.current.canvasW || Math.max(400, wrapper.clientWidth || 800);
    const nch     = visibleChs.length;
    const canvasH = nch * CH_H;
    stRef.current.writeX  = 0;
    stRef.current.prevY   = new Array(nch).fill(null);
    stRef.current.phases  = new Array(nch).fill(0);
    stRef.current.gridCanvas = buildGrid(W, nch);
    canvas.width  = W;
    canvas.height = canvasH;
    ctx.drawImage(stRef.current.gridCanvas, 0, 0);
    drawLabels(ctx, W, usePatientStore.getState().vitals, audioCriticalRef, audioWarningRef, stRef);
  }, [numCh]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapperRef} className="w-full leading-[0] relative">
      <canvas
        ref={canvasRef}
        className="block bg-[#060e1e] rounded w-full pointer-events-none"
        style={{ height: `${numCh * CH_H}px` }}
      />
      <audio ref={audioCriticalRef} src="/sounds/alarm-critical.mp3" loop preload="auto" />
      <audio ref={audioWarningRef} src="/sounds/alarm-warning.mp3" loop preload="auto" />
    </div>
  );
};

export default WaveformMonitor;
export { WaveformMonitor };