// tests/unit/normalizeCategory.spec.ts — FASE 6
import { describe, it, expect } from 'vitest';
import { normalizeCategory, CLINICAL_CATEGORY_ORDER } from '../../src/types/ClinicalCategory';

describe('normalizeCategory legacy mapping', () => {
  it("'sepsis' → 'infecto'",      () => expect(normalizeCategory('sepsis')).toBe('infecto'));
  it("'metabolic' → 'endocrino' (Área 5: DKA/HHS son endocrinas)", () => expect(normalizeCategory('metabolic')).toBe('endocrino'));
  it("'respiratory' → 'pneumo'",  () => expect(normalizeCategory('respiratory')).toBe('pneumo'));
  it("'surgical' → 'cirugia'",    () => expect(normalizeCategory('surgical')).toBe('cirugia'));
  it("'burns' → 'quemados'",      () => expect(normalizeCategory('burns')).toBe('quemados'));
  it("'neuro' → 'neuro'",         () => expect(normalizeCategory('neuro')).toBe('neuro'));
  it("undefined → 'general'",     () => expect(normalizeCategory(undefined)).toBe('general'));
  it("null → 'general'",          () => expect(normalizeCategory(null)).toBe('general'));
  it("string desconocido → 'general'", () => expect(normalizeCategory('cardiothoracic')).toBe('general'));
  it("'infecto' → 'infecto' (idempotente)", () => expect(normalizeCategory('infecto')).toBe('infecto'));
  it("'pneumo' → 'pneumo' (idempotente)",   () => expect(normalizeCategory('pneumo')).toBe('pneumo'));
  it("'cirugia' → 'cirugia' (idempotente)", () => expect(normalizeCategory('cirugia')).toBe('cirugia'));
  it("'quemados' → 'quemados' (idempotente)", () => expect(normalizeCategory('quemados')).toBe('quemados'));
  it("'general' → 'general' (idempotente)",   () => expect(normalizeCategory('general')).toBe('general'));

  it('CLINICAL_CATEGORY_ORDER tiene 10 elementos (Área 5: +endocrino, hemato, obstetricia)', () => {
    expect(CLINICAL_CATEGORY_ORDER).toHaveLength(10);
    expect(CLINICAL_CATEGORY_ORDER).not.toContain('general');
  });

  it('Todos los valores en CLINICAL_CATEGORY_ORDER son idempotentes', () => {
    for (const cat of CLINICAL_CATEGORY_ORDER) {
      expect(normalizeCategory(cat)).toBe(cat);
    }
  });
});
