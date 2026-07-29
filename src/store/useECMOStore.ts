// src/store/useECMOStore.ts
//
// Estado del oxigenador de membrana extracorpórea (ECMO).
// Soporta VV (venovenoso — soporte respiratorio) y VA (venoarterial — cardiorrespiratorio).
//
// Refs:
//   Combes A et al. EOLIA. ICM 2020;46:2464-76. DOI:10.1007/s00134-020-06290-1
//   Grotberg J et al. Crit Care 2023;27:289. DOI:10.1186/s13054-023-04574-8
//   Araos J et al. BJA 2021;127:807-14. DOI:10.1016/j.bja.2021.07.031
//   Rodriguez Y et al. ECMOVENT. Ann Intensive Care 2025;15:32.
//   Guervilly C et al. Crit Care 2022;26:380.

import { create } from 'zustand';

export type ECMOMode = 'vv' | 'va';
export type ECMOCannulation =
  | 'femoral_femoral'    // VV: drenaje femoral, retorno femoral (bifemoral)
  | 'femoro_jugular'     // VV: drenaje femoral, retorno yugular (estándar VV)
  | 'bicaval'            // VV: drenaje bicaval, retorno pulmonar
  | 'central'            // VA/VV: cánulas directas (post-cardiotomía)
  | 'femoro_axillar';    // VA: drenaje femoral, retorno axilar

export interface ECMOState {
  active:               boolean;
  mode:                 ECMOMode;
  bloodFlowLmin:        number;    // L/min — flujo de sangre (1.5-7 L/min)
  sweepFlowLmin:        number;    // L/min — flujo de gas barrido (CO₂ removal)
  membraneFiO2:         number;    // FiO₂ entrada del oxigenador (0.21-1.0)
  /** Saturación a la salida del oxigenador (post-membrana) — normalmente 0.98-1.0 */
  outputSaO2:           number;
  cannulation:          ECMOCannulation;
  /** Presión pre-membrana (mmHg) — límite seguro < 350 mmHg */
  preMembranePressureMmhg:  number;
  /** Presión post-membrana (mmHg) */
  postMembranePressureMmhg: number;
  /** Anticoagulación: HNF bolo + infusión */
  heparinInfusionUkgh:  number;
  /** Tiempo activo en horas simuladas */
  activeHours:          number;
  /** Alerta de driving pressure elevado (ΔP > 14 con ECMO activo) */
  drivingPressureAlert: boolean;

  setActive:        (v: boolean) => void;
  configure:        (partial: Partial<ECMOState>) => void;
  resetECMO:        () => void;
}

const DEFAULTS: Pick<ECMOState,
  'mode' | 'bloodFlowLmin' | 'sweepFlowLmin' | 'membraneFiO2' | 'outputSaO2'
  | 'cannulation' | 'preMembranePressureMmhg' | 'postMembranePressureMmhg'
  | 'heparinInfusionUkgh' | 'activeHours' | 'drivingPressureAlert'
> = {
  mode:                    'vv',
  bloodFlowLmin:           4.0,
  sweepFlowLmin:           4.0,
  membraneFiO2:            1.0,
  outputSaO2:              0.98,
  cannulation:             'femoro_jugular',
  preMembranePressureMmhg: 200,
  postMembranePressureMmhg: 80,
  heparinInfusionUkgh:     18,
  activeHours:             0,
  drivingPressureAlert:    false,
};

export const useECMOStore = create<ECMOState>((set) => ({
  active: false,
  ...DEFAULTS,

  setActive: (v) => set((s) => ({
    active: v,
    ...(v ? {} : { ...DEFAULTS, drivingPressureAlert: false }),
  })),

  configure: (partial) => set((s) => ({ ...s, ...partial })),

  resetECMO: () => set({ active: false, ...DEFAULTS }),
}));
