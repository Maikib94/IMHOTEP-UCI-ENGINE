// src/components/clinical/InotropeControls.tsx
import React from 'react';
import { InfusionControl } from './drugControls';

export default function InotropeControls() {
  return (
    <div className="p-3">
      <InfusionControl label="Dobutamina"   drug="dobutamine"  unit="mcg/kg/m" step={1.0}  colorTheme="orange" />
      <InfusionControl label="Dopamina"     drug="dopamine"    unit="mcg/kg/m" step={1.0}  colorTheme="orange" />
      <InfusionControl label="Milrinona"    drug="milrinone"   unit="mcg/kg/m" step={0.1}  colorTheme="orange" />
      <InfusionControl label="Levosimendan" drug="levosimendan" unit="mcg/kg/m" step={0.05} colorTheme="orange" />
    </div>
  );
}
