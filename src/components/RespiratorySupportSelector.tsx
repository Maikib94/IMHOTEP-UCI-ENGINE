// src/components/RespiratorySupportSelector.tsx
/* eslint-disable react/forbid-dom-props */
import React from 'react';
import {
  usePatientStore,
  computeDeviceFiO2,
  type RespiratorySupport,
} from '../store/usePatientStore';

interface Props {
  onOpenVent?: () => void;
}

const STEPS: {
  key: RespiratorySupport;
  label: string;
  color: string;
  glowColor: string;
}[] = [
  { key: 'room_air',      label: 'AIRE\nAMBIENTE',  color: '#94a3b8', glowColor: 'rgba(148,163,184,0.15)' },
  { key: 'nasal_cannula', label: 'CÁNULA\nNASAL',   color: '#38bdf8', glowColor: 'rgba(56,189,248,0.15)'  },
  { key: 'simple_mask',   label: 'MASC.\nSIMPLE',   color: '#60a5fa', glowColor: 'rgba(96,165,250,0.15)'  },
  { key: 'venturi',       label: 'VENTURI',          color: '#818cf8', glowColor: 'rgba(129,140,248,0.15)' },
  { key: 'hfnc',          label: 'HFNC',             color: '#a78bfa', glowColor: 'rgba(167,139,250,0.15)' },
  { key: 'arm',           label: 'VMI\n/ ARM',       color: '#34d399', glowColor: 'rgba(52,211,153,0.15)'  },
];

