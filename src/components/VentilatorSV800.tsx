// src/components/VentilatorSV800.tsx
//
// ═══════════════════════════════════════════════════════════════════════════════
//  VentilatorSV800 — UI emuladora Mindray SV800
//  Dark mode, Glass UI, acentos ciano/verde/rojo.
//  Consume el VentilatorSV800Engine vía RespiratoryEngine.getSV800Engine().
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { RespiratoryEngine } from '../core/RespiratoryEngine';
import type { SV800Settings, VentMode } from '../core/VentilatorSV800Engine';
import { GeometricLung } from './GeometricLung';

// ─── WaveformPanel: canvas que dibuja Paw/Flow/Vol a 60 FPS ─────────────────

const WaveformPanel: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    const engine = RespiratoryEngine.getInstance().getSV800Engine();

    // 3 tracks: Paw, Flow, Vol
    const trackH = height / 3;
    const paint = () => {
      const wf = engine.getWaveforms();
      ctx.fillStyle = '#030509';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let y = 0; y <= height; y += trackH / 3) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      for (let x = 0; x <= width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }

      // Separadores entre tracks
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(0, trackH); ctx.lineTo(width, trackH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 2 * trackH); ctx.lineTo(width, 2 * trackH); ctx.stroke();

      // Labels
      ctx.fillStyle = '#64748b';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('Paw cmH₂O', 6, 14);
      ctx.fillText('Flow L/min', 6, trackH + 14);
      ctx.fillText('Vol mL', 6, 2 * trackH + 14);

      if (wf.length < 2) { rafRef.current = requestAnimationFrame(paint); return; }

      // Autoscale por track
      const drawTrack = (
        buf: Float32Array, yCenter: number, halfH: number,
        color: string, minRange: number, hasZeroLine: boolean,
      ) => {
        let mn = +Infinity, mx = -Infinity;
        for (let i = 0; i < wf.length; i++) {
          const v = buf[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (!isFinite(mn) || !isFinite(mx)) return;
        const range = Math.max(minRange, mx - mn);
        const pad = range * 0.1;
        const yMin = mn - pad;
        const yRange = range + 2 * pad;

        // Zero line
        if (hasZeroLine) {
          const yZero = yCenter + halfH - ((0 - yMin) / yRange) * (2 * halfH);
          if (yZero >= yCenter - halfH && yZero <= yCenter + halfH) {
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath(); ctx.moveTo(0, yZero); ctx.lineTo(width, yZero); ctx.stroke();
          }
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const stride = wf.length / width;
        for (let x = 0; x < width; x++) {
          const iLogical = Math.floor(x * stride);
          // índice físico en buffer circular
          const i = (wf.writeIdx - wf.length + iLogical + buf.length) % buf.length;
          const v = buf[i];
          const y = yCenter + halfH - ((v - yMin) / yRange) * (2 * halfH);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      const halfTrack = trackH / 2 - 8;
      drawTrack(wf.paw,  trackH * 0.5,  halfTrack, '#22d3ee', 10, false);
      drawTrack(wf.flow, trackH * 1.5,  halfTrack, '#a3e635', 20, true);
      drawTrack(wf.vol,  trackH * 2.5,  halfTrack, '#f59e0b', 100, false);

      rafRef.current = requestAnimationFrame(paint);
    };

    rafRef.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        background: '#030509',
      }}
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
      padding: '8px 10px',
      fontFamily: 'ui-monospace, monospace',
      boxShadow: alert ? '0 0 12px rgba(239,68,68,0.35)' : 'inset 0 0 8px rgba(0,0,0,0.5)',
    }}
  >
    <div style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.12em' }}>{label}</div>
    <div style={{
      fontSize: 18, fontWeight: 700, color: alert ? '#ef4444' : accent,
      marginTop: 2,
    }}>{value}</div>
    <div style={{ fontSize: 9, color: '#475569' }}>{unit}</div>
  </div>
);

// ─── Slider con etiqueta ────────────────────────────────────────────────────

