// src/components/clinical/ParalysisControls.tsx — BNM (bloqueo neuromuscular)
import React, { useState } from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { InfusionControl, BolusRow, ProgressBar, useBolusAdmin } from './drugControls';

export default function ParalysisControls() {
  const nmba = usePharmacologyStore(s => s.systemicEffects.nmba);
  const adminBolus = useBolusAdmin();

  const [rocDose,  setRocDose]  = useState(0.15);
  const [cisDose,  setCisDose]  = useState(0.03);
  const [atrDose,  setAtrDose]  = useState(0.10);
  const [panDose,  setPanDose]  = useState(0.02);

  return (
    <div className="p-3 space-y-3">
      {/* Barra bloqueo */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[0.45rem] text-slate-500 uppercase tracking-wider">Bloqueo NM</span>
          <span className={`text-[0.6rem] font-black font-mono ${nmba > 0.8 ? 'text-red-400' : nmba > 0.4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {Math.round(nmba * 100)}%
          </span>
        </div>
        <ProgressBar
          value={nmba} max={1}
          colorClass={nmba > 0.8 ? 'bg-red-500' : nmba > 0.4 ? 'bg-yellow-400' : 'bg-emerald-400'}
          height="h-1.5"
        />
      </div>

      {/* Bolos */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">BOLOS IV</div>
        <BolusRow label="Rocuronio"    drug="rocuronium"    dose={rocDose} unit="mg/kg" step={0.05} max={1.2}  colorTheme="emerald" onDoseChange={setRocDose} onBolus={() => adminBolus('rocuronium',    rocDose)} />
        <BolusRow label="Cisatracurio" drug="cisatracurium" dose={cisDose} unit="mg/kg" step={0.01} max={0.40} colorTheme="emerald" onDoseChange={setCisDose} onBolus={() => adminBolus('cisatracurium', cisDose)} />
        <BolusRow label="Atracurio"    drug="atracurium"    dose={atrDose} unit="mg/kg" step={0.05} max={1.0}  colorTheme="emerald" onDoseChange={setAtrDose} onBolus={() => adminBolus('atracurium',    atrDose)} />
        <BolusRow label="Pancuronio"   drug="pancuronium"   dose={panDose} unit="mg/kg" step={0.01} max={0.15} colorTheme="emerald" onDoseChange={setPanDose} onBolus={() => adminBolus('pancuronium',   panDose)} />
      </div>

      {/* Infusiones */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">INFUSIONES</div>
        <InfusionControl label="Rocuronio"    drug="rocuronium"    unit="mg/kg/h" step={0.1} colorTheme="emerald" />
        <InfusionControl label="Atracurio"    drug="atracurium"    unit="mg/kg/h" step={0.1} colorTheme="emerald" />
        <InfusionControl label="Cisatracurio" drug="cisatracurium" unit="mg/kg/h" step={0.1} colorTheme="emerald" />
        <InfusionControl label="Pancuronio"   drug="pancuronium"   unit="mg/kg/h" step={0.1} colorTheme="emerald" />
      </div>
    </div>
  );
}
