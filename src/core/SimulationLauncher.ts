// src/core/SimulationLauncher.ts
//
// Centraliza la decisión de soporte O2 antes de iniciar un caso.
// Desacopla la UI del ScenarioSelectorModal del acceso directo a stores.

import { usePatientStore }   from '../store/usePatientStore';
import { useScenarioStore }  from '../store/useScenarioStore';
import type { ScenarioDefinition } from '../store/useScenarioStore';
import type { RespiratorySupport, O2Support } from '../store/usePatientStore';

// ─── Tipo canónico para la estrategia de oxigenoterapia ──────────────────────

export type O2Strategy =
  | 'room_air'       // Sin suplemento de O₂
  | 'nasal_cannula'  // Cánula nasal 1-6 L/min
  | 'simple_mask'    // Mascarilla simple (FiO₂ ~0.35-0.50)
  | 'reservoir_mask' // Mascarilla reservorio (FiO₂ ~0.60-0.90)
  | 'hfnc'           // Alto flujo nasal (Optiflow) — FiO₂ y flujo ajustables
  | 'niv_cpap'       // CPAP no invasivo
  | 'niv_bipap'      // BiPAP no invasivo
  | 'arm';           // ARM — ventilación mecánica invasiva

export interface O2StrategyMeta {
  label: string;
  abbrev: string;
  color: string;
  description: string;
  fiO2Range: string;
  invasive: boolean;
}

export const O2_STRATEGY_META: Record<O2Strategy, O2StrategyMeta> = {
  room_air:       { label: 'Aire ambiental',      abbrev: 'AA',     color: '#94a3b8', description: 'Sin suplemento de O₂ (FiO₂ 0.21)',          fiO2Range: '0.21',        invasive: false },
  nasal_cannula:  { label: 'Cánula nasal',         abbrev: 'CN',     color: '#34d399', description: '1-6 L/min → FiO₂ 0.24-0.44',               fiO2Range: '0.24-0.44',   invasive: false },
  simple_mask:    { label: 'Mascarilla simple',    abbrev: 'MV',     color: '#22d3ee', description: '5-10 L/min → FiO₂ 0.35-0.50',              fiO2Range: '0.35-0.50',   invasive: false },
  reservoir_mask: { label: 'Mascarilla reservorio',abbrev: 'MR',     color: '#60a5fa', description: '10-15 L/min → FiO₂ 0.60-0.90 (no-rebreather)',fiO2Range: '0.60-0.90', invasive: false },
  hfnc:           { label: 'Alto flujo (HFNC)',    abbrev: 'HFNC',   color: '#fbbf24', description: 'Optiflow 20-60 L/min, FiO₂ hasta 1.0',      fiO2Range: '0.21-1.00',   invasive: false },
  niv_cpap:       { label: 'CPAP no invasivo',     abbrev: 'CPAP',   color: '#fb923c', description: 'PEEP continua vía máscara facial',          fiO2Range: '0.21-1.00',   invasive: false },
  niv_bipap:      { label: 'BiPAP no invasivo',    abbrev: 'BiPAP',  color: '#f97316', description: 'IPAP/EPAP ajustable — soporte inspiratorio', fiO2Range: '0.21-1.00',   invasive: false },
  arm:            { label: 'ARM (intubado)',        abbrev: 'ARM',    color: '#ef4444', description: 'Ventilación mecánica invasiva — IOT',       fiO2Range: '0.21-1.00',   invasive: true  },
};

// ─── Mapeo O2Strategy → tipos de store ───────────────────────────────────────

const STRATEGY_TO_RESP_SUPPORT: Record<O2Strategy, RespiratorySupport> = {
  room_air:       'room_air',
  nasal_cannula:  'nasal_cannula',
  simple_mask:    'simple_mask',
  reservoir_mask: 'simple_mask', // closest available
  hfnc:           'hfnc',
  niv_cpap:       'hfnc',        // closest available
  niv_bipap:      'hfnc',
  arm:            'arm',
};

const STRATEGY_TO_O2_SUPPORT: Record<O2Strategy, O2Support> = {
  room_air:       'NONE',
  nasal_cannula:  'NASAL_CANNULA',
  simple_mask:    'SIMPLE_MASK',
  reservoir_mask: 'RESERVOIR_MASK',
  hfnc:           'HFNC',
  niv_cpap:       'NIV_CPAP',
  niv_bipap:      'NIV_BIPAP',
  arm:            'INVASIVE_ARM',
};

