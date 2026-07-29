/* eslint-disable react/forbid-dom-props */
import React, { useState, useMemo } from 'react';
import { useScenarioStore, CATEGORY_META, getDifficultyLabel, scaleSeverity } from '../store/useScenarioStore';
import type { ScenarioCategory, ScenarioDefinition } from '../store/useScenarioStore';
import { CLINICAL_CATEGORY_ORDER, normalizeCategory, type ClinicalCategory } from '../types/ClinicalCategory';
import { SCENARIOS_BY_CATEGORY } from '../scenarios/index';
import { formatVital } from '../utils/formatVital';
import { CustomCaseModal } from './CustomCaseModal';
import O2StrategyPicker from './launcher/O2StrategyPicker';
import { SimulationLauncher } from '../core/SimulationLauncher';
import type { LauncherConfig } from '../core/SimulationLauncher';

// Ordered by clinical relevance in UCI: most critical first
const CATEGORY_ORDER: ClinicalCategory[] = CLINICAL_CATEGORY_ORDER;

const DIFFICULTY_MARKS = [
  { value: 1,  label: 'Docente',      color: '#34d399' },
  { value: 3,  label: 'Rutinario',    color: '#22d3ee' },
  { value: 5,  label: 'Complejo',     color: '#fbbf24' },
  { value: 7,  label: 'Crítico',      color: '#f97316' },
  { value: 10, label: 'Catastrófico', color: '#ef4444' },
];

function difficultyColor(d: number): string {
  if (d <= 2)  return '#34d399';
  if (d <= 4)  return '#22d3ee';
  if (d <= 6)  return '#fbbf24';
  if (d <= 8)  return '#f97316';
  return '#ef4444';
}

function SeverityBadge({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded font-mono text-[0.45rem] font-black tracking-[0.08em]"
      style={{ background: `${color}20`, border: `1px solid ${color}60`, color }}
    >
      {Math.round(value * 100)}%
    </span>
  );
}

