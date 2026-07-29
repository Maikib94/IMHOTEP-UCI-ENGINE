// src/components/clinical/AntiarrhythmicControls.tsx
// Antiarrítmicos IV — patrón unificado: BOLOS IV arriba, INFUSIONES abajo.
// Idéntico estéticamente a SedationControls y AnalgesiaControls.
//
// Refs: AHA ACLS 2023; Kotecha JAMA 2020; Goodman & Gilman 13ª; Ellenbogen 1991.

import React, { useState } from 'react';
import { InfusionControl, BolusRow, useBolusAdmin } from './drugControls';

export default function AntiarrhythmicControls() {
  const adminBolus = useBolusAdmin();

  const [amioDose, setAmioDose]   = useState(150);   // mg — AHA ACLS 2023
  const [digDose,  setDigDose]    = useState(0.5);   // mg — Kotecha JAMA 2020
  const [esmoDose, setEsmoDose]   = useState(500);   // mcg/kg — Schwartz 1985
  const [metoDose, setMetoDose]   = useState(5);     // mg — Goodman 13ª
  const [diltDose, setDiltDose]   = useState(20);    // mg — Ellenbogen 1991

  return (
    <div className="p-2 space-y-3">

      {/* ── BOLOS IV ──────────────────────────────────────────────── */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          BOLOS IV
        </div>

        <BolusRow
          label="Amiodarona"
          drug="amiodarone"
          dose={amioDose}
          unit="mg"
          step={50}
          max={900}
          colorTheme="violet"
          onDoseChange={setAmioDose}
          onBolus={() => adminBolus('amiodarone', amioDose)}
        />

        <BolusRow
          label="Digoxina"
          drug="digoxin"
          dose={digDose}
          unit="mg"
          step={0.125}
          max={1.5}
          colorTheme="violet"
          onDoseChange={setDigDose}
          onBolus={() => adminBolus('digoxin', digDose)}
        />

        <BolusRow
          label="Esmolol"
          drug="esmolol"
          dose={esmoDose}
          unit="mcg/kg"
          step={50}
          max={2000}
          colorTheme="violet"
          onDoseChange={setEsmoDose}
          onBolus={() => adminBolus('esmolol', esmoDose)}
        />

        <BolusRow
          label="Metoprolol IV"
          drug="metoprolol_iv"
          dose={metoDose}
          unit="mg"
          step={2.5}
          max={30}
          colorTheme="violet"
          onDoseChange={setMetoDose}
          onBolus={() => adminBolus('metoprolol_iv', metoDose)}
        />

        <BolusRow
          label="Diltiazem IV"
          drug="diltiazem_iv"
          dose={diltDose}
          unit="mg"
          step={5}
          max={100}
          colorTheme="violet"
          onDoseChange={setDiltDose}
          onBolus={() => adminBolus('diltiazem_iv', diltDose)}
        />
      </div>

      {/* ── INFUSIONES ──────────────────────────────────────────────── */}
      <div>
        <div className="text-[0.48rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          INFUSIONES
        </div>

        <InfusionControl
          label="Amiodarona"
          drug="amiodarone"
          unit="mg/h"
          step={5}
          colorTheme="violet"
        />

        <InfusionControl
          label="Esmolol"
          drug="esmolol"
          unit="mcg/kg/min"
          step={25}
          colorTheme="violet"
        />

        <InfusionControl
          label="Diltiazem"
          drug="diltiazem_iv"
          unit="mg/h"
          step={1}
          colorTheme="violet"
        />
      </div>

    </div>
  );
}
