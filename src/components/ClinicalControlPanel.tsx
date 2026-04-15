import React, { useState } from 'react';
import { usePharmacologyStore, DrugId, DRUG_CATALOG } from '../store/usePharmacologyStore';
import { usePatientStore } from '../store/usePatientStore';
import { DRUG_MAX_DOSES } from '../core/PharmacologyEngine';

// ─── Helpers: Escalas Clínicas ─────────────────────────────────────────────

function computeRASS(sedation: number): number {
  if (sedation >= 1.1) return -5;
  if (sedation >= 0.9) return -4;
  if (sedation >= 0.7) return -3;
  if (sedation >= 0.5) return -2;
  if (sedation >= 0.3) return -1;
  return 0;
}

function rassLabel(rass: number): string {
  const map: Record<string, string> = {
    '5': 'Combativo', '4': 'Muy Agitado', '3': 'Agitado',
    '2': 'Inquieto', '1': 'Inquieto', '0': 'Alerta/Calmado',
    '-1': 'Somnoliento', '-2': 'Sed. Leve', '-3': 'Sed. Mod.',
    '-4': 'Sed. Profunda', '-5': 'Sin Respuesta',
  };
  return map[String(rass)] ?? '—';
}

function rassColor(rass: number): string {
  if (rass <= -3) return 'bg-blue-600';
  if (rass <= -1) return 'bg-cyan-500';
  if (rass === 0) return 'bg-emerald-400';
  if (rass <= 2)  return 'bg-yellow-400';
  return 'bg-red-500';
}

function rassTextColor(rass: number): string {
  if (rass <= -3) return 'text-blue-400';
  if (rass <= -1) return 'text-cyan-400';
  if (rass === 0) return 'text-emerald-400';
  if (rass <= 2)  return 'text-yellow-400';
  return 'text-red-400';
}

function decomposeGCS(gcs: number): { E: number; V: number; M: number } {
  if (gcs >= 15) return { E: 4, V: 5, M: 6 };
  if (gcs === 14) return { E: 4, V: 4, M: 6 };
  if (gcs === 13) return { E: 3, V: 4, M: 6 };
  if (gcs === 12) return { E: 3, V: 4, M: 5 };
  if (gcs === 11) return { E: 3, V: 3, M: 5 };
  if (gcs === 10) return { E: 3, V: 3, M: 4 };
  if (gcs === 9)  return { E: 2, V: 3, M: 4 };
  if (gcs === 8)  return { E: 2, V: 2, M: 4 };
  if (gcs === 7)  return { E: 2, V: 2, M: 3 };
  if (gcs === 6)  return { E: 1, V: 2, M: 3 };
  if (gcs === 5)  return { E: 1, V: 1, M: 3 };
  if (gcs === 4)  return { E: 1, V: 1, M: 2 };
  return { E: 1, V: 1, M: 1 };
}

function computeCPOT(analgesia: number, sedation: number, nmba: number): number {
  const suppression = Math.min(1, analgesia * 0.65 + sedation * 0.25 + nmba * 0.1);
  return Math.max(0, Math.round(8 * (1 - suppression)));
}

// ─── Configuración de bolos ────────────────────────────────────────────────

interface BolusConfig {
  dose: number;
  unit: string;
  max: number;
  step: number;
  label: string;
}

const BOLUS_CONFIG: Partial<Record<DrugId, BolusConfig>> = {
  propofol:   { dose: 1.5,  unit: 'mg/kg',  max: 4.0, step: 0.5,  label: 'Propofol' },
  midazolam:  { dose: 0.05, unit: 'mg/kg',  max: 0.3, step: 0.01, label: 'Midazolam' },
  ketamine:   { dose: 1.5,  unit: 'mg/kg',  max: 3.0, step: 0.5,  label: 'Ketamina' },
  thiopental: { dose: 4.0,  unit: 'mg/kg',  max: 8.0, step: 0.5,  label: 'Tiopental' },
};

// ─── Componente principal ──────────────────────────────────────────────────

