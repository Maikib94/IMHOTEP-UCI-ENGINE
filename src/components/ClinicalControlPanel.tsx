import React, { useState } from 'react';
import { usePharmacologyStore, DrugId, DRUG_CATALOG } from '../store/usePharmacologyStore';
import { usePatientStore, RespiratorySupport } from '../store/usePatientStore';
import { DRUG_MAX_DOSES } from '../core/PharmacologyEngine';
import { usePrognosisStore } from '../store/usePrognosisStore';
import CulturePanel from './CulturePanel';
import QuickARMPanel from './QuickARMPanel';

// ─── Helpers: Escalas Clínicas ─────────────────────────────────────────────

function computeRASS(sedation: number, analgesia: number = 0): number {
  // Efecto sinérgico: opioides potencian la sedación (~30% contribución)
  const combined = sedation + analgesia * 0.3;
  if (combined >= 1.1) return -5;
  if (combined >= 0.9) return -4;
  if (combined >= 0.7) return -3;
  if (combined >= 0.5) return -2;
  if (combined >= 0.3) return -1;
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
  propofol:   { dose: 1.5,  unit: 'mg/kg',  max: 4.0,  step: 0.5,  label: 'Propofol' },
  midazolam:  { dose: 0.05, unit: 'mg/kg',  max: 0.3,  step: 0.01, label: 'Midazolam' },
  ketamine:   { dose: 1.5,  unit: 'mg/kg',  max: 3.0,  step: 0.5,  label: 'Ketamina' },
  thiopental: { dose: 4.0,  unit: 'mg/kg',  max: 8.0,  step: 0.5,  label: 'Tiopental' },
};

const BOLUS_CONFIG_ANALG: Partial<Record<DrugId, BolusConfig>> = {
  // morphine maxRate = 10 mg/h → dosis en mg para que la relación sea dimensionalmente correcta
  morphine:     { dose: 2.0,  unit: 'mg',     max: 10.0, step: 0.5,  label: 'Morfina' },
  fentanyl:     { dose: 1.0,  unit: 'mcg/kg', max: 4.0,  step: 0.5,  label: 'Fentanilo' },
  remifentanil: { dose: 0.5,  unit: 'mcg/kg', max: 2.0,  step: 0.1,  label: 'Remifentan.' },
};

const BOLUS_CONFIG_NMBA: Partial<Record<DrugId, BolusConfig>> = {
  rocuronium:    { dose: 0.15, unit: 'mg/kg', max: 1.2,  step: 0.05, label: 'Rocuronio'    },
  cisatracurium: { dose: 0.03, unit: 'mg/kg', max: 0.40, step: 0.01, label: 'Cisatracurio' },
  atracurium:    { dose: 0.10, unit: 'mg/kg', max: 1.0,  step: 0.05, label: 'Atracurio'    },
  pancuronium:   { dose: 0.02, unit: 'mg/kg', max: 0.15, step: 0.01, label: 'Pancuronio'   },
};

// ─── Panel Antiarrítmicos (Fase 4) ────────────────────────────────────────────
//
//  cpRatio (plasmaConcentrations) ≡ concentración normalizada:
//    amio:  1.0 ≡ 1.5 mg/L (terapéutico)    | tóxico > 1.67 (> 2.5 mg/L)
//    digox: 1.0 ≡ 1.2 ng/mL (terapéutico)   | tóxico > 1.67 (> 2.0 ng/mL)
//  Ref: Goodman & Gilman 13ª; Rathore NEJM 2003 (digoxina); Kowey JACC 2009 (amio)
//
interface AntiarrhythmicPanelProps {
  getDose: (d: DrugId) => number;
  setDose: (d: DrugId) => (val: number) => void;
  queueBolusRatio: (drug: DrugId, ratio: number) => void;
}

