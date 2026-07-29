// src/components/DeathOverlay.tsx
//
// Modal post-mortem con causa clínica, timeline de exposición y nota didáctica.
// Aparece cuando useMortalityStore.isDeceased === true.
// z-index 9999 — bloquea toda la UI hasta que el residente interactúa.

import React, { useEffect, useState } from 'react';
import { useMortalityStore } from '../store/useMortalityStore';
import { useScenarioStore }  from '../store/useScenarioStore';
import { LETHAL_THRESHOLD_MAP } from '../data/LethalThresholds';

// ─── Utilidades de formato ────────────────────────────────────────────────────

function fmtSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtSimTime(simTimeSeconds: number): string {
  const day  = Math.floor(simTimeSeconds / 86400) + 1;
  const h    = Math.floor((simTimeSeconds % 86400) / 3600);
  const m    = Math.floor((simTimeSeconds % 3600) / 60);
  const s    = Math.floor(simTimeSeconds % 60);
  return `D${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono', monospace";

export const DeathOverlay: React.FC = () => {
  const isDeceased   = useMortalityStore(s => s.isDeceased);
  const deathCause   = useMortalityStore(s => s.deathCause);
  const deathTime    = useMortalityStore(s => s.deathTime);
  const counters     = useMortalityStore(s => s.dangerCounters);

  const [visible, setVisible] = useState(false);
  const [animIn,  setAnimIn]  = useState(false);

  // Animación de entrada con retardo
  useEffect(() => {
    if (isDeceased) {
      setVisible(true);
      const t = setTimeout(() => setAnimIn(true), 50);
      return () => clearTimeout(t);
    } else {
      setAnimIn(false);
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [isDeceased]);

  if (!visible) return null;

  const threshold = deathCause ? LETHAL_THRESHOLD_MAP[deathCause] : null;
  const counter   = deathCause ? counters[deathCause] : null;

  function handleReviewTimeline() {
    // Cierra el modal, deja simulación pausada (ya lo está por triggerDeath)
    // Solo cierra la overlay — el estado de óbito persiste para análisis
    useMortalityStore.setState({ isDeceased: false });
  }

  function handleNewCase() {
    useMortalityStore.getState().reset();
    useScenarioStore.getState().resetSimulation();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Óbito registrado"
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          9999,
        background:      'rgba(0, 0, 0, 0.92)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        opacity:         animIn ? 1 : 0,
        transition:      'opacity 800ms ease',
        backdropFilter:  'blur(4px)',
      }}
    >
      <div
        style={{
          width:          '520px',
          maxWidth:       '94vw',
          background:     'linear-gradient(145deg, #1a0d30 0%, #0d0318 60%, #1a0a12 100%)',
          border:         '1px solid rgba(139, 92, 246, 0.4)',
          borderRadius:   '16px',
          padding:        '32px',
          boxShadow:      '0 0 60px rgba(76, 29, 149, 0.5), 0 0 120px rgba(139, 92, 246, 0.15)',
          transform:      animIn ? 'scale(1)' : 'scale(0.94)',
          transition:     'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          fontFamily:     MONO,
          color:          '#e2e8f0',
          position:       'relative',
          overflow:       'hidden',
        }}
      >
        {/* Decoración de fondo */}
        <div style={{
          position:   'absolute',
          top:        -40,
          right:      -40,
          width:      200,
          height:     200,
          background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Icono de causa */}
        <div style={{ textAlign: 'center', fontSize: '3rem', marginBottom: 8, lineHeight: 1 }}>
          {threshold?.icon ?? '💔'}
        </div>

        {/* Título */}
        <h1 style={{
          textAlign:     'center',
          fontSize:      '0.9rem',
          fontWeight:    900,
          letterSpacing: '0.2em',
          color:         '#a78bfa',
          margin:        '0 0 4px',
          textTransform: 'uppercase',
        }}>
          ÓBITO REGISTRADO
        </h1>
        <div style={{
          width: 60, height: 2,
          background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)',
          margin: '0 auto 20px',
        }} />

        {/* Causa principal */}
        {threshold && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize:   '0.75rem',
              fontWeight: 700,
              color:      '#fbbf24',
              marginBottom: 4,
              letterSpacing: '0.08em',
            }}>
              CAUSA:
            </div>
            <div style={{
              fontSize:   '0.85rem',
              fontWeight: 700,
              color:      '#f1f5f9',
              lineHeight: 1.4,
            }}>
              {threshold.nameES}
            </div>
          </div>
        )}

        {/* Hora del simulador */}
        {deathTime !== null && (
          <div style={{
            display:       'flex',
            justifyContent:'space-between',
            alignItems:    'center',
            marginBottom:  16,
            padding:       '8px 12px',
            background:    'rgba(255,255,255,0.03)',
            borderRadius:  8,
            border:        '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: '0.58rem', color: '#64748b', letterSpacing: '0.1em' }}>
              HORA SIMULADOR
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
              {fmtSimTime(deathTime)}
            </span>
          </div>
        )}

        {/* Caja de detalle clínico */}
        {threshold && (
          <div style={{
            background:   'rgba(76, 29, 149, 0.12)',
            border:       '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: 10,
            padding:      '16px',
            marginBottom: 20,
          }}>
            <div style={{
              fontSize:      '0.55rem',
              color:         '#7c3aed',
              fontWeight:    700,
              letterSpacing: '0.12em',
              marginBottom:  10,
            }}>
              DETALLE CLÍNICO
            </div>

            {/* Descripción del mecanismo */}
            <p style={{
              fontSize:     '0.65rem',
              color:        '#cbd5e1',
              lineHeight:   1.6,
              margin:       '0 0 10px',
            }}>
              {threshold.description}
            </p>

            {/* Timeline: cuánto tiempo de exposición y primer cruce */}
            {counter && (
              <div style={{
                display:       'grid',
                gridTemplateColumns: '1fr 1fr',
                gap:           8,
                marginBottom:  10,
              }}>
                <div style={{
                  background:   'rgba(0,0,0,0.3)',
                  borderRadius: 6,
                  padding:      '6px 10px',
                }}>
                  <div style={{ fontSize: '0.48rem', color: '#475569', marginBottom: 2, letterSpacing: '0.1em' }}>
                    EXPOSICIÓN
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f87171' }}>
                    {fmtSeconds(counter.accumulatedSeconds)}
                  </div>
                  <div style={{ fontSize: '0.44rem', color: '#475569' }}>
                    / {fmtSeconds(threshold.sustainedSeconds)} límite
                  </div>
                </div>
                {counter.firstCrossedAt !== null && (
                  <div style={{
                    background:   'rgba(0,0,0,0.3)',
                    borderRadius: 6,
                    padding:      '6px 10px',
                  }}>
                    <div style={{ fontSize: '0.48rem', color: '#475569', marginBottom: 2, letterSpacing: '0.1em' }}>
                      PRIMER CRUCE
                    </div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fbbf24' }}>
                      {fmtSimTime(counter.firstCrossedAt)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nota didáctica */}
            <div style={{
              background:   'rgba(0,0,0,0.25)',
              borderRadius: 6,
              padding:      '10px 12px',
              marginBottom: 10,
            }}>
              <div style={{ fontSize: '0.48rem', color: '#7c3aed', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                NOTA DIDÁCTICA
              </div>
              <p style={{ fontSize: '0.6rem', color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
                {threshold.didacticNote}
              </p>
            </div>

            {/* Referencia */}
            <div style={{
              display:       'flex',
              alignItems:    'center',
              gap:           6,
              fontSize:      '0.5rem',
              color:         '#4c1d95',
            }}>
              <span style={{ color: '#6d28d9' }}>📚</span>
              <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                {threshold.referenceCitation}
              </span>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div style={{
          display:       'grid',
          gridTemplateColumns: '1fr 1fr',
          gap:           10,
        }}>
          <button
            type="button"
            id="death-overlay-review-timeline"
            onClick={handleReviewTimeline}
            style={{
              padding:       '10px 12px',
              background:    'rgba(109, 40, 217, 0.15)',
              border:        '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius:  8,
              color:         '#c4b5fd',
              fontSize:      '0.58rem',
              fontWeight:    700,
              letterSpacing: '0.08em',
              cursor:        'pointer',
              fontFamily:    MONO,
              transition:    'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109, 40, 217, 0.28)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109, 40, 217, 0.15)')}
          >
            🔍 REVISAR TIMELINE
          </button>
          <button
            type="button"
            id="death-overlay-new-case"
            onClick={handleNewCase}
            style={{
              padding:       '10px 12px',
              background:    'rgba(220, 38, 38, 0.1)',
              border:        '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius:  8,
              color:         '#fca5a5',
              fontSize:      '0.58rem',
              fontWeight:    700,
              letterSpacing: '0.08em',
              cursor:        'pointer',
              fontFamily:    MONO,
              transition:    'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)')}
          >
            ⟳ NUEVO CASO
          </button>
        </div>

        {/* Footer */}
        <div style={{
          textAlign:    'center',
          marginTop:    16,
          fontSize:     '0.44rem',
          color:        '#374151',
          letterSpacing:'0.08em',
        }}>
          IMHOTEP UCI — MOTOR DE MORTALIDAD AGUDA V1.0
        </div>
      </div>
    </div>
  );
};

export default DeathOverlay;
