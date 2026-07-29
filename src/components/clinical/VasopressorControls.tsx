// src/components/clinical/VasopressorControls.tsx
import React from 'react';
import { InfusionControl } from './drugControls';

export default function VasopressorControls() {
  return (
    <div className="p-2 space-y-0.5">
      <InfusionControl label="Noradrenalina"    drug="noradrenaline"  unit="mcg/kg/min" step={0.02}  colorTheme="red" />
      <InfusionControl label="Adrenalina"       drug="adrenaline"     unit="mcg/kg/min" step={0.02}  colorTheme="red" />
      <InfusionControl label="Vasopresina"      drug="vasopressin"    unit="U/h"        step={0.1}   colorTheme="red" />
      <InfusionControl label="Azul Metileno"    drug="methylene_blue" unit="mg/kg/h"    step={0.05}  colorTheme="cyan" />
    </div>
  );
}

export function vasopressorBadge(): string | undefined { return undefined; }
