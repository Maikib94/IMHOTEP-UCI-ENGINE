// src/components/InfusionRateDisplay.tsx
//
// Componente compartido para mostrar dosis de infusión en modo médico / cc/h / dual.
// Reactivo al peso del paciente y al modo global (useUIStore.dripUnitMode).

import React from 'react';
import { useUIStore } from '../store/useUIStore';
import { usePatientStore } from '../store/usePatientStore';
import { doseToCcH, type DrugUnit } from '../utils/dilutionTable';
import type { DrugId } from '../store/usePharmacologyStore';

const MONO = "[font-family:'JetBrains_Mono',monospace]";

interface InfusionRateDisplayProps {
  drug:      DrugId;
  rate:      number;
  unit:      string;    // DrogUnit string
  colorClass?: string;
  /** Si true, muestra versión compacta (solo 1 línea primaria) */
  compact?:  boolean;
}

export const InfusionRateDisplay: React.FC<InfusionRateDisplayProps> = ({
  drug, rate, unit, colorClass = 'text-cyan-300', compact = false,
}) => {
  const mode   = useUIStore(s => s.dripUnitMode);
  const weight = usePatientStore(s => s.profile?.weightKg ?? (s.vitals.weight ?? 70));
  const ccH    = doseToCcH(drug, rate, unit as DrugUnit, weight);
  const hasCcH = ccH > 0;

  if (mode === 'medical' || !hasCcH) {
    return (
      <div>
        <span className={`text-sm font-black leading-none ${MONO} ${colorClass}`}>
          {rate.toFixed(2)}
          <span className="text-[0.45rem] font-normal text-slate-500 ml-1">{unit}</span>
        </span>
        {!compact && hasCcH && (
          <div className="text-[0.42rem] text-slate-500 font-mono mt-0.5">
            ≈ {ccH.toFixed(1)} cc/h
          </div>
        )}
      </div>
    );
  }

  if (mode === 'cc_h') {
    return (
      <div>
        <span className={`text-sm font-black leading-none ${MONO} ${colorClass}`}>
          {ccH.toFixed(1)}
          <span className="text-[0.45rem] font-normal text-slate-500 ml-1">cc/h</span>
        </span>
        {!compact && (
          <div className="text-[0.42rem] text-slate-500 font-mono mt-0.5">
            ≈ {rate.toFixed(2)} {unit}
          </div>
        )}
      </div>
    );
  }

  // dual
  return (
    <div className="flex flex-col">
      <span className={`text-sm font-black leading-none ${MONO} ${colorClass}`}>
        {rate.toFixed(2)}
        <span className="text-[0.45rem] font-normal text-slate-500 ml-1">{unit}</span>
      </span>
      {!compact && (
        <span className={`text-xs font-bold leading-none ${MONO} text-slate-300 mt-0.5`}>
          {ccH.toFixed(1)}
          <span className="text-[0.4rem] font-normal text-slate-500 ml-1">cc/h</span>
        </span>
      )}
    </div>
  );
};
