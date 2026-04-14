// LabPanel.tsx v3
// UX Clínica — ATLS 11va / Guyton & Hall 15va / Pinsky / SATI-Cárdenas
// Pilar 1: Tipografía escalada (legibilidad de crisis)
// Pilar 2: Cebra alto contraste #060d1a / #0c1628
// Pilar 3: Fila crítica — borde 3px rojo + tinte fila completa
// Pilar 4: Δ-tendencia vs. historial COMPLETO (no ventana visible)
// Pilar 5: Badge 💧 DILUC. cross-study (Guyton Cap.31)
// Bonus:   Agrupación fisiológica jerárquica dentro de la tabla

import React, { useState, useMemo } from 'react';
import { usePatientStore } from '../store/usePatientStore';
import { useTimeStore }    from '../store/useTimeStore';
import { LabEngine }       from '../core/LabEngine';
import type { LabOrder }   from '../store/usePatientStore';

// ── Tipografía ────────────────────────────────────────────────────────────────
const MONO = "'JetBrains Mono', monospace";
const BG   = '#070d1b';

// ── Paleta clínica SATI ───────────────────────────────────────────────────────
const C_NORMAL   = '#c8d6e5';   // valor dentro de rango
const C_HIGH     = '#f97316';   // H — naranja
const C_LOW      = '#38bdf8';   // L — azul cielo
const C_CRITICAL = '#ff4444';   // C — rojo urgencia vital
const C_ANALYTE  = '#94a3b8';   // nombre analito
const C_REF      = '#1e3a5f';   // referencia (muy muted)
const C_TS       = '#38bdf8';   // timestamp columna
const C_UNIT     = '#334155';   // unidad inline

// ── Cebra UCI ─────────────────────────────────────────────────────────────────
const ROW_EVEN = '#060d1a';
const ROW_ODD  = '#0c1628';

// ── Agrupación fisiológica jerárquica ─────────────────────────────────────────
// Ordena analitos según sistema fisiológico (ATLS / Guyton / SATI)
const ANALYTE_GROUP: Record<string, string> = {
  // GASES Y OXIGENACIÓN
  pH: 'GASES Y OXIGENACIÓN', pCO2: 'GASES Y OXIGENACIÓN',
  pO2: 'GASES Y OXIGENACIÓN', HCO3: 'GASES Y OXIGENACIÓN',
  BE: 'GASES Y OXIGENACIÓN', SaO2: 'GASES Y OXIGENACIÓN',
  Lactato: 'GASES Y OXIGENACIÓN', Glucosa: 'GASES Y OXIGENACIÓN',
  // HEMATOLOGÍA
  Hb: 'HEMATOLOGÍA', Hct: 'HEMATOLOGÍA',
  'WBC total': 'HEMATOLOGÍA', Plaquetas: 'HEMATOLOGÍA',
  'Neutrof. %': 'HEMATOLOGÍA', 'Linfoc. %': 'HEMATOLOGÍA',
  'Monocit. %': 'HEMATOLOGÍA', 'Eosinof. %': 'HEMATOLOGÍA',
  'Cayados %': 'HEMATOLOGÍA',
  // COAGULACIÓN
  TP: 'COAGULACIÓN', INR: 'COAGULACIÓN',
  KPTT: 'COAGULACIÓN', Fibrinogeno: 'COAGULACIÓN',
  // MEDIO INTERNO / RENAL
  Na: 'MEDIO INTERNO / RENAL', Sodio: 'MEDIO INTERNO / RENAL',
  K: 'MEDIO INTERNO / RENAL', Potasio: 'MEDIO INTERNO / RENAL',
  Cl: 'MEDIO INTERNO / RENAL', Cloro: 'MEDIO INTERNO / RENAL',
  CO2: 'MEDIO INTERNO / RENAL', BUN: 'MEDIO INTERNO / RENAL',
  Urea: 'MEDIO INTERNO / RENAL', Creatinina: 'MEDIO INTERNO / RENAL',
  eGFR: 'MEDIO INTERNO / RENAL', Magnesio: 'MEDIO INTERNO / RENAL',
  Fosforo: 'MEDIO INTERNO / RENAL', 'Ca total': 'MEDIO INTERNO / RENAL',
  'Ca ionico': 'MEDIO INTERNO / RENAL', Albumina: 'MEDIO INTERNO / RENAL',
  // HEPÁTICO / PÁNCREAS
  AST: 'HEPÁTICO / PÁNCREAS', ALT: 'HEPÁTICO / PÁNCREAS',
  'Bilirrubina T': 'HEPÁTICO / PÁNCREAS', 'Bilirrubina D': 'HEPÁTICO / PÁNCREAS',
  GGT: 'HEPÁTICO / PÁNCREAS', Amilasa: 'HEPÁTICO / PÁNCREAS',
  Lipasa: 'HEPÁTICO / PÁNCREAS',
  // ESPECIALES / INFLAMACIÓN
  hsTnI: 'ESPECIALES / INFLAMACIÓN', 'NT-proBNP': 'ESPECIALES / INFLAMACIÓN',
  'Dimero-D': 'ESPECIALES / INFLAMACIÓN', Procalcitonina: 'ESPECIALES / INFLAMACIÓN',
  PCR: 'ESPECIALES / INFLAMACIÓN', Cortisol: 'ESPECIALES / INFLAMACIÓN',
};