// ─── Config de lanzamiento ────────────────────────────────────────────────────

export interface LauncherConfig {
  strategy: O2Strategy;
  /** FiO₂ inicial (0.21-1.0) — sólo relevante para HFNC/ARM/NIV */
  fiO2?: number;
  /** Flujo nasal L/min — cánula / HFNC */
  flowLpm?: number;
  /** PEEP inicial cmH₂O — ARM / NIV */
  peep?: number;
}

// ─── Sugerencia automática basada en escenario ───────────────────────────────

export function suggestStrategy(scenario: ScenarioDefinition, difficulty: number): O2Strategy {
  // ARM obligatorio si el escenario lo requiere
  if (scenario.isVentilatorConnected === true) return 'arm';

  // Soporte recomendado del escenario
  const rec = scenario.recommendedRespSupport;
  if (rec === 'arm')  return 'arm';
  if (rec === 'hfnc') return 'hfnc';

  // Lógica por categoría + severidad escalada
  const sev = scenario.baseSeverity * (1 / (1 + Math.exp(-0.6 * (difficulty - 5.5))));

  if (scenario.category === 'respiratory') {
    if (sev > 0.65) return 'hfnc';
    if (sev > 0.40) return 'reservoir_mask';
    return 'nasal_cannula';
  }

  if (scenario.category === 'sepsis' || scenario.category === 'surgical') {
    if (sev > 0.70) return 'arm';
    if (sev > 0.45) return 'reservoir_mask';
    return 'nasal_cannula';
  }

  if (scenario.category === 'cardio') {
    if (sev > 0.65) return 'niv_bipap';
    if (sev > 0.40) return 'simple_mask';
    return 'nasal_cannula';
  }

  if (scenario.category === 'neuro') {
    if (sev > 0.70) return 'arm';
    return 'nasal_cannula';
  }

  if (scenario.category === 'burns') {
    if (sev > 0.55) return 'arm';
    return 'reservoir_mask';
  }

  if (rec === 'nasal_cannula') return 'nasal_cannula';
  if (rec === 'simple_mask')   return 'simple_mask';
  if (rec === 'venturi')       return 'simple_mask';

  return 'nasal_cannula';
}

// ─── Aplicar configuración a los stores ──────────────────────────────────────

export function applyLauncherConfig(config: LauncherConfig): void {
  const ps = usePatientStore.getState();

  const respSupport = STRATEGY_TO_RESP_SUPPORT[config.strategy];
  const o2Support   = STRATEGY_TO_O2_SUPPORT[config.strategy];

  ps.setRespiratorySupport(respSupport);
  ps.setO2Support(o2Support);

  if (config.strategy === 'arm') {
    ps.setVentilatorConnected(true);
    if (config.fiO2 !== undefined) {
      ps.setVentilator({ fio2: config.fiO2 });
    }
    if (config.peep !== undefined) {
      ps.setVentilator({ peep: config.peep });
    }
  } else {
    ps.setVentilatorConnected(false);
    if (config.strategy === 'nasal_cannula' && config.flowLpm !== undefined) {
      ps.setRespiratoryDevice({ cannulaFlow: config.flowLpm });
    }
    if (config.strategy === 'hfnc') {
      ps.setRespiratoryDevice({
        hfncFlow:  config.flowLpm ?? 40,
        hfncFiO2:  config.fiO2   ?? 0.40,
      });
    }
  }
}

// ─── Fachada pública (ScenarioSelectorModal la llama) ────────────────────────

export class SimulationLauncher {
  static suggest(scenario: ScenarioDefinition, difficulty: number): O2Strategy {
    return suggestStrategy(scenario, difficulty);
  }

  /**
   * Pasa el config al applyScenario() para aplicarlo AL FINAL del pipeline asíncrono,
   * DESPUÉS de que el escenario establezca sus propios valores — evitando sobrescritura.
   * No llama applyLauncherConfig() directamente aquí.
   */
  static apply(config: LauncherConfig): void {
    useScenarioStore.getState().applyScenario(config);
  }
}
