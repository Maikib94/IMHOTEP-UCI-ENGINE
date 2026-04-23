// src/components/ARDSStatusBar.tsx
// Barra SDRA compacta (28 px). Condicional: retorna null si ardsActive=false.
// Lee del store directamente — no necesita props de severidad externos.
// Histéresis en RespiratoryEngine (P/F activa ≤300, desactiva >320).
// Ref: ARDS Definition Task Force JAMA 2012 (Berlin); Ferguson ICM 2012.

import React from 'react';
import { usePatientStore } from '../store/usePatientStore';

// Props opcionales para override externo (testeo/storybook)
export interface ARDSStatusBarProps {
  overrideSeverity?: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
}

const SEVERITY_CONFIG = {
  NONE:     { label: 'NORMAL',   border: '#334155', bg: '#1e293b', text: '#94a3b8', bar: '#475569' },
  MILD:     { label: 'LEVE',     border: '#713f12', bg: '#1c1003', text: '#fbbf24', bar: '#d97706' },
  MODERATE: { label: 'MODERADO', border: '#9a3412', bg: '#1c0a03', text: '#fb923c', bar: '#ea580c' },
  SEVERE:   { label: 'SEVERO',   border: '#7f1d1d', bg: '#1c0303', text: '#f87171', bar: '#dc2626' },
} as const;

export const ARDSStatusBar: React.FC<ARDSStatusBarProps> = ({ overrideSeverity }) => {
  const ardsActive   = usePatientStore(s => s.vitals.ardsActive);
  const ardsSeverity = usePatientStore(s => s.vitals.ardsSeverityLevel);
  const pfRatio      = usePatientStore(s => s.vitals.pfRatio);
  const peep         = usePatientStore(s => s.ventilator.peep);
  const fio2Pct      = usePatientStore(s => Math.round(s.ventilator.fio2Effective * 100));

  const severity = overrideSeverity ?? ardsSeverity;
  const active   = overrideSeverity ? overrideSeverity !== 'NONE' : ardsActive;

  if (!active) return null;

  const cfg = SEVERITY_CONFIG[severity];
  // Barra P/F inversa: 0=400+ (verde), 100=0 (rojo) → se invierta visualmente
  const pfPct = Math.min(100, Math.max(0, (pfRatio / 400) * 100));

  return (
    <div
      role="status"
      aria-label={`SDRA ${cfg.label} — P/F ${pfRatio}`}
      style={{
        height: 28, flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 10, padding: '0 12px',
        background: cfg.bg,
        borderBottom: `1px solid ${cfg.border}`,
        borderTop: `1px solid ${cfg.border}`,
      }}
    >
      <span style={{
        fontSize: '0.48rem', fontWeight: 900, letterSpacing: '0.14em',
        color: cfg.text, fontFamily: 'monospace', whiteSpace: 'nowrap',
      }}>
        SDRA · {cfg.label}
      </span>

      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', minWidth: 40 }}>
        <div style={{
          height: '100%', width: `${pfPct.toFixed(1)}%`,
          background: cfg.bar, borderRadius: 2,
          transition: 'width 1s ease',
        }} />
      </div>

      <span style={{ fontSize: '0.46rem', fontFamily: 'monospace', color: cfg.text, whiteSpace: 'nowrap' }}>
        P/F <strong>{pfRatio}</strong>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
        PEEP <strong>{peep}</strong>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
        FiO₂ <strong>{fio2Pct}%</strong>
      </span>
    </div>
  );
};
