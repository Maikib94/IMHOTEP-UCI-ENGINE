// src/components/clinical/SedationControls.tsx
import React, { useState } from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { InfusionControl, BolusRow, useBolusAdmin } from './drugControls';

export default function SedationControls() {
  const sedation = usePharmacologyStore(s => s.systemicEffects.sedation);
  const adminBolus = useBolusAdmin();

  const [propofolDose,   setPropofolDose]   = useState(1.5);
  const [midazolamDose,  setMidazolamDose]  = useState(0.05);
  const [ketamineDose,   setKetamineDose]   = useState(1.5);
  const [thiopentalDose, setThiopentalDose] = useState(4.0);

  return (
    <div className="p-3 space-y-3">
      {/* Efecto */}
      <div className="flex items-center justify-between">
        <span className="text-[0.45rem] text-slate-500 uppercase tracking-wider">Efecto sedante</span>
        <span className={`text-[0.6rem] font-black font-mono ${sedation >= 0.7 ? 'text-yellow-300' : 'text-slate-400'}`}>
          {Math.round(Math.min(100, sedation * 100))}%
        </span>
      </div>

      {/* Bolos */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">BOLOS IV</div>
        <BolusRow label="Propofol"   drug="propofol"   dose={propofolDose}   unit="mg/kg" step={0.5}  max={4.0} colorTheme="yellow" onDoseChange={setPropofolDose}   onBolus={() => adminBolus('propofol',   propofolDose)}   />
        <BolusRow label="Midazolam"  drug="midazolam"  dose={midazolamDose}  unit="mg/kg" step={0.01} max={0.3} colorTheme="yellow" onDoseChange={setMidazolamDose}  onBolus={() => adminBolus('midazolam',  midazolamDose)}  />
        <BolusRow label="Ketamina"   drug="ketamine"   dose={ketamineDose}   unit="mg/kg" step={0.5}  max={3.0} colorTheme="yellow" onDoseChange={setKetamineDose}   onBolus={() => adminBolus('ketamine',   ketamineDose)}   />
        <BolusRow label="Tiopental"  drug="thiopental" dose={thiopentalDose} unit="mg/kg" step={0.5}  max={8.0} colorTheme="yellow" onDoseChange={setThiopentalDose} onBolus={() => adminBolus('thiopental', thiopentalDose)} />
      </div>

      {/* Infusiones */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-2">INFUSIONES</div>
        <InfusionControl label="Propofol"    drug="propofol"        unit="mg/kg/h"  step={0.5}  colorTheme="yellow" />
        <InfusionControl label="Midazolam"   drug="midazolam"       unit="mg/kg/h"  step={0.05} colorTheme="yellow" />
        <InfusionControl label="Dexmedeto."  drug="dexmedetomidine" unit="mcg/kg/h" step={0.1}  colorTheme="yellow" />
        <InfusionControl label="Ketamina"    drug="ketamine"        unit="mg/kg/h"  step={0.5}  colorTheme="yellow" />
        <InfusionControl label="Tiopental"   drug="thiopental"      unit="mg/kg/h"  step={1.0}  colorTheme="yellow" />
      </div>
    </div>
  );
}
