// src/components/ARDSStatusBar.tsx
// Sugerencias A (ΔP), C (S/F ratio), D (Vt alerta), E (Potencia Mecanica)
// Campos corregidos: vent.vt (no tidalVolume), fio2 ya es decimal 0.21-1.0
//
// Formulas validadas:
//   ΔP = Vt / Compliance                           [Amato NEJM 2015]
//   Pplat = PEEP + ΔP
//   MP = 0.098 × FR × Vt(L) × (Ppico − ΔP/2)     [Grieco Crit Care 2026]
//
// Umbrales:
//   ΔP  : verde <14, amarillo 14-18, rojo >18 cmH2O
//   MP  : verde <17, amarillo 17-25, rojo >25 J/min
//   Vt  : verde ≤420 mL (6 mL/kg × 70 kg), rojo >420
//   S/F : verde >235, amarillo 148-235, rojo <148

import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
const COMPLIANCE_BASE = 50.0; // mL/cmH2O pulmon sano

function zoneColor(value: number, green: number, yellow: number, highIsBad: boolean): string {
  if (highIsBad) {
    if (value <= green) return '#34d399';
    if (value <= yellow) return '#fbbf24';
    return '#ef4444';
  } else {
    if (value >= green) return '#34d399';
    if (value >= yellow) return '#fbbf24';
    return '#ef4444';
  }
}

interface ArdsClassification {
  label: 'LEVE' | 'MODERADO' | 'SEVERO' | 'SIN SDRA';
  color: string;
}

// Clasificación de severidad del SDRA según el Consenso de Berlín (usando P/F)
// y la modificación de Kigali (usando S/F como sustituto).
// Ref: ARDS Definition Task Force. JAMA 2012;311(20):2122-2122.
// Ref: Brown SM, et al. Am J Respir Crit Care Med. 2016;193(12):1373-1380. (Kigali)
function getARDSClassification(pfRatio: number, sfRatio: number): ArdsClassification {
  // Usar P/F (Berlin) si está disponible, si no, usar S/F (Kigali)
  if (pfRatio > 0) {
    if (pfRatio > 300) return { label: 'SIN SDRA', color: '#34d399' };
    if (pfRatio > 200) return { label: 'LEVE', color: '#a3e635' };
    if (pfRatio > 100) return { label: 'MODERADO', color: '#fbbf24' };
    return { label: 'SEVERO', color: '#ef4444' };
  } else {
    if (sfRatio > 315) return { label: 'SIN SDRA', color: '#34d399' };
    if (sfRatio > 235) return { label: 'LEVE', color: '#a3e635' };
    if (sfRatio > 148) return { label: 'MODERADO', color: '#fbbf24' };
    return { label: 'SEVERO', color: '#ef4444' };
  }
}

