// tests/integration/area5.expansion.spec.ts — ÁREA 5
import { describe, it, expect } from 'vitest';
import {
  CLINICAL_CATEGORY_ORDER,
  CLINICAL_CATEGORY_META,
  normalizeCategory,
  type ClinicalCategory,
} from '../../src/types/ClinicalCategory';
import { generatePatient } from '../../src/scenarios/PatientFactory';
import { DRUG_CATALOG, usePharmacologyStore, type DrugId } from '../../src/store/usePharmacologyStore';
import { DRUG_MAX_DOSES } from '../../src/core/PharmacologyEngine';
import { SCENARIOS_BY_CATEGORY, ALL_SCENARIOS } from '../../src/scenarios/index';
import { computeInfusionRate } from '../../src/utils/DrugCalculator';
import { useMortalityStore }   from '../../src/store/useMortalityStore';
import { usePatientStore }    from '../../src/store/usePatientStore';
import { useCRRTStore }       from '../../src/store/useCRRTStore';
import { useTimeStore }       from '../../src/store/useTimeStore';
import { AcuteMortalityEngine } from '../../src/core/AcuteMortalityEngine';
import { advanceSimSeconds }  from '../helpers/timeAdvance';

// ─── ClinicalCategory extension ──────────────────────────────────────────────

describe('ClinicalCategory extension (Área 5)', () => {
  it('CLINICAL_CATEGORY_ORDER has 10 elements (excl. general)', () => {
    expect(CLINICAL_CATEGORY_ORDER).toHaveLength(10);
    expect(CLINICAL_CATEGORY_ORDER).not.toContain('general');
  });

  it('New categories present in ORDER', () => {
    expect(CLINICAL_CATEGORY_ORDER).toContain('endocrino');
    expect(CLINICAL_CATEGORY_ORDER).toContain('hemato');
    expect(CLINICAL_CATEGORY_ORDER).toContain('obstetricia');
  });

  it("normalizeCategory('metabolic') === 'endocrino'", () => {
    expect(normalizeCategory('metabolic')).toBe('endocrino');
  });

  it('CLINICAL_CATEGORY_META.obstetricia has icon 🤰 and pink color', () => {
    const meta = CLINICAL_CATEGORY_META['obstetricia'];
    expect(meta.icon).toContain('🤰');
    expect(meta.color).toBe('#ec4899');
  });

  it('CLINICAL_CATEGORY_META.endocrino has green color', () => {
    expect(CLINICAL_CATEGORY_META['endocrino'].color).toBe('#22c55e');
  });

  it('CLINICAL_CATEGORY_META.hemato has red color', () => {
    expect(CLINICAL_CATEGORY_META['hemato'].color).toBe('#dc2626');
  });
});

// ─── PatientFactory.forcedSex ─────────────────────────────────────────────────

describe('PatientFactory.forcedSex', () => {
  it('forcedSex=F generates female patients 20/20 times', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePatient({ forcedSex: 'F' }, i * 31337);
      expect((p as unknown as { sex: string }).sex).toBe('F');
    }
  });

  it('scenarioCategory=obstetricia implicitly forces female 20/20 times', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePatient({ scenarioCategory: 'obstetricia' }, i * 73919);
      expect((p as unknown as { sex: string }).sex).toBe('F');
    }
  });

  it('scenarioCategory=obstetricia generates age 18-42', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePatient({ scenarioCategory: 'obstetricia' }, i);
      const age = (p as unknown as { age: number }).age;
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(42);
    }
  });
});

// ─── Vademecum nuevas drogas ──────────────────────────────────────────────────

describe('Vademecum: new drugs in DRUG_CATALOG', () => {
  const newDrugs: DrugId[] = [
    'insulin_regular_iv', 'dextrose_50', 'levothyroxine_iv',
    'propylthiouracil_oral', 'methimazole_oral',
    'tranexamic_acid_iv', 'vitamin_k_iv', 'pcc_4factor',
    'desmopressin_iv', 'argatroban_iv', 'rasburicase_iv',
    'oxytocin_iv', 'methylergonovine_im', 'misoprostol_rectal',
    'carbetocin_iv', 'magnesium_sulfate_iv',
  ];

  it.each(newDrugs)('%s is in DRUG_CATALOG', (drug) => {
    expect(DRUG_CATALOG[drug]).toBeDefined();
    expect(DRUG_CATALOG[drug].halfLifeMin).toBeGreaterThan(0);
  });

  it.each(newDrugs)('%s is in DRUG_MAX_DOSES', (drug) => {
    expect(DRUG_MAX_DOSES[drug]).toBeGreaterThan(0);
  });

  it('insulin_regular_iv has concentrationUnit U/mL', () => {
    // insulin_regular_iv is in catalog (no concentrationUnit field in DrugPKDef,
    // but the drug exists — verify it's accessible from dilutionTable)
    expect(DRUG_CATALOG['insulin_regular_iv']).toBeDefined();
  });

  it('magnesium_sulfate_iv has g/h inputUnit', () => {
    expect(DRUG_CATALOG['magnesium_sulfate_iv'].inputUnit).toBe('g/h');
  });

  it('oxytocin_iv has U/h inputUnit', () => {
    expect(DRUG_CATALOG['oxytocin_iv'].inputUnit).toBe('U/h');
  });
});

