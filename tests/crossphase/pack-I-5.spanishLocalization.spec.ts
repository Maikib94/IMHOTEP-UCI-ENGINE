// tests/crossphase/pack-I-5.spanishLocalization.spec.ts
// PACK-I-5: Localización ES — labels en todos los panels nuevos
import { describe, it, expect } from 'vitest';
import { CLINICAL_CATEGORY_META, CLINICAL_CATEGORY_ORDER } from '../../src/types/ClinicalCategory';
import { UI_LABELS_ES } from '../../src/i18n/clinicalLabels.es.ts';
import { DRUG_LABELS_ES } from '../../src/i18n/clinicalLabels.es.ts';

describe('PACK-I-5: Localización española', () => {
  it('✓ CLINICAL_CATEGORY_META.neuro.label = "Neurología"', () => {
    expect(CLINICAL_CATEGORY_META.neuro.label).toBe('Neurología');
  });

  it('✓ CLINICAL_CATEGORY_META.infecto.label = "Infectología"', () => {
    expect(CLINICAL_CATEGORY_META.infecto.label).toBe('Infectología');
  });

  it('✓ CLINICAL_CATEGORY_META.pneumo.label = "Neumología"', () => {
    expect(CLINICAL_CATEGORY_META.pneumo.label).toBe('Neumología');
  });

  it('✓ CLINICAL_CATEGORY_META.cirugia.label = "Cirugía"', () => {
    expect(CLINICAL_CATEGORY_META.cirugia.label).toBe('Cirugía');
  });

  it('✓ CLINICAL_CATEGORY_META.quemados.label = "Quemados"', () => {
    expect(CLINICAL_CATEGORY_META.quemados.label).toBe('Quemados');
  });

  it('✓ CLINICAL_CATEGORY_META.trauma.label = "Traumatología"', () => {
    expect(CLINICAL_CATEGORY_META.trauma.label).toBe('Traumatología');
  });

  it('✓ CLINICAL_CATEGORY_META.cardio.label = "Cardiología"', () => {
    expect(CLINICAL_CATEGORY_META.cardio.label).toBe('Cardiología');
  });

  it('✓ No category label contains English legacy strings', () => {
    const badLabels = ['Sepsis', 'Burns', 'Respiratory', 'Surgical', 'Metabolic'];
    for (const cat of CLINICAL_CATEGORY_ORDER) {
      const label = CLINICAL_CATEGORY_META[cat].label;
      for (const bad of badLabels) {
        expect(label).not.toContain(bad);
      }
    }
  });

  it('✓ DRUG_LABELS_ES.noradrenaline.full contains "Noradrenalina" (ES)', () => {
    expect(DRUG_LABELS_ES.noradrenaline?.full).toContain('Noradrenalina');
  });

  it('✓ UI_LABELS_ES has key "customizeCase"', () => {
    expect(UI_LABELS_ES).toHaveProperty('customizeCase');
    expect(UI_LABELS_ES.customizeCase).toBeTruthy();
  });

  it('✓ UI_LABELS_ES has category keys', () => {
    expect(UI_LABELS_ES).toHaveProperty('categoryNeuro');
    expect(UI_LABELS_ES).toHaveProperty('categoryInfecto');
    expect(UI_LABELS_ES).toHaveProperty('categoryPneumo');
  });

  it('✓ PiCCO VolumeView labels are in Spanish', () => {
    expect(UI_LABELS_ES).toHaveProperty('flow');
    expect(UI_LABELS_ES).toHaveProperty('preload');
    expect(UI_LABELS_ES).toHaveProperty('lung');
    expect(UI_LABELS_ES).toHaveProperty('contractility');
    expect(UI_LABELS_ES.flow).not.toBe('Flow');
    expect(UI_LABELS_ES.preload).not.toBe('Preload');
  });

  it('✓ All 7 visible categories have Spanish labels', () => {
    for (const cat of CLINICAL_CATEGORY_ORDER) {
      const meta = CLINICAL_CATEGORY_META[cat];
      expect(meta.label).toBeTruthy();
      expect(meta.dept).toBeTruthy();
      // Labels should not be English
      expect(meta.label).not.toMatch(/^[A-Z][a-z]+logy$/); // no "-logy" pattern (Neurology etc)
    }
  });
});
