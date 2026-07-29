// src/components/ARDSStatusBar.tsx
//
// Barra SDRA 28 px. Visible SOLO cuando RespiratoryEngine diagnostica SDRA.
// Lee del pathology store (diagnosis, pfRatio, sfRatio) — NO del vitals store.
//
// Ref: Berlin 2012 (Ferguson NEJM; Ranieri JAMA); Global 2023 (Matthay AJRCCM).
//
// Dual P/F display (Fase 2 v0.19):
//   P/F real   = pfRatio del pathology store (suavizado τ=30s)
//   P/F est.   = PAO₂/FiO₂ instantáneo vía ecuación alveolar: 713 − PaCO₂/(FiO₂×0.8)
//   Diferencia ≡ "reserva de shunt" — alto gap = shunt-dominado, FiO₂ sola insuficiente

import React from 'react';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePatientStore } from '../store/usePatientStore';

// Constantes alveolar equation
const PB    = 760;
const PH2O  = 47;
const RQ    = 0.8;

export interface ARDSStatusBarProps {
  overrideSeverity?: 'none' | 'mild' | 'moderate' | 'severe';
}

const SEVERITY_CONFIG = {
  none:     { label: 'NORMAL',   border: '#334155', bg: '#1e293b', text: '#94a3b8', bar: '#475569' },
  mild:     { label: 'LEVE',     border: '#713f12', bg: '#1c1003', text: '#fbbf24', bar: '#d97706' },
  moderate: { label: 'MODERADO', border: '#9a3412', bg: '#1c0a03', text: '#fb923c', bar: '#ea580c' },
  severe:   { label: 'SEVERO',   border: '#7f1d1d', bg: '#1c0303', text: '#f87171', bar: '#dc2626' },
} as const;

export const ARDSStatusBar: React.FC<ARDSStatusBarProps> = ({ overrideSeverity }) => {
  const diagnosis = usePathologyStore(s => s.ards.diagnosis);
  const pfStore   = usePathologyStore(s => s.ards.pfRatio);
  const sfStore   = usePathologyStore(s => s.ards.sfRatio);
  const peep      = usePatientStore(s => s.ventilator.peep);
  const fio2Eff   = usePatientStore(s => s.ventilator.fio2Effective);
  const fio2Pct   = Math.round(fio2Eff * 100);
  const paCO2     = usePatientStore(s => s.vitals.paCO2);

  const sev    = overrideSeverity ?? diagnosis;
  const active = sev !== 'none';

  if (!active) return null;

  const cfg = SEVERITY_CONFIG[sev];

  // Seleccionar qué ratio mostrar: P/F si disponible, S/F si no hay PaO₂
  const showSF    = pfStore === 0 || pfStore > 900;
  const mainRatio = showSF ? sfStore : pfStore;
  const ratioLabel = showSF ? 'S/F' : 'P/F';

  // Barra proporcional (400 = normal SpO₂/FiO₂ base; ajustado para 0–400)
  const pfPct = Math.min(100, Math.max(0, (mainRatio / 400) * 100));

  // P/F estimado instantáneo (alveolar, sin suavizado τ=30s)
  const fio2Safe   = Math.max(0.21, fio2Eff);
  const pfInstant  = Math.round((PB - PH2O) - paCO2 / (fio2Safe * RQ));
  const pfInstClamp = Math.max(0, Math.min(999, pfInstant));

  const shuntGap  = pfInstClamp - mainRatio;
  const instColor = shuntGap > 200
    ? 'rgba(248,113,113,0.7)'
    : shuntGap > 80
      ? 'rgba(251,191,36,0.7)'
      : 'rgba(163,230,53,0.7)';

  return (
    <div
      role="status"
      aria-label={`SDRA ${cfg.label} — ${ratioLabel} ${mainRatio}`}
      style={{
        height: 28, flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 10, padding: '0 12px',
        background: cfg.bg,
        borderBottom: `1px solid ${cfg.border}`,
        borderTop: `1px solid ${cfg.border}`,
      }}
    >
      <span style={{ fontSize: '0.48rem', fontWeight: 900, letterSpacing: '0.14em', color: cfg.text, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        SDRA · {cfg.label}
      </span>

      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', minWidth: 40 }}>
        <div style={{ height: '100%', width: `${pfPct.toFixed(1)}%`, background: cfg.bar, borderRadius: 2, transition: 'width 1s ease' }} />
      </div>

      <span style={{ fontSize: '0.46rem', fontFamily: 'monospace', color: cfg.text, whiteSpace: 'nowrap' }}>
        <span style={{ opacity: 0.65, fontSize: '0.40rem' }}>{ratioLabel} real </span>
        <strong>{mainRatio}</strong>
        <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 5px' }}>→</span>
        <span style={{ opacity: 0.65, fontSize: '0.40rem' }}>est. </span>
        <em style={{ color: instColor, fontStyle: 'italic', fontWeight: 700 }}>~{pfInstClamp}</em>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
        PEEP <strong>{peep}</strong>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
        FiO₂ <strong>{fio2Pct}%</strong>
      </span>
    </div>
  );
};
