// src/components/clinical/VasopressorControls.tsx
import React from 'react';
import { InfusionControl } from './drugControls';

export default function VasopressorControls() {
  return (
    <div className="p-3">
      <InfusionControl label="Noradrenalina" drug="noradrenaline" unit="mcg/kg/m" step={0.05} colorTheme="red" />
      <InfusionControl label="Adrenalina"    drug="adrenaline"    unit="mcg/kg/m" step={0.05} colorTheme="red" />
      <InfusionControl label="Vasopresina"   drug="vasopressin"   unit="U/h"      step={0.01} colorTheme="red" />
      <InfusionControl label="Azul de M."    drug="methylene_blue" unit="mg/kg/h" step={1.0}  colorTheme="red" />
    </div>
  );
}

export function vasopressorBadge(): string | undefined {
  // Dynamic badge computed by parent from store
  return undefined;
}
