export { neuroCriticalScenarios }     from './neuroCriticalScenarios';
export { sepsisScenarios }            from './sepsisScenarios';
export { polytraumaScenarios }        from './polytraumaScenarios';
export { burnScenarios }              from './burnScenarios';
export { respiratoryScenarios }       from './respiratoryScenarios';
export { cardioScenarios }            from './cardioScenarios';
export { surgicalAbdominalScenarios } from './surgicalAbdominalScenarios';
export { neuroExtScenarios }          from './neuro/index';
export { cardiacExtScenarios }        from './cardiac/index';
export { respiratoryExtScenarios }    from './respiratory/index';
export { sepsisExtScenarios }         from './sepsis_ext/index';
export { metabolicScenarios }         from './metabolic/index';
export { traumaBurnExtScenarios }     from './trauma_burn_ext/index';
export { endocrineScenarios }         from './endocrineScenarios';
export { hematoScenarios }            from './hematoScenarios';
export { obstetricScenarios }         from './obstetricScenarios';

import { neuroCriticalScenarios }     from './neuroCriticalScenarios';
import { sepsisScenarios }            from './sepsisScenarios';
import { polytraumaScenarios }        from './polytraumaScenarios';
import { burnScenarios }              from './burnScenarios';
import { respiratoryScenarios }       from './respiratoryScenarios';
import { cardioScenarios }            from './cardioScenarios';
import { surgicalAbdominalScenarios } from './surgicalAbdominalScenarios';
import { neuroExtScenarios }          from './neuro/index';
import { cardiacExtScenarios }        from './cardiac/index';
import { respiratoryExtScenarios }    from './respiratory/index';
import { sepsisExtScenarios }         from './sepsis_ext/index';
import { metabolicScenarios }         from './metabolic/index';
import { traumaBurnExtScenarios }     from './trauma_burn_ext/index';
import { endocrineScenarios }         from './endocrineScenarios';
import { hematoScenarios }            from './hematoScenarios';
import { obstetricScenarios }         from './obstetricScenarios';
import type { ScenarioDefinition }    from '../store/useScenarioStore';
import {
  type ClinicalCategory,
  normalizeCategory,
} from '../types/ClinicalCategory';

export const ALL_SCENARIOS: ScenarioDefinition[] = [
  ...neuroCriticalScenarios,
  ...neuroExtScenarios,
  ...sepsisScenarios,
  ...sepsisExtScenarios,
  ...metabolicScenarios,
  ...polytraumaScenarios,
  ...traumaBurnExtScenarios,
  ...burnScenarios,
  ...respiratoryScenarios,
  ...respiratoryExtScenarios,
  ...cardioScenarios,
  ...cardiacExtScenarios,
  ...surgicalAbdominalScenarios,
  ...endocrineScenarios,
  ...hematoScenarios,
  ...obstetricScenarios,
];

/**
 * Agrupación dinámica con LEGACY_CATEGORY_MAP.
 * Área 5: 'metabolic' → 'endocrino'; nuevas categorías: endocrino/hemato/obstetricia.
 */
export const SCENARIOS_BY_CATEGORY: Record<ClinicalCategory, ScenarioDefinition[]> = (() => {
  const result: Record<ClinicalCategory, ScenarioDefinition[]> = {
    general:    [],
    neuro:      [],
    cardio:     [],
    pneumo:     [],
    infecto:    [],
    endocrino:  [],
    hemato:     [],
    cirugia:    [],
    trauma:     [],
    quemados:   [],
    obstetricia:[],
  };
  for (const sc of ALL_SCENARIOS) {
    const cat = normalizeCategory(sc.category as string);
    result[cat].push(sc);
  }
  return result;
})();