const SV800Slider: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; accent?: string;
}> = ({ label, value, min, max, step, unit, onChange, accent = '#22d3ee' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace',
    }}>
      <span>{label}</span>
      <span style={{ color: accent, fontWeight: 700 }}>
        {value.toFixed(step < 1 ? 2 : 0)} {unit}
      </span>
    </div>
    <input type="range"
      min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ accentColor: accent, width: '100%' }}
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export const VentilatorSV800: React.FC = () => {
  const engine = RespiratoryEngine.getInstance();

  // Mirror del state SV800 → re-render cuando cambian settings
  const [settings, setSettings] = useState<SV800Settings>(() => engine.getSV800Settings());
  // Breath metrics mirror (polling cada 250ms)
  const [metrics, setMetrics] = useState(() => engine.getSV800Engine().getLastBreath());

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(engine.getSV800Engine().getLastBreath());
    }, 250);
    return () => clearInterval(id);
  }, [engine]);

  const patch = (p: Partial<SV800Settings>) => {
    engine.setSV800(p);
    setSettings({ ...engine.getSV800Settings() });
  };

  const modes: VentMode[] = ['VCV', 'PCV', 'PRVC', 'PSV', 'AMV'];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr 360px',
      gap: 10,
      padding: 12,
      background: '#060a12',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#e2e8f0',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
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
            fontStyle: 'italic', fontSize: 14,
          }}>Mindray SV800</span>
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
            <button key={m} onClick={() => patch({ mode: m })}
              style={{
                padding: '6px 0',
                background: settings.mode === m
                  ? 'rgba(34,211,238,0.18)'
                  : 'rgba(255,255,255,0.02)',
                color: settings.mode === m ? '#22d3ee' : '#94a3b8',
                border: `1px solid ${settings.mode === m
                  ? 'rgba(34,211,238,0.5)'
                  : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6, fontSize: 10, fontWeight: 700,
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

          <SV800Slider label="FiO₂" value={settings.fio2}
            min={0.21} max={1.0} step={0.01} unit=""
            onChange={v => patch({ fio2: v })} />
          <SV800Slider label="PEEP" value={settings.peep}
            min={0} max={25} step={1} unit="cmH₂O"
            onChange={v => patch({ peep: v })} />
          <SV800Slider label="V_T target" value={settings.vtTarget}
            min={200} max={800} step={10} unit="mL"
            onChange={v => patch({ vtTarget: v })} />
          <SV800Slider label="RR" value={settings.rrSet}
            min={6} max={40} step={1} unit="rpm"
            onChange={v => patch({ rrSet: v })} />
          <SV800Slider label="T_insp" value={settings.tInspSet}
            min={0.4} max={3.0} step={0.1} unit="s"
            onChange={v => patch({ tInspSet: v })} />
          {settings.mode === 'PCV' && (
            <SV800Slider label="P_insp" value={settings.pInspSet}
              min={5} max={40} step={1} unit="cmH₂O"
              onChange={v => patch({ pInspSet: v })} />
          )}
          {(settings.mode === 'PSV') && (
            <SV800Slider label="P_support" value={settings.pSupport}
              min={0} max={30} step={1} unit="cmH₂O"
              onChange={v => patch({ pSupport: v })} />
          )}
          {settings.mode === 'PRVC' && (
            <SV800Slider label="P_alarm MAX" value={settings.pMaxAlarm}
              min={25} max={60} step={1} unit="cmH₂O"
              onChange={v => patch({ pMaxAlarm: v })} accent="#f59e0b" />
          )}
          {settings.mode === 'AMV' && (
            <>
              <SV800Slider label="MV target" value={settings.amvMinuteVentTarget}
                min={4} max={14} step={0.5} unit="L/min"
                onChange={v => patch({ amvMinuteVentTarget: v })} accent="#e879f9" />
              <SV800Slider label="PBW" value={settings.amvWeightKg}
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
            <button onClick={() => patch({ atrcEnabled: !settings.atrcEnabled })}
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
              <button key={d} onClick={() => patch({ atrcTubeId: d })}
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
          <SV800Slider label="Compensación" value={settings.atrcCompensation}
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
              <button key={t} onClick={() => patch({ triggerType: t })}
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
            <SV800Slider label="Flow trigger" value={settings.flowTriggerLpm}
              min={0.5} max={15} step={0.5} unit="L/min"
              onChange={v => patch({ flowTriggerLpm: v })} />
          ) : (
            <SV800Slider label="P trigger" value={settings.pressTriggerCmH2O}
              min={0.5} max={20} step={0.5} unit="cmH₂O"
              onChange={v => patch({ pressTriggerCmH2O: v })} />
          )}
        </div>
      </div>

      {/* ─── COLUMNA CENTRAL: waveforms + monitor digital ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <WaveformPanel width={640} height={340} />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6,
        }}>
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
          <ValBox label="I:E" value={`1:${(1/Math.max(0.01, metrics.ieRatio)).toFixed(1)}`}
            unit="" accent="#34d399" />
          <ValBox label={settings.mode === 'PRVC' ? 'P_insp' : 'P_TRACH'}
            value={settings.mode === 'PRVC'
              ? metrics.pInspTarget.toFixed(1)
              : metrics.pTrachPeak.toFixed(1)}
            unit="cmH₂O"
            accent={settings.mode === 'PRVC' ? '#e879f9' : '#22d3ee'} />
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
    </div>
  );
};

export default VentilatorSV800;
