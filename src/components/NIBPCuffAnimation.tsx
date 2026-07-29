// src/components/NIBPCuffAnimation.tsx
// Inline NIBP inflation progress bar — mounts INSIDE the BP card.
// NO longer uses position:fixed. Import NIBPCuffProgress for inline use.

import React, { memo } from 'react';
import { usePatientStore } from '../store/usePatientStore';

/** Inline 3-second progress bar for the NIBP card. */
export const NIBPCuffProgress = memo(function NIBPCuffProgress() {
  const isInflating = usePatientStore(s => s.procedures.nibp.isInflating);
  if (!isInflating) return null;

  return (
    <div style={{ marginTop: 4 }}>
      {/* Progress bar */}
      <div
        style={{
          height: 3, borderRadius: 2, overflow: 'hidden',
          background: 'rgba(251,191,36,0.18)',
        }}
      >
        <div
          style={{
            height: '100%', borderRadius: 2,
            background: '#fbbf24',
            animation: 'nibp-fill 3s linear forwards',
            width: '0%',
          }}
        />
      </div>
      <div style={{
        fontSize: '0.42rem', color: '#d97706',
        fontFamily: "'JetBrains Mono', monospace",
        marginTop: 2,
      }}>
        inflando…
      </div>
      <style>{`
        @keyframes nibp-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
});

// Backward-compat default export — renders nothing (overlay removed)
const NIBPCuffAnimation = memo(function NIBPCuffAnimation() {
  return null;
});

export default NIBPCuffAnimation;
