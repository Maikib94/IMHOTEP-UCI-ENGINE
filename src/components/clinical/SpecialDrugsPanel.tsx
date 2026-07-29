// src/components/clinical/SpecialDrugsPanel.tsx
// Fármacos especiales UCI: Hiperosmolar · Endocrino · Hematológico · Obstétrico.
// Cada sección se destaca visualmente cuando caseCategory coincide.
//
// Refs: Cook NCS 2020 (Manitol); ADA 2024 (Insulina/DKA); Ross JCEM 2016 (tiroideos);
//       Scully ASH 2020 (TXA); WOMAN Lancet 2017 (TXA-HPP); ACOG 222 (Mg eclampsia).

import React, { useState } from 'react';
import { InfusionControl, BolusRow, useBolusAdmin } from './drugControls';
import { usePathologyStore } from '../../store/usePathologyStore';
import { usePatientStore }   from '../../store/usePatientStore';
import type { ClinicalCategory } from '../../types/ClinicalCategory';

const MONO = "'JetBrains Mono', monospace";

interface SectionProps { active: boolean; }

function SectionHeader({
  icon, title, accentColor, activeBorderColor, active,
}: {
  icon: string; title: string; accentColor: string; activeBorderColor: string; active: boolean;
}) {
  return (
    <div className={`flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg ${
      active
        ? 'border bg-opacity-10'
        : 'border border-white/5 bg-slate-900/20 opacity-80'
    }`}
      style={active ? { borderColor: activeBorderColor, background: activeBorderColor + '12' } : {}}
    >
      <span style={{ fontFamily: MONO, fontSize: '0.48rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: active ? accentColor : '#475569' }}>
        {icon} {title}
      </span>
      {active && (
        <span style={{ fontFamily: MONO, fontSize: '0.38rem', fontWeight: 700, color: accentColor, border: `1px solid ${activeBorderColor}40`, borderRadius: 3, padding: '1px 5px', background: activeBorderColor + '15' }}>
          PRIORITARIO
        </span>
      )}
    </div>
  );
}

// ─── Hiperosmolar ─────────────────────────────────────────────────────────────

function HiperosmolarSection({ active }: SectionProps) {
  const adminBolus = useBolusAdmin();
  const weight     = usePatientStore(s => s.vitals.weight ?? 70);
  const [dose, setDose] = useState(0.5); // g/kg

  return (
    <div className="space-y-1">
      <SectionHeader icon="💊" title="Hiperosmolar" accentColor="#a78bfa" activeBorderColor="#7c3aed" active={active} />
      <div className="px-1">
        <BolusRow
          label="Manitol 15%"
          drug="mannitol"
          dose={dose}
          unit="g/kg"
          step={0.05}
          max={1.0}
          colorTheme="violet"
          onDoseChange={setDose}
          onBolus={() => adminBolus('mannitol', dose * weight * 1000)}
        />
        <div style={{ fontSize: '0.34rem', color: '#334155', marginTop: 4 }}>
          Cook NCS 2020 · 15-20 min IV · Onset 15-30 min · Máx 200 g/24h
        </div>
      </div>
    </div>
  );
}

// ─── Endocrino ────────────────────────────────────────────────────────────────

function EndocrinoSection({ active }: SectionProps) {
  const adminBolus = useBolusAdmin();
  const [d50Dose,  setD50Dose]  = useState(25);   // g
  const [lt4Dose,  setLt4Dose]  = useState(300);  // mcg
  const [ptuDose,  setPtuDose]  = useState(200);  // mg
  const [mmiDose,  setMmiDose]  = useState(20);   // mg

  return (
    <div className="space-y-1">
      <SectionHeader icon="🧪" title="Endocrino" accentColor="#22c55e" activeBorderColor="#16a34a" active={active} />
      <div className="px-1 space-y-0.5">
        <InfusionControl label="Insulina R IV" drug="insulin_regular_iv" unit="U/h" step={0.5} colorTheme="emerald" />
        <BolusRow label="Dextrosa 50%" drug="dextrose_50" dose={d50Dose}
          unit="g" step={5} max={50} colorTheme="emerald"
          onDoseChange={setD50Dose}
          onBolus={() => adminBolus('dextrose_50', d50Dose * 1000)}
        />
        <BolusRow label="Levotiroxina" drug="levothyroxine_iv" dose={lt4Dose}
          unit="mcg" step={50} max={500} colorTheme="emerald"
          onDoseChange={setLt4Dose}
          onBolus={() => adminBolus('levothyroxine_iv', lt4Dose / 1000)}
        />
        <BolusRow label="Propiltiouracilo" drug="propylthiouracil_oral" dose={ptuDose}
          unit="mg" step={50} max={600} colorTheme="emerald"
          onDoseChange={setPtuDose}
          onBolus={() => adminBolus('propylthiouracil_oral', ptuDose)}
        />
        <BolusRow label="Metimazol" drug="methimazole_oral" dose={mmiDose}
          unit="mg" step={5} max={60} colorTheme="emerald"
          onDoseChange={setMmiDose}
          onBolus={() => adminBolus('methimazole_oral', mmiDose)}
        />
        <div style={{ fontSize: '0.34rem', color: '#334155', marginTop: 4 }}>
          ADA 2024 DKA · Ross JCEM 2016 (hipertiroidismo) · Wartofsky NEJM 2009 (mixedema)
        </div>
      </div>
    </div>
  );
}

// ─── Hematológico ─────────────────────────────────────────────────────────────

function HematoSection({ active }: SectionProps) {
  const adminBolus = useBolusAdmin();
  const [txaDose,  setTxaDose]  = useState(1000); // mg
  const [vkDose,   setVkDose]   = useState(10);   // mg
  const [ccpDose,  setCcpDose]  = useState(25);   // U/kg equiv
  const [ddavpDose,setDdavpDose]= useState(0.3);  // mcg/kg equiv
  const [rasDose,  setRasDose]  = useState(7);    // mg (0.2 mg/kg × 35 kg ref)

  return (
    <div className="space-y-1">
      <SectionHeader icon="🩸" title="Hematológico" accentColor="#dc2626" activeBorderColor="#b91c1c" active={active} />
      <div className="px-1 space-y-0.5">
        <InfusionControl label="Argatrobán" drug="argatroban_iv" unit="mcg/kg/min" step={0.5} colorTheme="red" />
        <BolusRow label="Áci. Tranexámico" drug="tranexamic_acid_iv" dose={txaDose}
          unit="mg" step={250} max={4000} colorTheme="red"
          onDoseChange={setTxaDose}
          onBolus={() => adminBolus('tranexamic_acid_iv', txaDose)}
        />
        <BolusRow label="Vitamina K IV" drug="vitamin_k_iv" dose={vkDose}
          unit="mg" step={2} max={50} colorTheme="red"
          onDoseChange={setVkDose}
          onBolus={() => adminBolus('vitamin_k_iv', vkDose)}
        />
        <BolusRow label="CCP 4F" drug="pcc_4factor" dose={ccpDose}
          unit="U/kg" step={5} max={50} colorTheme="red"
          onDoseChange={setCcpDose}
          onBolus={() => adminBolus('pcc_4factor', ccpDose)}
        />
        <BolusRow label="DDAVP" drug="desmopressin_iv" dose={ddavpDose}
          unit="mcg/kg" step={0.1} max={0.4} colorTheme="red"
          onDoseChange={setDdavpDose}
          onBolus={() => adminBolus('desmopressin_iv', ddavpDose * 1000)}
        />
        <BolusRow label="Rasburicasa" drug="rasburicase_iv" dose={rasDose}
          unit="mg" step={1} max={20} colorTheme="red"
          onDoseChange={setRasDose}
          onBolus={() => adminBolus('rasburicase_iv', rasDose)}
        />
        <div style={{ fontSize: '0.34rem', color: '#334155', marginTop: 4 }}>
          CRASH-2 2010 (TXA) · Sarode Circulation 2013 (CCP) · Mannucci Blood 1997 (DDAVP)
        </div>
      </div>
    </div>
  );
}

// ─── Obstétrico ───────────────────────────────────────────────────────────────

function ObstetricSection({ active }: SectionProps) {
  const adminBolus = useBolusAdmin();
  const [ergDose,  setErgDose]  = useState(0.2);   // mg
  const [misoDose, setMisoDose] = useState(800);   // mcg
  const [carbDose, setCarbDose] = useState(100);   // mcg
  const [mgBolo,   setMgBolo]   = useState(4);     // g bolo

  return (
    <div className="space-y-1">
      <SectionHeader icon="🤰" title="Obstétrico" accentColor="#ec4899" activeBorderColor="#be185d" active={active} />
      <div className="px-1 space-y-0.5">
        <InfusionControl label="Oxitocina" drug="oxytocin_iv" unit="U/h" step={2} colorTheme="violet" />
        <InfusionControl label="Sulfato Mg" drug="magnesium_sulfate_iv" unit="g/h" step={0.5} colorTheme="violet" />
        <BolusRow label="Mg — bolo carga" drug="magnesium_sulfate_iv" dose={mgBolo}
          unit="g" step={0.5} max={6} colorTheme="violet"
          onDoseChange={setMgBolo}
          onBolus={() => adminBolus('magnesium_sulfate_iv', mgBolo * 1000)}
        />
        <BolusRow label="Ergonovina IM" drug="methylergonovine_im" dose={ergDose}
          unit="mg" step={0.1} max={0.5} colorTheme="violet"
          onDoseChange={setErgDose}
          onBolus={() => adminBolus('methylergonovine_im', ergDose)}
        />
        <BolusRow label="Misoprostol R" drug="misoprostol_rectal" dose={misoDose}
          unit="mcg" step={200} max={1000} colorTheme="violet"
          onDoseChange={setMisoDose}
          onBolus={() => adminBolus('misoprostol_rectal', misoDose / 1000)}
        />
        <BolusRow label="Carbetocina" drug="carbetocin_iv" dose={carbDose}
          unit="mcg" step={20} max={100} colorTheme="violet"
          onDoseChange={setCarbDose}
          onBolus={() => adminBolus('carbetocin_iv', carbDose / 1000)}
        />
        <div style={{ fontSize: '0.34rem', color: '#334155', marginTop: 4 }}>
          WHO 2017 PPH · WOMAN Lancet 2017 (TXA) · MAGPIE 2002 (Mg) · ACOG 222
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SpecialDrugsPanel() {
  const caseCategory = usePathologyStore(s => s.caseCategory) as ClinicalCategory;

  return (
    <div className="p-2 space-y-3">
      <HiperosmolarSection active={caseCategory === 'neuro'} />
      <EndocrinoSection    active={caseCategory === 'endocrino'} />
      <HematoSection       active={caseCategory === 'hemato'} />
      <ObstetricSection    active={caseCategory === 'obstetricia'} />
    </div>
  );
}
