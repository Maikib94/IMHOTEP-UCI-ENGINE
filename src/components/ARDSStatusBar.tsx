// src/components/ARDSStatusBar.tsx
// Sugerencias A (ΔP), C (S/F ratio), D (Vt alerta), E (Potencia Mecanica)
// Campos corregidos: vent.vt (no tidalVolume), fio2 ya es decimal 0.21-1.0
//
// Formulas validadas:
//   ΔP = Vt / Compliance                           [Amato NEJM 2015]
//   Pplat = PEEP + ΔP
//   MP = 0.098 × FR × Vt(L) × (Ppico − ΔP/2)     [Grieco Crit Care 2026]
//   S/F = SpO2 / FiO2                              [Global ARDS Def. 2024]
//
// Umbrales:
//   ΔP  : verde <14, amarillo 14-18, rojo >18 cmH2O
//   MP  : verde <17, amarillo 17-25, rojo >25 J/min
//   Vt  : verde ≤420 mL (6 mL/kg × 70 kg), rojo >420
//   S/F : verde >235, amarillo 148-235, rojo <148

import React from 'react';
import { usePatientStore }   from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';

const MONO            = "'JetBrains Mono', 'Courier New', monospace";
const COMPLIANCE_BASE = 50.0; // mL/cmH2O pulmon sano

function zoneColor(value: number, green: number, yellow: number, highIsBad: boolean): string {
  if (highIsBad) {
    if (value <= green)  return '#34d399';
    if (value <= yellow) return '#fbbf24';
    return '#ef4444';
  } else {
    if (value >= green)  return '#34d399';
    if (value >= yellow) return '#fbbf24';
    return '#ef4444';
  }
}

function berlinLabel(sf: number): { label: string; color: string } {
  if (sf > 235) return { label: 'LEVE',     color: '#a3e635' };
  if (sf > 148) return { label: 'MODERADO', color: '#fbbf24' };
  return          { label: 'SEVERO',        color: '#ef4444' };
}

