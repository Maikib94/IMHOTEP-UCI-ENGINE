const fs = require('fs');

const file = 'src/MonitorApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const splitPoint = 'var bleeding = hem > 0;';
const topIdx = s.indexOf(splitPoint);

if (topIdx !== -1) {
    const top = s.substring(0, s.indexOf('var [showLab, setShowLab] = useState(false);')) + 
                'var [showLab, setShowLab] = useState(false);\n  var [leftCollapsed, setLeftCollapsed] = useState(false);\n  var [rightCollapsed, setRightCollapsed] = useState(false);\n' + 
                s.substring(s.indexOf('var [showLab, setShowLab] = useState(false);') + 44, topIdx + splitPoint.length);

    const bottom = `

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0b0f19',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <LabPanel isOpen={showLab} onClose={() => setShowLab(false)} />

      {/* STATUS BAR */}
      <div style={{ flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: '#060a12', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.65rem', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: '#1a2236', padding: '2px 8px', borderRadius: 5, fontWeight: 700, color: '#00e5ff', border: '1px solid rgba(255,255,255,0.08)' }}>CAMA 4</span>
          <span style={{ fontWeight: 600, color: '#f3f4f6' }}>Doe, John — {wt}kg</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(52,211,153,0.2)', fontSize: '0.55rem' }}>D{simD(ticks)}/14</span>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: '#f3f4f6', background: '#111827', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em', fontSize: '0.7rem' }}>{fmtT(ticks)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => useTimeStore.getState().start()} style={{ background: isRun ? '#14532d' : '#166534', border: isRun ? '1px solid #22c55e' : 'none', borderRadius: 4, color: '#fff', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer' }}>▶ PLAY</button>
          <button onClick={() => useTimeStore.getState().pause()} style={{ background: !isRun ? '#7c2d12' : '#92400e', border: !isRun ? '1px solid #f97316' : 'none', borderRadius: 4, color: '#fff', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer' }}>⏸ PAUSE</button>
          {[1, 10, 60].map(x => (
             <button key={x} onClick={() => useTimeStore.getState().setSpeed(x)} style={{ background: spd === x ? '#1d4ed8' : '#1a2236', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#fff', fontFamily: MONO, fontWeight: 700, fontSize: '0.5rem', padding: '3px 6px', cursor: 'pointer' }}>{x}x</button>
          ))}
          <button onClick={() => setShowLab(true)} style={{ background: '#4c1d95', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, color: '#c4b5fd', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer', marginLeft: 2 }}>LAB</button>
        </div>
      </div>

      <ARDSStatusBar />

      {/* MAIN GRID */}
      <div 
        className="flex-1 grid gap-2 p-2 overflow-hidden min-h-0 transition-all duration-300 ease-in-out"
        style={{
          gridTemplateColumns: \`\${leftCollapsed ? '40px' : '330px'} 1fr \${rightCollapsed ? '40px' : '250px'}\`
        }}
      >
        
        {/* LEFT COLUMN */}
        <div className="relative flex flex-col min-w-0 h-full overflow-hidden rounded-xl border border-white/5 bg-[#060a12] transition-colors">
          
          {/* Vertical Collapsed Bar Text */}
          <div className={\`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none \${leftCollapsed ? 'opacity-100' : 'opacity-0'}\`}>
             <div className="transform -rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-[#ef4444] opacity-80">
                CONTROLES
             </div>
          </div>

          <div className={\`flex flex-col gap-4 h-full overflow-y-auto pr-1 p-2 transition-opacity duration-300 \${leftCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}\`}>
            {/* Volemia */}
            <div style={{ background: '#111827', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px', flexShrink: 0 }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>VOLEMIA: {Math.round(bv)}ml</div>
              <button
                onClick={() => { var s = usePatientStore.getState(); s.setHemorrhageRate(s.hemorrhageRate > 0 ? 0 : 2); }}
                style={{ width: '100%', background: bleeding ? '#7f1d1d' : '#1a2236', border: '1px solid ' + (bleeding ? '#ef4444' : 'rgba(255,255,255,0.08)'), borderRadius: 5, color: bleeding ? '#fca5a5' : '#f3f4f6', fontWeight: 700, fontSize: '0.55rem', padding: '4px 0', cursor: 'pointer', marginBottom: 3 }}
              >
                {bleeding ? '⬛ DETENER SANGRADO' : '🩸 SANGRADO'}
              </button>
              <button
                onClick={() => usePatientStore.getState().administerBolus(500)}
                style={{ width: '100%', background: '#0c4a6e', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, color: '#7dd3fc', fontWeight: 700, fontSize: '0.55rem', padding: '4px 0', cursor: 'pointer' }}
              >
                💧 BOLUS 500ml
              </button>
            </div>

            {/* Ventilador */}
            <div style={{ background: '#111827', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px', flexShrink: 0  }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ffeb3b', marginBottom: 4 }}>VENTILADOR</div>
              <div style={{ fontSize: '0.5rem', color: '#9ca3af', marginBottom: 2 }}>FiO2: {Math.round(vent.fio2 * 100)}%</div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                <button onClick={() => setVent({ fio2: fio2Down(vent.fio2) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#f3f4f6', fontSize: '0.6rem', fontWeight: 700, padding: '2px', cursor: 'pointer' }}>-</button>
                <button onClick={() => setVent({ fio2: fio2Up(vent.fio2) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#f3f4f6', fontSize: '0.6rem', fontWeight: 700, padding: '2px', cursor: 'pointer' }}>+</button>
              </div>
              <div style={{ fontSize: '0.5rem', color: '#9ca3af', marginBottom: 2 }}>Vt: {vent.vt}ml | PEEP: {vent.peep} cmH₂O</div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => setVent({ vt: Math.max(200, vent.vt - 10) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#9ca3af', fontSize: '0.45rem', padding: '2px', cursor: 'pointer' }}>Vt-</button>
                <button onClick={() => setVent({ vt: Math.min(800, vent.vt + 10) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#9ca3af', fontSize: '0.45rem', padding: '2px', cursor: 'pointer' }}>Vt+</button>
                <button onClick={() => setVent({ peep: Math.max(0, vent.peep - 1) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#9ca3af', fontSize: '0.45rem', padding: '2px', cursor: 'pointer' }}>P-</button>
                <button onClick={() => setVent({ peep: Math.min(24, vent.peep + 1) })} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#9ca3af', fontSize: '0.45rem', padding: '2px', cursor: 'pointer' }}>P+</button>
              </div>
            </div>

            {/* Torre Infusion */}
            <div style={{ background: '#111827', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px', flexShrink: 0 }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', marginBottom: 4 }}>TORRE DE INFUSION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                {PUMPS.map(p => <Pump key={p.drug} c={p} />)}
              </div>
            </div>
          </div>

          <button 
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-12 bg-gray-800/80 border border-white/10 rounded-l cursor-pointer z-10 flex items-center justify-center text-gray-400 hover:text-white border-r-0 shadow"
            title="Colapsar Panel Controles"
          >
            {leftCollapsed ? '>' : '<'}
          </button>
        </div>

        {/* CENTER COLUMN: Waveforms */}
        <div className="flex flex-col min-w-0 bg-[#060a12] rounded-xl border border-white/5 p-2 overflow-hidden h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] z-0">
          <WaveformMonitor />
        </div>

        {/* RIGHT COLUMN */}
        <div className="relative flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300">
          {/* Vertical Collapsed Bar Text */}
          <div className={\`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none z-0 \${rightCollapsed ? 'opacity-100' : 'opacity-0'}\`}>
             <div className="transform rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-[#39ff14] opacity-80 mt-12">
                SIGNOS VITALES
             </div>
          </div>

          <button 
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="absolute top-1/2 left-0 -translate-y-1/2 w-4 h-12 bg-gray-800/80 border border-white/10 rounded-r cursor-pointer z-10 flex items-center justify-center text-gray-400 hover:text-white border-l-0 shadow"
            title="Colapsar Signos Vitales"
          >
            {rightCollapsed ? '<' : '>'}
          </button>

          <div className={\`w-full h-full flex flex-col transition-opacity duration-300 \${rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}\`}>
            <VitalSignsPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonitorApp;
`;
    fs.writeFileSync(file, top + bottom);
    console.log("Success rewriting MonitorApp for Collapse mode!");
} else {
    console.log("Failed to find split point.")
}
