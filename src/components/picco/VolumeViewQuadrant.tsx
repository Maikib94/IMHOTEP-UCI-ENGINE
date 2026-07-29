// src/components/picco/VolumeViewQuadrant.tsx
// Sub-componente cuadrante del PiCCOVolumeView.
// Stateless — recibe props, renderiza métricas con colores por rango clínico.
//
// Refs: Monnet X, Teboul JL. Crit Care 2017 (lockset CI/GEDI/EVLWI/SVV).
//       Bendjelid K et al. Br J Anaesth 2013 (validación EV1000/VolumeView).

import React, { memo } from 'react';

const MONO = "'JetBrains Mono', monospace";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuadrantMetric {
  label: string;
  value: string | number;
  unit:  string;
  range: [number, number];
}

export interface VolumeViewQuadrantProps {
  icon:              string;
  title:             string;
  accentColor:       string;
  primary:           QuadrantMetric;
  secondary?:        QuadrantMetric;
  tertiary?:         QuadrantMetric;
  quadrantPosition:  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  borderRight?:      boolean;
  borderBottom?:     boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RangeStatus = 'in' | 'borderline' | 'out';

function getStatus(val: number, [lo, hi]: [number, number]): RangeStatus {
  const margin = (hi - lo) * 0.15;
  if (val < lo - margin || val > hi + margin) return 'out';
  if (val < lo || val > hi) return 'borderline';
  return 'in';
}

const STATUS_COLORS: Record<RangeStatus, string> = {
  in:         '#10b981',
  borderline: '#f59e0b',
  out:        '#f87171',
};

function StatusDots({ status }: { status: RangeStatus }) {
  const c = STATUS_COLORS[status];
  const dim = 'rgba(255,255,255,0.12)';
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 3 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: c,
        boxShadow: `0 0 5px ${c}`,
        display: 'inline-block',
      }} />
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: status === 'in' ? c : dim,
        boxShadow: status === 'in' ? `0 0 5px ${c}` : 'none',
        display: 'inline-block',
      }} />
    </div>
  );
}

function MetricLine({ metric }: { metric: QuadrantMetric }) {
  const numVal = typeof metric.value === 'number' ? metric.value : parseFloat(String(metric.value));
  const status = Number.isFinite(numVal) ? getStatus(numVal, metric.range) : 'in';
  const color  = STATUS_COLORS[status];
  return (
    <div style={{
      marginTop: 4, paddingTop: 4,
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <span style={{ fontSize: '0.42rem', color: '#475569', fontFamily: MONO }}>
        {metric.label}
      </span>
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color, fontFamily: MONO }}>
        {metric.value}{metric.unit && <span style={{ fontSize: '0.36rem', marginLeft: 2, opacity: 0.6 }}>{metric.unit}</span>}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const VolumeViewQuadrant = memo(function VolumeViewQuadrant({
  icon, title, accentColor, primary, secondary, tertiary,
  borderRight, borderBottom,
}: VolumeViewQuadrantProps) {
  const numVal  = typeof primary.value === 'number' ? primary.value : parseFloat(String(primary.value));
  const status  = Number.isFinite(numVal) ? getStatus(numVal, primary.range) : 'in';
  const color   = STATUS_COLORS[status];

  return (
    <div style={{
      padding: '10px 10px 8px',
      borderRight:  borderRight  ? '1px solid rgba(255,255,255,0.06)' : undefined,
      borderBottom: borderBottom ? '1px solid rgba(255,255,255,0.06)' : undefined,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: '0.8rem' }}>{icon}</span>
        <span style={{
          fontSize: '0.44rem', fontWeight: 900, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: accentColor, opacity: 0.8,
          fontFamily: MONO,
        }}>
          {title}
        </span>
      </div>

      {/* Primary metric — large */}
      <div style={{
        fontSize: '1.8rem', fontWeight: 900, lineHeight: 1,
        color, fontFamily: MONO, letterSpacing: '-0.02em',
      }}>
        {primary.value}
      </div>
      <div style={{ fontSize: '0.4rem', color: '#334155', fontFamily: MONO, marginTop: 2 }}>
        {primary.label} · {primary.unit}
      </div>

      <StatusDots status={status} />

      {secondary && <MetricLine metric={secondary} />}
      {tertiary  && <MetricLine metric={tertiary} />}
    </div>
  );
});

export default VolumeViewQuadrant;