export default function ClinicalControlPanel() {
  const [activeTab, setActiveTab] = useState('hemo');

  const infusionRates    = usePharmacologyStore(state => state.infusionRates);
  const setInfusionRate  = usePharmacologyStore(state => state.setInfusionRate);
  const systemicEffects  = usePharmacologyStore(state => state.systemicEffects);
  const queueBolusRatio  = usePharmacologyStore(state => state.queueBolusRatio);

  const vitals = usePatientStore(state => state.vitals);

  const getDose = (d: DrugId) => infusionRates[d] || 0;
  const setDose = (d: DrugId) => (val: number) => setInfusionRate(d, val);

  // Estado local de dosis para bolos
  const [bolusDoses, setBolusDoses] = useState<Partial<Record<DrugId, number>>>(
    Object.fromEntries(
      (Object.entries(BOLUS_CONFIG) as [DrugId, BolusConfig][]).map(([k, v]) => [k, v.dose])
    )
  );

  // Valores de escalas en tiempo real
  const rass       = computeRASS(systemicEffects.sedation);
  const gcsDecomp  = decomposeGCS(vitals.gcs);
  const cpot       = computeCPOT(systemicEffects.analgesia, systemicEffects.sedation, systemicEffects.nmba);
  const rassPct    = ((rass + 5) / 9) * 100;

  const administerBolus = (drug: DrugId) => {
    const dose = bolusDoses[drug] ?? 0;
    if (dose <= 0) return;
    const maxRate   = DRUG_MAX_DOSES[drug];
    const halfLifeH = DRUG_CATALOG[drug].halfLifeMin / 60;
    const ratio     = dose / (maxRate * halfLifeH);
    queueBolusRatio(drug, Math.min(ratio, 3.0));
  };

  // ─── Control de infusión reutilizable ────────────────────────────────────

  const renderControl = (
    label: string,
    value: number,
    setter: (val: number) => void,
    unit: string,
    step: number = 0.05,
    colorTheme: 'cyan' | 'red' | 'orange' | 'yellow' | 'blue' | 'emerald' = 'cyan'
  ) => {
    const isActive = value > 0;

    const colors = {
      cyan:    { bg: 'bg-cyan-500',    shadow: 'shadow-[0_0_10px_rgba(6,182,212,0.6)]',    text: 'text-cyan-400',    input: 'text-cyan-300 focus:border-cyan-500' },
      red:     { bg: 'bg-red-600',     shadow: 'shadow-[0_0_10px_rgba(220,38,38,0.6)]',    text: 'text-red-600',     input: 'text-red-400 focus:border-red-600' },
      orange:  { bg: 'bg-orange-500',  shadow: 'shadow-[0_0_10px_rgba(249,115,22,0.6)]',   text: 'text-orange-500',  input: 'text-orange-400 focus:border-orange-500' },
      yellow:  { bg: 'bg-yellow-400',  shadow: 'shadow-[0_0_10px_rgba(250,204,21,0.6)]',   text: 'text-yellow-400',  input: 'text-yellow-300 focus:border-yellow-400' },
      blue:    { bg: 'bg-blue-500',    shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.6)]',   text: 'text-blue-500',    input: 'text-blue-400 focus:border-blue-500' },
      emerald: { bg: 'bg-emerald-400', shadow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]',   text: 'text-emerald-400', input: 'text-emerald-300 focus:border-emerald-400' },
    };
    const t = colors[colorTheme];

    return (
      <div className="flex items-center justify-between bg-[#0f172a] p-2 rounded-lg border border-white/5 mb-2 hover:border-white/10 transition-colors">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setter(isActive ? 0 : step)}
            className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isActive ? `${t.bg} ${t.shadow}` : 'bg-slate-700'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${isActive ? t.text : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value === 0 ? '' : Number(value).toFixed(2)}
            placeholder="0.00"
            step={step}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setter(isNaN(val) ? 0 : val);
            }}
            className={`w-16 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none font-mono shadow-inner placeholder-slate-600 ${t.input}`}
          />
          <span className="text-[0.5rem] text-slate-500 w-12 shrink-0">{unit}</span>
        </div>
      </div>
    );
  };

  // ─── Barra de progreso reutilizable ──────────────────────────────────────

  const ProgressBar = ({
    value, max, colorClass, height = 'h-2'
  }: { value: number; max: number; colorClass: string; height?: string }) => (
    <div className={`relative ${height} bg-slate-800 rounded-full overflow-hidden`}>
      <div
        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden rounded-xl">

      {/* Tabs */}
      <div className="flex border-b border-slate-800 shrink-0 bg-[#060a12]/50">
        {([
          { key: 'hemo',     label: 'HEMO' },
          { key: 'analg',    label: 'ANALG' },
          { key: 'neuro',    label: 'NEURO' },
          { key: 'infecto',  label: 'INFECT/LAB' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-3 text-[8px] font-bold tracking-widest transition-all duration-300 relative ${activeTab === key ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {label}
            {activeTab === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_-2px_8px_rgba(34,211,238,0.8)]" />
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">

        {/* ══════════ HEMO ══════════ */}
        {activeTab === 'hemo' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.8)]" />
                <div className="text-[0.55rem] font-black text-red-600 tracking-widest">VASOPRESORES</div>
              </div>
              {renderControl('Noradrenalina', getDose('noradrenaline'), setDose('noradrenaline'), 'mcg/kg/m', 0.05, 'red')}
              {renderControl('Adrenalina',    getDose('adrenaline'),    setDose('adrenaline'),    'mcg/kg/m', 0.05, 'red')}
              {renderControl('Vasopresina',   getDose('vasopressin'),   setDose('vasopressin'),   'U/h',      0.01, 'red')}
              {renderControl('Azul de M.',    getDose('methylene_blue'),setDose('methylene_blue'),'mg/kg/h',  1.0,  'red')}
            </div>

            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]" />
                <div className="text-[0.55rem] font-black text-orange-500 tracking-widest">INOTRÓPICOS</div>
              </div>
              {renderControl('Dobutamina',  getDose('dobutamine'),  setDose('dobutamine'),  'mcg/kg/m', 1.0,  'orange')}
              {renderControl('Dopamina',    getDose('dopamine'),    setDose('dopamine'),    'mcg/kg/m', 1.0,  'orange')}
              {renderControl('Milrinona',   getDose('milrinone'),   setDose('milrinone'),   'mcg/kg/m', 0.1,  'orange')}
              {renderControl('Levosimendan',getDose('levosimendan'),setDose('levosimendan'),'mcg/kg/m', 0.05, 'orange')}
            </div>
          </div>
        )}

        {/* ══════════ ANALG ══════════ */}
        {activeTab === 'analg' && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* Evaluación del dolor */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
                <div className="text-[0.55rem] font-black text-blue-400 tracking-widest">EVALUACIÓN DOLOR — CPOT</div>
              </div>

              <div className="flex justify-between items-center mb-1">
                <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">CPOT</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black font-mono ${cpot <= 2 ? 'text-emerald-400' : cpot <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {cpot}/8
                  </span>
                  <span className="text-[0.5rem] text-slate-500">
                    {cpot <= 2 ? 'Sin Dolor' : cpot <= 5 ? 'Dolor Mod.' : 'Dolor Severo'}
                  </span>
                </div>
              </div>
              <ProgressBar
                value={cpot} max={8}
                colorClass={cpot <= 2 ? 'bg-emerald-400' : cpot <= 5 ? 'bg-yellow-400' : 'bg-red-500'}
              />
              <div className="flex justify-between text-[0.5rem] text-slate-600 mt-0.5 font-mono">
                <span>0 (Sin Dolor)</span><span>8 (Máximo)</span>
              </div>

              <div className="mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[0.5rem] text-slate-500 uppercase tracking-wider">Efecto Analgésico</span>
                  <span className="text-[0.6rem] font-black font-mono text-blue-400">
                    {Math.round(Math.min(100, systemicEffects.analgesia * 100))}%
                  </span>
                </div>
                <ProgressBar
                  value={Math.min(1, systemicEffects.analgesia)} max={1}
                  colorClass="bg-blue-500" height="h-1.5"
                />
              </div>
            </div>

            {/* Analgésicos */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
                <div className="text-[0.55rem] font-black text-blue-500 tracking-widest">ANALGÉSICOS</div>
              </div>
              {renderControl('Morfina',     getDose('morphine'),     setDose('morphine'),     'mg/h',      1.0,  'blue')}
              {renderControl('Fentanilo',   getDose('fentanyl'),     setDose('fentanyl'),     'mcg/kg/h',  0.5,  'blue')}
              {renderControl('Remifentan.', getDose('remifentanil'), setDose('remifentanil'), 'mcg/kg/m',  0.05, 'blue')}
            </div>
          </div>
        )}

        {/* ══════════ NEURO ══════════ */}
        {activeTab === 'neuro' && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* ── Escalas Clínicas ── */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="text-[0.55rem] font-black text-cyan-400 tracking-widest">ESCALAS CLÍNICAS</div>
              </div>

              {/* RASS */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">RASS</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black font-mono ${rassTextColor(rass)}`}>
                      {rass > 0 ? `+${rass}` : rass}
                    </span>
                    <span className="text-[0.5rem] text-slate-500">{rassLabel(rass)}</span>
                  </div>
                </div>
                <ProgressBar
                  value={rassPct} max={100}
                  colorClass={rassColor(rass)}
                />
                <div className="flex justify-between text-[0.5rem] text-slate-600 mt-0.5 font-mono">
                  <span>-5 (Sin Resp.)</span><span>0 (Alerta)</span><span>+4 (Combat.)</span>
                </div>
              </div>

              {/* GCS Desglosado */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">GCS</span>
                  <span className={`text-xs font-black font-mono ${vitals.gcs <= 8 ? 'text-red-400' : vitals.gcs <= 12 ? 'text-yellow-400' : 'text-cyan-400'}`}>
                    {vitals.gcs}/15
                    {vitals.gcs <= 8 && <span className="text-[0.45rem] text-red-500 ml-1 font-normal">IOT</span>}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'OCULAR (E)', val: gcsDecomp.E, max: 4, border: 'border-blue-900/60',  text: 'text-blue-400'  },
                    { label: 'VERBAL (V)', val: gcsDecomp.V, max: 5, border: 'border-cyan-900/60',  text: 'text-cyan-400'  },
                    { label: 'MOTOR (M)',  val: gcsDecomp.M, max: 6, border: 'border-teal-900/60',  text: 'text-teal-400'  },
                  ].map(({ label, val, max, border, text }) => (
                    <div key={label} className={`bg-[#0f172a] border ${border} rounded-lg p-1.5 text-center`}>
                      <div className="text-[0.4rem] font-bold text-slate-500 mb-0.5">{label}</div>
                      <div className={`text-sm font-black font-mono ${text}`}>
                        {val}<span className="text-[0.5rem] text-slate-600">/{max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CPOT */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">CPOT (Dolor)</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black font-mono ${cpot <= 2 ? 'text-emerald-400' : cpot <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {cpot}/8
                    </span>
                    <span className="text-[0.5rem] text-slate-500">
                      {cpot <= 2 ? 'Sin Dolor' : cpot <= 5 ? 'Moderado' : 'Severo'}
                    </span>
                  </div>
                </div>
                <ProgressBar
                  value={cpot} max={8}
                  colorClass={cpot <= 2 ? 'bg-emerald-400' : cpot <= 5 ? 'bg-yellow-400' : 'bg-red-500'}
                />
              </div>
            </div>

            {/* ── Sedación ── */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                  <div className="text-[0.55rem] font-black text-yellow-400 tracking-widest">SEDACIÓN</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.45rem] text-slate-500 uppercase">Efecto</span>
                  <span className={`text-[0.6rem] font-black font-mono ${systemicEffects.sedation >= 0.7 ? 'text-yellow-300' : 'text-slate-400'}`}>
                    {Math.round(Math.min(100, systemicEffects.sedation * 100))}%
                  </span>
                </div>
              </div>

              {/* Bolos IV */}
              <div className="mb-3">
                <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                  <span className="w-3 h-px bg-yellow-600/50 inline-block" />
                  BOLOS IV
                  <span className="w-3 h-px bg-yellow-600/50 inline-block" />
                </div>
                {(Object.entries(BOLUS_CONFIG) as [DrugId, BolusConfig][]).map(([drug, cfg]) => {
                  const currentDose = bolusDoses[drug] ?? cfg.dose;
                  return (
                    <div key={drug} className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[0.55rem] font-bold text-yellow-300 w-14 shrink-0">{cfg.label}</span>
                      <input
                        type="number"
                        value={currentDose}
                        step={cfg.step}
                        min={0}
                        max={cfg.max}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setBolusDoses(prev => ({ ...prev, [drug]: isNaN(v) ? 0 : v }));
                        }}
                        className="w-12 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1 py-0.5 focus:outline-none font-mono text-yellow-300 focus:border-yellow-500"
                      />
                      <span className="text-[0.45rem] text-slate-500 w-9 shrink-0">{cfg.unit}</span>
                      <button
                        onClick={() => administerBolus(drug)}
                        className="flex-1 py-0.5 px-1.5 text-[0.48rem] font-bold bg-yellow-500/10 hover:bg-yellow-500/25 border border-yellow-600/30 hover:border-yellow-500/70 rounded text-yellow-400 transition-all uppercase tracking-wider"
                      >
                        BOLO ↑
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Infusiones sedantes */}
              <div>
                <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                  <span className="w-3 h-px bg-yellow-600/50 inline-block" />
                  INFUSIONES
                  <span className="w-3 h-px bg-yellow-600/50 inline-block" />
                </div>
                {renderControl('Propofol',    getDose('propofol'),        setDose('propofol'),        'mg/kg/h',  0.5,  'yellow')}
                {renderControl('Midazolam',   getDose('midazolam'),       setDose('midazolam'),       'mg/kg/h',  0.05, 'yellow')}
                {renderControl('Dexmedeto.',  getDose('dexmedetomidine'), setDose('dexmedetomidine'), 'mcg/kg/h', 0.1,  'yellow')}
                {renderControl('Ketamina',    getDose('ketamine'),        setDose('ketamine'),        'mg/kg/h',  0.5,  'yellow')}
                {renderControl('Tiopental',   getDose('thiopental'),      setDose('thiopental'),      'mg/kg/h',  1.0,  'yellow')}
              </div>
            </div>

            {/* ── Parálisis (BNM) ── */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                  <div className="text-[0.55rem] font-black text-emerald-400 tracking-widest">PARÁLISIS (BNM)</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.45rem] text-slate-500 uppercase">Bloqueo NM</span>
                  <span className={`text-[0.6rem] font-black font-mono ${systemicEffects.nmba > 0.8 ? 'text-red-400' : systemicEffects.nmba > 0.4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {Math.round(systemicEffects.nmba * 100)}%
                  </span>
                </div>
              </div>

              {/* Barra bloqueo NM */}
              <div className="mb-3">
                <ProgressBar
                  value={systemicEffects.nmba} max={1}
                  colorClass={systemicEffects.nmba > 0.8 ? 'bg-red-500' : systemicEffects.nmba > 0.4 ? 'bg-yellow-400' : 'bg-emerald-400'}
                  height="h-1.5"
                />
                <div className="flex justify-between text-[0.45rem] text-slate-600 mt-0.5 font-mono">
                  <span>0%</span>
                  <span className={systemicEffects.nmba > 0.8 ? 'text-red-600' : 'text-slate-600'}>
                    {systemicEffects.nmba > 0.8 ? 'Parálisis Total' : systemicEffects.nmba > 0.4 ? 'Bloqueo Parcial' : 'Sin Bloqueo'}
                  </span>
                  <span>100%</span>
                </div>
              </div>

              {renderControl('Atracurio',    getDose('atracurium'),    setDose('atracurium'),    'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Cisatracurio', getDose('cisatracurium'), setDose('cisatracurium'), 'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Rocuronio',    getDose('rocuronium'),    setDose('rocuronium'),    'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Pancuronio',   getDose('pancuronium'),   setDose('pancuronium'),   'mg/kg/h', 0.1, 'emerald')}
            </div>

          </div>
        )}

        {/* ══════════ INFECT/LAB ══════════ */}
        {activeTab === 'infecto' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">BIOMARCADORES DE SEPSIS</div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Lactato',       val: '2.4', unit: 'mmol/L', color: 'bg-red-500'    },
                  { label: 'PCR',           val: '145', unit: 'mg/L',   color: 'bg-orange-500' },
                  { label: 'Procalcitonina',val: '12.5',unit: 'ng/mL',  color: 'bg-yellow-500' },
                ].map(({ label, val, unit, color }) => (
                  <div key={label} className="bg-[#0f172a] border border-white/5 rounded-lg p-2.5 flex justify-between items-center relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${color}`} />
                    <span className="text-[0.65rem] font-bold text-slate-400 ml-2">{label}</span>
                    <div className="flex items-end gap-1">
                      <span className="text-xs font-black text-white font-mono leading-none">{val}</span>
                      <span className="text-[10px] text-slate-500 leading-none">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]" />
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">CULTIVOS</div>
              </div>
              <div className="bg-[#0f172a] border border-emerald-900/30 rounded-lg p-3 relative hover:border-emerald-500/30 transition-colors">
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="text-[0.55rem] font-bold text-emerald-400 mb-1 tracking-wider uppercase">Hemocultivo x2 (24h)</div>
                <div className="text-[10px] text-slate-300 font-medium">Cocáceas Gram Positivas en racimos.</div>
                <div className="text-[0.65rem] text-slate-500 mt-1">Pendiente tipificación y antibiograma.</div>
              </div>
            </div>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}} />
    </div>
  );
}
