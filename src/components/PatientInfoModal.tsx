// src/components/PatientInfoModal.tsx
// Panel de información del paciente — biometría, fragilidad, antecedentes,
// medicación domiciliaria, resumen clínico y escenario activo.
/* eslint-disable react/forbid-dom-props */

import React, { useState } from 'react';
import { usePatientStore } from '../store/usePatientStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { COMORBIDITY_CATALOG } from '../scenarios/PatientFactory';

const C = {
  bg:     '#060a12',
  panel:  '#0d1224',
  card:   '#111827',
  border: 'rgba(255,255,255,0.06)',
  dim:    '#4a566e',
  mid:    '#7a90b0',
  bright: '#e2e8f0',
  cyan:   '#22d3ee',
  violet: '#a78bfa',
  lime:   '#a3e635',
};

const CATEGORY_ICON: Record<string, string> = {
  cv:       '♥',
  resp:     '🫁',
  endocrine:'⚗',
  renal:    '💧',
  hepatic:  '🔺',
  other:    '⚕',
};

function SectionHeader({ label, color = C.cyan }: { label: string; color?: string }) {
  return (
    <div style={{
      fontSize: '0.5rem', fontWeight: 900, letterSpacing: '0.18em',
      color, textTransform: 'uppercase', borderBottom: `1px solid ${color}22`,
      paddingBottom: 4, marginBottom: 10,
    }}>
      {label}
    </div>
  );
}

function StatCell({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <div style={{ background: C.card, borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: '0.42rem', color: C.dim, letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: C.bright, fontFamily: 'monospace' }}>
        {value} <span style={{ fontSize: '0.5rem', color: C.mid }}>{unit}</span>
      </div>
    </div>
  );
}