const GROUP_ORDER = [
  'GASES Y OXIGENACIÓN',
  'HEMATOLOGÍA',
  'COAGULACIÓN',
  'MEDIO INTERNO / RENAL',
  'HEPÁTICO / PÁNCREAS',
  'ESPECIALES / INFLAMACIÓN',
];

const GROUP_COLOR: Record<string, string> = {
  'GASES Y OXIGENACIÓN':      '#34d399',
  'HEMATOLOGÍA':              '#a78bfa',
  'COAGULACIÓN':              '#f472b6',
  'MEDIO INTERNO / RENAL':    '#38bdf8',
  'HEPÁTICO / PÁNCREAS':      '#fb923c',
  'ESPECIALES / INFLAMACIÓN': '#fbbf24',
};

// ── Δ-tendencia: analitos donde SUBIR es clínicamente malo ───────────────────
const BAD_IF_RISING = new Set([
  'Lactato', 'Creatinina', 'BUN', 'Urea', 'INR', 'KPTT', 'TP',
  'Bilirrubina T', 'Bilirrubina D', 'AST', 'ALT', 'GGT',
  'Procalcitonina', 'PCR', 'NT-proBNP', 'Dimero-D',
  'Cayados %', 'hsTnI', 'WBC total', 'Amilasa', 'Lipasa',
]);

// Umbral mínimo Δ — elimina ruido gaussiano del modelo fisiológico
const DELTA_THRESH: Record<string, number> = {
  Lactato: 0.5,  Hb: 0.5,  Hct: 1.5,  pH: 0.03,
  Potasio: 0.3,  K: 0.3,  INR: 0.10,  Creatinina: 0.20,
  'WBC total': 2.0,  Plaquetas: 20,  Fibrinogeno: 30,
  BE: 1.5,  pO2: 5,  HCO3: 2,  SaO2: 2,
  BUN: 5,  Urea: 10,  AST: 20,  ALT: 20,
  'NT-proBNP': 100,  Procalcitonina: 0.5,  PCR: 10,
};

// Sin indicador Δ (bidireccional o baja relevancia de tendencia puntual)
const NO_DELTA = new Set([
  'pCO2', 'Cl', 'Cloro', 'Sodio', 'Na', 'Magnesio',
  'Fosforo', 'Ca total', 'Ca ionico',
  'Neutrof. %', 'Linfoc. %', 'Monocit. %', 'Eosinof. %',
  'Glucosa', 'Cortisol',
]);

const COLS_PER_PAGE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Funciones puras de análisis clínico
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(ticks: number): string {
  const h = Math.floor(ticks / 3600) % 24;
  const m = Math.floor((ticks % 3600) / 60);
  return 'D' + (Math.floor(ticks / 86400) + 1)
    + ' ' + String(h).padStart(2, '0')
    + ':' + String(m).padStart(2, '0');
}