function ScenarioCard({ scenario, selected, onClick, difficulty }: {
  scenario: ScenarioDefinition;
  selected: boolean;
  onClick: () => void;
  difficulty: number;
}) {
  const meta = CATEGORY_META[normalizeCategory(scenario.category as string)] ?? CATEGORY_META['infecto'];
  const effectiveSev = scaleSeverity(scenario.baseSeverity ?? 0.5, difficulty);
  const sevColor = effectiveSev < 0.30 ? '#34d399' : effectiveSev < 0.55 ? '#fbbf24' : effectiveSev < 0.80 ? '#f97316' : '#ef4444';
  const c = meta.color;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-3 rounded-xl cursor-pointer transition-all duration-150"
      style={{
        background: selected ? `${c}18` : 'rgba(0,0,0,0.35)',
        border: `1px solid ${selected ? c : 'rgba(255,255,255,0.06)'}`,
        boxShadow: selected ? `0 0 12px ${c}30` : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono font-black text-[0.65rem] tracking-[0.06em]" style={{ color: selected ? c : '#e2e8f0' }}>
          {scenario.name}
        </span>
        <SeverityBadge value={effectiveSev} color={sevColor} />
      </div>
      <p className="text-slate-500 text-[0.55rem] leading-relaxed mb-2 line-clamp-2">
        {scenario.description}
      </p>
      <div className="flex flex-wrap gap-1">
        {scenario.tags.slice(0, 4).map(tag => (
          <span key={tag} className="text-[0.4rem] px-1 rounded" style={{ background: `${c}15`, color: `${c}cc`, border: `1px solid ${c}30` }}>
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

interface VitalRow {
  label: string;
  key:   keyof import('../store/usePatientStore').Vitals;
  unit:  string;
  min:   number;
  max:   number;
  digits?: number;
  alert?: (v: number) => boolean;
}

const VITAL_ROWS: VitalRow[] = [
  { label: 'FC',      key: 'heartRate',           unit: 'lpm',    min: 20,  max: 250,  alert: v => v > 120 || v < 50 },
  { label: 'PAS',     key: 'systolicBP',           unit: 'mmHg',   min: 40,  max: 280,  alert: v => v < 90 || v > 180 },
  { label: 'PAM',     key: 'meanArterialPressure', unit: 'mmHg',   min: 20,  max: 180,  alert: v => v < 65 },
  { label: 'SpO₂',   key: 'spo2',                 unit: '%',      min: 50,  max: 100,  alert: v => v < 90 },
  { label: 'FR',      key: 'respiratoryRate',       unit: 'rpm',    min: 0,   max: 60,   alert: v => v > 25 },
  { label: 'PaO₂',   key: 'paO2',                 unit: 'mmHg',   min: 20,  max: 600,  alert: v => v < 60 },
  { label: 'PaCO₂',  key: 'paCO2',                unit: 'mmHg',   min: 15,  max: 100,  alert: v => v > 50 || v < 30 },
  { label: 'P/F',     key: 'pfRatio',              unit: '',       min: 0,   max: 600,  alert: v => v < 300 },
  { label: 'Lactato', key: 'lactate',              unit: 'mmol/L', min: 0,   max: 25,   digits: 1, alert: v => v > 2 },
  { label: 'pH',      key: 'pH',                   unit: '',       min: 6.8, max: 7.8,  digits: 2, alert: v => v < 7.30 || v > 7.50 },
  { label: 'GCS',     key: 'gcs',                  unit: '/15',    min: 3,   max: 15,   alert: v => v < 9 },
  { label: 'PIC',     key: 'icp',                  unit: 'mmHg',   min: 0,   max: 60,   alert: v => v > 20 },
  { label: 'Temp',    key: 'temperature',           unit: '°C',     min: 32,  max: 42,   digits: 1, alert: v => v > 38.5 || v < 36 },
  { label: 'Cr',      key: 'creatinine',            unit: 'mg/dL',  min: 0.3, max: 15,  digits: 1, alert: v => v > 1.5 },
];

function VitalsTable({ vitals }: { vitals: Partial<import('../store/usePatientStore').Vitals> }) {
  return (
    <div className="grid grid-cols-2 gap-0.5">
      {VITAL_ROWS.map(({ label, key, unit, min, max, digits, alert }) => {
        const val = vitals[key] as number | undefined;
        if (val === undefined) return null;
        const isAlert = alert ? alert(val) : false;
        const formatted = formatVital(val, { min, max, digits });
        return (
          <div key={key} className="flex justify-between items-center px-2 py-1 rounded" style={{ background: isAlert ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.2)' }}>
            <span className="text-slate-500 text-[0.75rem] font-mono">{label}</span>
            <span className="font-mono font-black text-[1.1rem]" style={{ color: isAlert ? '#ef4444' : '#a3e635' }}>
              {formatted}
              {unit && <span className="text-[0.65rem] font-normal text-slate-500 ml-0.5">{unit}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const ScenarioSelectorModal: React.FC = () => {
  const { activeScenario, difficulty, selectScenario, setDifficulty, launchError, clearLaunchError } = useScenarioStore();
  const [activeCategory, setActiveCategory] = useState<ClinicalCategory>('neuro');
  const [customOpen, setCustomOpen]         = useState(false);
  const [pickerOpen, setPickerOpen]         = useState(false);

  const scenariosInCategory = useMemo(
    () => SCENARIOS_BY_CATEGORY[activeCategory] ?? [],
    [activeCategory]
  );

  const dColor = difficultyColor(difficulty);
  const diffLabel = getDifficultyLabel(difficulty);
  const canStart = activeScenario !== null;

  return (
    <>
    <div
      className="fixed inset-0 z-[9000] flex flex-col items-center justify-center gap-3"
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      {/* ── Launch error banner ── */}
      {launchError && (
        <div className="w-full max-w-[900px] mx-auto px-4">
          <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-red-700/60 bg-red-950/60 text-red-200 text-[0.5rem] font-mono">
            <div>
              <div className="font-black text-red-400 uppercase tracking-wider mb-0.5">⚠ Error al iniciar caso</div>
              <div className="text-red-300 opacity-80">{launchError}</div>
              <div className="text-red-600 text-[0.38rem] mt-1">Revisa la consola del navegador para el stack trace completo.</div>
            </div>
            <button type="button" onClick={clearLaunchError} className="text-red-500 hover:text-red-200 cursor-pointer shrink-0 text-base">✕</button>
          </div>
        </div>
      )}

      <div
        className="flex rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: '96vw',
          maxWidth: 1400,
          height: '92vh',
          background: '#060a12',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* ── LEFT: Category tabs ───────────────────────────────────────────── */}
        <div className="flex flex-col w-[140px] shrink-0 border-r border-white/5 bg-black/30 pt-6 pb-4 gap-1 px-2">
          <div className="text-center mb-4">
            <div className="font-mono font-black text-[0.55rem] tracking-[0.18em] text-slate-500">CATEGORÍA</div>
          </div>
          {CATEGORY_ORDER.map(cat => {
            const meta = CATEGORY_META[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                type="button"
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="w-full py-2.5 px-2 rounded-lg font-mono text-[0.55rem] font-black tracking-[0.06em] cursor-pointer text-left transition-all duration-150"
                style={{
                  background: isActive ? `${meta.color}20` : 'transparent',
                  border: `1px solid ${isActive ? meta.color : 'transparent'}`,
                  color: isActive ? meta.color : '#4b5563',
                }}
              >
                <div className="text-[0.7rem] mb-0.5">{meta.icon}</div>
                <div className="leading-tight">{meta.label}</div>
                <div className="text-[0.36rem] opacity-50 font-normal mt-0.5 leading-tight">{meta.dept}</div>
                <div className="text-[0.38rem] opacity-60 font-normal mt-0.5">{(SCENARIOS_BY_CATEGORY[cat] ?? []).length} casos</div>
              </button>
            );
          })}

          {/* ─── Personalizar Caso — siempre accesible desde sidebar ─── */}
          <div className="mt-auto pt-3 border-t border-white/5 px-0">
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="w-full py-2.5 px-2 rounded-lg font-mono text-[0.52rem] font-black tracking-[0.05em] cursor-pointer text-left transition-all duration-150 group"
              style={{ background: 'transparent', border: '1px solid transparent', color: '#6d28d9' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.35)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
            >
              <div className="text-[0.7rem] mb-0.5">✎</div>
              <div className="text-violet-400">Personalizar</div>
              <div className="text-[0.38rem] text-violet-700 font-normal mt-0.5">narrativa libre</div>
            </button>
          </div>

          <div className="pt-2 border-t border-white/5">
            <div className="text-[0.4rem] text-slate-600 text-center font-mono tracking-widest">IMHOTEP UCI</div>
            <div className="text-[0.35rem] text-slate-700 text-center font-mono mt-0.5">v0.18+</div>
          </div>
        </div>

        {/* ── CENTER: Scenario cards ────────────────────────────────────────── */}
        <div className="flex flex-col w-[340px] shrink-0 border-r border-white/5">
          {/* Header categoría */}
          <div className="px-4 pt-5 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xl">{CATEGORY_META[activeCategory].icon}</span>
              <div>
                <div className="font-mono font-black text-[0.75rem] tracking-[0.1em]" style={{ color: CATEGORY_META[activeCategory].color }}>
                  {CATEGORY_META[activeCategory].dept.toUpperCase()}
                </div>
                <div className="text-slate-600 text-[0.5rem] mt-0.5">{scenariosInCategory.length} escenarios · {CATEGORY_META[activeCategory].label}</div>
              </div>
            </div>
          </div>

          {/* Cards list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {scenariosInCategory.map(scenario => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                selected={activeScenario?.id === scenario.id}
                onClick={() => selectScenario(scenario)}
                difficulty={difficulty}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT: Detail panel ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeScenario ? (
            <>
              {/* Scenario header */}
              <div className="px-6 pt-5 pb-3 border-b border-white/5 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div
                      className="font-mono font-black text-[0.95rem] tracking-[0.06em] mb-1"
                      style={{ color: (CATEGORY_META[normalizeCategory(activeScenario.category as string)] ?? CATEGORY_META['infecto']).color }}
                    >
                      {activeScenario.name}
                    </div>
                    <p className="text-slate-400 text-[0.6rem] leading-relaxed max-w-xl">
                      {activeScenario.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0 max-w-[200px] justify-end">
                    {(activeScenario.tags ?? []).map(tag => {
                      const catColor = (CATEGORY_META[normalizeCategory(activeScenario.category as string)] ?? CATEGORY_META['infecto']).color;
                      return (
                      <span key={tag} className="text-[0.45rem] px-1.5 py-0.5 rounded-full font-mono"
                        style={{ background: `${catColor}15`, color: `${catColor}cc`, border: `1px solid ${catColor}40` }}>
                        {tag}
                      </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-6">

                  {/* Left: vitals + notes */}
                  <div>
                    <div className="text-slate-500 text-[0.5rem] font-mono tracking-[0.12em] mb-2">VITALES INICIALES</div>
                    <VitalsTable vitals={activeScenario.initialVitals} />

                    {activeScenario.recommendedRespSupport && (
                      <div className="mt-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
                        <span className="text-[0.5rem] text-sky-400 font-mono font-black">SOPORTE RESP: </span>
                        <span className="text-[0.5rem] text-sky-300 font-mono">{activeScenario.recommendedRespSupport.replace('_', ' ').toUpperCase()}</span>
                        {activeScenario.isVentilatorConnected && (
                          <span className="ml-2 text-[0.45rem] text-emerald-400 font-mono">[INTUBADO]</span>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <div className="text-slate-500 text-[0.5rem] font-mono tracking-[0.12em] mb-2">NOTAS CLÍNICAS</div>
                      <div className="text-slate-400 text-[0.55rem] leading-relaxed p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {activeScenario.clinicalNotes}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-slate-600 text-[0.45rem] font-mono tracking-[0.1em] mb-1">REFERENCIAS</div>
                      <div className="flex flex-col gap-0.5">
                        {activeScenario.references.map(ref => (
                          <div key={ref} className="text-slate-600 text-[0.45rem] font-mono">• {ref}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: difficulty + pathology preview */}
                  <div>
                    <div className="text-slate-500 text-[0.5rem] font-mono tracking-[0.12em] mb-3">DIFICULTAD</div>

                    {/* Difficulty slider */}
                    <div className="mb-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono font-black text-[1.8rem] leading-none" style={{ color: dColor }}>{difficulty}</span>
                        <div className="text-right">
                          <div className="font-mono font-black text-[0.75rem] tracking-[0.06em]" style={{ color: dColor }}>{diffLabel.label}</div>
                          <div className="text-slate-600 text-[0.45rem] font-mono mt-0.5">
                            Sev. efectiva: {Math.round(scaleSeverity(activeScenario.baseSeverity, difficulty) * 100)}%
                          </div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={1} max={10} step={1}
                        value={difficulty}
                        onChange={e => setDifficulty(Number(e.target.value))}
                        aria-label="Dificultad del escenario"
                        className="w-full cursor-pointer h-3"
                        style={{ accentColor: dColor }}
                      />

                      {/* Tick marks */}
                      <div className="relative mt-1 h-8">
                        {DIFFICULTY_MARKS.map(mark => {
                          const pct = ((mark.value - 1) / 9) * 100;
                          return (
                            <div
                              key={mark.value}
                              className="absolute transform -translate-x-1/2 flex flex-col items-center"
                              style={{ left: `${pct}%` }}
                            >
                              <div className="w-px h-2 mb-0.5" style={{ background: mark.color + '80' }} />
                              <span className="text-[0.4rem] font-mono font-black whitespace-nowrap" style={{ color: mark.color }}>
                                {mark.value}
                              </span>
                              <span className="text-[0.35rem] font-mono text-slate-600 whitespace-nowrap">
                                {mark.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Pathology preview at this difficulty */}
                    <div className="mt-4">
                      <div className="text-slate-500 text-[0.5rem] font-mono tracking-[0.12em] mb-2">PATOLOGÍAS ACTIVAS (d={difficulty})</div>
                      <div className="flex flex-col gap-1.5">
                        {activeScenario.pathologyConfigs.map((cfg, i) => {
                          const effSev = scaleSeverity(cfg.baseSeverity, difficulty);
                          const col = effSev < 0.30 ? '#34d399' : effSev < 0.55 ? '#fbbf24' : effSev < 0.80 ? '#f97316' : '#ef4444';
                          return (
                            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{ background: `${col}0c`, border: `1px solid ${col}30` }}>
                              <div className="flex-1">
                                <span className="font-mono font-black text-[0.55rem] uppercase tracking-[0.06em]" style={{ color: col }}>
                                  {cfg.domain}
                                </span>
                                {cfg.subtype && (
                                  <span className="font-mono text-[0.45rem] text-slate-500 ml-1">({cfg.subtype})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-20 rounded-full bg-black/40 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${effSev * 100}%`, background: `linear-gradient(90deg, ${col}88, ${col})` }}
                                  />
                                </div>
                                <SeverityBadge value={effSev} color={col} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Logistic formula info */}
                    <div className="mt-4 p-2.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="text-slate-600 text-[0.42rem] font-mono leading-relaxed">
                        <div className="text-slate-500 font-black mb-1">Escala logística (BIBLIOGRAPHY.md)</div>
                        sev_eff = base × σ(k×(d−x₀))<br />
                        k = 0.6 · x₀ = 5.5 · base = {activeScenario.baseSeverity.toFixed(2)}<br />
                        σ({difficulty}) = {(1 / (1 + Math.exp(-0.6 * (difficulty - 5.5)))).toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer: INICIAR CASO button */}
              <div className="shrink-0 px-6 py-4 border-t border-white/5" style={{ background: 'rgba(0,0,0,0.3)' }}>
                <button
                  type="button"
                  onClick={canStart ? () => setPickerOpen(true) : undefined}
                  disabled={!canStart}
                  className="w-full py-3.5 rounded-xl font-mono font-black text-[0.8rem] tracking-[0.15em] uppercase cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: canStart ? '#a3e635' : '#374151',
                    color: canStart ? '#000000' : '#6b7280',
                    boxShadow: canStart ? '0 0 20px rgba(163,230,53,0.3)' : 'none',
                  }}
                >
                  INICIAR CASO →
                </button>
                <div className="text-center text-slate-600 text-[0.42rem] font-mono mt-2">
                  {activeScenario.name} · Dificultad {difficulty} · Sev. {Math.round(scaleSeverity(activeScenario.baseSeverity, difficulty) * 100)}%
                </div>
              </div>
            </>
          ) : (
            /* No scenario selected — placeholder */
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="text-6xl opacity-20">⚕</div>
              <div className="text-center">
                <div className="font-mono font-black text-[0.7rem] tracking-[0.12em] text-slate-600">SELECCIONA UN CASO</div>
                <div className="text-slate-700 text-[0.55rem] mt-2">Elige una categoría y un escenario para comenzar</div>
              </div>
              <div className="mt-4 px-6 py-4 rounded-xl max-w-sm" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-slate-600 text-[0.5rem] font-mono leading-loose">
                  <div className="text-slate-500 font-black text-[0.55rem] mb-2">ESCALA LOGÍSTICA DE DIFICULTAD</div>
                  <div>· Dificultad 1 → caso docente (hemodinamia estable)</div>
                  <div>· Dificultad 5 → complejidad media</div>
                  <div>· Dificultad 10 → catastrófico (MOF, respuesta mínima)</div>
                  <div className="mt-2 text-slate-700">{'sev_eff = base × 1/(1 + e^(-0.6(d-5.5)))'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <CustomCaseModal open={customOpen} onClose={() => setCustomOpen(false)} />

    {pickerOpen && activeScenario && (
      <O2StrategyPicker
        suggested={SimulationLauncher.suggest(activeScenario, difficulty)}
        scenarioName={activeScenario.name}
        onConfirm={(config: LauncherConfig) => {
          setPickerOpen(false);
          SimulationLauncher.apply(config);
        }}
        onCancel={() => setPickerOpen(false)}
      />
    )}
    </>
  );
};

export default ScenarioSelectorModal;
