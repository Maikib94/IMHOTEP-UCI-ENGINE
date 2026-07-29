// src/components/clinical/InotropeControls.tsx
import React from 'react';
import { InfusionControl } from './drugControls';

export default function InotropeControls() {
  return (
    <div className="p-2 space-y-0.5">
      <InfusionControl label="Dobutamina"   drug="dobutamine"   unit="mcg/kg/min" step={0.5}   colorTheme="orange" />
      <InfusionControl label="Dopamina"     drug="dopamine"     unit="mcg/kg/min" step={0.5}   colorTheme="orange" />
      <InfusionControl label="Milrinona"    drug="milrinone"    unit="mcg/kg/min" step={0.05}  colorTheme="orange" />
      <InfusionControl label="Levosimendán" drug="levosimendan" unit="mcg/kg/min" step={0.025} colorTheme="yellow" />
    </div>
  );
}