// CFS visual (1-9 scale with highlighted marker)
function CFSBar({ cfs }: { cfs: number }) {
  const labels: Record<number, { label: string; color: string }> = {
    1: { label: 'Muy activo', color: '#34d399' },
    2: { label: 'Activo', color: '#34d399' },
    3: { label: 'Manejando bien', color: '#a3e635' },
    4: { label: 'Vulnerable', color: '#fbbf24' },
    5: { label: 'Levemente frágil', color: '#fbbf24' },
    6: { label: 'Moderadamente frágil', color: '#f97316' },
    7: { label: 'Severamente frágil', color: '#f97316' },
    8: { label: 'Muy severo', color: '#ef4444' },
    9: { label: 'Terminal', color: '#ef4444' },
  };
  const info = labels[cfs] ?? { label: '—', color: C.dim };
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <div
            key={n}
            style={{
              flex: 1, height: 14, borderRadius: 3,
              background: n <= cfs ? info.color : C.card,
              border: `1px solid ${n === cfs ? info.color : C.border}`,
              opacity: n <= cfs ? (n === cfs ? 1 : 0.45) : 0.3,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.4rem', color: C.mid }}>
        <span>1 Muy activo</span>
        <span style={{ color: info.color, fontWeight: 700 }}>CFS {cfs} — {info.label}</span>
        <span>9 Terminal</span>
      </div>
    </div>
  );
}

export function PatientInfoModal() {
  const profile     = usePatientStore(s => s.profile);
  const vitals      = usePatientStore(s => s.vitals);
  const scenario    = useScenarioStore(s => s.activeScenario);
  const difficulty  = useScenarioStore(s => s.difficulty);
  const ards        = usePathologyStore(s => s.ards);
  const sepsis      = usePathologyStore(s => s.sepsis);
  const [open, setOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        title="Info del Paciente"
        onClick={() => setOpen(true)}
        style={{
          background: profile ? 'rgba(167,139,250,0.15)' : '#0d1224',
          border: `1px solid ${profile ? C.violet : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 5, color: profile ? C.violet : C.dim,
          fontWeight: 900, fontSize: '0.7rem',
          padding: '3px 7px', cursor: 'pointer',
          letterSpacing: '0.05em', lineHeight: 1,
          transition: 'all 0.15s',
        }}
      >
        {profile ? `👤 ${profile.name.split(' ')[0]}` : '👤'}
      </button>
    );
  }

  const p = profile;
  const frailtyContinuous = p?.frailtyContinuous ?? 0;
  const reservaPct = Math.round((1 - frailtyContinuous) * 100);
  const reservaColor = reservaPct > 70 ? '#34d399' : reservaPct > 40 ? '#fbbf24' : '#ef4444';

  const exportHandover = () => {
    if (!p) return;
    // Obtener labels legibles de comorbilidades (corrige el bug con 'comorbidities' field)
    const comorbLabels = (p.comorbidityIds ?? [])
      .map(id => COMORBIDITY_CATALOG[id]?.label ?? id)
      .join(', ') || '—';
    const lines = [
      `══ FICHA CLÍNICA — ${p.name} ══`,
      `Edad: ${p.age}a · Sexo: ${p.sex === 'M' ? 'Hombre' : 'Mujer'} · Talla: ${p.heightCm} cm · Peso: ${p.weightKg} kg`,
      `IMC: ${p.bmi.toFixed(1)} · PBW: ${p.pbwKg.toFixed(1)} kg · BSA: ${p.bsaMosteller.toFixed(2)} m²`,
      `CFS: ${p.cfsScore}/9 · Fragilidad: ${Math.round(frailtyContinuous * 100)}% · Reserva: ${reservaPct}%`,
      ``,
      `━ ANTECEDENTES ━`,
      comorbLabels,
      ``,
      `━ MEDICACIÓN HABITUAL ━`,
      ...((p.homeMeds ?? []).length > 0
        ? (p.homeMeds ?? []).map(m => `  · ${m.drug} ${m.dose} ${m.unit} ${m.freq}${m.indication ? ` (${m.indication})` : ''}`)
        : ['Sin medicación domiciliaria.']),
      ``,
      `━ CASO ACTUAL ━`,
      `Escenario: ${scenario?.name ?? '—'} · Dificultad: ${difficulty}/10`,
      `Sepsis: ${sepsis.isActive ? `ACTIVA (${Math.round(sepsis.severity * 100)}%)` : 'No activa'}`,
      `SDRA: ${ards.diagnosis !== 'none' ? `${ards.diagnosis.toUpperCase()} (lesión ${Math.round(ards.lungInjury * 100)}%)` : 'No activo'}`,
      ``,
      `━ SIGNOS VITALES ━`,
      `FC ${Math.round(vitals.heartRate)} · TA ${Math.round(vitals.systolicBP)}/${Math.round(vitals.diastolicBP)} (${Math.round(vitals.meanArterialPressure)}) mmHg`,
      `SpO₂ ${Math.round(vitals.spo2)}% · FR ${Math.round(vitals.respiratoryRate)} rpm · Tº ${vitals.temperature.toFixed(1)}°C`,
      `Lactato ${vitals.lactate.toFixed(1)} mmol/L · pH ${vitals.pH.toFixed(2)} · PaO₂ ${Math.round(vitals.paO2)} · PaCO₂ ${Math.round(vitals.paCO2)}`,
      ``,
      `Resumen: ${p.clinicalSummary}`,
      `Generado: ${new Date().toLocaleString('es-ES')}`,
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text)
      .then(() => {
        setExportMsg('✓ Ficha copiada al portapapeles');
        setTimeout(() => setExportMsg(null), 3000);
      })
      .catch(() => {
        // Fallback: descarga como .txt
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `imhotep-${(p.name ?? 'paciente').replace(/\s+/g, '_')}-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg('✓ Ficha descargada como .txt');
        setTimeout(() => setExportMsg(null), 3000);
      });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 16, width: '680px', maxWidth: '96vw', maxHeight: '88vh',
        overflowY: 'auto', padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: C.bright }}>
              {p?.name ?? 'Sin perfil asignado'}
            </div>
            <div style={{ fontSize: '0.5rem', color: C.dim, marginTop: 2 }}>
              {p ? `${p.age} años · ${p.sex === 'M' ? 'Hombre' : 'Mujer'} · CFS ${p.cfsScore}/9` : 'Generando perfil...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {p && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <button type="button" onClick={exportHandover}
                  style={{ fontSize: '0.42rem', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: C.card, border: `1px solid ${C.border}`, color: C.mid, fontWeight: 700 }}>
                  EXPORTAR FICHA
                </button>
                {exportMsg && (
                  <div style={{ fontSize: '0.38rem', color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 4, padding: '2px 6px' }}>
                    {exportMsg}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={() => setOpen(false)}
              style={{ fontSize: '0.7rem', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: C.card, border: `1px solid ${C.border}`, color: C.mid, fontWeight: 900 }}>
              ✕
            </button>
          </div>
        </div>

        {!p ? (
          <div style={{ color: C.dim, textAlign: 'center', padding: '40px 0', fontSize: '0.55rem' }}>
            No hay perfil de paciente asignado. Selecciona un paciente en el selector de escenarios.
          </div>
        ) : (
          <>
            {/* ── Sección 1: Biometría ── */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader label="Biometría" color={C.cyan} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <StatCell label="Edad" value={`${p.age}a`} />
                <StatCell label="Talla" value={p.heightCm} unit="cm" />
                <StatCell label="Peso" value={p.weightKg} unit="kg" />
                <StatCell label="IMC" value={p.bmi} unit="kg/m²" />
                <StatCell label="PBW" value={p.pbwKg} unit="kg" />
                <StatCell label="BSA" value={p.bsaMosteller} unit="m²" />
              </div>
            </div>

            {/* ── Sección 2: Fragilidad ── */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader label="Reserva Fisiológica" color={C.violet} />
              <CFSBar cfs={p.cfsScore} />
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.42rem', color: C.dim }}>Reserva fisiológica</span>
                  <span style={{ fontSize: '0.5rem', fontWeight: 700, color: reservaColor }}>{reservaPct}%</span>
                </div>
                <div style={{ height: 8, background: C.card, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${reservaPct}%`, background: `linear-gradient(90deg, ${reservaColor}88, ${reservaColor})`, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>

              {/* Antecedentes */}
              {(p.comorbidityIds ?? []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.42rem', color: C.dim, letterSpacing: '0.1em', marginBottom: 6 }}>ANTECEDENTES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.comorbidityIds!.map(id => {
                      const def = COMORBIDITY_CATALOG[id];
                      if (!def) return null;
                      return (
                        <div key={id} style={{
                          fontSize: '0.38rem', padding: '3px 7px', borderRadius: 12,
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                          color: C.mid, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span>{CATEGORY_ICON[def.category] ?? '·'}</span>
                          <span>{def.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sección 3: Medicación habitual ── */}
            {(p.homeMeds ?? []).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SectionHeader label="Medicación Habitual" color="#fbbf24" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.homeMeds!.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: C.card, borderRadius: 6, padding: '6px 10px',
                      border: `1px solid ${C.border}`, fontSize: '0.42rem',
                    }}>
                      <span style={{ color: C.bright, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.drug}</span>
                      <span style={{ color: C.mid }}>{m.dose} {m.unit} · {m.freq}</span>
                      {m.indication && <span style={{ color: C.dim }}>{m.indication}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Sección 4: Resumen clínico ── */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader label="Resumen Clínico" color={C.lime} />
              <div style={{
                background: C.card, borderRadius: 8, padding: '12px 14px',
                border: `1px solid ${C.border}`, fontSize: '0.45rem', color: C.mid, lineHeight: 1.7,
              }}>
                {p.clinicalSummary}
              </div>
            </div>

            {/* ── Sección 5: Caso activo ── */}
            <div>
              <SectionHeader label="Caso Activo" color={C.cyan} />
              <div style={{ background: C.card, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                {scenario ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.42rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.dim }}>Escenario</span>
                      <span style={{ color: C.bright, fontWeight: 700 }}>{scenario.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.dim }}>Dificultad</span>
                      <span style={{ color: '#fbbf24', fontWeight: 700 }}>{difficulty}/10</span>
                    </div>
                    {ards.hasLungInjury && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.dim }}>SDRA</span>
                        <span style={{ color: ards.diagnosis !== 'none' ? '#ef4444' : C.dim, fontWeight: 700 }}>
                          {ards.diagnosis !== 'none' ? `${ards.diagnosis.toUpperCase()} (P/F ${ards.pfRatio})` : 'Sin diagnóstico aún'}
                        </span>
                      </div>
                    )}
                    {sepsis.isActive && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.dim }}>Sepsis</span>
                        <span style={{ color: '#f97316', fontWeight: 700 }}>{Math.round(sepsis.severity * 100)}% severidad</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.dim }}>Vitales actuales (HR/PAM/SpO₂)</span>
                      <span style={{ color: C.mid, fontFamily: 'monospace' }}>
                        {Math.round(vitals.heartRate)} lpm / {Math.round(vitals.meanArterialPressure)} mmHg / {vitals.spo2}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: C.dim, fontSize: '0.42rem' }}>Sin escenario activo</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PatientInfoModal;
