// tests/integration/area2.pharmaUx.spec.ts — ÁREA 2
import { describe, it, expect } from 'vitest';
import { usePharmacologyStore, DRUG_CATALOG } from '../../src/store/usePharmacologyStore';
import { usePatientStore }       from '../../src/store/usePatientStore';
import { useUIStore }            from '../../src/store/useUIStore';
import { computeInfusionRate }   from '../../src/utils/DrugCalculator';
import { doseToCcH }             from '../../src/utils/dilutionTable';
import { advanceSimSeconds }     from '../helpers/timeAdvance';
import { applyTCEGrave }         from '../fixtures/clinicalCases';
import { DRUG_MAX_DOSES }        from '../../src/core/PharmacologyEngine';

// ─── Suite: cc/h correctness ─────────────────────────────────────────────────

describe('cc/h calculation correctness for all drug categories', () => {
  const weight = 70;

  it('Noradrenalina 0.1 mcg/kg/min → ≈ 6.6 cc/h (64 mcg/mL)', () => {
    const r = computeInfusionRate({ dose: 0.1, inputUnit: 'mcg/kg/min', weightKg: weight, concentration: 64, concentrationUnit: 'mcg/mL' });
    expect(r).toBeCloseTo(6.6, 1);
  });

  it('Dobutamina 5 mcg/kg/min → ≈ 21 cc/h (1 mg/mL)', () => {
    const r = computeInfusionRate({ dose: 5, inputUnit: 'mcg/kg/min', weightKg: weight, concentration: 1, concentrationUnit: 'mg/mL' });
    expect(r).toBeCloseTo(21.0, 0);
  });

  it('Propofol 2 mg/kg/h → 14 cc/h (10 mg/mL)', () => {
    const r = computeInfusionRate({ dose: 2, inputUnit: 'mg/kg/h', weightKg: weight, concentration: 10, concentrationUnit: 'mg/mL' });
    expect(r).toBeCloseTo(14.0, 1);
  });

  it('Rocuronio 0.5 mg/kg/h → 3.5 cc/h (10 mg/mL)', () => {
    const r = doseToCcH('rocuronium', 0.5, 'mg/kg/h', weight);
    expect(r).toBeCloseTo(3.5, 1);
  });

  it('Atracurio 0.6 mg/kg/h → 42 cc/h (1 mg/mL)', () => {
    const r = doseToCcH('atracurium', 0.6, 'mg/kg/h', weight);
    expect(r).toBeCloseTo(42.0, 0);
  });

  it('Cisatracurio 0.18 mg/kg/h → 6.3 cc/h (2 mg/mL)', () => {
    const r = doseToCcH('cisatracurium', 0.18, 'mg/kg/h', weight);
    expect(r).toBeCloseTo(6.3, 1);
  });

  it('Pancuronio 0.06 mg/kg/h → 21 cc/h (0.2 mg/mL)', () => {
    const r = doseToCcH('pancuronium', 0.06, 'mg/kg/h', weight);
    expect(r).toBeCloseTo(21.0, 0);
  });
});

// ─── Suite: InfusionControl store behavior (no-readonly) ─────────────────────

describe('InfusionControl read-only bug — store level', () => {
  it('setInfusionRate: 0 → 1.5 works', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 1.5);
    expect(usePharmacologyStore.getState().infusionRates['propofol']).toBe(1.5);
  });

  it('setInfusionRate: 1.5 → 2.5 without reset (no read-only)', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 1.5);
    usePharmacologyStore.getState().setInfusionRate('propofol', 2.5);
    expect(usePharmacologyStore.getState().infusionRates['propofol']).toBe(2.5);
  });

  it('setInfusionRate: 2.5 → 0 (stop)', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 2.5);
    usePharmacologyStore.getState().setInfusionRate('propofol', 0);
    expect(usePharmacologyStore.getState().infusionRates['propofol'] ?? 0).toBe(0);
  });

  it('After stop → setRate again works', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 2.5);
    usePharmacologyStore.getState().setInfusionRate('propofol', 0);
    usePharmacologyStore.getState().setInfusionRate('propofol', 0.8);
    expect(usePharmacologyStore.getState().infusionRates['propofol']).toBe(0.8);
  });

  it('Noradrenaline: multiple incremental changes work', () => {
    for (let v = 0.1; v <= 0.5; v += 0.1) {
      usePharmacologyStore.getState().setInfusionRate('noradrenaline', parseFloat(v.toFixed(1)));
    }
    expect(usePharmacologyStore.getState().infusionRates['noradrenaline']).toBeCloseTo(0.5, 1);
  });
});

// ─── Suite: dripUnitMode gate ─────────────────────────────────────────────────

describe('dripUnitMode gate for cc/h display', () => {
  it('doseToCcH returns 0 when rate=0 (no display needed)', () => {
    expect(doseToCcH('noradrenaline', 0, 'mcg/kg/min', 70)).toBe(0);
  });

  it('doseToCcH returns > 0 when rate > 0', () => {
    expect(doseToCcH('noradrenaline', 0.1, 'mcg/kg/min', 70)).toBeGreaterThan(0);
  });

  it('dripUnitMode toggle changes UIStore correctly', () => {
    useUIStore.getState().setDripUnitMode('medical');
    expect(useUIStore.getState().dripUnitMode).toBe('medical');
    useUIStore.getState().setDripUnitMode('cc_h');
    expect(useUIStore.getState().dripUnitMode).toBe('cc_h');
  });
});

// ─── Suite: Manitol bolus + ICP effect ───────────────────────────────────────

describe('Manitol bolus admin + ICP effect', () => {
  it('mannitol is in DrugCatalog and DRUG_MAX_DOSES', () => {
    expect(DRUG_CATALOG['mannitol']).toBeDefined();
    expect(DRUG_MAX_DOSES['mannitol']).toBeGreaterThan(0);
  });

  it('queueBolusRatio for mannitol updates cpRatio', () => {
    const store = usePharmacologyStore.getState();
    const maxRate   = DRUG_MAX_DOSES['mannitol'];
    const halfLifeH = DRUG_CATALOG['mannitol'].halfLifeMin / 60;
    const ratio     = Math.min(3.0, 0.5 / (maxRate * halfLifeH));

    store.queueBolusRatio('mannitol', ratio);
    advanceSimSeconds(30, 1);

    const cp = usePharmacologyStore.getState().plasmaConcentrations['mannitol'] ?? 0;
    expect(cp).toBeGreaterThan(0);
  });

  it('Manitol bolus reduces ICP after 120 sim-sec in neuro case', () => {
    applyTCEGrave();
    const initialICP = usePatientStore.getState().vitals.icp;
    expect(initialICP).toBeGreaterThan(20);

    const maxRate   = DRUG_MAX_DOSES['mannitol'];
    const halfLifeH = DRUG_CATALOG['mannitol'].halfLifeMin / 60;
    const ratio     = Math.min(3.0, 0.5 / (maxRate * halfLifeH));
    usePharmacologyStore.getState().queueBolusRatio('mannitol', ratio);

    advanceSimSeconds(120, 1);

    const finalICP = usePatientStore.getState().vitals.icp;
    expect(finalICP).toBeLessThan(initialICP);
  });
});
