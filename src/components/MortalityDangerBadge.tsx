// src/components/MortalityDangerBadge.tsx
//
// HUD pre-mortem — badges de alerta temprana cuando los counters superan
// el 25% del threshold letal. Posicionado en el área del WaveformMonitor.
//
// Colores por proximidad al umbral:
//   25-50%  → ámbar  (#fbbf24)
//   50-80%  → naranja (#f97316)
//   >80%    → rojo   (#ef4444) con animación pulse
//
// Click en badge → tooltip con nota didáctica completa.
// Si hay >3 alertas simultáneas → modo comprimido (icon-only + contador).

import React, { useState } from 'react';
import { useMortalityStore } from '../store/useMortalityStore';
import { LETHAL_THRESHOLD_MAP } from '../data/LethalThresholds';
import type { LethalCauseId } from '../data/LethalThresholds';

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface AlertInfo {
  id:           LethalCauseId;
  icon:         string;
  nameES:       string;
  didacticNote: string;
  accumulated:  number;
  threshold:    number;
  fraction:     number;   // 0-1: proporción del threshold alcanzado
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function getColor(fraction: number): string {
  if (fraction > 0.80) return '#ef4444';
  if (fraction > 0.50) return '#f97316';
  return '#fbbf24';
}

function getBg(fraction: number): string {
  if (fraction > 0.80) return 'rgba(239, 68, 68, 0.15)';
  if (fraction > 0.50) return 'rgba(249, 115, 22, 0.12)';
  return 'rgba(251, 191, 36, 0.10)';
}

function getBorderColor(fraction: number): string {
  if (fraction > 0.80) return 'rgba(239, 68, 68, 0.45)';
  if (fraction > 0.50) return 'rgba(249, 115, 22, 0.4)';
  return 'rgba(251, 191, 36, 0.35)';
}

// ─── Subcomponente: tooltip didáctico ────────────────────────────────────────

interface TooltipProps {
  info:    AlertInfo;
  onClose: () => void;
}

const AlertTooltip: React.FC<TooltipProps> = ({ info, onClose }) => {
  const MONO = "'JetBrains Mono', monospace";

  return (
    <div
      role="tooltip"
      style={{
        position:     'absolute',
        top:          '110%',
        left:         0,
        zIndex:       1000,
        width:        280,
        background:   '#0b1120',
        border:       `1px solid ${getBorderColor(info.fraction)}`,
        borderRadius: 10,
        padding:      '12px 14px',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.7)',
        fontFamily:   MONO,
        pointerEvents:'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: getColor(info.fraction), lineHeight: 1.3, flex: 1 }}>
          {info.icon} {info.nameES}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', fontSize: '0.8rem', lineHeight: 1,
            padding: '0 0 0 8px', flexShrink: 0,
          }}
        >×</button>
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '0.44rem', color: '#475569' }}>EXPOSICIÓN</span>
          <span style={{ fontSize: '0.52rem', fontWeight: 700, color: getColor(info.fraction) }}>
            {fmtSeconds(info.accumulated)} / {fmtSeconds(info.threshold)} min
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width:  `${Math.min(100, info.fraction * 100).toFixed(0)}%`,
            background: getColor(info.fraction),
            borderRadius: 2,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Nota didáctica */}
      <p style={{ fontSize: '0.55rem', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
        {info.didacticNote}
      </p>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const MONO = "'JetBrains Mono', monospace";

export const MortalityDangerBadge: React.FC = () => {
  const isDeceased    = useMortalityStore(s => s.isDeceased);
  const activeAlerts  = useMortalityStore(s => s.activeAlerts);
  const dangerCounters = useMortalityStore(s => s.dangerCounters);

  const [openTooltip, setOpenTooltip] = useState<LethalCauseId | null>(null);

  // No mostrar si el paciente ya murió (DeathOverlay se encarga)
  if (isDeceased) return null;
  if (activeAlerts.length === 0) return null;

  // Construir info enriquecida de cada alerta
  const alertInfos: AlertInfo[] = activeAlerts
    .map(id => {
      const thr     = LETHAL_THRESHOLD_MAP[id];
      const counter = dangerCounters[id];
      if (!thr || !counter) return null;
      const fraction = counter.accumulatedSeconds / thr.sustainedSeconds;
      return {
        id,
        icon:         thr.icon,
        nameES:       thr.nameES,
        didacticNote: thr.didacticNote,
        accumulated:  counter.accumulatedSeconds,
        threshold:    thr.sustainedSeconds,
        fraction,
      } as AlertInfo;
    })
    .filter(Boolean)
    .sort((a, b) => (b?.fraction ?? 0) - (a?.fraction ?? 0)) as AlertInfo[];

  const COMPACT_THRESHOLD = 3;
  const isCompact = alertInfos.length > COMPACT_THRESHOLD;

  return (
    <div
      id="mortality-danger-badge"
      style={{
        position:   'absolute',
        top:        8,
        left:       8,
        zIndex:     100,
        display:    'flex',
        flexDirection: 'column',
        gap:        4,
        fontFamily: MONO,
        maxWidth:   280,
      }}
    >
      {isCompact ? (
        // Modo comprimido: icono + contador total de alertas críticas
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          padding:      '4px 8px',
          background:   'rgba(239, 68, 68, 0.15)',
          border:       '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 6,
          animation:    'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        }}>
          <span style={{ fontSize: '0.75rem' }}>⚠️</span>
          <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ef4444' }}>
            {alertInfos.length} ALERTAS CRÍTICAS
          </span>
          {/* Mini íconos */}
          <div style={{ display: 'flex', gap: 2 }}>
            {alertInfos.slice(0, COMPACT_THRESHOLD).map(a => (
              <span key={a.id} style={{ fontSize: '0.65rem' }}>{a.icon}</span>
            ))}
            {alertInfos.length > COMPACT_THRESHOLD && (
              <span style={{ fontSize: '0.48rem', color: '#ef4444', fontWeight: 700 }}>
                +{alertInfos.length - COMPACT_THRESHOLD}
              </span>
            )}
          </div>
        </div>
      ) : (
        // Modo expandido: una pill por alerta
        alertInfos.map(info => {
          const isOpen      = openTooltip === info.id;
          const color       = getColor(info.fraction);
          const bgColor     = getBg(info.fraction);
          const borderColor = getBorderColor(info.fraction);
          const isCritical  = info.fraction > 0.80;

          return (
            <div
              key={info.id}
              style={{ position: 'relative' }}
            >
              <button
                type="button"
                id={`danger-badge-${info.id}`}
                title={`${info.nameES} — click para ver detalle`}
                onClick={() => setOpenTooltip(isOpen ? null : info.id)}
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           6,
                  padding:       '4px 8px',
                  background:    bgColor,
                  border:        `1px solid ${borderColor}`,
                  borderRadius:  6,
                  cursor:        'pointer',
                  width:         '100%',
                  textAlign:     'left',
                  fontFamily:    MONO,
                  animation:     isCritical ? 'pulse 1.2s cubic-bezier(0.4,0,0.6,1) infinite' : undefined,
                }}
              >
                {/* Icono */}
                <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>{info.icon}</span>

                {/* Nombre + barra */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize:     '0.5rem',
                    fontWeight:   700,
                    color,
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: 2,
                  }}>
                    ⚠ {info.nameES.replace('PCR por ', '').replace('Asistolia por ', '')}
                  </div>
                  {/* Barra de progreso */}
                  <div style={{
                    height:     3,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 2,
                    overflow:   'hidden',
                    marginBottom: 1,
                  }}>
                    <div style={{
                      height:     '100%',
                      width:      `${Math.min(100, info.fraction * 100).toFixed(0)}%`,
                      background: color,
                      borderRadius: 2,
                    }} />
                  </div>
                  {/* Tiempo */}
                  <div style={{ fontSize: '0.44rem', color: '#64748b' }}>
                    {fmtSeconds(info.accumulated)} / {fmtSeconds(info.threshold)}
                  </div>
                </div>
              </button>

              {/* Tooltip expandido */}
              {isOpen && (
                <AlertTooltip
                  info={info}
                  onClose={() => setOpenTooltip(null)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default MortalityDangerBadge;