export default function RespiratorySupportSelector({ onOpenVent }: Props): React.ReactElement {
  const device          = usePatientStore(s => s.respiratoryDevice);
  const isVentConnected = usePatientStore(s => s.isVentilatorConnected);
  const ventFiO2        = usePatientStore(s => s.ventilator.fio2);
  const setSupport      = usePatientStore(s => s.setRespiratorySupport);
  const setDevice       = usePatientStore(s => s.setRespiratoryDevice);

  const active = device.support;
  const effectiveFiO2 = isVentConnected ? ventFiO2 : computeDeviceFiO2(device);

  function handleStep(key: RespiratorySupport) {
    setSupport(key);
    if (key === 'simple_mask' && (device.hfncFlow < 5 || device.hfncFlow > 10)) {
      setDevice({ hfncFlow: 7 });
    }
    if (key === 'arm') onOpenVent?.();
  }

  const fio2Pct = Math.round(effectiveFiO2 * 100);
  const fio2Color = effectiveFiO2 >= 0.70 ? '#f97316' : effectiveFiO2 >= 0.45 ? '#facc15' : '#34d399';

  return (
    <div style={{ padding: '8px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Header + FiO₂ badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.42rem', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Soporte Respiratorio
        </span>
        <span style={{
          fontSize: '0.48rem', fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
          color: fio2Color,
          background: 'rgba(0,0,0,0.35)', padding: '1px 6px',
          borderRadius: 4, border: `1px solid ${fio2Color}44`,
        }}>
          FiO₂ {fio2Pct}%
        </span>
      </div>

      {/* 3×2 horizontal grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
        {STEPS.map(({ key, label, color, glowColor }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleStep(key)}
              style={{
                padding: '5px 3px',
                borderRadius: 5,
                border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.06)'}`,
                background: isActive ? glowColor : '#0d1224',
                color: isActive ? color : '#374151',
                fontSize: '0.37rem',
                fontWeight: 900,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'center',
                lineHeight: 1.35,
                whiteSpace: 'pre-line',
                boxShadow: isActive ? `0 0 6px ${color}33` : 'none',
              }}
            >
              {isActive && (
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: color, margin: '0 auto 2px',
                  boxShadow: `0 0 5px ${color}`,
                }} />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Cánula Nasal ── */}
      {active === 'nasal_cannula' && (
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '0.38rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flujo Cánula</span>
            <span style={{ fontSize: '0.45rem', color: '#7dd3fc', fontFamily: 'monospace', fontWeight: 900 }}>{device.cannulaFlow} L/min</span>
          </div>
          <input type="range" min={1} max={6} step={1}
            value={device.cannulaFlow}
            title="Flujo cánula nasal (1-6 L/min)"
            onChange={e => setDevice({ cannulaFlow: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#38bdf8' }} />
          <div style={{ fontSize: '0.36rem', color: '#0369a1', marginTop: 2, textAlign: 'right' }}>
            FiO₂ ≈ {Math.round(Math.min(0.44, 0.21 + 0.04 * device.cannulaFlow) * 100)}%
          </div>
        </div>
      )}

      {/* ── Mascarilla Simple ── */}
      {active === 'simple_mask' && (
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '0.38rem', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flujo Mascarilla</span>
            <span style={{ fontSize: '0.45rem', color: '#93c5fd', fontFamily: 'monospace', fontWeight: 900 }}>
              {Math.max(5, Math.min(10, device.hfncFlow))} L/min
            </span>
          </div>
          <input type="range" min={5} max={10} step={1}
            value={Math.max(5, Math.min(10, device.hfncFlow))}
            title="Flujo mascarilla simple (5-10 L/min)"
            onChange={e => setDevice({ hfncFlow: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#60a5fa' }} />
        </div>
      )}

      {/* ── Venturi ── */}
      {active === 'venturi' && (
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6 }}>
          <div style={{ fontSize: '0.38rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
            FiO₂ Venturi
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {[0.24, 0.28, 0.31, 0.35, 0.40, 0.50, 0.60].map(fio2 => {
              const sel = device.venturiFiO2 === fio2;
              return (
                <button key={fio2} type="button"
                  onClick={() => setDevice({ venturiFiO2: fio2 })}
                  style={{
                    padding: '2px 5px', fontSize: '0.38rem', fontWeight: 900,
                    fontFamily: 'monospace', borderRadius: 4,
                    border: `1px solid ${sel ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                    background: sel ? 'rgba(99,102,241,0.35)' : '#0d1224',
                    color: sel ? '#c7d2fe' : '#475569',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >{Math.round(fio2 * 100)}%</button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HFNC ── */}
      {active === 'hfnc' && (
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '0.38rem', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>HFNC — Parámetros</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: '0.36rem', color: '#a78bfa' }}>Flujo</span>
              <span style={{ fontSize: '0.42rem', color: '#c4b5fd', fontFamily: 'monospace', fontWeight: 900 }}>{device.hfncFlow} L/min</span>
            </div>
            <input type="range" min={20} max={60} step={5}
              value={device.hfncFlow}
              title="Flujo HFNC (20-60 L/min)"
              onChange={e => setDevice({ hfncFlow: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#a78bfa' }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: '0.36rem', color: '#a78bfa' }}>FiO₂</span>
              <span style={{ fontSize: '0.42rem', color: '#c4b5fd', fontFamily: 'monospace', fontWeight: 900 }}>{Math.round(device.hfncFiO2 * 100)}%</span>
            </div>
            <input type="range" min={21} max={100} step={1}
              value={Math.round(device.hfncFiO2 * 100)}
              title="FiO2 HFNC (21-100%)"
              onChange={e => setDevice({ hfncFiO2: Number(e.target.value) / 100 })}
              style={{ width: '100%', accentColor: '#a78bfa' }} />
          </div>
          <div style={{ fontSize: '0.36rem', color: '#6d28d9', textAlign: 'right' }}>
            PEEP_eff ≈ {Math.min(5, device.hfncFlow / 10).toFixed(1)} cmH₂O
          </div>
        </div>
      )}

      {/* ── ARM ── */}
      {active === 'arm' && (
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6 }}>
          <div style={{ fontSize: '0.38rem', marginBottom: 5, fontWeight: 700, color: isVentConnected ? '#34d399' : '#6b7280' }}>
            {isVentConnected ? '● VENTILADOR CONECTADO' : '○ DESCONECTADO'}
          </div>
          <button
            type="button"
            onClick={() => { setSupport('arm'); onOpenVent?.(); }}
            style={{
              width: '100%', padding: '5px 4px', borderRadius: 5,
              border: '1px solid rgba(52,211,153,0.35)',
              background: 'rgba(16,185,129,0.12)',
              color: '#34d399', fontWeight: 900, fontSize: '0.4rem',
              letterSpacing: '0.07em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            ▶ ABRIR CONSOLA SM100
          </button>
        </div>
      )}
    </div>
  );
}
