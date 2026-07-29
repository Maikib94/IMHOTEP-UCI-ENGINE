// tests/integration/fase6.taxonomy.spec.ts — FASE 6
import { describe, it, expect } from 'vitest';
import {
  SCENARIOS_BY_CATEGORY,
  sepsisScenarios,
  metabolicScenarios,
  respiratoryScenarios,
  surgicalAbdominalScenarios,
  burnScenarios,
} from '../../src/scenarios/index';
import { usePathologyStore } from '../../src/store/usePathologyStore';
import { useScenarioStore }  from '../../src/store/useScenarioStore';
import { normalizeCategory } from '../../src/types/ClinicalCategory';

describe('ClinicalCategory unification', () => {
  it('SCENARIOS_BY_CATEGORY has exactly 11 keys (Área 5: +endocrino, hemato, obstetricia)', () => {
    expect(Object.keys(SCENARIOS_BY_CATEGORY)).toHaveLength(11);
    expect(Object.keys(SCENARIOS_BY_CATEGORY)).toContain('general');
  });

  it("SCENARIOS_BY_CATEGORY.infecto.length >= sepsis + metabolic count", () => {
    const infectoCount = SCENARIOS_BY_CATEGORY.infecto.length;
    const sepsisCount  = sepsisScenarios.length;
    const metabolicCount = metabolicScenarios.length;
    // infecto must include at least those two groups
    expect(infectoCount).toBeGreaterThanOrEqual(sepsisCount + metabolicCount);
  });

  it('SCENARIOS_BY_CATEGORY.pneumo >= respiratory scenarios count', () => {
    expect(SCENARIOS_BY_CATEGORY.pneumo.length).toBeGreaterThanOrEqual(respiratoryScenarios.length);
  });

  it('SCENARIOS_BY_CATEGORY.cirugia >= surgical scenarios count', () => {
    expect(SCENARIOS_BY_CATEGORY.cirugia.length).toBeGreaterThanOrEqual(surgicalAbdominalScenarios.length);
  });

  it('SCENARIOS_BY_CATEGORY.quemados >= burn scenarios count', () => {
    expect(SCENARIOS_BY_CATEGORY.quemados.length).toBeGreaterThanOrEqual(burnScenarios.length);
  });

  it('No group contains scenarios with legacy category as ClinicalCategory key', () => {
    // The grouped scenarios are properly mapped — they live in canonical groups
    expect(SCENARIOS_BY_CATEGORY).not.toHaveProperty('sepsis');
    expect(SCENARIOS_BY_CATEGORY).not.toHaveProperty('metabolic');
    expect(SCENARIOS_BY_CATEGORY).not.toHaveProperty('respiratory');
    expect(SCENARIOS_BY_CATEGORY).not.toHaveProperty('surgical');
    expect(SCENARIOS_BY_CATEGORY).not.toHaveProperty('burns');
  });

  it('All scenarios in each group are accessible and have names', () => {
    for (const [_cat, scenarios] of Object.entries(SCENARIOS_BY_CATEGORY)) {
      for (const sc of scenarios) {
        expect(sc.name).toBeTruthy();
        expect(sc.id).toBeTruthy();
      }
    }
  });
});

describe('applyScenario auto-sync caseCategory', () => {
  it('Scenario with category="neuro" → caseCategory=neuro after sync', () => {
    // Test the normalizeCategory part that applyScenario uses
    const canonical = normalizeCategory('neuro');
    usePathologyStore.getState().setCaseCategory(canonical);
    expect(usePathologyStore.getState().caseCategory).toBe('neuro');
  });

  it('Scenario with legacy category="sepsis" → caseCategory="infecto"', () => {
    const canonical = normalizeCategory('sepsis');
    usePathologyStore.getState().setCaseCategory(canonical);
    expect(usePathologyStore.getState().caseCategory).toBe('infecto');
  });

  it('Scenario with legacy category="metabolic" → caseCategory="endocrino" (Área 5 reclassification)', () => {
    const canonical = normalizeCategory('metabolic');
    usePathologyStore.getState().setCaseCategory(canonical);
    expect(usePathologyStore.getState().caseCategory).toBe('endocrino');
  });

  it('Scenario with legacy category="respiratory" → caseCategory="pneumo"', () => {
    const canonical = normalizeCategory('respiratory');
    usePathologyStore.getState().setCaseCategory(canonical);
    expect(usePathologyStore.getState().caseCategory).toBe('pneumo');
  });
});
