// src/components/SettingsModal.tsx
//
// Modal de configuración global — unidades, visualización, audio.
// Accesible desde el botón engranaje (esquina superior izquierda).

import React from 'react';
import { useUIStore, type DripUnitMode } from '../store/useUIStore';

// ─── Primitivos ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[0.55rem] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 pb-1 border-b border-white/5">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-[0.55rem] font-bold text-slate-200">{label}</div>
        {desc && <div className="text-[0.45rem] text-slate-500 mt-0.5">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer shrink-0"
        style={{ background: value ? '#06b6d4' : '#374151' }}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[0.55rem] font-bold text-slate-200 w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        title={label}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-cyan-400 h-1 cursor-pointer"
      />
      <span className="text-[0.5rem] font-mono text-cyan-300 w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

const DRIP_OPTIONS: { value: DripUnitMode; label: string; desc: string }[] = [
  { value: 'medical', label: 'Unidades Médicas',
    desc: 'mcg/kg/min, UI/h — estándar UCI internacional' },
  { value: 'cc_h',    label: 'Caudal por Bomba',
    desc: 'cc/h — calculado por peso real + dilución estándar' },
  { value: 'dual',    label: 'Dual (médico + cc/h)',
    desc: 'Ambos visibles — recomendado para enseñanza' },
];

// ─── Componente principal ─────────────────────────────────────────────────────

interface SettingsModalProps {
  open:    boolean;
  onClose: () => void;
  onOpenInstructor?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, onOpenInstructor }) => {
  const {
    dripUnitMode, setDripUnitMode,
    showSofa, setShowSofa,
    picoPhotoreal, setPicoPhotoreal,
    waveAntialias, setWaveAntialias,
    audioAlarms, setAudioAlarms,
    alarmVolume, setAlarmVolume,
  } = useUIStore();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0b1120] border border-white/10 rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[0.85rem] font-black text-white tracking-[0.1em] uppercase">
            ⚙ Configuración
          </h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-white text-lg cursor-pointer px-2">✕</button>
        </div>

        {/* Unidad de Goteo */}
        <Section title="Unidad de Goteo Crítico">
          <div className="space-y-1.5">
            {DRIP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDripUnitMode(opt.value)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                  dripUnitMode === opt.value
                    ? 'bg-cyan-500/15 border-cyan-500/50'
                    : 'bg-black/30 border-white/5 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    dripUnitMode === opt.value ? 'bg-cyan-400 border-cyan-400' : 'border-slate-600'
                  }`} />
                  <div>
                    <div className="text-[0.58rem] font-bold text-slate-200">{opt.label}</div>
                    <div className="text-[0.46rem] text-slate-500 mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Visualización */}
        <Section title="Visualización">
          <Toggle label="Mostrar SOFA en barra superior"
                  desc="Score de disfunción orgánica visible en el header"
                  value={showSofa} onChange={setShowSofa} />
          <Toggle label="Tema fotorrealista PiCCO"
                  desc="Diales con LED simulados y gradientes profundos"
                  value={picoPhotoreal} onChange={setPicoPhotoreal} />
          <Toggle label="Anti-aliasing en curvas"
                  desc="Suavizado de bordes (requiere más CPU a speed×60)"
                  value={waveAntialias} onChange={setWaveAntialias} />
        </Section>

        {/* Audio */}
        <Section title="Audio">
          <Toggle label="Alarmas sonoras"
                  desc="Beep para PiCCO vencido, hipoglucemia severa, etc."
                  value={audioAlarms} onChange={setAudioAlarms} />
          <SliderRow label="Volumen alarmas" value={alarmVolume}
                     onChange={setAlarmVolume} min={0} max={1} step={0.1} />
        </Section>

        {/* Panel Instructor */}
        <Section title="Instructor">
          <div className="text-[0.5rem] text-slate-500 mb-2">
            El panel maestro permite overrides en tiempo real: fluidos, gravedad de patologías,
            control de foco séptico, ATB adecuado.
          </div>
          {onOpenInstructor && (
            <button
              type="button"
              onClick={() => { onClose(); onOpenInstructor(); }}
              className="w-full py-2 rounded-lg border border-sky-500/40 bg-sky-900/20 text-sky-300 text-[0.55rem] font-bold tracking-wider cursor-pointer hover:bg-sky-800/30 transition-all"
            >
              ABRIR PANEL INSTRUCTOR (Alt+I)
            </button>
          )}
        </Section>

        <div className="text-[0.42rem] text-slate-600 text-center mt-2">
          IMHOTEP UCI · v0.19+ · Configuración persiste en sesión
        </div>
      </div>
    </div>
  );
};