function AntiarrhythmicPanel({ getDose, setDose, queueBolusRatio }: AntiarrhythmicPanelProps) {
  const plasmaConc = usePharmacologyStore(s => s.plasmaConcentrations);

  const amioRatio = plasmaConc['amiodarone'] ?? 0;
  const digRatio  = plasmaConc['digoxin']    ?? 0;

  // Concentraciones en unidades clínicas para display
  const amioMgL  = +(amioRatio  * 1.5).toFixed(2);   // mg/L  (terapéutico: 0.5-2.5)
  const digNgmL  = +(digRatio   * 1.2).toFixed(2);   // ng/mL (terapéutico: 0.8-2.0)

  // Color según ventana terapéutica
  const amioColor = amioRatio > 1.67 ? 'text-red-400' : amioRatio > 0.33 ? 'text-emerald-400' : 'text-yellow-400';
  const digColor  = digRatio  > 1.67 ? 'text-red-400' : digRatio  > 0.67 ? 'text-emerald-400' : 'text-yellow-400';
  const amioBg    = amioRatio > 1.67 ? 'bg-red-900/20 border-red-800/50' : 'bg-slate-800/30 border-slate-700/30';
  const digBg     = digRatio  > 1.67 ? 'bg-red-900/20 border-red-800/50' : 'bg-slate-800/30 border-slate-700/30';

  const giveBolus = (drug: DrugId, doseMg: number) => {
    const maxRate    = DRUG_MAX_DOSES[drug];
    const halfLifeH  = DRUG_CATALOG[drug].halfLifeMin / 60;
    const ratio      = doseMg / (maxRate * halfLifeH);
    queueBolusRatio(drug, Math.min(ratio, 3.0));
  };

  return (
    <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
      <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.8)]" />
        <div className="text-[0.55rem] font-black text-violet-400 tracking-widest">ANTIARRÍTMICOS</div>
      </div>

      {/* ── Amiodarona ── */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.5rem] font-bold text-slate-400 uppercase tracking-wider">Amiodarona</span>
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.42rem] font-mono font-bold ${amioBg} ${amioColor}`}>
            {amioMgL} mg/L
            <span className="text-slate-500 font-normal">
              {amioRatio > 1.67 ? '⚠ TÓXICO' : amioRatio > 0.33 ? '✓ TER.' : '↓ SUB'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[0.42rem] text-slate-500 w-10 shrink-0">Infusión</span>
          {/* eslint-disable-next-line react/forbid-dom-props */}
          <input
            type="range"
            title="Amiodarona infusión"
            min={0} max={60} step={1}
            value={Math.round(getDose('amiodarone'))}
            onChange={e => setDose('amiodarone')(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: '#8b5cf6' }}
          />
          <span className="text-[0.42rem] text-violet-300 font-mono font-bold w-14 text-right shrink-0">
            {getDose('amiodarone').toFixed(0)} mg/h
          </span>
        </div>
        <button
          type="button"
          onClick={() => giveBolus('amiodarone', 150)}
          className="w-full py-1 text-[0.48rem] font-black bg-violet-500/10 hover:bg-violet-500/25 border border-violet-600/30 hover:border-violet-500/70 rounded text-violet-400 transition-all uppercase tracking-wider cursor-pointer"
        >
          BOLO 150 mg IV
        </button>
      </div>

      {/* ── Digoxina ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.5rem] font-bold text-slate-400 uppercase tracking-wider">Digoxina</span>
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.42rem] font-mono font-bold ${digBg} ${digColor}`}>
            {digNgmL} ng/mL
            <span className="text-slate-500 font-normal">
              {digRatio > 1.67 ? '⚠ TÓXICO' : digRatio > 0.67 ? '✓ TER.' : '↓ SUB'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[0.42rem] text-slate-500 w-10 shrink-0">Infusión</span>
          {/* eslint-disable-next-line react/forbid-dom-props */}
          <input
            type="range"
            title="Digoxina infusión"
            min={0} max={0.6} step={0.01}
            value={getDose('digoxin')}
            onChange={e => setDose('digoxin')(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: '#8b5cf6' }}
          />
          <span className="text-[0.42rem] text-violet-300 font-mono font-bold w-14 text-right shrink-0">
            {getDose('digoxin').toFixed(2)} mg/h
          </span>
        </div>
        <button
          type="button"
          onClick={() => giveBolus('digoxin', 0.25)}
          className="w-full py-1 text-[0.48rem] font-black bg-violet-500/10 hover:bg-violet-500/25 border border-violet-600/30 hover:border-violet-500/70 rounded text-violet-400 transition-all uppercase tracking-wider cursor-pointer"
        >
          BOLO 0.25 mg IV
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function ClinicalControlPanel() {
  const [activeTab, setActiveTab] = useState('hemo');

  const infusionRates          = usePharmacologyStore(state => state.infusionRates);
  const setInfusionRate        = usePharmacologyStore(state => state.setInfusionRate);
  const systemicEffects        = usePharmacologyStore(state => state.systemicEffects);
  const queueBolusRatio        = usePharmacologyStore(state => state.queueBolusRatio);
  const respiratoryDevice      = usePatientStore(state => state.respiratoryDevice);
  const setRespiratorySupport  = usePatientStore(state => state.setRespiratorySupport);
  const setRespiratoryDevice   = usePatientStore(state => state.setRespiratoryDevice);
  const prognosisActive        = usePrognosisStore(state => state.isActive);
  const sofaScore              = usePrognosisStore(state => state.sofaScore);
  const apacheII               = usePrognosisStore(state => state.apacheII);
  const outcome                = usePrognosisStore(state => state.outcome);
  const activatePrognosis      = usePrognosisStore(state => state.activate);
  const deactivatePrognosis    = usePrognosisStore(state => state.deactivate);

  const currentSupport = respiratoryDevice.support;

  const vitals = usePatientStore(state => state.vitals);

  const getDose = (d: DrugId) => infusionRates[d] || 0;
  const setDose = (d: DrugId) => (val: number) => setInfusionRate(d, val);

  // Estado local de dosis para bolos (sedantes + analgésicos)
  const [bolusDoses, setBolusDoses] = useState<Partial<Record<DrugId, number>>>(
    Object.fromEntries([
      ...(Object.entries(BOLUS_CONFIG) as [DrugId, BolusConfig][]).map(([k, v]) => [k, v.dose]),
      ...(Object.entries(BOLUS_CONFIG_ANALG) as [DrugId, BolusConfig][]).map(([k, v]) => [k, v.dose]),
      ...(Object.entries(BOLUS_CONFIG_NMBA) as [DrugId, BolusConfig][]).map(([k, v]) => [k, v.dose]),
    ])
  );

  // Valores de escalas en tiempo real
  const rass       = computeRASS(systemicEffects.sedation, systemicEffects.analgesia);
  const gcsDecomp  = decomposeGCS(vitals.gcs);
  const cpot       = computeCPOT(systemicEffects.analgesia, systemicEffects.sedation, systemicEffects.nmba);
  const rassPct    = ((rass + 5) / 9) * 100;
  // CPOT aplica solo cuando el paciente no puede autoinformar dolor
  // (paciente sedado/intubado). Sin sedación activa → usar NRS/EVA.
  const cpotActivo = systemicEffects.sedation > 0.05 || systemicEffects.nmba > 0.05;

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
            type="button"
            aria-label={label}
            title={label}
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

  // Ancho aplicado imperativamente vía callback ref — elimina el style prop
  // (webhint no-inline-styles). La transición CSS funciona igualmente.
  const ProgressBar = ({
    value, max, colorClass, height = 'h-2'
  }: { value: number; max: number; colorClass: string; height?: string }) => {
    const fillPct = `${Math.min(100, (value / max) * 100).toFixed(1)}%`;
    return (
      <div className={`relative ${height} bg-slate-800 rounded-full overflow-hidden`}>
        <div
          ref={el => { if (el) el.style.width = fillPct; }}
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${colorClass}`}
        />
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden rounded-xl">

      {/* ── Soporte Respiratorio Escalonado ── */}
      <div className="shrink-0 px-3 pt-2 pb-1 space-y-1.5">
        <div className="text-[0.42rem] font-black text-slate-500 tracking-widest uppercase mb-1">Soporte Respiratorio</div>
        {([
          { key: 'room_air',      label: 'Aire Ambiental', color: 'text-slate-400',   border: 'border-slate-700',  bg: 'bg-slate-800/40' },
          { key: 'nasal_cannula', label: 'Cánula Nasal',   color: 'text-sky-400',     border: 'border-sky-700',    bg: 'bg-sky-900/30'   },
          { key: 'simple_mask',   label: 'Máscara Simple', color: 'text-blue-400',    border: 'border-blue-700',   bg: 'bg-blue-900/30'  },
          { key: 'venturi',       label: 'Máscara Venturi',color: 'text-indigo-400',  border: 'border-indigo-700', bg: 'bg-indigo-900/30'},
          { key: 'hfnc',          label: 'CNAF (Alto Flujo)',color: 'text-violet-400',border: 'border-violet-700', bg: 'bg-violet-900/30'},
          { key: 'arm',           label: 'ARM (Ventilación Mecánica)', color: 'text-emerald-400', border: 'border-emerald-600', bg: 'bg-emerald-900/40' },
        ] as { key: RespiratorySupport; label: string; color: string; border: string; bg: string }[]).map(({ key, label, color, border, bg }) => {
          const isActive = currentSupport === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRespiratorySupport(key)}
              className={`w-full py-1.5 px-2.5 rounded-lg font-bold text-[0.5rem] tracking-wider uppercase transition-all duration-200 border flex items-center gap-2 ${
                isActive ? `${bg} ${border} ${color} shadow-sm` : 'bg-slate-900/30 border-slate-800 text-slate-600 hover:text-slate-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-current animate-pulse' : 'bg-slate-700'}`} />
              {label}
            </button>
          );
        })}

        {/* Controles específicos del dispositivo activo */}
        {currentSupport === 'nasal_cannula' && (
          <div className="bg-sky-900/20 border border-sky-800/50 rounded-lg p-2 mt-1">
            <div className="text-[0.42rem] text-sky-400 font-bold mb-1">FLUJO CÁNULA</div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line react/forbid-dom-props */}
              <input type="range" title="Flujo cánula nasal" min={1} max={6} step={1} value={respiratoryDevice.cannulaFlow}
                onChange={e => setRespiratoryDevice({ cannulaFlow: Number(e.target.value) })}
                className="flex-1" style={{ accentColor: '#38bdf8' }} />
              <span className="text-sky-300 font-mono text-xs font-bold w-8">{respiratoryDevice.cannulaFlow} L</span>
            </div>
            <div className="text-[0.38rem] text-sky-700 mt-0.5">
              FiO₂ ≈ {Math.round((0.21 + 0.04 * respiratoryDevice.cannulaFlow) * 100)}%
            </div>
          </div>
        )}

        {currentSupport === 'venturi' && (
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-lg p-2 mt-1">
            <div className="text-[0.42rem] text-indigo-400 font-bold mb-1.5">FiO₂ VENTURI</div>
            <div className="flex flex-wrap gap-1">
              {[0.24, 0.28, 0.31, 0.35, 0.40, 0.60].map(fio2 => (
                <button key={fio2} type="button"
                  onClick={() => setRespiratoryDevice({ venturiFiO2: fio2 })}
                  className={`px-1.5 py-0.5 text-[0.42rem] font-bold rounded border font-mono cursor-pointer ${
                    respiratoryDevice.venturiFiO2 === fio2
                      ? 'bg-indigo-700 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {Math.round(fio2 * 100)}%
                </button>
              ))}
            </div>
          </div>
        )}

        {currentSupport === 'hfnc' && (
          <div className="bg-violet-900/20 border border-violet-800/50 rounded-lg p-2 mt-1 space-y-1.5">
            <div className="text-[0.42rem] text-violet-400 font-bold">CNAF — PARÁMETROS</div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.38rem] text-violet-400">Flujo</span>
                <span className="text-[0.42rem] text-violet-300 font-mono font-bold">{respiratoryDevice.hfncFlow} L/min</span>
              </div>
              {/* eslint-disable-next-line react/forbid-dom-props */}
              <input type="range" title="Flujo CNAF" min={20} max={60} step={5} value={respiratoryDevice.hfncFlow}
                onChange={e => setRespiratoryDevice({ hfncFlow: Number(e.target.value) })}
                className="w-full" style={{ accentColor: '#a78bfa' }} />
              <div className="text-[0.35rem] text-violet-700">PEEP efectivo ≈ {Math.min(5, Math.round(respiratoryDevice.hfncFlow / 10))} cmH₂O</div>
            </div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.38rem] text-violet-400">FiO₂</span>
                <span className="text-[0.42rem] text-violet-300 font-mono font-bold">{Math.round(respiratoryDevice.hfncFiO2 * 100)}%</span>
              </div>
              {/* eslint-disable-next-line react/forbid-dom-props */}
              <input type="range" title="FiO2 CNAF" min={21} max={100} step={1} value={Math.round(respiratoryDevice.hfncFiO2 * 100)}
                onChange={e => setRespiratoryDevice({ hfncFiO2: Number(e.target.value) / 100 })}
                className="w-full" style={{ accentColor: '#a78bfa' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Panel ARM rápido (Fase 3) ── */}
      <QuickARMPanel />

      {/* Tabs */}
      <div className="flex border-b border-slate-800 shrink-0 bg-[#060a12]/50">
        {([
          { key: 'hemo',    label: 'HEMO' },
          { key: 'neuro',   label: 'NEURO' },
          { key: 'infecto', label: 'INFECTO/LAB' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
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

            {/* ── ANTIARRÍTMICOS (Fase 4) ── */}
            <AntiarrhythmicPanel
              getDose={getDose}
              setDose={setDose}
              queueBolusRatio={queueBolusRatio}
            />
          </div>
        )}

        {/* ══════════ NEURO ══════════ */}
        {activeTab === 'neuro' && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* ── BLOQUE 1: Monitoreo (Escalas) ── */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="text-[0.55rem] font-black text-cyan-400 tracking-widest">MONITOREO — ESCALAS</div>
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
                <ProgressBar value={rassPct} max={100} colorClass={rassColor(rass)} />
                <div className="flex justify-between text-[0.5rem] text-slate-600 mt-0.5 font-mono">
                  <span>-5 (Sin Resp.)</span><span>0 (Alerta)</span><span>+4 (Combat.)</span>
                </div>
                <div className="text-[0.44rem] text-slate-600 mt-0.5 italic">
                  Efecto combinado: sed. {Math.round(Math.min(100, systemicEffects.sedation * 100))}% + analg. {Math.round(Math.min(100, systemicEffects.analgesia * 30))}%
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
                  <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${cpotActivo ? 'text-slate-400' : 'text-slate-600'}`}>
                    CPOT (Dolor)
                  </span>
                  {cpotActivo ? (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black font-mono ${cpot <= 2 ? 'text-emerald-400' : cpot <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {cpot}/8
                      </span>
                      <span className="text-[0.5rem] text-slate-500">
                        {cpot <= 2 ? 'Sin Dolor' : cpot <= 5 ? 'Moderado' : 'Severo'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[0.5rem] text-slate-600 italic">— / 8</span>
                  )}
                </div>
                {cpotActivo ? (
                  <>
                    <ProgressBar
                      value={cpot} max={8}
                      colorClass={cpot <= 2 ? 'bg-emerald-400' : cpot <= 5 ? 'bg-yellow-400' : 'bg-red-500'}
                    />
                    <div className="text-[0.44rem] text-slate-600 mt-0.5 italic">
                      {cpot > 2 && systemicEffects.analgesia < 0.3
                        ? '⚠ Analgesia insuficiente — CPOT elevado'
                        : 'Supresión: analg. 65% · sed. 25% · BNM 10%'}
                    </div>
                  </>
                ) : (
                  <div className="bg-slate-900/60 border border-slate-800 rounded px-2 py-1.5 text-center">
                    <div className="text-[0.44rem] text-slate-600 italic">
                      Escala no aplicable — paciente sin sedación activa
                    </div>
                    <div className="text-[0.42rem] text-slate-700 mt-0.5">
                      Iniciar sedación para evaluar CPOT · Usar NRS/EVA si paciente alerta
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── BLOQUE 2: Analgesia ── */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
                  <div className="text-[0.55rem] font-black text-blue-400 tracking-widest">ANALGESIA</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.45rem] text-slate-500 uppercase">Efecto</span>
                  <span className={`text-[0.6rem] font-black font-mono ${systemicEffects.analgesia >= 0.5 ? 'text-blue-300' : systemicEffects.analgesia >= 0.2 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {Math.round(Math.min(100, systemicEffects.analgesia * 100))}%
                  </span>
                </div>
              </div>

              {/* Barra efecto analgésico */}
              <div className="mb-3">
                <ProgressBar
                  value={Math.min(1, systemicEffects.analgesia)} max={1}
                  colorClass={systemicEffects.analgesia >= 0.5 ? 'bg-blue-500' : systemicEffects.analgesia >= 0.2 ? 'bg-yellow-400' : 'bg-red-500'}
                  height="h-1.5"
                />
                <div className="flex justify-between text-[0.45rem] text-slate-600 mt-0.5 font-mono">
                  <span>0%</span>
                  <span className={systemicEffects.analgesia < 0.3 && cpot > 2 ? 'text-red-500' : 'text-slate-600'}>
                    {systemicEffects.analgesia < 0.2 ? 'Sin Analgesia' : systemicEffects.analgesia < 0.5 ? 'Analgesia Parcial' : 'Analgesia Óptima'}
                  </span>
                  <span>100%</span>
                </div>
              </div>

              {/* Bolos opioides */}
              <div className="mb-3">
                <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                  <span className="w-3 h-px bg-blue-600/50 inline-block" />
                  BOLOS IV
                  <span className="w-3 h-px bg-blue-600/50 inline-block" />
                </div>
                {(Object.entries(BOLUS_CONFIG_ANALG) as [DrugId, BolusConfig][]).map(([drug, cfg]) => {
                  const currentDose = bolusDoses[drug] ?? cfg.dose;
                  return (
                    <div key={drug} className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[0.55rem] font-bold text-blue-300 w-14 shrink-0">{cfg.label}</span>
                      <input
                        type="number"
                        title={`Dosis bolo ${cfg.label}`}
                        placeholder={String(cfg.dose)}
                        value={currentDose}
                        step={cfg.step}
                        min={0}
                        max={cfg.max}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setBolusDoses(prev => ({ ...prev, [drug]: isNaN(v) ? 0 : v }));
                        }}
                        className="w-12 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1 py-0.5 focus:outline-none font-mono text-blue-300 focus:border-blue-500"
                      />
                      <span className="text-[0.45rem] text-slate-500 w-9 shrink-0">{cfg.unit}</span>
                      <button
                        type="button"
                        onClick={() => administerBolus(drug)}
                        className="flex-1 py-0.5 px-1.5 text-[0.48rem] font-bold bg-blue-500/10 hover:bg-blue-500/25 border border-blue-600/30 hover:border-blue-500/70 rounded text-blue-400 transition-all uppercase tracking-wider"
                      >
                        BOLO ↑
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Infusiones opioides */}
              <div>
                <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                  <span className="w-3 h-px bg-blue-600/50 inline-block" />
                  INFUSIONES
                  <span className="w-3 h-px bg-blue-600/50 inline-block" />
                </div>
                {renderControl('Morfina',     getDose('morphine'),     setDose('morphine'),     'mg/h',      1.0,  'blue')}
                {renderControl('Fentanilo',   getDose('fentanyl'),     setDose('fentanyl'),     'mcg/kg/h',  0.5,  'blue')}
                {renderControl('Remifentan.', getDose('remifentanil'), setDose('remifentanil'), 'mcg/kg/m',  0.05, 'blue')}
              </div>
            </div>

            {/* ── BLOQUE 3: Sedación ── */}
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

              {/* Bolos IV sedantes */}
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
                        title={`Dosis bolo ${cfg.label}`}
                        placeholder={String(cfg.dose)}
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
                        type="button"
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

            {/* ── BLOQUE 4: Parálisis (BNM) ── */}
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

              {/* Bolos IV BNM */}
              <div className="mb-3">
                <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                  <span className="w-3 h-px bg-emerald-600/50 inline-block" />
                  BOLOS IV
                  <span className="w-3 h-px bg-emerald-600/50 inline-block" />
                </div>
                {(Object.entries(BOLUS_CONFIG_NMBA) as [DrugId, BolusConfig][]).map(([drug, cfg]) => {
                  const currentDose = bolusDoses[drug] ?? cfg.dose;
                  return (
                    <div key={drug} className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[0.55rem] font-bold text-emerald-300 w-14 shrink-0">{cfg.label}</span>
                      <input
                        type="number"
                        title={`Dosis bolo ${cfg.label}`}
                        placeholder={String(cfg.dose)}
                        value={currentDose}
                        step={cfg.step}
                        min={0}
                        max={cfg.max}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setBolusDoses(prev => ({ ...prev, [drug]: isNaN(v) ? 0 : v }));
                        }}
                        className="w-12 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1 py-0.5 focus:outline-none font-mono text-emerald-300 focus:border-emerald-500"
                      />
                      <span className="text-[0.45rem] text-slate-500 w-9 shrink-0">{cfg.unit}</span>
                      <button
                        type="button"
                        onClick={() => administerBolus(drug)}
                        className="flex-1 py-0.5 px-1.5 text-[0.48rem] font-bold bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-600/30 hover:border-emerald-500/70 rounded text-emerald-400 transition-all uppercase tracking-wider"
                      >
                        BOLO ↑
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Infusiones BNM */}
              <div className="text-[0.5rem] font-bold text-slate-500 tracking-wider mb-2 uppercase flex items-center gap-1.5">
                <span className="w-3 h-px bg-emerald-600/50 inline-block" />
                INFUSIONES
                <span className="w-3 h-px bg-emerald-600/50 inline-block" />
              </div>
              {renderControl('Rocuronio',    getDose('rocuronium'),    setDose('rocuronium'),    'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Atracurio',    getDose('atracurium'),    setDose('atracurium'),    'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Cisatracurio', getDose('cisatracurium'), setDose('cisatracurium'), 'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Pancuronio',   getDose('pancuronium'),   setDose('pancuronium'),   'mg/kg/h', 0.1, 'emerald')}
            </div>

          </div>
        )}

        {/* ══════════ INFECT/LAB ══════════ */}
        {activeTab === 'infecto' && (
          <div className="space-y-3 animate-in fade-in duration-300">

            {/* Motor ISDA */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${prognosisActive ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-slate-600'}`} />
                  <div className={`text-[0.55rem] font-black tracking-widest ${prognosisActive ? 'text-red-400' : 'text-slate-500'}`}>COMPLICACIONES ISDA</div>
                </div>
                <button
                  type="button"
                  onClick={() => prognosisActive ? deactivatePrognosis() : activatePrognosis()}
                  className={`px-2 py-1 text-[0.45rem] font-black rounded border uppercase tracking-widest cursor-pointer transition-all ${
                    prognosisActive
                      ? 'bg-red-900/60 border-red-600 text-red-400 hover:bg-red-900'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {prognosisActive ? 'DESACTIVAR' : 'ACTIVAR'}
                </button>
              </div>

              {prognosisActive && (
                <div className="space-y-2">
                  {/* SOFA */}
                  <div className="bg-[#0f172a] rounded-lg p-2 border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[0.5rem] font-black text-slate-400 tracking-wider">SOFA 2.0</span>
                      <span className={`text-sm font-black font-mono ${sofaScore >= 11 ? 'text-red-400' : sofaScore >= 7 ? 'text-orange-400' : sofaScore >= 4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {sofaScore}/24
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      {/* eslint-disable-next-line react/forbid-dom-props */}
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${sofaScore >= 11 ? 'bg-red-500' : sofaScore >= 7 ? 'bg-orange-500' : sofaScore >= 4 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                        style={{ width: `${(sofaScore / 24) * 100}%` }}
                      />
                    </div>
                    <div className="text-[0.38rem] text-slate-600 mt-0.5">
                      {sofaScore < 7 ? 'Bajo riesgo' : sofaScore < 11 ? 'Riesgo moderado (~15-30% mort.)' : 'Alto riesgo (~50-70% mort.)'}
                    </div>
                  </div>

                  {/* APACHE II */}
                  <div className="bg-[#0f172a] rounded-lg p-2 border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[0.5rem] font-black text-slate-400 tracking-wider">APACHE II</span>
                      <span className={`text-sm font-black font-mono ${apacheII >= 25 ? 'text-red-400' : apacheII >= 15 ? 'text-orange-400' : 'text-emerald-400'}`}>
                        {apacheII}/71
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      {/* eslint-disable-next-line react/forbid-dom-props */}
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${apacheII >= 25 ? 'bg-red-500' : apacheII >= 15 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                        style={{ width: `${(apacheII / 71) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Desenlace */}
                  {outcome !== 'ongoing' && (
                    <div className={`rounded-lg p-2 border text-center ${
                      outcome === 'death' ? 'bg-red-950/40 border-red-800 text-red-400' :
                      outcome === 'discharge' ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400' :
                      'bg-amber-950/40 border-amber-700 text-amber-400'
                    }`}>
                      <div className="text-[0.55rem] font-black uppercase tracking-widest">
                        {outcome === 'death' ? '⚠ ÓBITO' :
                         outcome === 'discharge' ? '✓ ALTA UCI' :
                         outcome === 'late_discharge' ? 'ALTA TARDÍA' :
                         'TRAQUEOSTOMÍA + ALTA TARDÍA'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel de cultivos */}
            <div className="h-[300px] -mx-3 -mb-3 min-h-0">
              <CulturePanel />
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
