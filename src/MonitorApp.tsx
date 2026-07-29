/* eslint-disable react/forbid-dom-props */
import React, { useEffect, useState } from 'react';
import { usePatientStore } from './store/usePatientStore';
import { useTimeStore } from './store/useTimeStore';
import { usePrognosisStore } from './store/usePrognosisStore';
import { useScenarioStore } from './store/useScenarioStore';
import { usePathologyStore } from './store/usePathologyStore';
import { useGlycemicStore } from './store/useGlycemicStore';
import { CronosEngine } from './core/CronosEngine';
import LabPanel from './components/LabPanel';
import WaveformMonitor from './components/WaveformMonitor';
import { ARDSStatusBar } from './components/ARDSStatusBar';
import VitalSignsPanel from './components/VitalSignsPanel';
import ClinicalControlPanel from './components/ClinicalControlPanel';
import VentilatorPanel from './components/VentilatorPanel';
import { ScenarioSelectorModal } from './components/ScenarioSelectorModal';
import { LiveInstructorOverridePanel } from './components/LiveInstructorOverridePanel';
// CulturePanel now lives inside ClinicalControlPanel → INFECTOLOGÍA accordion
import { PatientInfoModal } from './components/PatientInfoModal';
import PiCCOMonitorSM1 from './components/PiCCOMonitorSM1';
import PiCCOMonitor    from './components/picco/PiCCOMonitor';
import { PiCCOVolumeView } from './components/picco/PiCCOVolumeView';
import PiCCOPanelToggle    from './components/picco/PiCCOPanelToggle';
import { Drawer }      from './components/ui/Drawer';
import { useMonitoringStore } from './store/useMonitoringStore';
import QuickAccessPanel from './components/QuickAccessPanel';
import { ThermodilutionAlarm }       from './components/ThermodilutionAlarm';
import { SettingsModal }             from './components/SettingsModal';
import InfectologyHeaderButton       from './components/header/InfectologyHeaderButton';
import ECMOCRRTPanel                 from './components/crosstalk/ECMOCRRTPanel';
import { CrashFallback }             from './components/CrashFallback';
import { useNIBPCycle, triggerNIBPNow } from './hooks/useNIBPCycle';
import NIBPCuffAnimation               from './components/NIBPCuffAnimation';
import ImagingPanel                    from './components/ImagingPanel';
import { CustomCaseModal }             from './components/CustomCaseModal';
import { DeathOverlay }               from './components/DeathOverlay';
import { MortalityDangerBadge }       from './components/MortalityDangerBadge';
import { useMortalityStore }           from './store/useMortalityStore';

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
  var ticks            = useTimeStore(s => s.ticks);
  var isRun            = useTimeStore(s => s.isRunning);
  var spd              = useTimeStore(s => s.speedMultiplier);
  var wt               = usePatientStore(s => s.vitals.weight);
  var isVentConnected  = usePatientStore(s => s.isVentilatorConnected);
  // 1.E: diagnosis derivado automáticamente por RespiratoryEngine (Berlin/Global 2023)
  var ardsDx           = usePathologyStore(s => s.ards.diagnosis);
  var bgDisplayed      = useGlycemicStore(s => s.bgDisplayed);
  var severHypo        = useGlycemicStore(s => s.severHypoAlert);
  var hypoAlert        = useGlycemicStore(s => s.hypoAlert);
  var severHyper       = useGlycemicStore(s => s.severHyperAlert);
  var hyperAlert       = useGlycemicStore(s => s.hyperAlert);
  var progOutcome      = usePrognosisStore(s => s.outcome);
  var progSofa         = usePrognosisStore(s => s.sofaScore);
  var progActive       = usePrognosisStore(s => s.isActive);
  var isSimStarted     = useScenarioStore(s => s.isSimulationStarted);
  var activeScenario   = useScenarioStore(s => s.activeScenario);
  var launchError      = useScenarioStore(s => s.launchError);
  var clearLaunchError = useScenarioStore(s => s.clearLaunchError);

  var piccoMode = useMonitoringStore(s => s.invasiveMode);

  var [showLab, setShowLab] = useState(false);
  var [showVent, setShowVent] = useState(false);
  var [showInstructor, setShowInstructor]   = useState(false);
  var [showECMOCRRT, setShowECMOCRRT]       = useState(false);
  var [showImaging, setShowImaging]         = useState(false);
  var [showCustomCase, setShowCustomCase]   = useState(false);
  var [showSettings, setShowSettings] = useState(false);
  var [showPiCCO, setShowPiCCO] = useState(false);
  var [showPiccoDropdown, setShowPiccoDropdown] = useState(false);
  var [showQuickAccess, setShowQuickAccess] = useState(false);
  var [leftCollapsed, setLeftCollapsed] = useState(false);
  var [rightCollapsed, setRightCollapsed] = useState(false);

  // ── NIBP cycle hook (Fase 2) ──────────────────────────────────────────────
  useNIBPCycle();

  // Captura inicial de NIBP para no mostrar "---/---" en los primeros 5 min
  useEffect(() => {
    const { procedures } = usePatientStore.getState();
    if (!procedures.arterialLine && procedures.nibp.lastSample === null) {
      triggerNIBPNow();
    }
  }, []);

  // Inicializar motor SIN arrancar — ScenarioSelectorModal llama start() vía applyScenario()
  useEffect(() => {
    var e = CronosEngine.getInstance();
    e.initialize();
    return () => { e.destroy(); };
  }, []);

  // Auto-abrir panel ARM cuando se conecta el ventilador
  useEffect(() => {
    if (isVentConnected) setShowVent(true);
  }, [isVentConnected]);

  function handleChangeCase() {
    useScenarioStore.getState().resetSimulation();
    // Reset del motor de mortalidad aguda al cambiar de caso
    useMortalityStore.getState().reset();
  }

  // FASE 2.B: Estado inconsistente — isSimStarted=true pero datos faltantes
  if (isSimStarted && !activeScenario) {
    console.error('[IMHOTEP·GUARD] isSimStarted=true pero activeScenario es null');
    return (
      <CrashFallback
        title="Estado inconsistente de simulación"
        message="La simulación está marcada como iniciada pero no hay caso cargado. Esto indica un bug en la secuencia de inicio."
        onReturn={() => { clearLaunchError(); useScenarioStore.getState().resetSimulation(); }}
      />
    );
  }

  // FASE 2.B: Error de lanzamiento — visible en lugar de redirect silencioso
  if (launchError && !isSimStarted) {
    return (
      <CrashFallback
        title="Error al iniciar caso"
        message={launchError}
        detail={undefined}
        onReturn={() => { clearLaunchError(); }}
        returnLabel="Volver al selector"
      />
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b0f19', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── MODAL SELECTOR — bloquea hasta selección de caso ── */}
      {!isSimStarted && <ScenarioSelectorModal />}

      <LabPanel isOpen={showLab} onClose={() => setShowLab(false)} />
      <ImagingPanel isOpen={showImaging} onClose={() => setShowImaging(false)} />
      <CustomCaseModal open={showCustomCase} onClose={() => setShowCustomCase(false)} />

      {/* STATUS BAR */}
      <div style={{ flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: '#060a12', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.65rem', zIndex: 50, opacity: isSimStarted ? 1 : 0.3, pointerEvents: isSimStarted ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* ── Botón Configuración (abre SettingsModal) ── */}
          <button
            type="button"
            title="Configuración (⚙) — Alt+I para Instructor"
            onClick={() => setShowSettings(v => !v)}
            style={{
              background: showSettings ? 'rgba(56,189,248,0.15)' : '#0d1224',
              border: `1px solid ${showSettings ? '#38bdf8' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 5, color: showSettings ? '#38bdf8' : '#64748b',
              fontWeight: 900, fontSize: '0.7rem',
              padding: '3px 7px', cursor: 'pointer',
              letterSpacing: '0.05em', lineHeight: 1,
              transition: 'all 0.15s',
            }}
          >&#9881;</button>
          <PatientInfoModal />
          <InfectologyHeaderButton />
          <button
            type="button"
            onClick={() => setShowECMOCRRT(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded border text-[0.46rem] font-black cursor-pointer transition-all"
            style={{
              background:  showECMOCRRT ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.04)',
              borderColor: showECMOCRRT ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.08)',
              color:       showECMOCRRT ? '#fca5a5' : '#475569',
            }}
            title="Panel ECMO / CRRT"
          >ECMO/CRRT</button>
          <button
            type="button"
            onClick={() => setShowImaging(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded border text-[0.46rem] font-black cursor-pointer transition-all"
            style={{
              background:  showImaging ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
              borderColor: showImaging ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)',
              color:       showImaging ? '#c4b5fd' : '#475569',
            }}
            title="Estudios de imagen"
          >🩻 ESTUDIOS</button>
          <button
            type="button"
            onClick={() => setShowCustomCase(v => !v)}
            title="Personalizar caso (narrativa clínica libre)"
            style={{
              background: '#1e1b4b',
              border: '1px solid rgba(139,92,246,0.45)',
              borderRadius: 4,
              color: '#a78bfa',
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: '0.55rem',
              padding: '3px 8px',
              marginLeft: 2,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >✎ PERSONALIZAR</button>
          <span style={{ fontWeight: 600, color: '#f3f4f6' }}>— {wt}kg</span>
          {activeScenario && (
            <span style={{ background: 'rgba(163,230,53,0.1)', padding: '1px 7px', borderRadius: 4, fontWeight: 700, color: '#a3e635', border: '1px solid rgba(163,230,53,0.25)', fontSize: '0.55rem', fontFamily: MONO }}>
              {activeScenario.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(52,211,153,0.2)', fontSize: '0.55rem' }}>D{simD(ticks)}/14</span>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: '#f3f4f6', background: '#111827', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em', fontSize: '0.7rem' }}>{fmtT(ticks)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => useTimeStore.getState().start()} style={{ background: isRun ? '#14532d' : '#166534', border: isRun ? '1px solid #22c55e' : 'none', borderRadius: 4, color: '#fff', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer' }}>▶ PLAY</button>
          <button type="button" onClick={() => useTimeStore.getState().pause()} style={{ background: !isRun ? '#7c2d12' : '#92400e', border: !isRun ? '1px solid #f97316' : 'none', borderRadius: 4, color: '#fff', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer' }}>⏸ PAUSE</button>
          {[1, 10, 60].map(x => (
            <button type="button" key={x} onClick={() => useTimeStore.getState().setSpeed(x)} style={{ background: spd === x ? '#1d4ed8' : '#1a2236', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#fff', fontFamily: MONO, fontWeight: 700, fontSize: '0.5rem', padding: '3px 6px', cursor: 'pointer' }}>{x}x</button>
          ))}
          <button type="button" onClick={() => setShowLab(true)} style={{ background: '#4c1d95', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, color: '#c4b5fd', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer', marginLeft: 2 }}>LAB</button>
          {isVentConnected && (
            <button type="button" onClick={() => setShowVent(true)} style={{ background: '#0a2a0a', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 4, color: '#34d399', fontWeight: 700, fontSize: '0.55rem', padding: '3px 8px', cursor: 'pointer', marginLeft: 2 }}>ARM</button>
          )}
          {/* Quick Access toggle */}
          <button
            type="button"
            onClick={() => setShowQuickAccess(v => !v)}
            style={{
              background: showQuickAccess ? 'rgba(34,211,238,0.12)' : '#080c18',
              border: `1px solid ${showQuickAccess ? '#22d3ee' : 'rgba(34,211,238,0.2)'}`,
              borderRadius: 4, color: showQuickAccess ? '#22d3ee' : '#0e7490',
              fontWeight: 900, fontSize: '0.5rem',
              padding: '3px 7px', cursor: 'pointer', marginLeft: 2,
              fontFamily: MONO,
            }}
            title="Quick Access Panel (bolos, fármacos, fluidos)"
          >
            ⚡
          </button>
          {/* PiCCO tri-state dropdown */}
          <div style={{ position: 'relative', marginLeft: 2 }}>
            <button
              type="button"
              onClick={() => setShowPiccoDropdown(v => !v)}
              style={{
                background: piccoMode !== 'none' ? 'rgba(6,182,212,0.15)' : '#060a14',
                border: `1px solid ${piccoMode !== 'none' ? '#22d3ee' : 'rgba(6,182,212,0.25)'}`,
                borderRadius: 4, color: piccoMode !== 'none' ? '#22d3ee' : '#0e7490',
                fontWeight: 900, fontSize: '0.5rem',
                padding: '3px 8px', cursor: 'pointer',
                fontFamily: MONO, letterSpacing: '0.06em',
              }}
              title="Monitoreo invasivo — click para cambiar modo"
            >
              {piccoMode === 'picco' ? '◉ PiCCO' : piccoMode === 'art_cvp' ? '● ART+PVC' : 'NIBP ▾'}
            </button>
            {showPiccoDropdown && (
              <div
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: '#0b1120', border: '1px solid rgba(6,182,212,0.3)',
                  borderRadius: 8, zIndex: 200, minWidth: 180,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                }}
              >
                {[
                  { mode: 'none' as const,    icon: '○', label: 'NIBP automático',      desc: 'Sin curva ART' },
                  { mode: 'art_cvp' as const, icon: '●', label: 'Línea Arterial + PVC', desc: 'Curva ART continua' },
                  { mode: 'picco' as const,   icon: '◉', label: 'PiCCO Completo',       desc: 'Termodilución + volúmenes' },
                ].map(opt => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => {
                      useMonitoringStore.getState().setInvasiveMode(opt.mode);
                      // Sync single source of truth: invasiveMode → procedures.arterialLine
                      usePatientStore.getState().setProcedure('arterialLine', opt.mode !== 'none');
                      if (opt.mode === 'picco') setShowPiCCO(true);
                      setShowPiccoDropdown(false);
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', cursor: 'pointer', border: 'none',
                      background: piccoMode === opt.mode ? 'rgba(6,182,212,0.12)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, color: piccoMode === opt.mode ? '#22d3ee' : '#cbd5e1', fontFamily: MONO }}>
                      {opt.icon} {opt.label}
                    </div>
                    <div style={{ fontSize: '0.4rem', color: '#475569', marginTop: 1 }}>{opt.desc}</div>
                  </button>
                ))}
                <button
                  key="open-picco"
                  type="button"
                  onClick={() => { setShowPiCCO(true); setShowPiccoDropdown(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    padding: '6px 12px', cursor: 'pointer', border: 'none',
                    background: 'rgba(139,92,246,0.1)',
                    fontSize: '0.45rem', fontWeight: 700, color: '#a78bfa',
                  }}
                >
                  ABRIR PANEL PiCCO →
                </button>
              </div>
            )}
          </div>
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
          {/* CAMBIAR CASO — abre el selector de escenarios */}
          <button
            type="button"
            onClick={handleChangeCase}
            style={{
              background: '#1a1a2e',
              border: '1px solid rgba(163,230,53,0.3)',
              borderRadius: 4, color: '#a3e635',
              fontWeight: 700, fontSize: '0.5rem',
              padding: '3px 8px', cursor: 'pointer', marginLeft: 4,
              fontFamily: MONO,
            }}
            title="Cambiar caso clínico (resetea simulación)"
          >
            ⟳ CASO
          </button>
        </div>
      </div>

      {/* ARDSStatusBar: visible solo cuando el engine diagnostica SDRA (Berlin/Global 2023) */}
      {ardsDx !== 'none' && <ARDSStatusBar />}

      {/* ── Glicemia banners (Fase 5.D) ── */}
      {isSimStarted && (severHypo || severHyper) && (
        <div style={{
          flexShrink: 0, padding: '2px 12px',
          background: '#3a0a0a',
          borderBottom: '1px solid #8a2a2a',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.5rem', fontWeight: 900, color: '#f87171',
          letterSpacing: '0.12em',
          animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        }}>
          <span>
            {severHypo
              ? `⚠ HIPOGLICEMIA SEVERA — ${bgDisplayed} mg/dL — TRATAR URGENTE (glucosa IV / glucagón)`
              : `⚠ HIPERGLICEMIA SEVERA — ${bgDisplayed} mg/dL — AJUSTAR INSULINA`}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem' }}>
            HGT: {bgDisplayed} mg/dL
          </span>
        </div>
      )}
      {isSimStarted && !severHypo && !severHyper && (hypoAlert || hyperAlert) && (
        <div style={{
          flexShrink: 0, padding: '2px 12px',
          background: '#2a1a08',
          borderBottom: '1px solid rgba(251,191,36,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.48rem', fontWeight: 700, color: '#fbbf24',
          letterSpacing: '0.08em',
        }}>
          <span>
            {hypoAlert
              ? `↓ Hipoglicemia — ${bgDisplayed} mg/dL (objetivo 140-180)`
              : `↑ Hiperglicemia — ${bgDisplayed} mg/dL (objetivo 140-180)`}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem' }}>
            NICE-SUGAR target: 140–180 mg/dL
          </span>
        </div>
      )}

      {/* BODY: dimmed cuando no se ha iniciado un caso */}
      <div
        className="flex-1 flex flex-col overflow-hidden min-h-0"
        style={{ opacity: isSimStarted ? 1 : 0.15, pointerEvents: isSimStarted ? 'auto' : 'none' }}
      >
        {/* MAIN GRID */}
        <div
          className="flex-1 grid gap-2 p-2 overflow-hidden min-h-0 transition-all duration-300 ease-in-out"
          style={{ gridTemplateColumns: `${leftCollapsed ? '40px' : '22%'} 1fr ${rightCollapsed ? '40px' : '15%'}` }}
        >

          {/* LEFT COLUMN */}
          <div className="relative flex flex-col min-w-0 h-full overflow-hidden rounded-xl border border-white/5 bg-[#060a12]">
            <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none ${leftCollapsed ? 'opacity-100' : 'opacity-0'}`}>
              <div className="transform -rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-gray-500 opacity-80">
                CONTROLES
              </div>
            </div>
            <div className={`flex flex-col h-full transition-opacity duration-300 ${leftCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <ClinicalControlPanel onOpenVent={() => setShowVent(true)} />
            </div>
            <button
              type="button"
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="absolute top-[320px] right-0 -translate-y-1/2 w-3.5 h-[40px] bg-gray-800 border border-white/20 rounded-l cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-r-0 shadow-lg"
              title="Toggle Controles"
            >
              {leftCollapsed ? '>' : '<'}
            </button>
          </div>

          {/* CENTER COLUMN: Waveforms */}
          <div className="flex flex-col min-w-0 bg-[#060a12] rounded-xl border border-white/5 p-2 overflow-hidden h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] z-0" style={{ position: 'relative' }}>
            {/* MortalityDangerBadge: posicionado sobre el WaveformMonitor */}
            {isSimStarted && <MortalityDangerBadge />}
            <WaveformMonitor />
          </div>

          {/* RIGHT COLUMN */}
          <div className="relative flex flex-col min-w-0 h-full overflow-hidden rounded-xl bg-[#060a12]">
            <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none z-0 ${rightCollapsed ? 'opacity-100' : 'opacity-0'}`}>
              <div className="transform rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-[#39ff14] opacity-80 mt-12">
                {showQuickAccess ? 'QUICK ACCESS' : 'SIGNOS VITALES'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="absolute top-[320px] left-0 -translate-y-1/2 w-3.5 h-[40px] bg-gray-800 border border-white/20 rounded-r cursor-pointer z-10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 border-l-0 shadow-lg"
              title="Toggle panel derecho"
            >
              {rightCollapsed ? '<' : '>'}
            </button>
            <div className={`w-full h-full flex flex-col transition-opacity duration-300 ${rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {/* Tab toggle: VITALES ↔ QUICK ACCESS */}
              <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button type="button"
                  onClick={() => setShowQuickAccess(false)}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: '0.4rem', fontWeight: 900,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: !showQuickAccess ? 'rgba(57,255,20,0.08)' : 'transparent',
                    color: !showQuickAccess ? '#39ff14' : '#475569',
                    border: 'none', cursor: 'pointer',
                    borderBottom: !showQuickAccess ? '1px solid #39ff14' : '1px solid transparent',
                  }}>VITALES</button>
                <button type="button"
                  onClick={() => setShowQuickAccess(true)}
                  style={{
                    flex: 1, padding: '3px 0', fontSize: '0.4rem', fontWeight: 900,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: showQuickAccess ? 'rgba(34,211,238,0.08)' : 'transparent',
                    color: showQuickAccess ? '#22d3ee' : '#475569',
                    border: 'none', cursor: 'pointer',
                    borderBottom: showQuickAccess ? '1px solid #22d3ee' : '1px solid transparent',
                  }}>QUICK ACCESS</button>
              </div>
              {!showQuickAccess
                ? <VitalSignsPanel />
                : <QuickAccessPanel onOpenVent={() => setShowVent(true)} />
              }
            </div>
          </div>
        </div>

        <VentilatorPanel isOpen={showVent} onClose={() => setShowVent(false)} />
      </div>

      {/* PiCCO SM1 legado (fallback) */}
      <PiCCOMonitorSM1 isOpen={false} onClose={() => setShowPiCCO(false)} />

      {/* PiCCO Monitor v2 — Drawer portal */}
      <Drawer open={showPiCCO && isSimStarted} onClose={() => setShowPiCCO(false)} title="PiCCO SM1 — VolumeView" side="right" width={980}>
        <PiCCOMonitor />
      </Drawer>

      {/* PiCCO VolumeView — panel 4-cuadrantes bottom-right */}
      {isSimStarted && <PiCCOVolumeView />}
      {isSimStarted && <PiCCOPanelToggle />}

      {/* PiCCO overlay components */}
      {isSimStarted && <ThermodilutionAlarm />}
      <NIBPCuffAnimation />

      {/* LiveInstructorOverridePanel — accesible desde SettingsModal o Alt+I */}
      {isSimStarted && <LiveInstructorOverridePanel forceOpen={showInstructor} onToggle={(v) => setShowInstructor(v)} />}

      {/* ECMO / CRRT Panel */}
      <ECMOCRRTPanel open={showECMOCRRT && isSimStarted} onClose={() => setShowECMOCRRT(false)} />

      {/* SettingsModal — abre desde botón ⚙ */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenInstructor={() => setShowInstructor(true)}
      />

      {/* Cultivos integrados en el acordeón INFECTOLOGÍA del panel clínico izquierdo */}

      {/* ── MORTALIDAD AGUDA ── */}
      {/* DeathOverlay: fullscreen modal post-mortem, z-index 9999 */}
      <DeathOverlay />

    </div>
  );
};

export default MonitorApp;