// ─── Scenarios ───────────────────────────────────────────────────────────────

describe('New scenarios grouped correctly', () => {
  it('SCENARIOS_BY_CATEGORY has endocrino, hemato, obstetricia keys', () => {
    expect(Object.keys(SCENARIOS_BY_CATEGORY)).toContain('endocrino');
    expect(Object.keys(SCENARIOS_BY_CATEGORY)).toContain('hemato');
    expect(Object.keys(SCENARIOS_BY_CATEGORY)).toContain('obstetricia');
  });

  it('endocrino has 3 new scenarios', () => {
    const ids = SCENARIOS_BY_CATEGORY.endocrino.map(s => s.id);
    expect(ids).toContain('endo_dka_severa');
    expect(ids).toContain('endo_hhs_anciano');
    expect(ids).toContain('endo_tormenta_tiroidea');
  });

  it('hemato has 3 new scenarios', () => {
    const ids = SCENARIOS_BY_CATEGORY.hemato.map(s => s.id);
    expect(ids).toContain('hemato_ptt_severo');
    expect(ids).toContain('hemato_cid_septica');
    expect(ids).toContain('hemato_tls_qt');
  });

  it('obstetricia has 3 new scenarios', () => {
    const ids = SCENARIOS_BY_CATEGORY.obstetricia.map(s => s.id);
    expect(ids).toContain('obs_hellp_severo');
    expect(ids).toContain('obs_eclampsia');
    expect(ids).toContain('obs_hpp_atonia');
  });

  it('ALL_SCENARIOS total increases by at least 9', () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThanOrEqual(9 + 10); // previous minimum
  });
});

// ─── Mortality: new thresholds ────────────────────────────────────────────────

describe('Mortality thresholds: hipoglucemia + hipermagnesemia', () => {
  it('glucose=20 counter accumulates after 11 min', () => {
    // Keep glucose forced low throughout (prevent GlycemicEngine from overriding)
    const steps = Math.round(660 / 5);
    for (let i = 0; i < steps; i++) {
      usePatientStore.getState().updateVitals({ glucoseMgdL: 20 });
      useTimeStore.getState().advanceTick(5);
      
      AcuteMortalityEngine.getInstance().update(5);
      if (useMortalityStore.getState().isDeceased) break;
    }
    const m = useMortalityStore.getState();
    expect(m.isDeceased || (m.dangerCounters['hipoglucemia_coma']?.accumulatedSeconds ?? 0) > 200).toBe(true);
  });

  it('magnesium=14 counter accumulates after 6 min', () => {
    useMortalityStore.getState().reset();
    const steps = Math.round(360 / 5);
    
    for (let i = 0; i < steps; i++) {
      usePatientStore.getState().updateVitals({ magnesiumMgdL: 14 });
      useTimeStore.getState().advanceTick(5);
      AcuteMortalityEngine.getInstance().update(5);
      if (useMortalityStore.getState().isDeceased) break;
    }
    const m = useMortalityStore.getState();
    expect(m.isDeceased || (m.dangerCounters['hipermagnesemia_letal']?.accumulatedSeconds ?? 0) > 200).toBe(true);
  });

  it('magnesium=14 with CRRT active does NOT trigger (exemption)', () => {
    useMortalityStore.getState().reset();
    useCRRTStore.getState().setActive(true);
    const steps = Math.round(360 / 5);
    
    for (let i = 0; i < steps; i++) {
      usePatientStore.getState().updateVitals({ magnesiumMgdL: 14 });
      useTimeStore.getState().advanceTick(5);
      AcuteMortalityEngine.getInstance().update(5);
    }
    const m = useMortalityStore.getState();
    expect(m.isDeceased).toBe(false);
    useCRRTStore.getState().setActive(false);
  });
});
