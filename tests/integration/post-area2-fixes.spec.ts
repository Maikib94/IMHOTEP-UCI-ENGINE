// tests/integration/post-area2-fixes.spec.ts
import { describe, it, expect } from 'vitest';
import { usePharmacologyStore, DRUG_CATALOG, type DrugId } from '../../src/store/usePharmacologyStore';
import { useTimeStore }          from '../../src/store/useTimeStore';
import { DRUG_MAX_DOSES }        from '../../src/core/PharmacologyEngine';
import { advanceSimSeconds }     from '../helpers/timeAdvance';

// ─── Bug 1: Liberación de techo de dosis ─────────────────────────────────────

describe('Bug 1 — Dose cap removed from InfusionControl (store level)', () => {
  it('Noradrenalina accepts 50 mcg/kg/min (10× clinical cap)', () => {
    usePharmacologyStore.getState().setInfusionRate('noradrenaline', 50);
    expect(usePharmacologyStore.getState().infusionRates['noradrenaline']).toBe(50);
  });

  it('Propofol accepts 20 mg/kg/h (5× clinical cap)', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 20);
    expect(usePharmacologyStore.getState().infusionRates['propofol']).toBe(20);
  });

  it('Fentanil accepts 100 mcg/kg/h', () => {
    usePharmacologyStore.getState().setInfusionRate('fentanyl', 100);
    expect(usePharmacologyStore.getState().infusionRates['fentanyl']).toBe(100);
  });

  it('Rocuronium accepts 5 mg/kg/h (8× cap)', () => {
    usePharmacologyStore.getState().setInfusionRate('rocuronium', 5);
    expect(usePharmacologyStore.getState().infusionRates['rocuronium']).toBe(5);
  });

  it('PharmacologyEngine computes cpRatio > 1 for supramaximal noradrenaline at steady state', () => {
    usePharmacologyStore.getState().setInfusionRate('noradrenaline', 10);
    // t½ noradrenaline = 2.5 min → need ~5×t½ = 12.5 min to reach steady state
    advanceSimSeconds(900, 10); // 15 min sim
    const cp = usePharmacologyStore.getState().plasmaConcentrations['noradrenaline'] ?? 0;
    expect(cp).toBeGreaterThan(1);
  });

  it('Stopper to 0 still works after supramaximal dose', () => {
    usePharmacologyStore.getState().setInfusionRate('propofol', 20);
    usePharmacologyStore.getState().setInfusionRate('propofol', 0);
    expect(usePharmacologyStore.getState().infusionRates['propofol'] ?? 0).toBe(0);
  });
});

// ─── Bug 2: Antiarrítmicos structure (store level) ───────────────────────────

describe('Bug 2 — Antiarrhythmic drugs store behavior', () => {
  it('amiodarone infusion rate can be set independently of bolus', () => {
    usePharmacologyStore.getState().setInfusionRate('amiodarone', 30);
    expect(usePharmacologyStore.getState().infusionRates['amiodarone']).toBe(30);
  });

  it('esmolol infusion rate can be set', () => {
    usePharmacologyStore.getState().setInfusionRate('esmolol', 100);
    expect(usePharmacologyStore.getState().infusionRates['esmolol']).toBe(100);
  });
});

// ─── Bug 3: Bolus registration in agenda ─────────────────────────────────────
// useBolusAdmin is a React hook — test the underlying store methods directly.

function simulateAdminBolus(drug: DrugId, doseMg: number, route: 'iv' | 'oral' = 'iv') {
  if (!Number.isFinite(doseMg) || doseMg <= 0) return;
  const maxRate   = DRUG_MAX_DOSES[drug] ?? 1;
  const halfLifeH = (DRUG_CATALOG[drug]?.halfLifeMin ?? 60) / 60;
  const ratio     = Math.min(3.0, doseMg / (maxRate * halfLifeH));
  usePharmacologyStore.getState().queueBolusRatio(drug, ratio);
  const tick = useTimeStore.getState().ticks;
  usePharmacologyStore.getState().addBolusHistory(drug, doseMg, tick, route);
}

describe('Bug 3 — Bolus now registers in bolusHistory (store level)', () => {
  it('adminBolus adds entry to bolusHistory', () => {
    const before = usePharmacologyStore.getState().bolusHistory.length;
    simulateAdminBolus('propofol', 100);
    expect(usePharmacologyStore.getState().bolusHistory.length).toBe(before + 1);
  });

  it('bolusHistory entry has correct drug and doseMg', () => {
    simulateAdminBolus('propofol', 100);
    const entry = usePharmacologyStore.getState().bolusHistory.at(-1);
    expect(entry?.drug).toBe('propofol');
    expect(entry?.doseMg).toBe(100);
    expect(entry?.route).toBe('iv');
  });

  it('tickAt uses current time store tick', () => {
    useTimeStore.setState({ ticks: 1234, simulatedElapsed: 1234 });
    simulateAdminBolus('rocuronium', 50);
    const entry = usePharmacologyStore.getState().bolusHistory.at(-1);
    expect(entry?.tickAt).toBe(1234);
  });

  it('Invalid doses (NaN, 0, negative) do NOT register', () => {
    const before = usePharmacologyStore.getState().bolusHistory.length;
    simulateAdminBolus('propofol', NaN);
    simulateAdminBolus('midazolam', 0);
    simulateAdminBolus('fentanyl', -1);
    expect(usePharmacologyStore.getState().bolusHistory.length).toBe(before);
  });

  it('Manitol: 0.5 g/kg × 70kg = 35,000 mg registers correctly', () => {
    const totalMg = 0.5 * 70 * 1000;
    simulateAdminBolus('mannitol', totalMg);
    const entry = usePharmacologyStore.getState().bolusHistory.at(-1);
    expect(entry?.drug).toBe('mannitol');
    expect(entry?.doseMg).toBe(35000);
  });

  it('Multiple boluses all appear in history', () => {
    const before = usePharmacologyStore.getState().bolusHistory.length;
    simulateAdminBolus('propofol', 100);
    simulateAdminBolus('rocuronium', 50);
    simulateAdminBolus('mannitol', 35000);
    expect(usePharmacologyStore.getState().bolusHistory.length).toBe(before + 3);
  });
});
