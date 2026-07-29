// src/components/LabPanelClinicalDay.tsx
//
// LabPanel reorganizado por día clínico con:
//   - Tabs D1, D2, D3… (newest first)
//   - Delta vs día anterior colorizado
//   - Tab LONGITUDINAL: sparklines por analito clave
//   - Fallback al LabPanel clásico si < 2 días de datos

import React, { useState, useMemo, memo } from 'react';
import { usePatientStore }  from '../store/usePatientStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { partitionLabsByDay, sortedDaysDesc } from '../utils/clinicalDayPartition';
import type { LabOrder }    from '../store/usePatientStore';

const BG   = '#070d1b';
const MONO = "'JetBrains Mono', monospace";

const C: Record<string, string> = {
  normal: '#c8d6e5',
  high:   '#f97316',
  low:    '#38bdf8',
  crit:   '#ff4444',
  dimmed: '#475569',
  ref:    '#1e3a5f',
};

function flagColor(f: 'H' | 'L' | 'C' | ''): string {
  if (f === 'C') return C.crit;
  if (f === 'H') return C.high;
  if (f === 'L') return C.low;
  return C.normal;
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ current, prev }: { current: number; prev: number | undefined }) {
  if (prev === undefined || !isFinite(current) || !isFinite(prev)) return null;
  const d = current - prev;
  if (Math.abs(d) < 0.001) return null;
  const color = d > 0 ? '#f97316' : '#38bdf8';
  return (
    <span style={{ color, fontFamily: MONO, fontSize: '0.38rem', marginLeft: 4 }}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(2)}
    </span>
  );
}

// ─── Labs for one day ─────────────────────────────────────────────────────────