function MetricBox({ label, value, color, sublabel }: {
  label: string; value: string; color: string; sublabel?: string;
}) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${color}44`,
      borderRadius: 6,
      padding: '5px 10px',
      minWidth: 88,
      textAlign: 'center',
    }}>
      <div style={{ color: '#6b7a99', fontSize: '0.5rem', fontFamily: MONO, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ color, fontSize: '0.88rem', fontWeight: 700, fontFamily: MONO }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ color, fontSize: '0.42rem', fontFamily: MONO, marginTop: 1, opacity: 0.8 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

export const ARDSStatusBar: React.FC = () => {
  const vitals     = usePatientStore((s) => s.vitals);
  const ventilator = usePatientStore((s) => s.ventilator);
  const modifiers  = usePathologyStore((s) => s.modifiers);
  const ards       = usePathologyStore((s) => s.ards);

  // Solo mostrar cuando hay lesion pulmonar clinicamente significativa
  const showBar = ards.isActive || modifiers.lungShuntFraction > 0.15;
  if (!showBar) return null;

  // ─── Campos correctos del store ───────────────────────────────────────────
  // ventilator.vt   → mL (ej: 500)
  // ventilator.fio2 → decimal 0.21-1.0 (MonitorApp muestra Math.round(fio2*100))
  // ventilator.peep → cmH2O
  const vt      = ventilator.vt      ?? 500;
  const peep    = ventilator.peep    ?? 5;
  const fio2Dec = ventilator.fio2    ?? 0.40;   // ya es decimal
  const spo2    = (vitals as any).spo2 ?? 97;
  const fr      = (vitals as any).respiratoryRate ?? 14;

  // ─── Calculos fisiologicos ─────────────────────────────────────────────────
  const compliance = COMPLIANCE_BASE * modifiers.complianceMultiplier;

  // ΔP = Vt / C  [Amato NEJM 2015 — mejor predictor mortalidad SDRA]
  const deltaP = compliance > 0 ? vt / compliance : 0;
  const pplat  = peep + deltaP;

  // Ppico ≈ Pplat + resistencia normal intubado (~5 cmH2O)
  const ppico  = pplat + 5;

  // Potencia Mecanica [Grieco Critical Care 2026; Gattinoni ICM 2016]
  // MP = 0.098 × FR × Vt(L) × [Ppico − ΔP/2]
  const mp = 0.098 * fr * (vt / 1000) * (ppico - deltaP / 2);

  // Ratio S/F [Global ARDS Definition 2024]
  // S/F < 148 ≈ P/F < 100 (Berlin severo)
  const sf = fio2Dec > 0 ? Math.round(spo2 / fio2Dec) : 0;

  // Vt protector: 6 mL/kg PBW para 70 kg = 420 mL [ARDS Network 2000]
  const vtPerKg = (vt / 70).toFixed(1);
  const vtAlert = vt > 420;

  const deltaPColor = zoneColor(deltaP, 14, 18, true);
  const mpColor     = zoneColor(mp, 17, 25, true);
  const vtColor     = vtAlert ? '#ef4444' : '#34d399';
  const { label: sfLabel, color: sfColor } = berlinLabel(sf);

  return (
    <div style={{
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 12px',
      background: 'rgba(0,0,0,0.45)',
      borderTop:    '1px solid rgba(56,189,248,0.12)',
      borderBottom: '1px solid rgba(56,189,248,0.12)',
      flexWrap: 'wrap',
    }}>

      {/* Etiqueta sección */}
      <div style={{
        color: '#38bdf8', fontSize: '0.48rem', fontWeight: 700,
        fontFamily: MONO, letterSpacing: '0.1em', whiteSpace: 'nowrap',
      }}>
        SDRA
      </div>

      {/* ΔP — Driving Pressure */}
      <MetricBox
        label="ΔP (cmH₂O)"
        value={deltaP.toFixed(1)}
        color={deltaPColor}
        sublabel={deltaP > 18 ? '⚠ RIESGO VILI' : deltaP > 14 ? '> 14 CUIDADO' : '< 14 OK'}
      />

      {/* Pplat */}
      <MetricBox
        label="Pplat (cmH₂O)"
        value={pplat.toFixed(1)}
        color={zoneColor(pplat, 25, 30, true)}
        sublabel={pplat > 30 ? '⚠ > 30 VILI' : 'OK'}
      />

      {/* Potencia Mecánica */}
      <MetricBox
        label="Pot.Mec (J/min)"
        value={mp.toFixed(1)}
        color={mpColor}
        sublabel={mp > 25 ? '⚠ ALTO' : mp > 17 ? 'CUIDADO' : 'OK'}
      />

      {/* Vt / kg — Protector */}
      <MetricBox
        label="Vt/kg (mL/kg)"
        value={vtPerKg}
        color={vtColor}
        sublabel={vtAlert ? `⚠ ${vt}mL > 420mL` : `${vt}mL OK`}
      />

      {/* Ratio S/F */}
      <MetricBox
        label="Ratio S/F"
        value={String(sf)}
        color={sfColor}
        sublabel={sfLabel}
      />

      {/* Compliance */}
      <MetricBox
        label="Compliance"
        value={`${compliance.toFixed(0)} mL/cmH₂O`}
        color={zoneColor(compliance, 35, 20, false)}
        sublabel={compliance < 20 ? '⚠ SDRA SEVERO' : compliance < 35 ? 'REDUCIDA' : 'OK'}
      />

      {/* Indicador PRONO */}
      {ards.proneActive && (
        <div style={{
          background: 'rgba(163,230,53,0.12)',
          border: '1px solid rgba(163,230,53,0.4)',
          borderRadius: 6, padding: '5px 10px', textAlign: 'center',
        }}>
          <div style={{ color: '#a3e635', fontSize: '0.58rem', fontWeight: 700, fontFamily: MONO }}>
            PRONO ✓
          </div>
          <div style={{ color: '#a3e635', fontSize: '0.4rem', fontFamily: MONO, opacity: 0.7 }}>
            ACTIVO
          </div>
        </div>
      )}
    </div>
  );
};

export default ARDSStatusBar;