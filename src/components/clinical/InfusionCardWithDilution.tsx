// src/components/clinical/InfusionCardWithDilution.tsx
//
// Card universal de infusión IV con modo dilución.
// Muestra dosis médica (mcg/kg/min, mg/h…) Y cc/h calculados con useDilutionStore.
// Botón ⚙ abre DilutionConfigModal para personalizar dilución.

import React, { useState, memo } from 'react';
import { usePharmacologyStore, type DrugId, DRUG_CATALOG } from '../../store/usePharmacologyStore';
import { DRUG_MAX_DOSES }    from '../../core/PharmacologyEngine';
import { useUIStore }        from '../../store/useUIStore';
import { useDilutionStore }  from '../../store/useDilutionStore';
import { usePatientStore }   from '../../store/usePatientStore';
import { DilutionConfigModal } from './DilutionConfigModal';
import type { ColorTheme }   from './drugControls';
import { THEME_COLORS }      from './drugControls';

interface Props {
  drugId:           DrugId;
  rate:             number;
  onRateChange:     (r: number) => void;
  step?:            number;
  colorTheme?:      ColorTheme;
  decimals?:        number;
  showDilutionTrigger?: boolean;
  /** Called when user clicks the dilution config icon */
  onOpenDilutionConfig?: () => void;
  /** Shown above value */
  label?:           string;
}

const InfusionCardWithDilution = memo(function InfusionCardWithDilution({
  drugId, rate, onRateChange,
  step, colorTheme = 'cyan', decimals = 2,
  showDilutionTrigger = true,
  label,
}: Props) {
  const [showDilutionModal, setShowDilutionModal] = useState(false);

  const dripUnitMode = useUIStore(s => s.dripUnitMode);
  const weightKg     = usePatientStore(s => s.profile?.weightKg ?? 70);
  const computeCcH   = useDilutionStore(s => s.computeCcH);
  const getPreset    = useDilutionStore(s => s.getPreset);

  const drugEntry  = DRUG_CATALOG[drugId];
  const maxRate    = DRUG_MAX_DOSES[drugId] ?? 100;
  const stepSize   = step ?? maxRate * 0.05;
  const inputUnit  = drugEntry?.inputUnit ?? 'mg/h';
  const displayName = label ?? drugEntry?.shortName ?? drugId;

  const ccH    = computeCcH(drugId, rate, inputUnit as Parameters<typeof computeCcH>[2], weightKg);
  const preset = getPreset(drugId);

  const theme  = THEME_COLORS[colorTheme];
  const isCustom = preset?.source === 'custom';

  function nudge(delta: number) {
    const next = Math.max(0, Math.min(maxRate, rate + delta));
    onRateChange(parseFloat(next.toFixed(decimals)));
  }

  const showMedical = dripUnitMode !== 'cc_h';
  const showCcH     = dripUnitMode !== 'medical';

  return (
    <>
      <div className="bg-[#0b1020] rounded-xl border border-white/5 p-2.5 space-y-2">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className={`text-[0.52rem] font-black uppercase tracking-wider ${theme.text}`}>
            {displayName}
          </span>
          <div className="flex items-center gap-1.5">
            {isCustom && (
              <span className="text-[0.36rem] font-bold text-amber-400 border border-amber-700/40 px-1 rounded">
                CUSTOM
              </span>
            )}
            {showDilutionTrigger && (
              <button
                type="button"
                onClick={() => setShowDilutionModal(true)}
                title="Configurar dilución"
                className="text-slate-600 hover:text-amber-400 transition-colors cursor-pointer text-[0.65rem]"
              >⚙</button>
            )}
          </div>
        </div>

        {/* Rate display */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            {showMedical && (
              <div>
                <span className={`text-xl font-black font-mono leading-none ${theme.text}`}>
                  {rate.toFixed(decimals)}
                </span>
                <span className="text-[0.42rem] text-slate-500 ml-1">{inputUnit}</span>
              </div>
            )}
            {showCcH && ccH > 0 && (
              <div className={showMedical ? 'mt-0.5' : ''}>
                <span className="text-base font-bold font-mono text-slate-300 leading-none">
                  {ccH.toFixed(1)}
                </span>
                <span className="text-[0.42rem] text-slate-500 ml-1">cc/h</span>
                {preset && (
                  <span className="text-[0.36rem] text-slate-700 ml-1">
                    ({preset.concentration_mg_mL.toFixed(3)} mg/mL)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stepper */}
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => nudge(+stepSize)}
              className={`w-8 h-5 rounded text-[0.6rem] font-black cursor-pointer transition-all hover:opacity-80 ${theme.bg} text-black`}
            >▲</button>
            <button
              type="button"
              onClick={() => nudge(-stepSize)}
              className="w-8 h-5 rounded text-[0.6rem] font-black cursor-pointer transition-all bg-slate-700 text-slate-300 hover:bg-slate-600"
            >▼</button>
          </div>
        </div>

        {/* Range input */}
        <input
          type="range"
          min={0}
          max={maxRate}
          step={stepSize}
          value={rate}
          onChange={e => onRateChange(parseFloat(e.target.value))}
          className="w-full h-1 rounded appearance-none cursor-pointer"
          style={{ accentColor: theme.text.replace('text-', '') }}
        />

        {/* Stop button */}
        {rate > 0 && (
          <button
            type="button"
            onClick={() => onRateChange(0)}
            className="w-full py-0.5 rounded text-[0.42rem] font-bold text-red-400 border border-red-900/50 bg-red-950/20 cursor-pointer hover:bg-red-900/30 transition-all"
          >
            ⏹ DETENER
          </button>
        )}
      </div>

      {showDilutionModal && (
        <DilutionConfigModal drug={drugId} onClose={() => setShowDilutionModal(false)} />
      )}
    </>
  );
});

export default InfusionCardWithDilution;
