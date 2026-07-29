// src/components/CustomCaseModal.tsx
//
// Modal de personalización de caso clínico por narrativa libre.
// Usa ProceduralPatientFactory para parsear la descripción → estado del simulador.

import React, { useState } from 'react';
import {
  ProceduralPatientFactory,
  type CaseDescription,
  type ParsedCase,
} from '../core/ProceduralPatientFactory';

// ─── Etiquetas y placeholders de sección ─────────────────────────────────────

const SECTION_LABELS: Record<keyof CaseDescription, string> = {
  antecedentes:  'Antecedentes personales',
  motivoIngreso: 'Motivo de ingreso',
  neuro:         'Estado neurológico',
  hemo:          'Hemodinamia',
  resp:          'Soporte respiratorio',
  renal:         'Función renal',
  gastro:        'Tracto gastrointestinal',
  infecto:       'Infectología',
  quirurgico:    'Antecedentes quirúrgicos',
  estudios:      'Estudios previos / Labs',
};

const SECTION_PLACEHOLDERS: Record<keyof CaseDescription, string> = {
  antecedentes:  'Ej: HTA, DM2, EPOC GOLD II, ex-tabaquista. 72 años, masculino.',
  motivoIngreso: 'Ej: Shock séptico foco pulmonar. Hipotensión + fiebre + taquicardia.',
  neuro:         'Ej: GCS 10, orientado parcialmente. Sin foco motor. Sin PIC.',
  hemo:          'Ej: Noradrenalina 0.3 mcg/kg/min. CVP 8 mmHg. PICCO activo.',
  resp:          'Ej: Intubado. VCV PEEP 8, FiO2 0.60. PaO2/FiO2 = 180.',
  renal:         'Ej: Oliguria 0.3 mL/kg/h. Creatinina 2.1 mg/dL (basal 0.9).',
  gastro:        'Ej: SNG abierta. Íleo prolongado. Sin signos peritoneales.',
  infecto:       'Ej: Neumonía bilateral. ATB: meropenem + vancomicina día 2.',
  quirurgico:    'Ej: PO 1 de laparotomía exploradora. Dren en sitio.',
  estudios:      'Ej: Hb 9.2, PCT 28, lactato 3.8, pH 7.31. TAC: consolidaciones bilaterales.',
};

// ─── Componente preview del parseo ───────────────────────────────────────────

