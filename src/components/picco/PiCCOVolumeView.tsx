// src/components/picco/PiCCOVolumeView.tsx
// Panel PiCCO tipo EV1000/VolumeView — 4 cuadrantes fijos: Flujo/Precarga/Pulmón/Contractilidad.
//
// Refs:
//   Bendjelid K et al. Br J Anaesth 2013;111(4):573-579 — validación multicéntrica EV1000/VolumeView.
//   Monnet X, Teboul JL. Crit Care 2017 — CI/GEDI/EVLWI/SVV como lockset de métricas core.
//   Huber W et al. BMC Anesthesiol 2015 — PE < 30% hasta ~8h sin recalibración.
//   Hamzaoui O et al. CCM 2008 — recalibración 1-2h en paciente inestable.
//   Sakka SG ICM 2000; Tagami T ICM 2014; Combes A Anesth 2004.

import React, { useEffect, memo, useMemo } from 'react';
import { usePiCCOPanel, PiCCOActions }      from '../../store/usePiCCOStore';
import { usePatientStore }                  from '../../store/usePatientStore';
import { useTimeStore }                     from '../../store/useTimeStore';
import VolumeViewQuadrant                   from './VolumeViewQuadrant';

const MONO = "'JetBrains Mono', monospace";

// ─── TD Timer ────────────────────────────────────────────────────────────────

function useTDTimer(lastTDTick: number | null): { display: string; color: string } {
  const ticks = useTimeStore(s => s.ticks);
  return useMemo(() => {
    if (lastTDTick === null) return { display: '--:--', color: '#475569' };
    const elapsed = Math.max(0, ticks - lastTDTick);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const display = h > 0
      ? `${h}h ${String(m).padStart(2, '0')}m`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    // Huber 2015: verde <4h, ámbar 4-8h, rojo >8h
    const color = elapsed > 8 * 3600 ? '#f87171'
                : elapsed > 4 * 3600 ? '#f59e0b'
                : '#10b981';
    return { display, color };
  }, [ticks, lastTDTick]);
}

// ─── Main component ───────────────────────────────────────────────────────────