const LabsForDay = memo(function LabsForDay({
  orders,
  prevOrders,
}: { orders: LabOrder[]; prevOrders?: LabOrder[] }) {
  const resolved = orders.filter(o => o.result !== null);

  if (resolved.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: C.dimmed, fontFamily: MONO, fontSize: '0.5rem' }}>
        Sin resultados para este día.
      </div>
    );
  }

  const prevMap = new Map<string, Record<string, number | string>>();
  prevOrders?.forEach(o => {
    if (o.result) prevMap.set(o.type, o.result.values);
  });

  return (
    <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
      {resolved.map(o => {
        const { values, units, refs, flags } = o.result!;
        const prevVals = prevMap.get(o.type);
        const entries  = Object.entries(values);

        return (
          <div key={o.id} style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 10px', background: '#0b1420', borderLeft: '3px solid #1e3a5f',
            }}>
              <span style={{ color: '#60a5fa', fontFamily: MONO, fontSize: '0.52rem', fontWeight: 700 }}>
                {o.label}
              </span>
              <span style={{ color: C.dimmed, fontFamily: MONO, fontSize: '0.38rem' }}>
                +{Math.floor(o.readyAt / 3600).toString().padStart(2, '0')}h sim
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {entries.map(([analyte, val], idx) => {
                  const f      = flags[analyte] ?? '';
                  const color  = flagColor(f);
                  const numVal = typeof val === 'number' ? val : parseFloat(String(val));
                  const prevV  = prevVals?.[analyte];
                  const prevNum = typeof prevV === 'number' ? prevV : parseFloat(String(prevV ?? ''));

                  return (
                    <tr key={analyte} style={{ background: idx % 2 === 0 ? BG : '#0c1628' }}>
                      <td style={{ padding: '2px 10px', color: '#94a3b8', fontFamily: MONO, fontSize: '0.44rem', width: '40%' }}>
                        {analyte}
                      </td>
                      <td style={{ padding: '2px 6px', color, fontFamily: MONO, fontSize: '0.52rem', fontWeight: 700 }}>
                        {typeof val === 'number' ? val.toFixed(2) : val}
                        {f && <span style={{ color, fontSize: '0.38rem', marginLeft: 4 }}>{f}</span>}
                        <DeltaBadge current={numVal} prev={isFinite(prevNum) ? prevNum : undefined} />
                      </td>
                      <td style={{ padding: '2px 6px', color: '#334155', fontFamily: MONO, fontSize: '0.38rem' }}>
                        {units[analyte] ?? ''}
                      </td>
                      <td style={{ padding: '2px 10px', color: '#1e3a5f', fontFamily: MONO, fontSize: '0.36rem', textAlign: 'right' }}>
                        {refs[analyte] ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
});

// ─── Longitudinal sparkline chart ─────────────────────────────────────────────

const LONGITUDINAL_ANALYTES = [
  { key: 'Hb',       label: 'Hb',      unit: 'g/dL',   lo: 7,    hi: 16   },
  { key: 'Creat.',   label: 'Cr',      unit: 'mg/dL',  lo: 0.6,  hi: 1.2  },
  { key: 'Na',       label: 'Na⁺',     unit: 'mEq/L',  lo: 135,  hi: 145  },
  { key: 'K',        label: 'K⁺',      unit: 'mEq/L',  lo: 3.5,  hi: 5.0  },
  { key: 'Lactato',  label: 'Lac',     unit: 'mmol/L', lo: 0.5,  hi: 2.0  },
  { key: 'PCR',      label: 'CRP',     unit: 'mg/L',   lo: 0,    hi: 10   },
  { key: 'PCT',      label: 'PCT',     unit: 'ng/mL',  lo: 0,    hi: 0.5  },
  { key: 'pH',       label: 'pH',      unit: '',       lo: 7.35, hi: 7.45 },
];

function Sparkline({ points, lo, hi, color }: { points: number[]; lo: number; hi: number; color: string }) {
  if (points.length < 2) return <span style={{ color: '#475569', fontSize: '0.38rem', fontFamily: MONO }}>—</span>;
  const W = 60, H = 20;
  const pad = (hi - lo) * 0.15;
  const minV = Math.min(lo - pad, ...points);
  const maxV = Math.max(hi + pad, ...points);
  const rng = Math.max(0.001, maxV - minV);
  const pts = points.map((v, i) =>
    `${(i / (points.length - 1)) * W},${H - ((v - minV) / rng) * H}`
  ).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <line x1="0" y1={H - ((lo - minV) / rng) * H} x2={W} y2={H - ((lo - minV) / rng) * H}
            stroke="#1e3a5f" strokeWidth="0.5" />
      <line x1="0" y1={H - ((hi - minV) / rng) * H} x2={W} y2={H - ((hi - minV) / rng) * H}
            stroke="#1e3a5f" strokeWidth="0.5" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={(points.length - 1) / (points.length - 1) * W} cy={H - ((points[points.length - 1] - minV) / rng) * H}
              r="2" fill={color} />
    </svg>
  );
}

const LongitudinalChart = memo(function LongitudinalChart({
  grouped,
}: { grouped: Map<number, LabOrder[]> }) {
  const days = sortedDaysDesc(grouped).reverse();

  return (
    <div style={{ overflowY: 'auto', maxHeight: '60vh', padding: '8px 4px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO }}>
        <thead>
          <tr style={{ background: '#0b1420' }}>
            <th style={{ padding: '4px 8px', color: '#475569', fontSize: '0.42rem', textAlign: 'left' }}>Analito</th>
            {days.map(d => (
              <th key={d} style={{ padding: '4px 8px', color: '#60a5fa', fontSize: '0.44rem' }}>D{d}</th>
            ))}
            <th style={{ padding: '4px 8px', color: '#475569', fontSize: '0.42rem' }}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {LONGITUDINAL_ANALYTES.map(({ key, label, unit, lo, hi }, ri) => {
            const series: number[] = [];
            const byDay: (number | null)[] = days.map(d => {
              const dayOrders = grouped.get(d) ?? [];
              for (const o of dayOrders) {
                if (o.result) {
                  const v = o.result.values[key];
                  if (typeof v === 'number' || !isNaN(parseFloat(String(v)))) {
                    const n = typeof v === 'number' ? v : parseFloat(String(v));
                    series.push(n);
                    return n;
                  }
                }
              }
              return null;
            });

            const lastVal = byDay.filter(v => v !== null).slice(-1)[0] ?? null;
            const color   = lastVal !== null
              ? (lastVal < lo || lastVal > hi ? '#f87171' : '#10b981')
              : '#475569';

            return (
              <tr key={key} style={{ background: ri % 2 === 0 ? BG : '#0c1628' }}>
                <td style={{ padding: '3px 8px', color: '#94a3b8', fontSize: '0.44rem' }}>
                  {label}
                  {unit && <span style={{ color: '#334155', marginLeft: 4, fontSize: '0.36rem' }}>{unit}</span>}
                </td>
                {byDay.map((v, i) => (
                  <td key={i} style={{ padding: '3px 8px', color: v !== null ? color : '#1e3a5f', fontSize: '0.48rem', fontWeight: 700, textAlign: 'center' }}>
                    {v !== null ? (Number.isInteger(v) ? v : v.toFixed(2)) : '—'}
                  </td>
                ))}
                <td style={{ padding: '3px 8px', verticalAlign: 'middle' }}>
                  <Sparkline points={series} lo={lo} hi={hi} color={color} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onSelect,
}: { tabs: string[]; active: string; onSelect: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f', background: '#060d1a', flexShrink: 0 }}>
      {tabs.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(t)}
          style={{
            padding: '5px 10px',
            fontFamily: MONO,
            fontSize: '0.46rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active === t ? '#60a5fa' : 'transparent'}`,
            color: active === t ? '#e2e8f0' : '#475569',
            letterSpacing: '0.08em',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LabPanelClinicalDay: React.FC = memo(function LabPanelClinicalDay() {
  const labOrders       = usePatientStore(s => s.labOrders);
  const startTick       = useScenarioStore(s => s.scenarioStartTick);

  const resolved = labOrders.filter(o => o.result !== null);

  const grouped = useMemo(
    () => partitionLabsByDay(resolved, startTick),
    [resolved, startTick]
  );

  const days     = useMemo(() => sortedDaysDesc(grouped), [grouped]);
  const tabLabels = useMemo(() => [...days.map(d => `D${d}`), 'LONGITUDINAL'], [days]);

  const [activeTab, setActiveTab] = useState<string>(() => tabLabels[0] ?? 'D1');

  // Keep active tab in sync when new days appear
  const effectiveTab = tabLabels.includes(activeTab) ? activeTab : (tabLabels[0] ?? 'D1');

  if (resolved.length === 0) {
    return (
      <div style={{ background: BG, textAlign: 'center', padding: 32, color: '#475569', fontFamily: MONO, fontSize: '0.5rem' }}>
        Sin resultados de laboratorio.<br />
        <span style={{ fontSize: '0.42rem', marginTop: 6, display: 'block' }}>
          Solicite estudios desde la barra de botones superior.
        </span>
      </div>
    );
  }

  const activeDay    = effectiveTab.startsWith('D') ? parseInt(effectiveTab.slice(1)) : null;
  const prevDay      = activeDay !== null ? activeDay - 1 : null;
  const activeOrders = activeDay !== null ? (grouped.get(activeDay) ?? []) : [];
  const prevOrders   = prevDay !== null ? (grouped.get(prevDay) ?? []) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: BG, height: '100%' }}>
      <TabBar tabs={tabLabels} active={effectiveTab} onSelect={setActiveTab} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {effectiveTab === 'LONGITUDINAL' ? (
          <LongitudinalChart grouped={grouped} />
        ) : (
          <LabsForDay orders={activeOrders} prevOrders={prevOrders.length > 0 ? prevOrders : undefined} />
        )}
      </div>
    </div>
  );
});

export default LabPanelClinicalDay;