/**
 * Δ vs. historial COMPLETO (Decisión 1):
 * Busca hacia atrás en chronological el resultado anterior más reciente
 * que contenga el mismo analito, sin limitarse a la ventana visible.
 */
function getDeltaFull(
  analyte: string,
  currentOrder: LabOrder,
  chronological: LabOrder[],
): number | null {
  if (NO_DELTA.has(analyte)) return null;
  if (!currentOrder.result) return null;
  const curVal = currentOrder.result.values[analyte];
  if (typeof curVal !== 'number') return null;

  const curIdx = chronological.findIndex(o => o.id === currentOrder.id);
  if (curIdx <= 0) return null;

  for (let i = curIdx - 1; i >= 0; i--) {
    const prev = chronological[i];
    if (!prev.result) continue;
    const prevVal = prev.result.values[analyte];
    if (typeof prevVal !== 'number') continue;
    const delta  = curVal - prevVal;
    const thresh = DELTA_THRESH[analyte] ?? 0.5;
    return Math.abs(delta) >= thresh ? delta : null;
  }
  return null;
}

/** Color Δ según dirección clínica del analito */
function deltaColor(analyte: string, delta: number): string {
  const isBad = BAD_IF_RISING.has(analyte) ? delta > 0 : delta < 0;
  return isBad ? '#f87171' : '#4ade80';
}

/**
 * Hemodilución dinámica cross-study (Decisión 2 + Guyton Cap.31):
 * Hb/Hct cae Y el bloodVolume del estudio actual supera al previo en > 200 mL.
 * No requiere nuevo estado — usa snapshots de LabOrder existentes.
 */