function ParsedCasePreview({ parsed }: { parsed: ParsedCase }) {
  const stabilityColor: Record<string, string> = {
    stable:     'text-emerald-400',
    borderline: 'text-amber-400',
    unstable:   'text-orange-500',
    critical:   'text-red-400',
  };

  return (
    <div className="mt-4 border border-violet-500/30 rounded-xl p-4 bg-black/40">
      <div className="text-violet-300 text-[0.65rem] font-black tracking-widest uppercase mb-3">
        Vista previa del parseo
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-black/30 rounded-lg p-2 text-center">
          <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider">Dificultad</div>
          <div className="text-2xl font-black text-violet-300 [font-family:'JetBrains_Mono',monospace]">
            {parsed.difficulty}/10
          </div>
        </div>
        <div className="bg-black/30 rounded-lg p-2 text-center">
          <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider">Estabilidad</div>
          <div className={`text-sm font-black uppercase ${stabilityColor[parsed.initialStability]}`}>
            {parsed.initialStability}
          </div>
        </div>
        <div className="bg-black/30 rounded-lg p-2 text-center">
          <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider">Paciente</div>
          <div className="text-[0.6rem] font-bold text-slate-300 truncate">
            {parsed.patientProfile.name}
          </div>
          <div className="text-[0.5rem] text-slate-500">
            {parsed.patientProfile.age}a · {parsed.patientProfile.sex === 'M' ? 'M' : 'F'}
          </div>
        </div>
      </div>

      {parsed.inferredComorbidities.length > 0 && (
        <div className="mb-2">
          <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider mb-1">Comorbilidades</div>
          <div className="flex flex-wrap gap-1">
            {parsed.inferredComorbidities.map(c => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[0.45rem] font-mono bg-violet-900/30 text-violet-300 border border-violet-700/40">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.inferredPathologies.length > 0 && (
        <div className="mb-2">
          <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider mb-1">Patologías inferidas</div>
          <div className="space-y-0.5">
            {parsed.inferredPathologies.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.5rem]">
                <span className="text-orange-400 font-mono w-24 shrink-0">{p.domain}</span>
                <span className="text-slate-400">{p.subtype}</span>
                <div className="flex-1 h-1 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-orange-500 rounded" style={{ width: `${p.severity * 100}%` }} />
                </div>
                <span className="text-slate-500 w-8 text-right">{Math.round(p.severity * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="text-[0.5rem] text-slate-500 uppercase tracking-wider mb-1">Manejo pre-ingreso</div>
        <div className="text-[0.5rem] text-slate-400 font-mono space-y-0.5">
          <div>Soporte resp: <span className="text-cyan-400">{parsed.preAdmissionManagement.respiratorySupport}</span></div>
          {parsed.preAdmissionManagement.activeInfusions.length > 0 && (
            <div>Infusiones: {parsed.preAdmissionManagement.activeInfusions.map(i => i.drug).join(', ')}</div>
          )}
          {parsed.preAdmissionManagement.invasiveMonitoring !== 'none' && (
            <div>Monitoreo: <span className="text-cyan-400">{parsed.preAdmissionManagement.invasiveMonitoring}</span></div>
          )}
          {parsed.preAdmissionManagement.icpCatheterPlaced && (
            <div className="text-purple-400">Catéter PIC colocado</div>
          )}
        </div>
      </div>

      {parsed.warnings.length > 0 && (
        <div className="border border-amber-600/40 rounded p-2 bg-amber-900/10">
          <div className="text-[0.5rem] text-amber-400 font-black uppercase tracking-wider mb-1">Advertencias</div>
          {parsed.warnings.map((w, i) => (
            <div key={i} className="text-[0.48rem] text-amber-300">⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface CustomCaseModalProps {
  open:    boolean;
  onClose: () => void;
}

export const CustomCaseModal: React.FC<CustomCaseModalProps> = ({ open, onClose }) => {
  const [sections, setSections] = useState<CaseDescription>({
    antecedentes:  '',
    motivoIngreso: '',
    neuro:         '',
    hemo:          '',
    resp:          '',
    renal:         '',
    gastro:        '',
    infecto:       '',
    quirurgico:    '',
    estudios:      '',
  });

  const [parsedPreview, setParsedPreview] = useState<ParsedCase | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleParse = () => {
    setIsParsing(true);
    try {
      const parsed = ProceduralPatientFactory.parse(sections);
      setParsedPreview(parsed);
    } finally {
      setIsParsing(false);
    }
  };

  const handleStart = () => {
    if (!parsedPreview) return;
    // applyParsedCase tiene try/catch internamente.
    // El modal se cierra SOLO si no hay error (launchError queda null si ok).
    ProceduralPatientFactory.applyParsedCase(parsedPreview);
    // Cerrar el modal: si hay error, CrashFallback en MonitorApp lo mostrará.
    onClose();
  };

  const handleClose = () => {
    setParsedPreview(null);
    onClose();
  };

  if (!open) return null;

  const sectionKeys = Object.keys(sections) as Array<keyof CaseDescription>;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-[#0b1120] border border-violet-500/30 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-xl font-black text-violet-300 tracking-wider">
              ✎ PERSONALIZAR CASO
            </h2>
            <p className="text-slate-500 text-[0.6rem] mt-1">
              Describí cada apartado en lenguaje natural. El motor procesará la narrativa para
              inferir comorbilidades, dificultad y manejo pre-ingreso.
            </p>
          </div>
          <button type="button" onClick={handleClose}
            className="text-slate-400 hover:text-white text-lg cursor-pointer px-2">✕</button>
        </div>

        <div className="p-6">
          {/* Grid de secciones */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {sectionKeys.map(k => (
              <div key={k}>
                <label className="text-violet-300 text-[0.55rem] font-black tracking-wider uppercase">
                  {SECTION_LABELS[k]}
                </label>
                <textarea
                  value={sections[k]}
                  onChange={e => setSections(s => ({ ...s, [k]: e.target.value }))}
                  rows={3}
                  placeholder={SECTION_PLACEHOLDERS[k]}
                  className="w-full mt-1 px-2 py-1.5 bg-black/50 border border-white/10 rounded-lg text-slate-200 text-[0.6rem] font-mono resize-none focus:outline-none focus:border-violet-500/50 placeholder-slate-700"
                />
              </div>
            ))}
          </div>

          {/* Botones */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={isParsing}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 text-white rounded-lg font-bold text-[0.65rem] cursor-pointer transition-all tracking-wider"
            >
              {isParsing ? 'ANALIZANDO...' : 'ANALIZAR NARRATIVA'}
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={!parsedPreview}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold text-[0.65rem] cursor-pointer transition-all tracking-wider disabled:cursor-not-allowed"
            >
              INICIAR CASO
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[0.65rem] cursor-pointer transition-all"
            >
              Cancelar
            </button>
          </div>

          {/* Preview */}
          {parsedPreview && <ParsedCasePreview parsed={parsedPreview} />}
        </div>
      </div>
    </div>
  );
};
