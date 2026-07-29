// tests/unit/drugCalculator.spec.ts — FASE 1
import { describe, it, expect } from 'vitest';
import { computeInfusionRate, computeDoseFromRate } from '../../src/utils/DrugCalculator';

describe('DrugCalculator.computeInfusionRate', () => {
  it('Noradrenalina 0.1 mcg/kg/min @ 70kg @ 64mcg/mL = 6.6 cc/h', () => {
    expect(computeInfusionRate({
      dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: 64, concentrationUnit: 'mcg/mL',
    })).toBeCloseTo(6.6, 1);
  });

  it('Fentanilo 2 mcg/kg/h @ 70kg @ 50mcg/mL = 2.8 cc/h', () => {
    expect(computeInfusionRate({
      dose: 2, inputUnit: 'mcg/kg/h', weightKg: 70,
      concentration: 50, concentrationUnit: 'mcg/mL',
    })).toBeCloseTo(2.8, 1);
  });

  it('Propofol 2 mg/kg/h @ 70kg @ 10mg/mL = 14 cc/h', () => {
    expect(computeInfusionRate({
      dose: 2, inputUnit: 'mg/kg/h', weightKg: 70,
      concentration: 10, concentrationUnit: 'mg/mL',
    })).toBeCloseTo(14.0, 1);
  });

  it('Vasopresina 2.4 U/h @ 0.2 U/mL = 12 cc/h', () => {
    expect(computeInfusionRate({
      dose: 2.4, inputUnit: 'U/h', weightKg: 70,
      concentration: 0.2, concentrationUnit: 'U/mL',
    })).toBeCloseTo(12.0, 1);
  });

  it('Morfina 4 mg/h @ 1 mg/mL = 4 cc/h', () => {
    expect(computeInfusionRate({
      dose: 4, inputUnit: 'mg/h', weightKg: 70,
      concentration: 1, concentrationUnit: 'mg/mL',
    })).toBeCloseTo(4.0, 1);
  });

  it('Defensa: weight=0 retorna 0 sin throw', () => {
    expect(() => computeInfusionRate({
      dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 0,
      concentration: 64, concentrationUnit: 'mcg/mL',
    })).not.toThrow();
    expect(computeInfusionRate({
      dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 0,
      concentration: 64, concentrationUnit: 'mcg/mL',
    })).toBe(0);
  });

  it('Defensa: concentration=NaN retorna 0 sin throw', () => {
    expect(computeInfusionRate({
      dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: NaN, concentrationUnit: 'mcg/mL',
    })).toBe(0);
  });

  it('Defensa: concentration=-5 retorna 0 sin throw', () => {
    expect(computeInfusionRate({
      dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: -5, concentrationUnit: 'mcg/mL',
    })).toBe(0);
  });

  it('Defensa: dose=Infinity retorna 0 sin throw', () => {
    expect(computeInfusionRate({
      dose: Infinity, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: 64, concentrationUnit: 'mcg/mL',
    })).toBe(0);
  });

  it('Cambio de peso 70→80kg recalcula proporcionalmente', () => {
    const r70 = computeInfusionRate({ dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 70, concentration: 64, concentrationUnit: 'mcg/mL' });
    const r80 = computeInfusionRate({ dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: 80, concentration: 64, concentrationUnit: 'mcg/mL' });
    expect(r80).toBeCloseTo(r70 * (80 / 70), 1);
  });
});

describe('DrugCalculator.computeDoseFromRate (inverso)', () => {
  it('6.6 cc/h @ 64mcg/mL @ 70kg → ~0.1 mcg/kg/min', () => {
    const dose = computeDoseFromRate({
      rateMlH: 6.6, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: 64, concentrationUnit: 'mcg/mL',
    });
    expect(dose).toBeCloseTo(0.1, 2);
  });

  it('Roundtrip: computeDoseFromRate(computeInfusionRate(p)) ≈ p.dose', () => {
    const params = { dose: 0.15, inputUnit: 'mcg/kg/min' as const, weightKg: 70, concentration: 64, concentrationUnit: 'mcg/mL' as const };
    const rate   = computeInfusionRate(params);
    const back   = computeDoseFromRate({ rateMlH: rate, inputUnit: params.inputUnit, weightKg: params.weightKg, concentration: params.concentration, concentrationUnit: params.concentrationUnit });
    expect(back).toBeCloseTo(params.dose, 2);
  });
});