function isHemodilutionFull(
  analyte: string,
  currentOrder: LabOrder,
  chronological: LabOrder[],
): boolean {
  if (analyte !== 'Hb' && analyte !== 'Hct') return false;
  if (!currentOrder.result) return false;
  const curVal = currentOrder.result.values[analyte];
  if (typeof curVal !== 'number') return false;

  const curIdx = chronological.findIndex(o => o.id === currentOrder.id);
  if (curIdx <= 0) return false;

  for (let i = curIdx - 1; i >= 0; i--) {
    const prev = chronological[i];
    if (!prev.result) continue;
    const prevVal = prev.result.values[analyte];
    if (typeof prevVal !== 'number') continue;
    if (curVal >= prevVal - 0.3) return false;                   // Hb debe haber caído
    return currentOrder.bloodVolume > prev.bloodVolume + 200;    // volemia subió → dilución
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo para la lista agrupada (header + fila de dato)
// ─────────────────────────────────────────────────────────────────────────────
type GroupedEntry =
  | { kind: 'header'; group: string }
  | { kind: 'row';    analyte: string };

/** Ordena analitos por grupo fisiológico e intercala separadores */
function buildGroupedEntries(analytes: string[]): GroupedEntry[] {
  const byGroup: Record<string, string[]> = {};
  analytes.forEach(a => {
    const g = ANALYTE_GROUP[a] ?? 'OTROS';
    (byGroup[g] = byGroup[g] ?? []).push(a);
  });

  const result: GroupedEntry[] = [];
  const orderedGroups = [
    ...GROUP_ORDER.filter(g => byGroup[g]?.length),
    ...(byGroup['OTROS']?.length ? ['OTROS'] : []),
  ];

  orderedGroups.forEach(group => {
    result.push({ kind: 'header', group });
    byGroup[group].forEach(a => result.push({ kind: 'row', analyte: a }));
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogos (sin cambios de lógica)
// ─────────────────────────────────────────────────────────────────────────────
const LAB_MENU = [
  { type: 'abg',        label: 'ABG',         category: 'gases',    color: '#34d399' },
  { type: 'lactate',    label: 'Lactato',      category: 'gases',    color: '#34d399' },
  { type: 'glucose_r',  label: 'Glucemia POC', category: 'gases',    color: '#34d399' },
  { type: 'cbc',        label: 'Hemograma',    category: 'hema',     color: '#a78bfa' },
  { type: 'coag',       label: 'Coagulacion',  category: 'hema',     color: '#a78bfa' },
  { type: 'bmp',        label: 'BMP',          category: 'quimica',  color: '#38bdf8' },
  { type: 'cmp',        label: 'CMP',          category: 'quimica',  color: '#38bdf8' },
  { type: 'renal',      label: 'Renal',        category: 'quimica',  color: '#38bdf8' },
  { type: 'ionogram',   label: 'Ionograma',    category: 'quimica',  color: '#38bdf8' },
  { type: 'lft',        label: 'Hepatograma',  category: 'quimica',  color: '#38bdf8' },
  { type: 'pancreatic', label: 'Pancreatico',  category: 'quimica',  color: '#38bdf8' },
  { type: 'magphos',    label: 'Mg/P/Ca',      category: 'quimica',  color: '#38bdf8' },
  { type: 'albumin',    label: 'Albumina',     category: 'quimica',  color: '#38bdf8' },
  { type: 'tni',        label: 'TnI us',       category: 'especial', color: '#fbbf24' },
  { type: 'bnp',        label: 'NT-proBNP',    category: 'especial', color: '#fbbf24' },
  { type: 'ddimer',     label: 'Dimero-D',     category: 'especial', color: '#fbbf24' },
  { type: 'pct',        label: 'PCT',          category: 'especial', color: '#fbbf24' },
  { type: 'crp',        label: 'PCR',          category: 'especial', color: '#fbbf24' },
  { type: 'cortisol',   label: 'Cortisol',     category: 'especial', color: '#fbbf24' },
];

const CATEGORIES = [
  { key: 'gases',    label: 'GASES', color: '#34d399' },
  { key: 'hema',     label: 'HEMA',  color: '#a78bfa' },
  { key: 'quimica',  label: 'QUIM',  color: '#38bdf8' },
  { key: 'especial', label: 'ESPEC', color: '#fbbf24' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: botón de navegación
// ─────────────────────────────────────────────────────────────────────────────
const NavBtn: React.FC<{
  label:    string;
  onClick:  () => void;
  disabled?: boolean;
  accent?:  boolean;
}> = ({ label, onClick, disabled, accent }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: '4px 10px', borderRadius: 4,
      border:      accent ? '1px solid rgba(56,189,248,0.38)' : '1px solid rgba(255,255,255,0.10)',
      background:  accent ? 'rgba(56,189,248,0.10)'           : 'rgba(0,0,0,0.30)',
      color:       disabled ? '#334155' : accent ? '#38bdf8'  : '#9ca3af',
      fontFamily:  MONO, fontSize: '0.50rem',
      cursor:      disabled ? 'not-allowed' : 'pointer',
      fontWeight:  accent ? 700 : 400,
    }}
  >
    {label}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// LabPanel v3 — componente principal
// ─────────────────────────────────────────────────────────────────────────────
interface Props { isOpen: boolean; onClose: () => void; }

const LabPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeTab,    setActiveTab]    = useState<string>('gases');
  const [viewOffset,   setViewOffset]   = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const labOrders      = usePatientStore(s => s.labOrders);
  const instantResults = usePatientStore(s => s.instantResults);
  const clearLabOrders = usePatientStore(s => s.clearLabOrders);
  const elapsed        = useTimeStore(s => s.simulatedElapsed);

  const completedOrders = useMemo(
    () => labOrders.filter(o => o.result !== null).reverse(),
    [labOrders],
  );
  const pendingOrders = useMemo(
    () => labOrders.filter(o => o.result === null),
    [labOrders],
  );

  // Historial COMPLETO cronológico ascendente (más antiguo → más reciente)
  // Este array es la fuente de verdad para Δ y hemodilución (Decisiones 1 y 2)
  const chronological = useMemo(
    () => [...completedOrders].reverse(),
    [completedOrders],
  );

  const safeOffset = Math.min(viewOffset, Math.max(0, chronological.length - COLS_PER_PAGE));
  const windowCols = chronological.slice(safeOffset, safeOffset + COLS_PER_PAGE);

  // Analitos únicos en la ventana visible
  const allAnalytes = useMemo(() => {
    const set = new Set<string>();
    windowCols.forEach(o => {
      if (o.result) Object.keys(o.result.values).forEach(k => set.add(k));
    });
    return Array.from(set);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowCols]);

  // Lista con separadores de grupo fisiológico (Decisión 3)
  const groupedEntries = useMemo(
    () => buildGroupedEntries(allAnalytes),
    [allAnalytes],
  );

  // Filas con al menos un valor CRÍTICO en la ventana (pre-compute para el borde)
  const criticalRows = useMemo(() => {
    const set = new Set<string>();
    windowCols.forEach(o => {
      if (!o.result) return;
      Object.entries(o.result.flags).forEach(([k, v]) => { if (v === 'C') set.add(k); });
    });
    return set;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowCols]);

  if (!isOpen) return null;

  const handleOrder = (type: string) => LabEngine.getInstance().placeOrder(type);

  const handleClear = () => {
    if (confirmClear) {
      clearLabOrders();
      setViewOffset(0);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  // Contador de filas de dato (para cebra — no cuenta los headers de grupo)
  let dataRowIdx = 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '96vw', maxWidth: 1200, maxHeight: '92vh',
          background: BG, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(56,189,248,0.18)',
          boxShadow: '0 32px 100px rgba(0,0,0,0.88), 0 0 0 1px rgba(56,189,248,0.06)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: '#050b17', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              color: C_TS, fontFamily: MONO, fontWeight: 700,
              fontSize: '0.75rem', letterSpacing: '0.12em',
            }}>
              LIS — LABORATORIO
            </span>
            {instantResults && (
              <span style={{
                background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24', fontFamily: MONO, fontSize: '0.52rem',
                fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              }}>
                ⚡ INSTANTÁNEO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pendingOrders.length > 0 && (
              <span style={{ color: '#fbbf24', fontFamily: MONO, fontSize: '0.55rem' }}>
                {pendingOrders.length} pendiente{pendingOrders.length > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: '#9ca3af', fontFamily: MONO,
                fontSize: '0.58rem', padding: '4px 14px', cursor: 'pointer',
              }}
            >
              CERRAR
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Columna izquierda — menú de órdenes */}
          <div style={{
            width: 192, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: '#060c1a',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, padding: '10px 8px 6px' }}>
              {CATEGORIES.map(cat => {
                const active = activeTab === cat.key;
                return (
                  <button key={cat.key} onClick={() => setActiveTab(cat.key)} style={{
                    padding: '5px 2px', borderRadius: 4, cursor: 'pointer',
                    border:      `1px solid ${active ? cat.color : 'rgba(255,255,255,0.07)'}`,
                    background:  active ? cat.color + '22' : 'rgba(0,0,0,0.35)',
                    color:       active ? cat.color : '#6b7a99',
                    fontFamily:  MONO, fontSize: '0.50rem', fontWeight: 700,
                  }}>
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {LAB_MENU.filter(l => l.category === activeTab).map(item => {
                const pending = pendingOrders.some(o => o.type === item.type);
                return (
                  <button key={item.type} onClick={() => handleOrder(item.type)} style={{
                    width: '100%', marginBottom: 3, padding: '7px 10px',
                    borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                    border:      `1px solid ${pending ? item.color + '66' : 'rgba(255,255,255,0.06)'}`,
                    background:  pending ? item.color + '15' : 'rgba(0,0,0,0.25)',
                    color:       pending ? item.color : '#8899aa',
                    fontFamily:  MONO, fontSize: '0.55rem', fontWeight: pending ? 700 : 400,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{item.label}</span>
                    {pending && <span style={{ fontSize: '0.40rem', opacity: 0.7 }}>EN PROC.</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel derecho — panorámica */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Sub-header con navegación */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: '#050b17', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7a99', fontFamily: MONO, fontSize: '0.54rem' }}>
                  PANORÁMICA — {chronological.length} resultado{chronological.length !== 1 ? 's' : ''}
                </span>
                {chronological.length > COLS_PER_PAGE && (
                  <span style={{ color: C_TS, fontFamily: MONO, fontSize: '0.48rem' }}>
                    ({safeOffset + 1}–{Math.min(safeOffset + COLS_PER_PAGE, chronological.length)} de {chronological.length})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {chronological.length > COLS_PER_PAGE && (
                  <>
                    <NavBtn label="◀ ANT" disabled={safeOffset === 0}
                      onClick={() => setViewOffset(Math.max(0, safeOffset - COLS_PER_PAGE))} />
                    <NavBtn label="SIG ▶" disabled={safeOffset + COLS_PER_PAGE >= chronological.length}
                      onClick={() => setViewOffset(Math.min(chronological.length - COLS_PER_PAGE, safeOffset + COLS_PER_PAGE))} />
                    <NavBtn label="ÚLTIMO" accent
                      onClick={() => setViewOffset(Math.max(0, chronological.length - COLS_PER_PAGE))} />
                  </>
                )}
                {chronological.length > 0 && (
                  <button
                    onClick={handleClear}
                    style={{
                      padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                      border:      `1px solid ${confirmClear ? 'rgba(239,68,68,0.70)' : 'rgba(239,68,68,0.25)'}`,
                      background:  confirmClear ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.07)',
                      color:       confirmClear ? '#ff4444' : '#7f1d1d',
                      fontFamily:  MONO, fontSize: '0.50rem', fontWeight: confirmClear ? 700 : 400,
                    }}
                  >
                    {confirmClear ? '⚠ CONFIRMAR LIMPIAR' : 'LIMPIAR'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Tabla panorámica ──────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              {chronological.length === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: '#334155', fontFamily: MONO,
                  fontSize: '0.62rem', flexDirection: 'column', gap: 12,
                }}>
                  <div>Sin resultados aún</div>
                  <div style={{ fontSize: '0.50rem', opacity: 0.6 }}>
                    Selecciona un análisis en el menú izquierdo
                  </div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO }}>
                  {/* ── CABECERA ── */}
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left', color: '#475569', padding: '9px 12px 7px',
                        borderBottom: '2px solid rgba(56,189,248,0.18)',
                        position: 'sticky', left: 0, background: BG, zIndex: 2,
                        fontWeight: 600, minWidth: 128, fontSize: '0.52rem',
                        letterSpacing: '0.06em',
                      }}>
                        ANALITO
                      </th>
                      <th style={{
                        textAlign: 'left', color: C_REF, padding: '9px 10px 7px',
                        borderBottom: '2px solid rgba(56,189,248,0.18)',
                        minWidth: 72, fontWeight: 400, fontSize: '0.46rem',
                      }}>
                        REF.
                      </th>
                      {windowCols.map((o, colIdx) => {
                        const isLatest = colIdx === windowCols.length - 1;
                        return (
                          <th key={o.id} style={{
                            textAlign: 'center', padding: '7px 12px',
                            borderBottom: `2px solid ${isLatest ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                            borderLeft: '1px solid rgba(255,255,255,0.05)',
                            color: '#9ca3af', fontWeight: 600, minWidth: 108,
                          }}>
                            <div style={{
                              fontSize: '0.58rem', color: C_TS,
                              letterSpacing: '0.04em', fontWeight: 700,
                            }}>
                              {fmtTime(o.orderedAt)}
                              {instantResults && (
                                <span style={{ color: '#fbbf24', marginLeft: 4 }}>⚡</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.44rem', opacity: 0.55, marginTop: 2, fontWeight: 400 }}>
                              {o.label.length > 17 ? o.label.slice(0, 17) + '…' : o.label}
                            </div>
                            {isLatest && (
                              <div style={{
                                fontSize: '0.38rem', color: '#38bdf8',
                                marginTop: 3, fontWeight: 700, opacity: 0.65,
                                letterSpacing: '0.08em',
                              }}>
                                ● ÚLTIMO
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* ── CUERPO CON GRUPOS ── */}
                  <tbody>
                    {groupedEntries.map((entry, entryIdx) => {

                      // ── Separador de grupo fisiológico ──────────────────────
                      if (entry.kind === 'header') {
                        const gc = GROUP_COLOR[entry.group] ?? '#475569';
                        return (
                          <tr key={'hdr_' + entry.group}>
                            <td
                              colSpan={2 + windowCols.length}
                              style={{
                                padding: '8px 12px 4px',
                                background: '#040a14',
                                borderTop: entryIdx === 0
                                  ? 'none'
                                  : '1px solid rgba(255,255,255,0.06)',
                                borderBottom: `1px solid ${gc}28`,
                              }}
                            >
                              <span style={{
                                fontFamily: MONO, fontSize: '0.46rem',
                                fontWeight: 700, letterSpacing: '0.10em',
                                color: gc, opacity: 0.75,
                                textTransform: 'uppercase',
                              }}>
                                — {entry.group} —
                              </span>
                            </td>
                          </tr>
                        );
                      }

                      // ── Fila de dato ─────────────────────────────────────────
                      const { analyte } = entry;
                      const isCrit  = criticalRows.has(analyte);
                      const rowBg   = isCrit
                        ? 'rgba(239,68,68,0.07)'
                        : (dataRowIdx % 2 === 0 ? ROW_EVEN : ROW_ODD);
                      const stickyBg = isCrit
                        ? 'rgba(220,38,38,0.14)'
                        : (dataRowIdx % 2 === 0 ? ROW_EVEN : ROW_ODD);
                      const refVal  = windowCols.find(o => o.result?.refs[analyte])?.result?.refs[analyte] ?? '';
                      const unitVal = windowCols.find(o => o.result?.units[analyte])?.result?.units[analyte] ?? '';
                      dataRowIdx++;

                      return (
                        <tr
                          key={analyte}
                          style={{
                            background: rowBg,
                            borderLeft: isCrit ? '3px solid #ef4444' : '3px solid transparent',
                          }}
                        >
                          {/* Analito — sticky */}
                          <td style={{
                            padding: '6px 12px',
                            color: isCrit ? '#fca5a5' : C_ANALYTE,
                            fontWeight: 600, fontSize: '0.60rem',
                            position: 'sticky', left: 0, zIndex: 1,
                            background: stickyBg,
                            borderRight: '1px solid rgba(255,255,255,0.05)',
                            whiteSpace: 'nowrap',
                          }}>
                            {analyte}
                            {unitVal && (
                              <span style={{
                                color: C_UNIT, fontWeight: 400,
                                marginLeft: 6, fontSize: '0.46rem',
                              }}>
                                {unitVal}
                              </span>
                            )}
                          </td>

                          {/* Referencia */}
                          <td style={{
                            padding: '6px 10px', color: C_REF,
                            fontSize: '0.46rem', fontWeight: 400,
                            verticalAlign: 'middle', whiteSpace: 'nowrap',
                          }}>
                            {refVal}
                          </td>

                          {/* Valores por columna */}
                          {windowCols.map((o) => {
                            if (!o.result) {
                              return (
                                <td key={o.id} style={{
                                  padding: '6px 12px', textAlign: 'center',
                                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                                  color: '#1f2937', fontSize: '0.62rem',
                                }}>—</td>
                              );
                            }

                            const val   = o.result.values[analyte];
                            const flag  = (o.result.flags[analyte] ?? '') as 'C' | 'H' | 'L' | '';

                            // Δ vs. historial completo (Decisión 1)
                            const delta = getDeltaFull(analyte, o, chronological);
                            // Hemodilución cross-study (Decisión 2)
                            const diluc = isHemodilutionFull(analyte, o, chronological);

                            if (val === undefined) {
                              return (
                                <td key={o.id} style={{
                                  padding: '6px 12px', textAlign: 'center',
                                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                                  color: '#1f2937', fontSize: '0.62rem',
                                }}>—</td>
                              );
                            }

                            // ── Tipografía por nivel de urgencia (Pilar 1 + 3) ──
                            const valColor =
                              flag === 'C' ? C_CRITICAL :
                              flag === 'H' ? C_HIGH     :
                              flag === 'L' ? C_LOW      :
                              C_NORMAL;
                            const valSize   = flag === 'C' ? '0.80rem' : flag ? '0.72rem' : '0.65rem';
                            const valWeight = flag === 'C' ? 900        : flag ? 700        : 500;

                            return (
                              <td key={o.id} style={{
                                padding: '5px 12px', textAlign: 'center',
                                borderLeft: '1px solid rgba(255,255,255,0.04)',
                                verticalAlign: 'middle',
                                background: flag === 'C'
                                  ? 'rgba(239,68,68,0.11)'
                                  : 'transparent',
                              }}>
                                {/* Valor principal */}
                                <div style={{
                                  color: valColor, fontSize: valSize,
                                  fontWeight: valWeight, lineHeight: 1.15,
                                  whiteSpace: 'nowrap',
                                }}>
                                  {typeof val === 'number' ? val.toFixed(2) : val}

                                  {/* Badge CRÍT */}
                                  {flag === 'C' && (
                                    <span style={{
                                      marginLeft: 4, fontSize: '0.36rem',
                                      background: '#dc2626', color: '#fff',
                                      padding: '1px 4px', borderRadius: 3,
                                      verticalAlign: 'middle', fontWeight: 700,
                                      letterSpacing: '0.05em',
                                    }}>
                                      CRÍT
                                    </span>
                                  )}

                                  {/* Superscript H / L */}
                                  {(flag === 'H' || flag === 'L') && (
                                    <span style={{
                                      fontSize: '0.40rem', marginLeft: 2,
                                      opacity: 0.80, fontWeight: 700,
                                    }}>
                                      {flag}
                                    </span>
                                  )}
                                </div>

                                {/* ── Δ-tendencia vs historial completo (Pilar 4) ── */}
                                {delta !== null && (
                                  <div style={{
                                    fontSize: '0.43rem',
                                    color: deltaColor(analyte, delta),
                                    marginTop: 3, lineHeight: 1,
                                    fontWeight: 600, opacity: 0.88,
                                  }}>
                                    {delta > 0 ? '▲' : '▼'}{' '}
                                    {Math.abs(delta) < 10
                                      ? Math.abs(delta).toFixed(1)
                                      : Math.round(Math.abs(delta))}
                                  </div>
                                )}

                                {/* ── Hemodilución dinámica cross-study (Pilar 5) ── */}
                                {diluc && (
                                  <div style={{
                                    fontSize: '0.40rem', color: '#7dd3fc',
                                    marginTop: 3, lineHeight: 1,
                                    fontWeight: 600, opacity: 0.85,
                                  }}>
                                    💧 DILUC.
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Cola de pendientes ──────────────────────────────────────────── */}
            {pendingOrders.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '8px 16px',
                background: '#050b17', flexShrink: 0,
              }}>
                <div style={{
                  color: '#6b7a99', fontFamily: MONO,
                  fontSize: '0.48rem', marginBottom: 6, letterSpacing: '0.06em',
                }}>
                  EN PROCESO
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {pendingOrders.map(o => {
                    const remaining = Math.max(0, o.readyAt - elapsed);
                    const mins      = Math.floor(remaining / 60);
                    return (
                      <div key={o.id} style={{
                        background: 'rgba(251,191,36,0.08)',
                        border: '1px solid rgba(251,191,36,0.22)',
                        borderRadius: 4, padding: '3px 9px',
                        color: '#fbbf24', fontFamily: MONO, fontSize: '0.48rem',
                      }}>
                        {o.label} — {instantResults ? '⚡ INST' : (mins > 0 ? `${mins}min` : 'pronto')}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabPanel;