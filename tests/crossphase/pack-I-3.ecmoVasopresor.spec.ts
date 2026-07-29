// tests/crossphase/pack-I-3.ecmoVasopresor.spec.ts
// PACK-I-3: Activación ECMO + ajuste Noradrenalina (Fases 1+3 cruzadas)
import { describe, it, expect } from 'vitest';
import { useECMOStore }          from '../../src/store/useECMOStore';
import { usePatientStore }       from '../../src/store/usePatientStore';
import { usePharmacologyStore }  from '../../src/store/usePharmacologyStore';
import { computeInfusionRate }   from '../../src/utils/DrugCalculator';
import { applySepsisSdra }       from '../fixtures/clinicalCases';
import { advanceSimSeconds }     from '../helpers/timeAdvance';

describe('PACK-I-3: ECMO + Noradrenalina cross-phase', () => {
  it('✓ Computación cc/h noradrenalina a dosis inicial', () => {
    const ccH_inicial = computeInfusionRate({
      dose: 0.5, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: 32, concentrationUnit: 'mcg/mL',
    });
    expect(ccH_inicial).toBeGreaterThan(0);

    const ccH_reducida = computeInfusionRate({
      dose: 0.2, inputUnit: 'mcg/kg/min', weightKg: 70,
      concentration: 32, concentrationUnit: 'mcg/mL',
    });
    expect(ccH_reducida).toBeLessThan(ccH_inicial * 0.5);
  });

  it('✓ ECMO VV activado + 60s sim → PaO2 mejora desde baseline séptico', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);

    const initialPaO2 = usePatientStore.getState().vitals.paO2;

    useECMOStore.getState().setActive(true);
    useECMOStore.getState().configure({
      mode: 'vv', bloodFlowLmin: 4, sweepFlowLmin: 4,
      membraneFiO2: 1.0, outputSaO2: 0.99,
    });

    advanceSimSeconds(60, 1);

    const finalPaO2 = usePatientStore.getState().vitals.paO2;
    expect(finalPaO2).toBeGreaterThan(initialPaO2);
  });

  it('✓ procedures.ecmo flag reflects ECMO context', () => {
    applySepsisSdra();
    usePatientStore.getState().setProcedure('ecmo', true);
    expect(usePatientStore.getState().procedures.ecmo).toBe(true);
  });

  it('✓ Cardiovascular engine stays stable with ECMO + vasopressor', () => {
    applySepsisSdra();
    usePatientStore.getState().setVentilatorConnected(true);

    useECMOStore.getState().setActive(true);
    useECMOStore.getState().configure({
      mode: 'vv', bloodFlowLmin: 3, sweepFlowLmin: 3,
      membraneFiO2: 0.8, outputSaO2: 0.98,
    });
    usePharmacologyStore.getState().setInfusionRate('noradrenaline', 0.3);

    advanceSimSeconds(30, 0.5);

    const v = usePatientStore.getState().vitals;
    expect(Number.isFinite(v.meanArterialPressure)).toBe(true);
    expect(Number.isFinite(v.cardiacOutput)).toBe(true);
    expect(v.meanArterialPressure).toBeGreaterThan(20);
    expect(v.meanArterialPressure).toBeLessThan(200);
  });

  it('✓ cc/h ratio correct between doses', () => {
    const r05 = computeInfusionRate({ dose: 0.5, inputUnit: 'mcg/kg/min', weightKg: 70, concentration: 32, concentrationUnit: 'mcg/mL' });
    const r02 = computeInfusionRate({ dose: 0.2, inputUnit: 'mcg/kg/min', weightKg: 70, concentration: 32, concentrationUnit: 'mcg/mL' });
    expect(r05 / r02).toBeCloseTo(0.5 / 0.2, 1);
  });
});
