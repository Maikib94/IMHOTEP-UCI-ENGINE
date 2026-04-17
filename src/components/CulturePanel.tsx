// src/components/CulturePanel.tsx
// Panel de Cultivos Microbiológicos — IMHOTEP UCI
// Cubre todos los sitios de muestreo de UCI: hemocultivos, catéteres, LCR,
// líquidos corporales, vía aérea, diagnóstico molecular y panel viral.

import React, { useState, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useMicrobiologyStore,
  CULTURE_SITE_CATALOG,
  ANTIBIOTIC_CATALOG,
  PATHOGEN_CATALOG,
  CultureSiteType,
  Culture,
  CultureResult,
} from '../store/useMicrobiologyStore';
import { useTimeStore } from '../store/useTimeStore';
import { usePathologyStore } from '../store/usePathologyStore';

// Constantes derivadas de los catálogos — calculadas una sola vez al importar el módulo,
// no en cada render.
const ALL_ATB_CLASSES: string[] = [
  ...new Set(Object.values(ANTIBIOTIC_CATALOG).map(a => a.class)),
].sort();

// ─── Constantes UI ─────────────────────────────────────────────────────────
const PANEL_TABS = [
  { id: 'hemoculture',    label: 'Hemocultivos',   icon: '🩸' },
  { id: 'catheter_retro', label: 'Retrocultivos',  icon: '🔴' },
  { id: 'catheter_tip',   label: 'Tips Catéter',   icon: '🟠' },
  { id: 'csf',            label: 'LCR',            icon: '🧠' },
  { id: 'body_fluid',     label: 'Líquidos Corp.', icon: '🫀' },
  { id: 'respiratory',    label: 'Vía Aérea',      icon: '🫁' },
  { id: 'molecular',      label: 'GeneXpert',      icon: '🧬' },
  { id: 'viral',          label: 'Panel Viral',    icon: '🦠' },
] as const;

type TabId = typeof PANEL_TABS[number]['id'];

// ─── Helpers ──────────────────────────────────────────────────────────────

// Clases Tailwind para sensibilidad — elimina style={{ color, backgroundColor }}.
// Equivalencias hex→Tailwind: #22c55e=green-500  #f59e0b=amber-400
//                              #ef4444=red-500     #6b7280=gray-500   #94a3b8=slate-400
// Opacidad fondo: hex 22 ≈ 13% → /15; borde hex 44 ≈ 27% → /25.
function sensitivityClasses(s: string): string {
  switch (s) {
    case 'S':           return 'text-green-500 bg-green-500/15';
    case 'I':           return 'text-amber-400 bg-amber-400/15';
    case 'R':           return 'text-red-500 bg-red-500/15';
    case 'INTRINSEC_R': return 'text-gray-500 bg-gray-500/15';
    default:            return 'text-slate-400 bg-slate-400/15';
  }
}

function sensitivityLabel(s: string): string {
  switch (s) {
    case 'S':           return 'S';
    case 'I':           return 'I';
    case 'R':           return 'R';
    case 'INTRINSEC_R': return 'RI';
    default:            return '--';
  }
}

// Clases Tailwind para el badge de estado de cultivo.
function statusBadge(culture: Culture): { classes: string; label: string } {
  switch (culture.status) {
    case 'pending':     return { classes: 'text-slate-400 bg-slate-400/15 border-slate-400/25',  label: 'Pendiente'   };
    case 'in_progress': return { classes: 'text-amber-400 bg-amber-400/15 border-amber-400/25',  label: 'En proceso'  };
    case 'positive':    return { classes: 'text-red-500   bg-red-500/15   border-red-500/25',    label: '⚠️ POSITIVO' };
    case 'negative':    return { classes: 'text-green-500 bg-green-500/15 border-green-500/25',  label: 'Negativo'    };
    case 'ready':       return { classes: 'text-blue-400  bg-blue-400/15  border-blue-400/25',   label: 'Listo'       };
    default:            return { classes: 'text-slate-400 bg-slate-400/15 border-slate-400/25',  label: 'N/D'         };
  }
}

