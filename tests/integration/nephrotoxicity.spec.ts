// tests/integration/nephrotoxicity.spec.ts
//
// C1.7 commit 1 — verificacion clinica de la tasa de nefrotoxicidad por
// antibiotico tras corregir el bug de unidades en
// MicrobiologyEngine.applyNephrotoxicity() (nephroStressorRate esta en
// Cr/h, dt en segundos — faltaba dividir por 3600).
//
// Nota de infraestructura: tests/helpers/timeAdvance.ts (advanceSimSeconds)
// NO incluye MicrobiologyEngine en su cadena (solo Pathology, Pharmacology,
// Renal, Respiratory, Cardiovascular, AcidBase, Crosstalk, AcuteMortality).
// Este spec llama a MicrobiologyEngine.getInstance().update(dt) directamente
// en un loop propio, mismo dt/duracion que pedia el prompt via
// advanceSimSeconds(86400, 0.25) — no se modifico el helper compartido para
// no ampliar el alcance de este PR a todos los specs que lo usan.
//
// MicrobiologyEngine.update() esta gateado por sepsis.isActive — se activa
// sepsis solo para levantar ese gate, no para modelar la infeccion en si.

import { describe, it, expect } from 'vitest';
import { usePatientStore } from '../../src/store/usePatientStore';
import { usePathologyStore } from '../../src/store/usePathologyStore';
import { useMicrobiologyStore } from '../../src/store/useMicrobiologyStore';
import { useTimeStore } from '../../src/store/useTimeStore';
import { MicrobiologyEngine } from '../../src/core/MicrobiologyEngine';

const DT = 0.25; // x60 — el dt real mas grueso que existe en la UI
const DURATION_S = 86400; // 24 h sim

interface Case {
  antibioticId: string;
  label: string;
  expectedMin: number | null; // mg/dL en 24h; null = sin rango especificado por el director clinico
  expectedMax: number | null;
}

const CASES: Case[] = [
  { antibioticId: 'vancomycin',    label: 'vancomicina',     expectedMin: 0.2, expectedMax: 0.5 },
  { antibioticId: 'amikacin',      label: 'aminoglucosido (amikacina)',   expectedMin: 0.3, expectedMax: 0.6 },
  { antibioticId: 'gentamicin',    label: 'aminoglucosido (gentamicina)', expectedMin: 0.3, expectedMax: 0.6 },
  { antibioticId: 'tobramycin',    label: 'aminoglucosido (tobramicina)', expectedMin: 0.3, expectedMax: 0.6 },
  { antibioticId: 'colistin',      label: 'colistina',       expectedMin: 0.4, expectedMax: 0.8 },
  { antibioticId: 'polymyxin_b',   label: 'polimixina B',    expectedMin: 0.4, expectedMax: 0.8 },
  { antibioticId: 'amphotericin_b',label: 'anfotericina B',  expectedMin: 0.4, expectedMax: 0.9 },
  { antibioticId: 'teicoplanin',   label: 'teicoplanina (sin rango especificado)', expectedMin: null, expectedMax: null },
];

interface Row {
  antibiotico: string;
  deltaCr24h: number;
  esperado: string;
  veredicto: string;
}
const rows: Row[] = [];

describe('C1.7 commit 1 — ascenso de creatinina a 24h por antibiotico nefrotoxico (post /3600)', () => {
  for (const c of CASES) {
    it(`${c.label}: delta Cr en 24h dentro de rango clinico esperado`, () => {
      // Paciente base sano, sin otra injuria renal.
      usePatientStore.getState().updateVitals({
        creatinine: 1.0, meanArterialPressure: 75, weight: 70, urineOutput: 1.0,
      });
      usePathologyStore.getState().resetAllPathologies();
      usePathologyStore.getState().activatePathology('sepsis', null, 0.5); // solo para levantar el gate
      useMicrobiologyStore.getState().resetMicrobiology();
      useMicrobiologyStore.getState().startAntibiotic(c.antibioticId, useTimeStore.getState().ticks, false);

      const steps = Math.round(DURATION_S / DT);
      for (let i = 0; i < steps; i++) {
        useTimeStore.getState().advanceTick(DT);
        MicrobiologyEngine.getInstance().update(DT);
      }

      const deltaCr = usePatientStore.getState().vitals.creatinine - 1.0;
      const esperado = c.expectedMin === null ? 'informativo' : `${c.expectedMin}–${c.expectedMax}`;
      const inRange = c.expectedMin === null
        ? true
        : deltaCr >= c.expectedMin && deltaCr <= c.expectedMax;
      rows.push({
        antibiotico: c.label,
        deltaCr24h: Math.round(deltaCr * 1000) / 1000,
        esperado,
        veredicto: c.expectedMin === null ? 'N/A' : (inRange ? 'OK' : 'FUERA DE RANGO'),
      });

      // Limpieza — no contaminar el siguiente caso.
      useMicrobiologyStore.getState().resetMicrobiology();
      usePathologyStore.getState().resetAllPathologies();

      if (c.expectedMin !== null) {
        expect(deltaCr, `delta Cr 24h para ${c.label} = ${deltaCr.toFixed(3)} mg/dL, esperado ${esperado}`)
          .toBeGreaterThanOrEqual(c.expectedMin);
        expect(deltaCr, `delta Cr 24h para ${c.label} = ${deltaCr.toFixed(3)} mg/dL, esperado ${esperado}`)
          .toBeLessThanOrEqual(c.expectedMax);
      }
    }, 120_000);
  }

  it('tabla resumen', () => {
    console.table(rows);
    expect(rows.length).toBe(CASES.length);
  });
});
