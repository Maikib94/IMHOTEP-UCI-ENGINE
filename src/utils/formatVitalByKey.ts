// src/utils/formatVitalByKey.ts
//
// Capa de presentacion para vitals: el estado fisiologico se guarda en
// punto flotante completo (C1.5); el redondeo es una decision de
// presentacion, no de fisica. Este helper centraliza cuantos decimales
// mostrar por campo al renderizar.
//
// Nombrado formatVitalByKey (no formatVital) porque src/utils/formatVital.ts
// ya existe con una firma distinta (clamp + digits explicitos) y tiene un
// consumidor en uso (ScenarioSelectorModal.tsx) — no se toca ese archivo.
//
// NOTA (C1.7): decidir cual usar por firma, no por nombre — esta toma
// (key: keyof Vitals, value) y busca decimales en VITAL_DECIMALS; la otra
// toma (value, {min,max,digits,unit}) con clamp explicito por llamada.

import type { Vitals } from '../store/usePatientStore';

const VITAL_DECIMALS: Partial<Record<keyof Vitals, number>> = {
  paO2: 0, paCO2: 0, spo2: 0, etco2: 1, pH: 2, hco3: 1,
  lactate: 1, baseExcess: 1, anionGap: 1, temperature: 1,
  creatinine: 2, urineOutput: 2, evlwi: 2, gedi: 0,
  kPlasma: 1, magnesiumMgdL: 1, glucoseMgdL: 0,
  heartRate: 0, systolicBP: 0, diastolicBP: 0,
  meanArterialPressure: 0, cardiacOutput: 1, strokeVolume: 0,
  svr: 0, cvp: 0, plethAmplitude: 2,
  pplat: 1, ppico: 1, meanAirwayPressure: 1, deltaP: 1,
  mechanicalPower: 1, respiratoryRate: 0, pfRatio: 0,
  icp: 0, gcs: 0,
};

export function formatVitalByKey(key: keyof Vitals, value: number): string {
  if (!isFinite(value)) return '--';
  const d = VITAL_DECIMALS[key] ?? 1;
  return value.toFixed(d);
}
