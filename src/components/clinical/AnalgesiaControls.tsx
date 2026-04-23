// src/components/clinical/AnalgesiaControls.tsx
import React, { useState } from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { InfusionControl, BolusRow, ProgressBar, useBolusAdmin } from './drugControls';

export default function AnalgesiaControls() {
  const analgesia = usePharmacologyStore(s => s.systemicEffects.analgesia);
  const adminBolus = useBolusAdmin();

  const [morphineDose,     setMorphineDose]     = useState(2.0);
  const [fentanylDose,     setFentanylDose]     = useState(1.0);
  const [remifentDose,     setRemifentDose]     = useState(0.5);

  return (
    <div className="p-3 space-y-3">
      {/* Barra efecto */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[0.45rem] text-slate-500 uppercase tracking-wider">Efecto analgésico</span>
          <span className={`text-[0.55rem] font-black font-mono ${analgesia >= 0.5 ? 'text-blue-300' : analgesia >= 0.2 ? 'text-yellow-400' : 'text-red-400'}`}>
            {Math.round(Math.min(100, analgesia * 100))}%
          </span>
        </div>
        <ProgressBar
          value={Math.min(1, analgesia)} max={1}
          colorClass={analgesia >= 0.5 ? 'bg-blue-500' : analgesia >= 0.2 ? 'bg-yellow-400' : 'bg-red-500'}
          height="h-1.5"
        />
      </div>

      {/* Bolos */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">BOLOS IV</div>
        <BolusRow label="Morfina"     drug="morphine"     dose={morphineDose}  unit="mg"       step={0.5}  max={10} colorTheme="blue" onDoseChange={setMorphineDose}  onBolus={() => adminBolus('morphine',     morphineDose)}  />
        <BolusRow label="Fentanilo"   drug="fentanyl"     dose={fentanylDose}  unit="mcg/kg"  step={0.5}  max={4}  colorTheme="blue" onDoseChange={setFentanylDose}  onBolus={() => adminBolus('fentanyl',     fentanylDose)}  />
        <BolusRow label="Remifentan." drug="remifentanil" dose={remifentDose}  unit="mcg/kg"  step={0.1}  max={2}  colorTheme="blue" onDoseChange={setRemifentDose}  onBolus={() => adminBolus('remifentanil', remifentDose)}  />
      </div>

      {/* Infusiones */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">INFUSIONES</div>
        <InfusionControl label="Morfina"     drug="morphine"     unit="mg/h"      step={1.0}  colorTheme="blue" />
        <InfusionControl label="Fentanilo"   drug="fentanyl"     unit="mcg/kg/h"  step={0.5}  colorTheme="blue" />
        <InfusionControl label="Remifentan." drug="remifentanil" unit="mcg/kg/m"  step={0.05} colorTheme="blue" />
      </div>
    </div>
  );
}
