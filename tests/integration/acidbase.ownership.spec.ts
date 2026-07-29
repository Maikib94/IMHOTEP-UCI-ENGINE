// tests/integration/acidbase.ownership.spec.ts
// Verifica la propiedad unica del eje acido-base tras el refactor:
//   RespiratoryEngine  -> paO2, paCO2, spo2, etco2
//   AcidBaseEngine     -> pH, hco3, baseExcess, anionGap, deltaDelta
import { describe, it, expect, beforeEach } from 'vitest';
import { usePatientStore } from '../../src/store/usePatientStore';
import { RespiratoryEngine } from '../../src/core/RespiratoryEngine';
import { AcidBaseEngine } from '../../src/core/AcidBaseEngine';
import { advanceSimSeconds } from '../helpers/timeAdvance';
import { applySepsisSdra, applyUrosepsisESBL } from '../fixtures/clinicalCases';

const FORBIDDEN_KEYS = ['pH', 'hco3', 'baseExcess'] as const;

beforeEach(() => {
  // Los engines son singletons: limpiar su estado interno entre tests
  // (storeReset.ts ya limpia los stores de Zustand, pero no estos campos privados).
  RespiratoryEngine.getInstance().reset();
  AcidBaseEngine.getInstance().reset();
});

describe('Acid-base axis: single-writer ownership', () => {
  it('TEST 1 - RespiratoryEngine nunca escribe pH, hco3 ni baseExcess', () => {
    const original = usePatientStore.getState().updateVitals;
    const calls: Record<string, unknown>[] = [];
    usePatientStore.setState({
      updateVitals: (partial) => {
        calls.push(partial);
        original(partial);
      },
    });

    try {
      const engine = RespiratoryEngine.getInstance();
      for (let i = 0; i < 100; i++) {
        engine.update(0.5);
      }
    } finally {
      usePatientStore.setState({ updateVitals: original });
    }

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      for (const key of FORBIDDEN_KEYS) {
        expect(call).not.toHaveProperty(key);
      }
    }
  });

  it('TEST 2 - la acidosis metabolica ya no se lava con el bicarbonato del respirador', () => {
    applySepsisSdra();
    // Shock septico refractario sostenido: DO2 por debajo del critico
    // (~7 mL/kg/min) durante toda la ventana, para que la produccion
    // anaerobia de lactato de AcidBaseEngine se mantenga (en vez de un
    // lactato forzado una sola vez que su propia ODE de aclaramiento
    // revertiria, generando un rebote artificial). Se llama a AcidBaseEngine
    // directamente para aislar su logica de la convergencia hemodinamica
    // de CardiovascularEngine (cubierta por otros specs).
    const dt = 0.5;
    const steps = Math.round(1800 / dt); // 30 min sim
    for (let i = 0; i < steps; i++) {
      usePatientStore.getState().updateVitals({
        cardiacOutput: 2.2, spo2: 82, paO2: 48,
      });
      AcidBaseEngine.getInstance().update(dt);
    }

    const v = usePatientStore.getState().vitals;
    // Antes del fix: RespiratoryEngine arrastraba hco3 de vuelta a ~22-24
    // por su propio target (24 + 0.1*(PaCO2-40)), ignorando el lactato.
    expect(v.hco3).toBeLessThan(18);
    expect(v.pH).toBeLessThan(7.30);
  });

  it('TEST 3 - compensacion aguda correcta (coeficiente 0.10, no 0.35)', () => {
    // Paciente base sano, hipoventilacion aguda SOSTENIDA. Se fija paCO2=60
    // en cada tick para aislar la logica de compensacion de AcidBaseEngine
    // de la convergencia del modelo de intercambio gaseoso del ventilador
    // (esa convergencia ya esta cubierta por otros specs de RespiratoryEngine).
    const dt = 0.5;
    const steps = Math.round(3600 / dt); // 1 h sim
    for (let i = 0; i < steps; i++) {
      usePatientStore.getState().updateVitals({ paCO2: 60 });
      AcidBaseEngine.getInstance().update(dt);
    }

    const v = usePatientStore.getState().vitals;
    // 24 + 0.10*20 = 26 es el asintota agudo; en 1h el tau renal (~3.5h)
    // solo permite alcanzar una fraccion de esa distancia (~24.5).
    // Con el coeficiente cronico viejo (0.35 fijo, sin rampa) el mismo
    // escenario habria llegado a ~25.75 en 1h — el limite superior aqui
    // (25.2) detecta una regresion a ese comportamiento.
    expect(v.hco3).toBeGreaterThan(24);
    expect(v.hco3).toBeLessThan(25.2);
  });

  it('TEST 4 - sin NaN ni valores fuera de rango fisiologico', () => {
    applyUrosepsisESBL();
    advanceSimSeconds(7200, 0.5); // 2 h sim

    const v = usePatientStore.getState().vitals;
    expect(Number.isFinite(v.pH)).toBe(true);
    expect(Number.isFinite(v.hco3)).toBe(true);
    expect(Number.isFinite(v.baseExcess)).toBe(true);
    expect(Number.isFinite(v.anionGap)).toBe(true);
    expect(v.pH).toBeGreaterThanOrEqual(6.80);
    expect(v.pH).toBeLessThanOrEqual(7.80);
  }, 20_000); // 14400 ticks x 8 engines — mas lento que el timeout default bajo carga
});