const PiCCOVolumeView = memo(function PiCCOVolumeView() {
  const { active, visible, snapshot, alarmActive, lastTDTick } = usePiCCOPanel();
  const vitals = usePatientStore(s => s.vitals);
  const { display: timerDisplay, color: timerColor } = useTDTimer(lastTDTick);

  // Auto-termodilución inicial cuando se activa PiCCO
  useEffect(() => {
    if (active && snapshot === null) {
      PiCCOActions.initializeIfNeeded();
    }
  }, [active, snapshot]);

  if (!active) return null;
  if (!visible) return null;

  const snap = snapshot;

  // ── Estado vacío — termodilución inicial ──────────────────────────────────
  if (!snap) {
    return (
      <div style={panelStyle}>
        <PanelHeader timerDisplay="--:--" timerColor="#475569" alarmActive={false} />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 20, textAlign: 'center', gap: 12,
        }}>
          <div style={{ fontSize: '2rem' }}>🌡️</div>
          <div style={{ fontSize: '0.55rem', fontWeight: 900, color: '#e2e8f0', fontFamily: MONO }}>
            Termodilución Inicial Requerida
          </div>
          <div style={{ fontSize: '0.44rem', color: '#475569', lineHeight: 1.6, maxWidth: 240 }}>
            Inyecte 15 mL de SF frío (&lt;8°C) por el catéter venoso central. El sistema calibrará automáticamente.
          </div>
          <button
            type="button"
            onClick={PiCCOActions.requestRecalibration}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.5)',
              color: '#fbbf24', fontSize: '0.5rem', fontWeight: 900, fontFamily: MONO,
              letterSpacing: '0.08em',
            }}
          >
            INICIAR TERMODILUCIÓN
          </button>
        </div>
      </div>
    );
  }

  // ── 4-cuadrante layout ────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <PanelHeader timerDisplay={timerDisplay} timerColor={timerColor} alarmActive={alarmActive} />

      {/* 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1 }}>
        {/* FLUJO — rosa */}
        <VolumeViewQuadrant
          icon="💗" title="Flujo" accentColor="#ec4899"
          quadrantPosition="top-left"
          borderRight borderBottom
          primary={{ label: 'CI', value: snap.ci.toFixed(1), unit: 'L/min/m²', range: [3.0, 5.0] }}
          secondary={{ label: 'GC', value: snap.co.toFixed(1), unit: 'L/min', range: [4, 8] }}
        />

        {/* PRECARGA — cian */}
        <VolumeViewQuadrant
          icon="💧" title="Precarga" accentColor="#06b6d4"
          quadrantPosition="top-right"
          borderBottom
          primary={{ label: 'GEDI', value: Math.round(snap.gedi), unit: 'mL/m²', range: [680, 800] }}
          secondary={{ label: 'SVV', value: Math.round(snap.svv), unit: '%', range: [0, 12] }}
          tertiary={{ label: 'PPV', value: Math.round(snap.ppv), unit: '%', range: [0, 13] }}
        />

        {/* PULMÓN — ámbar */}
        <VolumeViewQuadrant
          icon="🫁" title="Pulmón" accentColor="#f59e0b"
          quadrantPosition="bottom-left"
          borderRight
          primary={{ label: 'ELWI', value: snap.evlwi.toFixed(1), unit: 'mL/kg', range: [3, 7] }}
          secondary={{ label: 'PVPI', value: snap.pvpi.toFixed(1), unit: '', range: [1, 3] }}
        />

        {/* CONTRACTILIDAD — violeta */}
        <VolumeViewQuadrant
          icon="💪" title="Contractilidad" accentColor="#a78bfa"
          quadrantPosition="bottom-right"
          primary={{ label: 'GEF', value: Math.round(snap.gef), unit: '%', range: [25, 35] }}
          secondary={{ label: 'CFI', value: snap.cfi.toFixed(1), unit: '/min', range: [4.5, 6.5] }}
          tertiary={{ label: 'dPmx', value: Math.round(snap.dpmx), unit: 'mmHg/s', range: [1200, 2000] }}
        />
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '8px 10px 8px',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={PiCCOActions.requestRecalibration}
          style={{
            width: '100%', height: 30, borderRadius: 6, cursor: 'pointer',
            background: alarmActive ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.18)',
            border: `1px solid ${alarmActive ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.5)'}`,
            color: alarmActive ? '#fca5a5' : '#fbbf24',
            fontSize: '0.48rem', fontWeight: 900, fontFamily: MONO,
            letterSpacing: '0.06em',
            animation: alarmActive ? 'pulse 1.5s infinite' : 'none',
          }}
        >
          {alarmActive ? '🚨 RECALIBRAR YA' : '🌡️ Nueva Termodilución'}
        </button>
        <div style={{
          marginTop: 5, textAlign: 'center',
          fontSize: '0.38rem', color: '#334155', fontFamily: MONO,
        }}>
          PAM {Math.round(vitals.meanArterialPressure)} mmHg &nbsp;·&nbsp; GC {snap.co.toFixed(1)} L/min
        </div>
      </div>
    </div>
  );
});

export { PiCCOVolumeView };
export default PiCCOVolumeView;

// ─── Panel base style ─────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  zIndex: 100,
  width: 340,
  minHeight: 280,
  background: 'linear-gradient(140deg, rgba(15,12,25,0.96), rgba(8,7,16,0.97))',
  border: '1px solid rgba(167,139,250,0.28)',
  borderRadius: 14,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: MONO,
};

// ─── Header sub-component ─────────────────────────────────────────────────────

function PanelHeader({
  timerDisplay, timerColor, alarmActive,
}: { timerDisplay: string; timerColor: string; alarmActive: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 10px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#a78bfa', fontSize: '0.7rem' }}>⬡</span>
        <span style={{
          fontSize: '0.48rem', fontWeight: 900, color: '#c4b5fd',
          letterSpacing: '0.08em', fontFamily: MONO,
        }}>
          PiCCO · VolumeView
        </span>
        {alarmActive && (
          <span style={{
            fontSize: '0.38rem', fontWeight: 700, color: '#f87171',
            animation: 'pulse 1.5s infinite',
          }}>
            ● RECALIBRAR
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: '0.42rem', fontWeight: 700, color: timerColor,
          fontFamily: MONO, letterSpacing: '0.04em',
        }}>
          TD: {timerDisplay}
        </span>
        <button
          type="button"
          onClick={PiCCOActions.closePanelVisible}
          title="Cerrar panel (PiCCO sigue activo)"
          style={{
            background: 'transparent', border: 'none',
            color: '#475569', fontSize: '0.7rem',
            cursor: 'pointer', lineHeight: 1, padding: '1px 2px',
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
