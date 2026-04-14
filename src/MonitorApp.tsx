import React, { useEffect, useState } from 'react';
import { usePatientStore } from './store/usePatientStore';
import type { Infusions } from './store/usePatientStore';
import { useTimeStore } from './store/useTimeStore';
import { CronosEngine } from './core/CronosEngine';
import LabPanel from './components/LabPanel';
import WaveformMonitor from './components/WaveformMonitor';
import { ARDSStatusBar } from './components/ARDSStatusBar';
import VitalSignsPanel from './components/VitalSignsPanel';

var MONO = "'JetBrains Mono', monospace";


interface PC {
  drug: keyof Infusions;
  label: string;
  unit: string;
  color: string;
  step: number;
  max: number;
  dec: number;
}

var PUMPS: PC[] = [
  { drug: 'noradrenaline', label: 'NORA', unit: 'mcg/kg/min', color: '#ff00ff', step: 0.05, max: 2.0, dec: 2 },
  { drug: 'propofol', label: 'PROPOFOL', unit: 'mg/kg/hr', color: '#eab308', step: 0.5, max: 12.0, dec: 1 },
  { drug: 'dobutamine', label: 'DOBUTA', unit: 'mcg/kg/min', color: '#f97316', step: 1.0, max: 20.0, dec: 1 },
];

function fmtT(t: number): string {
  var h = Math.floor(t / 3600) % 24;
  var m = Math.floor((t % 3600) / 60);
  var s = t % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function simD(t: number): number {
  return Math.floor(t / 86400) + 1;
}


function fio2Up(current: number): number {
  if (current <= 0.21) return 0.25;
  return Math.min(1.0, parseFloat((current + 0.05).toFixed(2)));
}
function fio2Down(current: number): number {
  if (current <= 0.25) return 0.21;
  return Math.max(0.25, parseFloat((current - 0.05).toFixed(2)));
}

var Pump: React.FC<{ c: PC }> = function ({ c: cfg }) {
  var rate = usePatientStore(s => s.infusions[cfg.drug]);
  var plasma = usePatientStore(s => s.activeDrugs[cfg.drug]);
  var setR = usePatientStore(s => s.setInfusionRate);
  var on = rate > 0;
  var cl = cfg.color;
  return (
    <div style={{ background: '#060a12', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', padding: '6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,' + cl + ',transparent)' }} />
      <div style={{ fontSize: '0.5rem', fontWeight: 700, color: cl, marginBottom: 2 }}>
        {cfg.label}
        <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: on ? cl : '#4b5563', boxShadow: on ? '0 0 4px ' + cl : 'none', marginLeft: 4, verticalAlign: 'middle' }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: '1.2rem', fontWeight: 900, lineHeight: 1, color: cl }}>
        {rate.toFixed(cfg.dec)}
      </div>
      <div style={{ fontSize: '0.4rem', opacity: 0.5, color: cl, marginTop: 1 }}>{cfg.unit}</div>
      <div style={{ fontFamily: MONO, fontSize: '0.4rem', opacity: 0.35, color: '#9ca3af', marginTop: 1 }}>P:{plasma.toFixed(2)}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, width: '100%' }}>
        <button onClick={() => setR(cfg.drug, Number(Math.max(0, rate - cfg.step).toFixed(cfg.dec)))} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#f3f4f6', fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700, padding: '3px 0', cursor: 'pointer' }}>-</button>
        <button onClick={() => setR(cfg.drug, Number(Math.min(cfg.max, rate + cfg.step).toFixed(cfg.dec)))} style={{ flex: 1, background: '#1a2236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#f3f4f6', fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700, padding: '3px 0', cursor: 'pointer' }}>+</button>
      </div>
    </div>
  );
};

var MonitorApp: React.FC = function () {
  var ticks = useTimeStore(s => s.ticks);
  var isRun = useTimeStore(s => s.isRunning);
  var spd = useTimeStore(s => s.speedMultiplier);
  var wt = usePatientStore(s => s.vitals.weight);
  var bv = usePatientStore(s => s.bloodVolume);
  var hem = usePatientStore(s => s.hemorrhageRate);
  var vent = usePatientStore(s => s.ventilator);

  var [showLab, setShowLab] = useState(false);
  var [leftCollapsed, setLeftCollapsed] = useState(false);
  var [rightCollapsed, setRightCollapsed] = useState(false);


  useEffect(() => {
    var e = CronosEngine.getInstance();
    e.initialize();
    useTimeStore.getState().start();
    return () => { e.destroy(); };
  }, []);

  var setVent = usePatientStore(s => s.setVentilator);
  var bleeding = hem > 0;

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
        </div>
      </div>

      <ARDSStatusBar />

      {/* MAIN GRID */}
      <div 
        className="flex-1 grid gap-2 p-2 overflow-hidden min-h-0 transition-all duration-300 ease-in-out"
        style={{
          gridTemplateColumns: `${leftCollapsed ? '40px' : '330px'} 1fr ${rightCollapsed ? '40px' : '250px'}`
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

          <div className={`flex flex-col gap-4 h-full overflow-y-auto pr-1 p-2 transition-opacity duration-300 ${leftCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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
            className="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-[60px] bg-gray-800 border border-white/20 rounded-l cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-r-0 shadow-lg"
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
            className="absolute top-1/2 left-0 -translate-y-1/2 w-4 h-[60px] bg-gray-800 border border-white/20 rounded-r cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-l-0 shadow-lg"
            title="Toggle Signos Vitales"
          >
            {rightCollapsed ? '<' : '>'}
          </button>

          <div className={`w-full h-full flex flex-col transition-opacity duration-300 ${rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <VitalSignsPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonitorApp;
