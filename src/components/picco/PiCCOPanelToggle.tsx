// src/components/picco/PiCCOPanelToggle.tsx
// Botón flotante para reabrir PiCCOVolumeView cuando está cerrado.
// Renderiza solo cuando PiCCO activo && panel oculto.

import React, { memo } from 'react';
import { usePiCCOActive, usePiCCOPanelVisible, usePiCCORecalibrationAlarm, PiCCOActions } from '../../store/usePiCCOStore';

const PiCCOPanelToggle = memo(function PiCCOPanelToggle() {
  const active      = usePiCCOActive();
  const visible     = usePiCCOPanelVisible();
  const alarmActive = usePiCCORecalibrationAlarm();

  if (!active || visible) return null;

  return (
    <button
      type="button"
      onClick={PiCCOActions.openPanelVisible}
      title="Reabrir panel PiCCO"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #a78bfa, #6d28d9)',
        border: '1px solid rgba(167,139,250,0.5)',
        color: 'white',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '1rem',
        fontWeight: 900,
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(109,40,217,0.5)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: alarmActive ? 'pulse 1.5s infinite' : 'none',
      }}
    >
      ⬡
      {alarmActive && (
        <span style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 10, height: 10,
          borderRadius: '50%',
          background: '#ef4444',
          border: '2px solid #0f0a1e',
        }} />
      )}
    </button>
  );
});

export default PiCCOPanelToggle;