// ─── Subcomponente: CultureResultCard ─────────────────────────────────────

function CultureResultCard({ result }: { result: CultureResult }) {
  const [showSens, setShowSens] = useState(false);

  return (
    <div className="mt-2 p-2 bg-[#0f1c30] rounded-lg border border-red-800/40 text-xs">
      {/* Germen */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-red-400">{result.pathogenName}</span>
        <span className="text-gray-400 italic text-[10px]">{result.gramStainDesc}</span>
      </div>

      {/* Tinta China (Cryptococcus) */}
      {result.indiaInk !== undefined && (
        <div className={`mb-1 text-[10px] font-mono ${result.indiaInk ? 'text-yellow-400' : 'text-gray-500'}`}>
          🔬 Tinta China: <strong>{result.indiaInk ? 'POSITIVO (Cryptococcus)' : 'NEGATIVO'}</strong>
        </div>
      )}

      {/* Citoquímico (líquidos corporales / LCR) */}
      {result.fluidAnalysis && (
        <div className="mb-2 p-1.5 bg-[#091624] rounded border border-blue-900/30">
          <div className="text-[9px] font-bold text-blue-400 mb-1">ANÁLISIS CITOQUÍMICO</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
            {result.fluidAnalysis.appearance        && <span className="col-span-2 text-gray-300">Aspecto: <span className="text-cyan-300">{result.fluidAnalysis.appearance}</span></span>}
            {result.fluidAnalysis.wbc              !== undefined && <span>Leu: <span className="text-cyan-300">{result.fluidAnalysis.wbc} /mm³</span></span>}
            {result.fluidAnalysis.neutrophils      !== undefined && <span>PMN: <span className="text-cyan-300">{result.fluidAnalysis.neutrophils}%</span></span>}
            {result.fluidAnalysis.glucose          !== undefined && <span>Glucosa: <span className="text-cyan-300">{result.fluidAnalysis.glucose} mg/dL</span></span>}
            {result.fluidAnalysis.protein          !== undefined && <span>Prot: <span className="text-cyan-300">{result.fluidAnalysis.protein} mg/dL</span></span>}
            {result.fluidAnalysis.ldh              !== undefined && <span>LDH: <span className="text-cyan-300">{result.fluidAnalysis.ldh} UI/L</span></span>}
            {result.fluidAnalysis.ph               !== undefined && <span>pH: <span className={result.fluidAnalysis.ph < 7.2 ? 'text-red-400' : 'text-cyan-300'}>{result.fluidAnalysis.ph}</span></span>}
            {result.fluidAnalysis.ada              !== undefined && <span>ADA: <span className={result.fluidAnalysis.ada > 40 ? 'text-yellow-400' : 'text-cyan-300'}>{result.fluidAnalysis.ada} U/L</span></span>}
            {result.fluidAnalysis.openingPressure  !== undefined && <span>P.Apertura: <span className={result.fluidAnalysis.openingPressure > 200 ? 'text-red-400' : 'text-cyan-300'}>{result.fluidAnalysis.openingPressure} mmH₂O</span></span>}
            {result.fluidAnalysis.colonyCount      !== undefined && <span>UFC/mL: <span className={result.fluidAnalysis.colonyCount >= 10000 ? 'text-red-400' : 'text-cyan-300'}>{result.fluidAnalysis.colonyCount.toLocaleString()}</span></span>}
          </div>
        </div>
      )}

      {/* GeneXpert */}
      {result.geneXpert && result.geneXpert.length > 0 && (
        <div className="mb-2 p-1.5 bg-[#091624] rounded border border-purple-900/30">
          <div className="text-[9px] font-bold text-purple-400 mb-1">GENEXPERT</div>
          {result.geneXpert.map((gx, i) => (
            <div key={i} className="text-[9px] flex items-center gap-2">
              <span className={gx.detected ? 'text-red-400 font-bold' : 'text-gray-500'}>
                {gx.detected ? '⊕' : '⊖'} {gx.target}
              </span>
              {gx.rifResistance !== undefined && gx.detected && (
                <span className={gx.rifResistance ? 'text-red-400' : 'text-green-400'}>
                  {gx.rifResistance ? '⚠️ RIF-R (MDR-TB)' : 'RIF-S'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Panel viral */}
      {result.viralPanel && result.viralPanel.length > 0 && (
        <div className="mb-2 p-1.5 bg-[#091624] rounded border border-cyan-900/30">
          <div className="text-[9px] font-bold text-cyan-400 mb-1">PANEL VIRAL</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {result.viralPanel.map((vp, i) => (
              <div key={i} className={`text-[9px] ${vp.detected ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                {vp.detected ? '⊕' : '⊖'} {vp.target}
                {vp.quantitative && vp.detected && (
                  <span className="text-orange-300 ml-1">{vp.quantitative.toLocaleString()} {vp.unit || 'copies'}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Antibiograma */}
      <div>
        <button
          onClick={() => setShowSens(v => !v)}
          className="text-[10px] text-blue-400 underline mb-1"
        >
          {showSens ? '▲ Ocultar' : '▼ Antibiograma / Sensibilidades'}
        </button>
        {showSens && (
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 mt-1">
            {Object.entries(result.sensitivities).map(([atbId, sens]) => {
              const atbDef = ANTIBIOTIC_CATALOG[atbId];
              const mic    = result.mics[atbId];
              return (
                <div
                  key={atbId}
                  className="flex items-center gap-1"
                  title={atbDef?.notes?.join('\n') || atbId}
                >
                  <span
                    className={`font-bold text-[9px] w-6 text-center rounded ${sensitivityClasses(sens)}`}
                  >
                    {sensitivityLabel(sens)}
                  </span>
                  <span className="text-[9px] text-gray-300 truncate max-w-[60px]">
                    {atbDef?.shortName || atbId}
                  </span>
                  {mic !== undefined && (
                    <span className="text-[8px] text-gray-500">({mic})</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Nota clínica */}
      {result.clinicalNote && (
        <div className="mt-1.5 text-[9px] text-amber-400/80 italic border-t border-white/5 pt-1">
          {result.clinicalNote}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente: CultureSiteRow ────────────────────────────────────────

function CultureSiteRow({
  siteType,
  activeCultures,
  onOrder,
}: {
  siteType:       CultureSiteType;
  activeCultures: Culture[];
  onOrder:        (siteType: CultureSiteType) => void;
}) {
  const spec = CULTURE_SITE_CATALOG[siteType];

  // Bug fix: usar el cultivo MÁS RECIENTE (último en el array) para el sitio,
  // no el primero. Evita mostrar un resultado negativo antiguo cuando el clínico
  // reordena el mismo sitio tras obtener cultivo negativo inicial.
  const siteCultures = activeCultures.filter(c => c.siteType === siteType);
  const culture      = siteCultures.length > 0 ? siteCultures[siteCultures.length - 1] : undefined;
  const badge        = culture ? statusBadge(culture) : null;

  // Puede reordenar si no hay cultivo PENDIENTE activo (independientemente de
  // si hay resultados previos completados — negativo/positivo).
  const hasPending = siteCultures.some(c => c.status === 'pending' || c.status === 'in_progress');

  return (
    <div className="border border-white/5 rounded-lg p-2.5 bg-[#0a1525]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Nombre del sitio */}
          <div className="flex items-center gap-1.5">
            <span>{spec.icon}</span>
            <span className="text-xs font-bold text-gray-200 truncate">{spec.displayName}</span>
            {spec.requiresCatheterRemoval && (
              <span className="text-[9px] bg-orange-900/40 text-orange-400 px-1 rounded border border-orange-800/40">
                Retira catéter
              </span>
            )}
          </div>

          {/* Tiempo de resultado */}
          <div className="text-[9px] text-gray-500 mt-0.5">
            Resultado: ~{spec.turnaroundHours < 1
              ? `${spec.turnaroundHours * 60}min`
              : `${spec.turnaroundHours}h`}
            {' · '}
            {spec.quantitative ? 'Cuantitativo' : 'Cualitativo'}
          </div>

          {/* Técnicas incluidas */}
          {spec.additionalTests.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {spec.additionalTests.slice(0, 3).map((t, i) => (
                <span key={i} className="text-[8px] bg-[#0d1f35] text-gray-400 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[96px]">
                  {t}
                </span>
              ))}
              {spec.additionalTests.length > 3 && (
                <span className="text-[8px] text-gray-500">+{spec.additionalTests.length - 3} más</span>
              )}
            </div>
          )}
        </div>

        {/* Botón / Estado */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {/* Badge del cultivo más reciente (si existe) */}
          {culture && badge && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.classes}`}
            >
              {badge.label}
            </span>
          )}
          {/* Botón "Tomar": disponible si no hay cultivo pendiente/en proceso */}
          {!hasPending && (
            <button
              onClick={() => onOrder(siteType)}
              className="px-2.5 py-1 text-[10px] font-bold rounded bg-blue-800/50 text-blue-300 border border-blue-700/40 hover:bg-blue-700/50 transition-colors"
            >
              {siteCultures.length > 0 ? 'Re-tomar' : 'Tomar'}
            </button>
          )}
        </div>
      </div>

      {/* Resultado si disponible */}
      {culture?.result && culture.result.isPositive && (
        <CultureResultCard result={culture.result} />
      )}
      {culture?.result && !culture.result.isPositive && (
        <div className="mt-1.5 text-[10px] text-green-500/80 font-mono">
          ✓ Sin desarrollo bacteriano/fúngico
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal: CulturePanel ───────────────────────────────────

const CulturePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('hemoculture');
  const [showVademecum, setShowVademecum] = useState(false);
  const [vademecumFilter, setVademecumFilter] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('');

  // Fix #1: selectores granulares con useShallow para evitar re-renders en cada tick
  // del engine. Sin esto, el componente se re-renderizaba ~60 veces/s durante la
  // simulación porque useMicrobiologyStore() sin selector suscribe al objeto entero.
  const { cultures, sscBundle, orderCulture, treatmentEfficacy, hiddenPathogenId } =
    useMicrobiologyStore(useShallow(s => ({
      cultures:          s.cultures,
      sscBundle:         s.sscBundle,
      orderCulture:      s.orderCulture,
      treatmentEfficacy: s.treatmentEfficacy,
      hiddenPathogenId:  s.hiddenPathogenId,
    })));

  const simElapsed   = useTimeStore(s => s.simulatedElapsed);
  const sepsisActive = usePathologyStore(s => s.sepsis.isActive);

  // ── Cobertura insuficiente: patógeno activo + tratamiento sin eficacia ──────
  const hasActivePath = hiddenPathogenId !== null && hiddenPathogenId in PATHOGEN_CATALOG;
  const coverageAlert = sepsisActive && hasActivePath &&
    (treatmentEfficacy === 'mismatch' || treatmentEfficacy === 'none');
  // Fix #4: si hasActivePath es verdadero, la entrada del catálogo está garantizada —
  // no mezclar ! y ?. para el mismo acceso.
  const pathogenLabel = hasActivePath
    ? PATHOGEN_CATALOG[hiddenPathogenId as string].displayName
    : '';

  // ── Time-to-Antibiotic ────────────────────────────────────────────────────
  const sepsisAt   = sscBundle.sepsisActivatedAt;
  const firstAtbAt = sscBundle.firstATBAt;

  const ttaSeconds = firstAtbAt !== null && sepsisAt > 0
    ? Math.max(0, firstAtbAt - sepsisAt)
    : null;
  const ttaMinutes = ttaSeconds !== null ? Math.round(ttaSeconds / 60) : null;

  // Fix #6: derivar ttaClass solo cuando ttaMinutes tiene valor real
  const ttaClass = ttaMinutes === null
    ? 'text-slate-400'
    : ttaMinutes <= 60  ? 'text-green-500'
    : ttaMinutes <= 180 ? 'text-amber-400'
    : 'text-red-500';

  // Tiempo transcurrido sin ATB cuando sepsis activa y aún sin iniciar antibiótico
  const pendingTtaMin = sepsisActive && sepsisAt > 0 && firstAtbAt === null
    ? Math.round((simElapsed - sepsisAt) / 60)
    : null;

  // Fix #2: saber si hay ALGO real que mostrar en la sección de alertas antes
  // de renderizar el wrapper — evita el <div pb-2> vacío fantasma.
  const showAlertsSection = coverageAlert || (sepsisActive && sepsisAt > 0);

  // Fix #3: tabSites via useMemo — CULTURE_SITE_CATALOG es constante pero el
  // filtro depende de activeTab, que sí cambia. Evitar recrear el array en cada render.
  const tabSites = useMemo(
    () => Object.values(CULTURE_SITE_CATALOG)
      .filter(spec => spec.category === activeTab)
      .map(spec => spec.id),
    [activeTab],
  );

  // Fix #3: atbClasses es constante — ahora viene del nivel de módulo (ALL_ATB_CLASSES),
  // no se recalcula aquí en absoluto.
  const atbClasses = ALL_ATB_CLASSES;

  // useCallback para que handleOrder sea estable entre renders (no recrea la fn)
  const handleOrder = useCallback(
    (siteType: CultureSiteType) => orderCulture(siteType, simElapsed),
    [orderCulture, simElapsed],
  );

  return (
    <div className="flex flex-col h-full bg-[#060e1e] text-white text-xs select-none">

      {/* ─── Bundle SSC Badge ─────────────────────────────────────────────── */}
      <div className="shrink-0 p-2 border-b border-white/5">
        <div className="text-[10px] font-bold text-gray-400 mb-1.5">Bundle SSC — Hora-1</div>
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'hemoculture1Drawn', label: 'HC #1', done: sscBundle.hemoculture1Drawn },
            { key: 'hemoculture2Drawn', label: 'HC #2', done: sscBundle.hemoculture2Drawn },
            { key: 'lactateOrdered',    label: 'Lactato', done: sscBundle.lactateOrdered },
            { key: 'antibioticsStarted',label: 'ATB', done: sscBundle.antibioticsStarted },
            { key: 'fluidBolusSent',    label: 'Fluidos', done: sscBundle.fluidBolusSent },
            { key: 'vasopressorsStarted',label: 'Vasop.', done: sscBundle.vasopressorsStarted },
          ].map(({ key, label, done }) => (
            <span
              key={key}
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                done
                  ? 'bg-green-500/15 text-green-500 border-green-500/25'
                  : 'bg-red-900/15 text-red-500 border-red-500/25'
              }`}
            >
              {done ? '✓' : '○'} {label}
            </span>
          ))}
        </div>
      </div>

      {/* ─── Alertas Clínicas: COBERTURA INSUFICIENTE + Time-to-Antibiotic ── */}
      {showAlertsSection && (
        <div className="shrink-0 px-2 pt-2 pb-2 space-y-1">

          {/* COBERTURA INSUFICIENTE */}
          {coverageAlert && (
            <div className="flex items-start gap-2 p-2 rounded-lg border border-red-600/60 bg-red-950/40">
              <span className="text-red-400 font-black text-sm shrink-0">⛔</span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black text-red-400 tracking-wide">
                  COBERTURA INSUFICIENTE
                </div>
                <div className="text-[9px] text-red-300/80 mt-0.5">
                  Patógeno: <strong className="text-red-300">{pathogenLabel}</strong>
                  {' — '}
                  {treatmentEfficacy === 'mismatch'
                    ? 'Antibiótico actual RESISTENTE (presión selectiva — ↑mortalidad)'
                    : 'Sin tratamiento antibiótico activo'}
                </div>
                <div className="text-[8px] text-red-400/60 mt-0.5">
                  Ajustar tratamiento urgente — Ref: SSC 2025 Bundle Hora-1
                </div>
              </div>
            </div>
          )}

          {/* Time-to-Antibiotic */}
          {sepsisActive && sepsisAt > 0 && (
            <div className="flex items-center gap-2 p-1.5 rounded-lg border border-white/10 bg-[#0a1525]">
              <span className="text-[9px] text-gray-400 shrink-0">⏱ Tiempo-ATB:</span>
              {ttaMinutes !== null ? (
                <span
                  className={`text-[10px] font-black font-mono ${ttaClass}`}
                >
                  {ttaMinutes < 60
                    ? `${ttaMinutes} min`
                    : `${Math.floor(ttaMinutes / 60)}h ${ttaMinutes % 60}min`}
                  {/* Fix #5: ternario encadenado — mutuamente excluyente y sin
                      evaluaciones redundantes de los tres ramas en cada render */}
                  {ttaMinutes <= 60
                    ? ' ✓ Cumple Hora-1'
                    : ttaMinutes <= 180
                    ? ' ⚠️ >1h'
                    : ' ✗ TARDÍO (>3h → ↑mortalidad)'}
                </span>
              ) : pendingTtaMin !== null ? (
                <span className="text-[10px] font-black font-mono text-orange-400">
                  {pendingTtaMin < 60
                    ? `${pendingTtaMin} min sin ATB`
                    : `${Math.floor(pendingTtaMin / 60)}h ${pendingTtaMin % 60}min sin ATB`}
                  {' '}
                  {pendingTtaMin > 60 ? '⚠️ INICIAR ATB' : '— iniciar ATB ya'}
                </span>
              ) : (
                <span className="text-[9px] text-gray-600">Esperando activación sepsis…</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Vademécum Toggle ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/5">
        <button
          onClick={() => setShowVademecum(v => !v)}
          className="w-full px-3 py-1.5 text-left text-[10px] font-bold text-purple-300 hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span>📖 Vademécum Antibiótico — Sanford 2025</span>
          <span className="ml-auto">{showVademecum ? '▲' : '▼'}</span>
        </button>

        {showVademecum && (
          <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
            {/* Filtros */}
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Buscar antibiótico..."
                value={vademecumFilter}
                onChange={e => setVademecumFilter(e.target.value)}
                className="flex-1 bg-[#0a1525] border border-white/10 rounded px-2 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600"
              />
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                aria-label="Filtrar por clase de antibiótico"
                title="Clase de antibiótico"
                className="bg-[#0a1525] border border-white/10 rounded px-1.5 py-1 text-[9px] text-gray-200 focus:outline-none max-w-[110px]"
              >
                <option value="">Todas las clases</option>
                {atbClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Tabla vademécum */}
            <div className="space-y-1">
              {Object.values(ANTIBIOTIC_CATALOG)
                .filter(atb => {
                  const qLower = vademecumFilter.toLowerCase();
                  const matchSearch = !qLower ||
                    atb.displayName.toLowerCase().includes(qLower) ||
                    atb.shortName.toLowerCase().includes(qLower) ||
                    atb.class.toLowerCase().includes(qLower);
                  const matchClass = !selectedClass || atb.class === selectedClass;
                  return matchSearch && matchClass;
                })
                .map(atb => (
                  <div key={atb.id} className="bg-[#0a1525] rounded border border-white/5 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-bold text-[10px] text-purple-300">{atb.shortName}</span>
                        <span className="text-[9px] text-gray-400 ml-1.5">{atb.class}</span>
                      </div>
                      <div className="flex gap-1">
                        <span className="text-[8px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded border border-blue-800/30">
                          {atb.pkpdType === 'time' ? 'T>MIC' : atb.pkpdType === 'auc' ? 'AUC' : 'Cmax'}
                        </span>
                        <span className="text-[8px] text-gray-500 px-1 py-0.5">
                          CNS: {atb.cnsPermeability === 'good' ? '✅' : atb.cnsPermeability === 'moderate' ? '⚡' : atb.cnsPermeability === 'none' ? '❌' : '⚠️'}
                        </span>
                        {atb.nephrotoxic && (
                          <span className="text-[8px] bg-red-900/30 text-red-400 px-1 py-0.5 rounded">⚠️ Nefro</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[9px] text-gray-300 mb-1">{atb.doseStandard}</div>
                    {atb.notes.length > 0 && (
                      <div className="space-y-0.5">
                        {atb.notes.map((note, i) => (
                          <div key={i} className="text-[9px] text-amber-400/70">{note}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Tabs Cultivos ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/5 overflow-x-auto">
        <div className="flex min-w-max">
          {PANEL_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1.5 text-[9px] font-bold whitespace-nowrap transition-colors flex items-center gap-1 border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-300 bg-blue-900/20'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {/* Badge de positivos */}
              {(() => {
                const positives = cultures.filter(
                  c => CULTURE_SITE_CATALOG[c.siteType]?.category === tab.id && c.status === 'positive'
                ).length;
                return positives > 0 ? (
                  <span className="ml-1 text-[8px] bg-red-600 text-white rounded-full px-1.5">{positives}</span>
                ) : null;
              })()}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Lista de sitios de cultivo ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeTab === 'hemoculture' && (
          <div className="text-[9px] text-yellow-400/80 bg-yellow-900/10 border border-yellow-800/20 rounded p-2 mb-2">
            ⚠️ SSC Bundle: Se requieren <strong>DOS hemocultivos periféricos</strong> de sitios distintos <em>antes</em> del inicio de antibióticos (SSC 2025, Bundle Hora-1).
          </div>
        )}

        {activeTab === 'catheter_tip' && (
          <div className="text-[9px] text-orange-400/80 bg-orange-900/10 border border-orange-800/20 rounded p-2 mb-2">
            ⚠️ La toma de punta requiere <strong>retirar el catéter</strong>. Evaluar riesgo/beneficio según diagnóstico de CLABSI (criterio diferencial DTP &gt;2h).
            Cultivo semicuantitativo Maki: <strong>≥15 UFC</strong> en rodamiento = positivo.
          </div>
        )}

        {activeTab === 'csf' && (
          <div className="text-[9px] text-blue-400/80 bg-blue-900/10 border border-blue-800/20 rounded p-2 mb-2">
            🧠 <strong>Tinta china:</strong> sensibilidad 75-88% para Cryptococcus en VIH (IDSA 2010).
            Complementar con <strong>antígeno criptocócico (CRAG) sérico y LCR</strong>.
            GeneXpert ME Panel cubre bacterias + virus + Cryptococcus en 2h (BioFire® FilmArray).
          </div>
        )}

        {activeTab === 'molecular' && (
          <div className="text-[9px] text-purple-400/80 bg-purple-900/10 border border-purple-800/20 rounded p-2 mb-2">
            🧬 <strong>GeneXpert MTB/RIF:</strong> sensibilidad ~88%, especificidad ~99% para TBC pulmonar (OMS 2013).
            Detecta resistencia a Rifampicina (proxy MDR-TB) en <strong>2 horas</strong>.
            No reemplaza cultivo convencional (antibiograma completo en Löwenstein-Jensen: 6-8 semanas).
          </div>
        )}

        {activeTab === 'viral' && (
          <div className="text-[9px] text-cyan-400/80 bg-cyan-900/10 border border-cyan-800/20 rounded p-2 mb-2">
            🦠 <strong>Panel viral respiratorio:</strong> resultado en 4h. Crítico en UCI para aislamientos y antivirales.
            <strong> HSV en LCR</strong> (PCR): gold standard encefalitis por HSV — <em>no esperar serología</em>,
            iniciar Aciclovir 10mg/kg c/8h empírico (IDSA 2017).
          </div>
        )}

        {tabSites.map(siteType => (
          <CultureSiteRow
            key={siteType}
            siteType={siteType}
            activeCultures={cultures}
            onOrder={handleOrder}
          />
        ))}
      </div>

      {/* ─── Footer: total cultivos activos ───────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 px-3 py-1.5 flex items-center justify-between">
        <div className="text-[9px] text-gray-500">
          {cultures.filter(c => c.status === 'pending').length} pendientes
          {' · '}
          <span className="text-red-400">
            {cultures.filter(c => c.status === 'positive').length} positivos
          </span>
        </div>
        <div className="text-[9px] text-gray-600">
          {Object.keys(ANTIBIOTIC_CATALOG).length} ATBs en vademécum
        </div>
      </div>
    </div>
  );
};

export default CulturePanel;
export { CulturePanel };