function MetricBox({ label, value, color, sublabel }: {
  label: string; value: string; color: string; sublabel?: string;
}) {
  return (
    <div className="bg-black/35 rounded-md px-2.5 py-1.5 min-w-[88px] text-center" style={{ border: `1px solid ${color}44` }}>
      <div className="text-slate-500 text-[0.5rem] font-mono mb-0.5">
        {label}
      </div>
      <div className="text-[0.88rem] font-bold font-mono" style={{ color }}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[0.42rem] font-mono mt-0.5 opacity-80" style={{ color }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

export const ARDSStatusBar: React.FC = () => {
  const { vitals, ventilator } = usePatientStore(useShallow(s => ({
    vitals: s.vitals,
    ventilator: s.ventilator,
  })));
  const { modifiers, ards } = usePathologyStore(useShallow(s => ({
    modifiers: s.modifiers,
    ards: s.ards,
  })));

  // Solo mostrar cuando hay lesion pulmonar clinicamente significativa
  const showBar = ards.isActive || modifiers.lungShuntFraction > 0.15;
  if (!showBar) return null;

  const derivedValues = useMemo(() => {
    // SOLUCIÓN 3: Evitar `as any` repetido creando una variable con tipo explícito.
    const respVitals = vitals as {
      spo2?: number; respiratoryRate?: number; paO2?: number; pplat?: number; ppico?: number; deltaP?: number; mechanicalPower?: number;
    };

    const vt = ventilator.vt ?? 500;
    const peep = ventilator.peep ?? 5;
    const fio2Dec = ventilator.fio2 ?? 0.40;
    const spo2 = respVitals.spo2 ?? 97;
    const fr = respVitals.respiratoryRate ?? 14;
    const pao2 = respVitals.paO2 ?? -1;

    // ─── Calculos fisiologicos ─────────────────────────────────────────────────
    const compliance = COMPLIANCE_BASE * modifiers.complianceMultiplier;

    // SOLUCIÓN 2: Usar valores del engine como fuente de verdad, con fallback.
    const pplat = respVitals.pplat ?? (peep + (compliance > 0 ? vt / compliance : 0));
    const deltaP = respVitals.deltaP ?? (pplat - peep);
    const ppico = respVitals.ppico ?? (pplat + 5);
    const mp = respVitals.mechanicalPower ?? (0.098 * fr * (vt / 1000) * (ppico - deltaP / 2));

    const pfRatio = (fio2Dec > 0 && pao2 > 0) ? Math.round(pao2 / fio2Dec) : 0;
    const sfRatio = (fio2Dec > 0) ? Math.round(spo2 / fio2Dec) : 0;
    const vtPerKg = (vt / 70).toFixed(1);
    const vtAlert = vt > 420;

    const deltaPColor = zoneColor(deltaP, 14, 18, true);
    const mpColor = zoneColor(mp, 17, 25, true);
    const vtColor = vtAlert ? '#ef4444' : '#34d399';
    const { label: ardsLabel, color: ardsColor } = getARDSClassification(pfRatio, sfRatio);

    return {
      vt, compliance, deltaP, pplat, mp, pfRatio, sfRatio, vtPerKg, vtAlert,
      deltaPColor, mpColor, vtColor, ardsLabel, ardsColor,
    };
    // SOLUCIÓN 1: Dependencias granulares para optimizar re-cálculos y corregir bug
    // (no se actualizaba al pronar/supinar).
  }, [
    ventilator.vt,
    ventilator.peep,
    ventilator.fio2,
    vitals.spo2,
    vitals.respiratoryRate,
    vitals.paO2,
    vitals.pplat,
    vitals.ppico,
    vitals.deltaP,
    vitals.mechanicalPower,
    modifiers.complianceMultiplier,
    ards.proneActive,
  ]);

  const { vt, compliance, deltaP, pplat, mp, pfRatio, sfRatio, vtPerKg, vtAlert, deltaPColor, mpColor, vtColor, ardsLabel, ardsColor } = derivedValues;

  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-black/45 border-y border-cyan-500/10 flex-wrap">

      {/* Etiqueta sección */}
      <div className="text-cyan-400 text-[0.48rem] font-bold font-mono tracking-[0.1em] whitespace-nowrap">
        SDRA: BERLIN / KIGALI
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

      {/* Ratio P/F (Berlin) */}
      {derivedValues.pfRatio > 0 && (
        <MetricBox
          label="Ratio P/F"
          value={String(pfRatio)}
          color={ardsColor}
          sublabel={ardsLabel}
        />
      )}

      {/* Ratio S/F (Kigali) */}
      <MetricBox
        label="Ratio S/F"
        value={String(sfRatio)}
        color={ardsColor}
        sublabel={pfRatio > 0 ? `(Kigali: ${ardsLabel})` : ardsLabel}
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
        <div className="bg-lime-500/10 border border-lime-500/40 rounded-md px-2.5 py-1.5 text-center">
          <div className="text-lime-400 text-[0.58rem] font-bold font-mono">
            PRONO ✓
          </div>
          <div className="text-lime-400 text-[0.4rem] font-mono opacity-70">
            ACTIVO
          </div>
        </div>
      )}
    </div>
  );
};

export default ARDSStatusBar;