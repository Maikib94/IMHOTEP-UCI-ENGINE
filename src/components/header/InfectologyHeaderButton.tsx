// src/components/header/InfectologyHeaderButton.tsx
//
// Compact header button that opens InfectologyModal via Drawer.
// Badge shows: pending culture count / positive result alert.

import React, { useState } from 'react';
import { useMicrobiologyStore } from '../../store/useMicrobiologyStore';
import InfectologyModal          from './InfectologyModal';

export default function InfectologyHeaderButton() {
  const [open, setOpen] = useState(false);

  const cultures      = useMicrobiologyStore(s => s.cultures);
  const revealedGerm  = useMicrobiologyStore(s => s.revealedGerm);

  const pending  = cultures.filter(c => c.status === 'pending' || c.status === 'in_progress').length;
  const positive = cultures.filter(c => c.status === 'positive').length;
  const hasAlert = positive > 0 || revealedGerm !== null;

  const badgeCount = pending || positive;
  const badgeColor = hasAlert ? '#ef4444' : '#fbbf24';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer"
        style={{
          background:  hasAlert ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
          borderColor: hasAlert ? 'rgba(239,68,68,0.35)'  : 'rgba(255,255,255,0.08)',
          color:       hasAlert ? '#fca5a5' : '#94a3b8',
        }}
        title="Panel de Infectología"
      >
        <span className="text-[0.5rem] font-black uppercase tracking-wider">INFECTO</span>
        <span className="text-[0.55rem]">🦠</span>

        {badgeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[0.36rem] font-black"
            style={{ background: badgeColor, color: '#000' }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      <InfectologyModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
