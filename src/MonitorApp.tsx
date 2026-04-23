/* eslint-disable react/forbid-dom-props */
import React, { useEffect, useState } from 'react';
import { usePatientStore } from './store/usePatientStore';
import { useTimeStore } from './store/useTimeStore';
import { usePrognosisStore } from './store/usePrognosisStore';
import { CronosEngine } from './core/CronosEngine';
import LabPanel from './components/LabPanel';
import WaveformMonitor from './components/WaveformMonitor';
import { ARDSStatusBar } from './components/ARDSStatusBar';
import VitalSignsPanel from './components/VitalSignsPanel';
import ClinicalControlPanel from './components/ClinicalControlPanel';
import VentilatorPanel from './components/VentilatorPanel';

var MONO = "'JetBrains Mono', monospace";

function fmtT(t: number): string {
  var h = Math.floor(t / 3600) % 24;
  var m = Math.floor((t % 3600) / 60);
  var s = t % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function simD(t: number): number {
  return Math.floor(t / 86400) + 1;
}

var MonitorApp: React.FC = function () {
  var ticks = useTimeStore(s => s.ticks);
  var isRun = useTimeStore(s => s.isRunning);
  var spd = useTimeStore(s => s.speedMultiplier);
  var wt = usePatientStore(s => s.vitals.weight);
  var isVentConnected = usePatientStore(s => s.isVentilatorConnected);
  var progOutcome     = usePrognosisStore(s => s.outcome);
  var progSofa        = usePrognosisStore(s => s.sofaScore);
  var progActive      = usePrognosisStore(s => s.isActive);

  var [showLab, setShowLab] = useState(false);
  var [showVent, setShowVent] = useState(false);
  var [leftCollapsed, setLeftCollapsed] = useState(false);
  var [rightCollapsed, setRightCollapsed] = useState(false);

  useEffect(() => {
    var e = CronosEngine.getInstance();
    e.initialize();
    useTimeStore.getState().start();
    return () => { e.destroy(); };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b0f19', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          {isVentConnected && (
            <button onClick={() => setShowVent(true)} style={{ background: '#0a2a0a', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 4, color: '#34d399', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer', marginLeft: 2 }}>ARM</button>
          )}
          {progActive && (
            <div style={{
              background: progOutcome === 'death' ? '#3a0a0a' : progSofa >= 11 ? '#2a1a08' : '#0a1a0a',
              border: `1px solid ${progOutcome === 'death' ? '#8a2a2a' : progSofa >= 11 ? '#7a4a08' : '#1a5a1a'}`,
              borderRadius: 4, padding: '2px 7px', marginLeft: 2,
              fontSize: '0.5rem', fontWeight: 900,
              color: progOutcome === 'death' ? '#ff6060' : progSofa >= 11 ? '#ffaa40' : '#60cc60',
              letterSpacing: '0.1em',
            }}>
              {progOutcome === 'death' ? '✕ ÓBITO' : `SOFA ${progSofa}`}
            </div>
          )}
        </div>
      </div>

      <ARDSStatusBar />

      {/* BODY: grid principal + panel ARM (cuando está activo) */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

      {/* MAIN GRID */}
      <div
        className="flex-1 grid gap-2 p-2 overflow-hidden min-h-0 transition-all duration-300 ease-in-out"
        style={{
          gridTemplateColumns: `${leftCollapsed ? '40px' : '22%'} 1fr ${rightCollapsed ? '40px' : '15%'}`
        }}
      >
        
        {/* LEFT COLUMN */}
        <div className="relative flex flex-col min-w-0 h-full overflow-hidden rounded-xl border border-white/5 bg-[#060a12]">
          
          {/* Vertical Collapsed Bar Text */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none ${leftCollapsed ? 'opacity-100' : 'opacity-0'}`}>
             <div className="transform -rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-gray-500 opacity-80">
                CONTROLES
             </div>
          </div>

          <div className={`flex flex-col h-full transition-opacity duration-300 ${leftCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <ClinicalControlPanel />
          </div>

          <button 
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="absolute top-[320px] right-0 -translate-y-1/2 w-3.5 h-[40px] bg-gray-800 border border-white/20 rounded-l cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-r-0 shadow-lg"
            title="Toggle Controles"
          >
            {leftCollapsed ? '>' : '<'}
          </button>
        </div>

        {/* CENTER COLUMN: Waveforms */}
        <div className="flex flex-col min-w-0 bg-[#060a12] rounded-xl border border-white/5 p-2 overflow-hidden h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] z-0">
          <WaveformMonitor />
        </div>

        {/* RIGHT COLUMN */}
        <div className="relative flex flex-col min-w-0 h-full overflow-hidden rounded-xl bg-[#060a12]">
          {/* Vertical Collapsed Bar Text */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none z-0 ${rightCollapsed ? 'opacity-100' : 'opacity-0'}`}>
             <div className="transform rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-[#39ff14] opacity-80 mt-12">
                SIGNOS VITALES
             </div>
          </div>

          <button 
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="absolute top-[320px] left-0 -translate-y-1/2 w-3.5 h-[40px] bg-gray-800 border border-white/20 rounded-r cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-l-0 shadow-lg"
            title="Toggle Signos Vitales"
          >
            {rightCollapsed ? '<' : '>'}
          </button>

          <div className={`w-full h-full flex flex-col transition-opacity duration-300 ${rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <VitalSignsPanel />
          </div>
        </div>
      </div>

      <VentilatorPanel isOpen={showVent} onClose={() => setShowVent(false)} />

      </div>{/* end BODY */}
    </div>
  );
};

export default MonitorApp;
