// src/components/ImagingPanel.tsx
// Panel de estudios de imagen — solicitud y visualización de hallazgos.
// Refs: Schmidt M ICM 2013; Lichtenstein DA Chest 2015; Gattinoni NEJM 2020.

import React, { useState, useCallback } from 'react';
import { ImagingEngine, useImagingStore } from '../core/ImagingEngine';
import type { ImagingModality } from '../core/ImagingEngine';
import { MODALITY_LABELS } from '../core/ImagingEngine';

const MONO = "'JetBrains Mono', monospace";
const BG   = '#060c18';

const MODALITY_GROUPS: { label: string; items: ImagingModality[] }[] = [
  {
    label: 'Portátil / Rápido',
    items: ['cxr', 'us_lung', 'us_focused_cardiac', 'us_abdominal'],
  },
  {
    label: 'Ecocardiografía',
    items: ['tte', 'tee'],
  },
  {
    label: 'Tomografía / Especial',
    items: ['ct_thorax', 'ct_abdomen', 'ct_brain', 'doppler_tcd'],
  },
];

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
}

export default function ImagingPanel({ isOpen, onClose }: Props) {
  const [tab, setTab]       = useState<'results' | 'order'>('results');
  const [selected, setSelected] = useState<string | null>(null);
  const completed = useImagingStore(s => s.completed);
  const pending   = useImagingStore(s => s.pending);

  const order = useCallback((mod: ImagingModality) => {
    ImagingEngine.getInstance().requestStudy(mod);
    setTab('results');
  }, []);

  const selectedFinding = completed.find(f => f.id === selected) ?? null;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: BG, border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 12, width: 820, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          fontFamily: MONO,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#a78bfa', letterSpacing: '0.12em' }}>
              🩻 ESTUDIOS DE IMAGEN
            </span>
            {pending.length > 0 && (
              <span style={{
                background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                borderRadius: 4, padding: '1px 6px', fontSize: '0.42rem',
                fontWeight: 700, color: '#fbbf24',
              }}>
                {pending.length} en proceso…
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['results', 'order'] as const).map(t => (
              <button
                key={t} type="button" onClick={() => setTab(t)}
                style={{
                  padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  fontSize: '0.46rem', fontWeight: 700,
                  background: tab === t ? 'rgba(139,92,246,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                  color: tab === t ? '#c4b5fd' : '#475569',
                }}
              >
                {t === 'results' ? `Resultados (${completed.length})` : '+ Solicitar'}
              </button>
            ))}
            <button
              type="button" onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: '#475569',
                fontSize: '0.9rem', cursor: 'pointer', padding: '0 4px',
              }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {tab === 'results' && (
            <>
              {/* Study list */}
              <div style={{
                width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
                overflowY: 'auto', padding: '8px 0',
              }}>
                {pending.map(f => (
                  <div key={f.id} style={{
                    padding: '6px 12px', cursor: 'default',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ fontSize: '0.42rem', color: '#fbbf24', fontWeight: 700 }}>
                      ⏳ {MODALITY_LABELS[f.modality]}
                    </div>
                    <div style={{ fontSize: '0.38rem', color: '#475569', marginTop: 1 }}>en proceso…</div>
                  </div>
                ))}
                {completed.length === 0 && pending.length === 0 && (
                  <div style={{ padding: 16, fontSize: '0.44rem', color: '#334155', textAlign: 'center' }}>
                    Sin estudios solicitados.<br />
                    <span style={{ color: '#7c3aed' }}>+ Solicitar</span> para agregar.
                  </div>
                )}
                {[...completed].reverse().map(f => (
                  <button
                    key={f.id} type="button"
                    onClick={() => setSelected(f.id === selected ? null : f.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 12px', cursor: 'pointer', border: 'none',
                      background: selected === f.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: selected === f.id ? '2px solid #a78bfa' : '2px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: '0.42rem', fontWeight: 700, color: '#c4b5fd' }}>
                      ✓ {MODALITY_LABELS[f.modality]}
                    </div>
                    <div style={{ fontSize: '0.36rem', color: '#475569', marginTop: 1 }}>
                      t={f.timestamp}s
                    </div>
                    {f.pertinentToActivePathology && (
                      <div style={{ fontSize: '0.34rem', color: '#f87171', marginTop: 1 }}>
                        ● hallazgo activo
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Finding viewer */}
              <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
                {selectedFinding ? (
                  <FindingViewer finding={selectedFinding} />
                ) : (
                  <div style={{
                    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.44rem', color: '#1e3a5f',
                  }}>
                    Seleccione un estudio para ver el reporte
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'order' && (
            <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.46rem', color: '#64748b', marginBottom: 12 }}>
                Seleccione el tipo de estudio a solicitar. El reporte estará disponible tras el tiempo de adquisición simulado.
              </div>
              {MODALITY_GROUPS.map(g => (
                <div key={g.label} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: '0.38rem', fontWeight: 900, color: '#334155',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>
                    {g.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {g.items.map(mod => (
                      <button
                        key={mod} type="button" onClick={() => order(mod)}
                        style={{
                          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(139,92,246,0.08)',
                          border: '1px solid rgba(139,92,246,0.25)',
                          color: '#c4b5fd', fontSize: '0.46rem', fontWeight: 700,
                          fontFamily: MONO,
                        }}
                      >
                        {MODALITY_LABELS[mod]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Finding viewer ───────────────────────────────────────────────────────────

function FindingViewer({ finding }: { finding: import('../core/ImagingEngine').ImagingFinding }) {
  const label = MODALITY_LABELS[finding.modality];
  const isAbnormal = finding.pertinentToActivePathology;

  return (
    <div>
      {/* Study header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: isAbnormal ? '#f87171' : '#a78bfa' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.38rem', color: '#475569', marginTop: 2 }}>
          Tick: {finding.timestamp}s &nbsp;·&nbsp; ID: {finding.id}
        </div>
      </div>

      {/* Inline SVG placeholder (schematic) */}
      <div style={{ marginBottom: 12 }}>
        <StudySVG modality={finding.modality} abnormal={isAbnormal} />
      </div>

      {/* Report text */}
      <div style={{
        background: '#070d1b', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8, padding: 12,
      }}>
        <div style={{ fontSize: '0.4rem', color: '#64748b', fontWeight: 900, letterSpacing: '0.1em', marginBottom: 8 }}>
          REPORTE
        </div>
        <p style={{ fontSize: '0.46rem', color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 10px' }}>
          {finding.description}
        </p>
        {finding.pathologyTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {finding.pathologyTags.map(tag => (
              <span key={tag} style={{
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 4, padding: '1px 6px', fontSize: '0.36rem',
                color: '#fca5a5', fontWeight: 700,
              }}>
                {tag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Schematic SVG placeholders ───────────────────────────────────────────────

function StudySVG({ modality, abnormal }: { modality: ImagingModality; abnormal: boolean }) {
  const stroke  = abnormal ? '#f87171' : '#334155';
  const fill    = abnormal ? 'rgba(248,113,113,0.08)' : 'rgba(51,65,85,0.08)';
  const accent  = abnormal ? '#fca5a5' : '#a78bfa';

  const style: React.CSSProperties = {
    width: '100%', height: 100,
    background: '#040810',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 6, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (modality === 'cxr') {
    return (
      <div style={style}>
        <svg viewBox="0 0 200 100" width="100%" height="100%">
          {/* Trachea */}
          <line x1="100" y1="5" x2="100" y2="35" stroke="#475569" strokeWidth="2" />
          {/* Carina */}
          <line x1="100" y1="35" x2="70" y2="55" stroke="#475569" strokeWidth="1.5" />
          <line x1="100" y1="35" x2="130" y2="55" stroke="#475569" strokeWidth="1.5" />
          {/* Lungs */}
          <ellipse cx="65" cy="65" rx="42" ry="28" stroke={stroke} fill={fill} strokeWidth="1.5" />
          <ellipse cx="135" cy="65" rx="42" ry="28" stroke={stroke} fill={fill} strokeWidth="1.5" />
          {abnormal && (
            <>
              <ellipse cx="65" cy="65" rx="30" ry="20" stroke={accent} fill="rgba(248,113,113,0.12)" strokeWidth="0.8" />
              <ellipse cx="135" cy="65" rx="30" ry="20" stroke={accent} fill="rgba(248,113,113,0.12)" strokeWidth="0.8" />
            </>
          )}
          {/* Heart */}
          <ellipse cx="100" cy="72" rx="18" ry="20" stroke="#ef4444" fill="rgba(239,68,68,0.1)" strokeWidth="1" />
          <text x="100" y="10" textAnchor="middle" fill="#334155" fontSize="5">Rx Tórax AP</text>
        </svg>
      </div>
    );
  }

  if (modality === 'tte' || modality === 'us_focused_cardiac') {
    return (
      <div style={style}>
        <svg viewBox="0 0 200 100" width="100%" height="100%">
          {/* Heart schematic */}
          <path d="M100,20 C80,20 60,40 60,60 C60,80 80,90 100,90 C120,90 140,80 140,60 C140,40 120,20 100,20 Z"
            stroke={abnormal ? '#f87171' : '#ef4444'} fill={fill} strokeWidth="1.5" />
          {/* Septum */}
          <line x1="100" y1="25" x2="100" y2="85" stroke="#475569" strokeWidth="1" />
          {/* LV / RV labels */}
          <text x="80" y="60" fill="#334155" fontSize="6">LV</text>
          <text x="115" y="60" fill="#334155" fontSize="6">RV</text>
          {abnormal && (
            <text x="100" y="100" textAnchor="middle" fill={accent} fontSize="5">↓ FEVI</text>
          )}
          <text x="100" y="10" textAnchor="middle" fill="#334155" fontSize="5">Ecocardiograma</text>
        </svg>
      </div>
    );
  }

  if (modality === 'ct_brain') {
    return (
      <div style={style}>
        <svg viewBox="0 0 200 100" width="100%" height="100%">
          <ellipse cx="100" cy="52" rx="70" ry="45" stroke={stroke} fill={fill} strokeWidth="1.5" />
          {/* Midline */}
          <line x1="100" y1="10" x2="100" y2="94" stroke={abnormal ? '#fbbf24' : '#334155'} strokeWidth="1" strokeDasharray="3,2" />
          {/* Ventricles schematic */}
          <ellipse cx="88" cy="50" rx="10" ry="14" stroke="#475569" fill="#040810" strokeWidth="1" />
          <ellipse cx="112" cy="50" rx="10" ry="14" stroke="#475569" fill="#040810" strokeWidth="1" />
          {abnormal && (
            <ellipse cx="100" cy="50" rx="65" ry="40" stroke={accent} fill="rgba(248,113,113,0.05)" strokeWidth="0.8" />
          )}
          <text x="100" y="10" textAnchor="middle" fill="#334155" fontSize="5">TC Cráneo</text>
        </svg>
      </div>
    );
  }

  if (modality === 'us_lung') {
    return (
      <div style={style}>
        <svg viewBox="0 0 200 100" width="100%" height="100%">
          {/* Pleural line */}
          <line x1="20" y1="40" x2="180" y2="40" stroke="#64748b" strokeWidth="2" />
          {/* A-lines or B-lines */}
          {abnormal ? (
            // B-lines (vertical comet tails)
            [40, 70, 100, 130, 160].map(x => (
              <line key={x} x1={x} y1="40" x2={x} y2="95" stroke={accent} strokeWidth="1.5" opacity="0.7" />
            ))
          ) : (
            // A-lines (horizontal reverberation)
            [55, 70, 85].map(y => (
              <line key={y} x1="20" y1={y} x2="180" y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />
            ))
          )}
          <text x="100" y="15" textAnchor="middle" fill="#334155" fontSize="5">Eco Pulmonar</text>
          <text x="100" y="25" textAnchor="middle" fill={abnormal ? accent : '#475569'} fontSize="5">
            {abnormal ? 'Líneas B +++' : 'Líneas A (normal)'}
          </text>
        </svg>
      </div>
    );
  }

  // Generic placeholder
  return (
    <div style={{ ...style, flexDirection: 'column', gap: 4 }}>
      <svg viewBox="0 0 200 100" width="100%" height="100%">
        <rect x="10" y="10" width="180" height="80" stroke={stroke} fill={fill} strokeWidth="1" rx="4" />
        <text x="100" y="55" textAnchor="middle" fill={accent} fontSize="9" fontFamily={MONO}>
          {MODALITY_LABELS[modality] ?? modality}
        </text>
        {abnormal && (
          <text x="100" y="72" textAnchor="middle" fill={accent} fontSize="6">⚠ HALLAZGO ACTIVO</text>
        )}
      </svg>
    </div>
  );
}
