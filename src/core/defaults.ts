// src/core/defaults.ts
//
// Valores por defecto seguros para ScenarioDefinition y LauncherConfig.
// Usados por normalizeScenario() para prevenir TypeError de campos undefined
// en escenarios legacy o generados proceduralmente.

import type { ScenarioDefinition } from '../store/useScenarioStore';
import type { LauncherConfig }     from './SimulationLauncher';
import type { InvasiveMode }       from '../store/useMonitoringStore';
import type { RespiratorySupport } from '../store/usePatientStore';

export const DEFAULT_LAUNCHER_CONFIG: LauncherConfig = {
  strategy: 'nasal_cannula',
  fiO2:     0.24,
  flowLpm:  2,
};

export const DEFAULT_PRE_ADMISSION = {
  respiratorySupport: 'room_air' as RespiratorySupport,
  activeInfusions:    [] as { drug: string; rate: number }[],
  activeBoluses:      [] as { drug: string; doseMg: number }[],
  icpCatheterPlaced:  false,
  invasiveMonitoring: 'none' as InvasiveMode,
};

// Safe default for any required numeric vital
export const DEFAULT_VITALS = {
  heartRate:            80,
  systolicBP:           120,
  diastolicBP:          70,
  meanArterialPressure: 87,
  respiratoryRate:      16,
  spo2:                 96,
  temperature:          36.5,
  gcs:                  15,
  paO2:                 90,
  paCO2:                40,
  pH:                   7.40,
  lactate:              1.0,
  urineOutput:          1.0,
  icp:                  10,
};

/**
 * Ensures every required field on a (potentially partial) ScenarioDefinition
 * has a safe default value. NEVER throws for missing optional fields.
 * Only throws for genuinely invalid required fields (id, name, category).
 */
export function normalizeScenario(p: Partial<ScenarioDefinition>): ScenarioDefinition {
  if (!p.id)       throw new Error('Campo obligatorio faltante: scenario.id');
  if (!p.name)     throw new Error('Campo obligatorio faltante: scenario.name');
  if (!p.category) throw new Error('Campo obligatorio faltante: scenario.category');

  return {
    id:          p.id,
    name:        p.name,
    category:    p.category,
    description: p.description ?? '',

    baseSeverity:         p.baseSeverity         ?? 0.5,
    tags:                 p.tags                  ?? [],
    clinicalNotes:        p.clinicalNotes         ?? '',
    references:           p.references            ?? [],

    // pathologyConfigs — safe empty array (caso docente sin patología activa)
    pathologyConfigs: (p.pathologyConfigs ?? []).map(cfg => ({
      domain:       cfg.domain,
      subtype:      cfg.subtype ?? null,
      baseSeverity: (typeof cfg.baseSeverity === 'number' && isFinite(cfg.baseSeverity))
                      ? Math.max(0, Math.min(1, cfg.baseSeverity))
                      : 0.5,
    })),

    // Vitales iniciales — Partial<Vitals>, OK dejar vacío (usa defaults de PatientStore)
    initialVitals: p.initialVitals ?? {},

    // Optional fields — all with safe defaults
    initialModifiers:     p.initialModifiers,
    recommendedRespSupport: p.recommendedRespSupport,
    ventilatorPreset:     p.ventilatorPreset,
    isVentilatorConnected:  p.isVentilatorConnected  ?? false,
    initialBloodVolumeMl:   p.initialBloodVolumeMl,

    surgicalDrainStatus:    p.surgicalDrainStatus  ?? 'none',
    icpCatheterRequired:    p.icpCatheterRequired  ?? false,
    icpCatheterType:        p.icpCatheterType,
    evdActive:              p.evdActive,
    icpDrainageThreshold_mmHg: p.icpDrainageThreshold_mmHg,
  };
}
