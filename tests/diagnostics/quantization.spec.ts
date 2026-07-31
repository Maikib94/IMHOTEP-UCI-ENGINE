// tests/diagnostics/quantization.spec.ts
//
// C1.5 COMMIT 1 — arnes diagnostico de cuantizacion de integradores.
//
// Este test NO cambia comportamiento y NO debe fallar. Mide, para cada
// campo de vitals con un tau conocido, si el patron
//     integrar -> escribir redondeado -> releer redondeado
// esta congelando el integrador a dt de produccion (x1, dt=1/240s,
// ver CronosEngine.DT_BASE).
//
// Regla de supervivencia de un incremento por tick:
//     sobrevive solo si   gap * (dt/tau) > quantum/2
// Si el incremento por tick es menor a medio quantum, Math.round/toFixed
// lo redondea a cero antes de que pueda acumularse, y como el valor
// releido el tick siguiente es identico al anterior, el integrador queda
// en un punto fijo espurio para siempre (no depende de N).
//
// Metodologia: la mayoria de los campos se prueban llamando DIRECTAMENTE
// al motor dueno del campo (no advanceSimSeconds / cadena completa de
// CronosEngine), fijando (pin) las entradas que determinan el target
// ANTES de cada tick. Esto aisla el integrador bajo prueba de la
// convergencia/ruido de otros motores — mismo patron ya usado y
// aceptado en tests/integration/acidbase.ownership.spec.ts (C1).
//
// Excepcion: paCO2 depende de la ventilacion minuto entregada por
// VentilatorSM100Engine (archivo fragil, no tocar), que no tiene forma
// cerrada simple de mano. Se calibra su target corriendo el mismo motor
// con dt grueso (2s) donde la cuantizacion no puede enmascarar la
// convergencia, hasta asentarse, y se usa ese valor como referencia.

import { describe, it, expect } from 'vitest';
import { usePatientStore } from '../../src/store/usePatientStore';
import { usePathologyStore } from '../../src/store/usePathologyStore';
import { usePharmacologyStore } from '../../src/store/usePharmacologyStore';
import { useCRRTStore } from '../../src/store/useCRRTStore';
import { useMicrobiologyStore } from '../../src/store/useMicrobiologyStore';
import { useTimeStore } from '../../src/store/useTimeStore';
import { RespiratoryEngine } from '../../src/core/RespiratoryEngine';
import { CardiovascularEngine } from '../../src/core/CardiovascularEngine';
import { RenalEngine } from '../../src/core/RenalEngine';
import { CrosstalkEngine } from '../../src/core/CrosstalkEngine';
import { AcidBaseEngine } from '../../src/core/AcidBaseEngine';
import { PharmacologyEngine } from '../../src/core/PharmacologyEngine';
import { MicrobiologyEngine } from '../../src/core/MicrobiologyEngine';

// dt real de produccion a velocidad x1 (CronosEngine.DT_BASE = 1/TICKS_PER_REAL_SECOND)
const DT_FINE = 1 / 240;
// dt de calibracion (grueso): sobrevive cuantizacion trivialmente, sirve
// solo para asentar un target empirico de referencia (paCO2).
const DT_CALIB = 2;

// ─── Replica de formulas privadas de RespiratoryEngine (no exportadas) ─────
// Constantes identicas a src/core/RespiratoryEngine.ts — mantener en sync
// si esas constantes cambian.
const PB = 760, PH2O = 47, RQ = 0.8, HB_NORMAL = 14;
function severinghaus(po2: number): number {
  const x = Math.max(1, po2);
  return 1 / (1 + 23400 / (Math.pow(x, 3) + 150 * x));
}
function severinghausInv(sa: number): number {
  let lo = 20, hi = 500;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (severinghaus(mid) < sa) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function hbContent(po2: number, hb: number): number {
  return 1.34 * hb * severinghaus(po2) + 0.003 * po2;
}
function o2Target(fio2: number, paCO2: number, shunt: number) {
  const pao2Alv = fio2 * (PB - PH2O) - paCO2 / RQ;
  const ccO2 = hbContent(Math.min(100, pao2Alv), HB_NORMAL);
  const cvO2 = hbContent(40, HB_NORMAL) * 0.70 + 0.003 * 40;
  const caO2 = (1 - shunt) * ccO2 + shunt * cvO2;
  const sa = Math.min(1.0, caO2 / (1.34 * HB_NORMAL));
  return { paO2Target: severinghausInv(sa), spo2Target: Math.round(sa * 100) };
}

// ─── Replica de la ODE de lactato de AcidBaseEngine (equilibrio + tau) ─────
// Solo el termino anaerobio (DO2-dependiente) — sepsis/catecolaminas/PRIS
// se dejan en 0 en el escenario de prueba.
function lactateEquilibrium(cardiacOutput: number, spo2: number, paO2: number, weightKg: number, bloodVolumeMl: number) {
  const hbEst = 14 * (bloodVolumeMl / 5000);
  const cao2 = 1.34 * hbEst * (spo2 / 100) + 0.003 * paO2;
  const do2Total = cao2 * cardiacOutput * 10;
  const do2_kgmin = do2Total / Math.max(1, weightKg);
  const DO2_CRIT = 7.0;
  const anaerobicProd = do2_kgmin < DO2_CRIT
    ? Math.pow(Math.max(0, DO2_CRIT - do2_kgmin), 1.5) * 0.4
    : 0;
  const tHalf_h = do2_kgmin >= DO2_CRIT ? 0.5 : 2.0;
  const k_clearance = Math.LN2 / (tHalf_h * 3600);
  const prodPerSec = anaerobicProd / 3600;
  return { eq: 1.0 + prodPerSec / k_clearance, tau: 1 / k_clearance };
}

// ─── Reporte ────────────────────────────────────────────────────────────────
interface Row {
  campo: string;
  modelo: 'exp' | 'lineal';
  gap: number;
  delta_esperado: number;
  delta_observado: number;
  ratio: number;
  veredicto: string;
}
const rows: Row[] = [];
const r4 = (x: number) => Math.round(x * 10000) / 10000;

function verdict(ratio: number): string {
  if (!isFinite(ratio)) return 'N/A';
  const a = Math.abs(ratio);
  if (a < 0.05) return 'CONGELADO';
  if (a > 0.80) return 'OK';
  return 'DEGRADADO';
}

function pushRow(campo: string, modelo: 'exp' | 'lineal', gap: number, deltaEsperado: number, deltaObservado: number) {
  const ratio = deltaEsperado !== 0 ? deltaObservado / deltaEsperado : (deltaObservado === 0 ? 1 : Infinity);
  rows.push({
    campo, modelo,
    gap: r4(gap),
    delta_esperado: r4(deltaEsperado),
    delta_observado: r4(deltaObservado),
    ratio: r4(ratio),
    veredicto: verdict(ratio),
  });
}

describe('C1.5 — diagnostico de cuantizacion de integradores (no falla)', () => {
  it('mide ratio observado/analitico por campo y emite tabla', () => {
    const pat = usePatientStore.getState();

    // ═══ paO2 (RespiratoryEngine, tau=30) ═══════════════════════════════════
    {
      RespiratoryEngine.getInstance().reset();
      pat.setVentilatorConnected(false); // room air, fio2 deterministico=0.21
      const { paO2Target } = o2Target(0.21, 40, 0.05); // shunt basal default = 0.05
      const initial = 150;
      pat.updateVitals({ paO2: initial, paCO2: 40, temperature: 37 });
      const gap = paO2Target - initial;
      const N = 14400; // 60 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ paCO2: 40 }); // pin driver del target
        RespiratoryEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.paO2 - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 30);
      pushRow('paO2', 'exp', gap, gap * frac, obs);
    }

    // ═══ spo2 (RespiratoryEngine, tau=5) ════════════════════════════════════
    {
      RespiratoryEngine.getInstance().reset();
      pat.setVentilatorConnected(false);
      const { spo2Target } = o2Target(0.21, 40, 0.05);
      const initial = 70;
      pat.updateVitals({ spo2: initial, paCO2: 40, temperature: 37 });
      const gap = spo2Target - initial;
      const N = 7200; // 30 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ paCO2: 40 });
        RespiratoryEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.spo2 - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 5);
      pushRow('spo2', 'exp', gap, gap * frac, obs);
    }

    // ═══ etco2 (RespiratoryEngine, tau=4) ═══════════════════════════════════
    {
      RespiratoryEngine.getInstance().reset();
      pat.setVentilatorConnected(false);
      const vdvt = 0.30, etDropoff = 3; // dx='none' (sin ARDS)
      const paCO2Fixed = 40;
      const target = Math.max(15, paCO2Fixed * (1 - vdvt) - etDropoff);
      const initial = 5;
      pat.updateVitals({ etco2: initial, paCO2: paCO2Fixed, temperature: 37 });
      const gap = target - initial;
      const N = 4800; // 20 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ paCO2: paCO2Fixed });
        RespiratoryEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.etco2 - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 4);
      pushRow('etco2', 'exp', gap, gap * frac, obs);
    }

    // ═══ paCO2 (RespiratoryEngine, tau=45) — target calibrado empiricamente ═
    // El target depende de la ventilacion minuto de VentilatorSM100Engine
    // (fragil, no tocar) — no hay formula cerrada simple. Se calibra
    // corriendo el mismo motor con dt=2s (sobrevive cuantizacion trivial)
    // hasta asentarse, y se usa ese valor asentado como referencia.
    {
      RespiratoryEngine.getInstance().reset();
      pat.setVentilatorConnected(true);
      pat.setVentilatorSettings({ mode: 'VC-AC', vt: 500, setRR: 14, fio2: 0.21, peep: 5 });
      pat.updateVitals({ paCO2: 40, temperature: 37 });
      // Calibracion: 600 s @ dt=2s (~13 tau) — deberia asentarse
      for (let i = 0; i < 300; i++) RespiratoryEngine.getInstance().update(DT_CALIB);
      const target = usePatientStore.getState().vitals.paCO2;

      RespiratoryEngine.getInstance().reset();
      pat.setVentilatorConnected(true);
      pat.setVentilatorSettings({ mode: 'VC-AC', vt: 500, setRR: 14, fio2: 0.21, peep: 5 });
      const initial = 70;
      pat.updateVitals({ paCO2: initial, temperature: 37 });
      const gap = target - initial;
      const N = 14400; // 60 s sim @ dt fino
      for (let i = 0; i < N; i++) RespiratoryEngine.getInstance().update(DT_FINE);
      const obs = usePatientStore.getState().vitals.paCO2 - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 45);
      pushRow('paCO2', 'exp', gap, gap * frac, obs);
    }

    // ═══ temperature (CardiovascularEngine, tau=300) ════════════════════════
    {
      const initial = 34.0;
      pat.updateVitals({ temperature: initial }); // bv=5000, thermoDepression=0 → target=37.0
      const gap = 37.0 - initial;
      const N = 28800; // 120 s sim
      for (let i = 0; i < N; i++) CardiovascularEngine.getInstance().updateHemodynamics(DT_FINE);
      const obs = usePatientStore.getState().vitals.temperature - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 300);
      pushRow('temperature', 'exp', gap, gap * frac, obs);
    }

    // ═══ evlwi (CardiovascularEngine, tasa fija 8e-4/s con furosemida) ══════
    // No es un integrador exponencial hacia un target — es un decremento a
    // tasa fija mientras furoActive && evlwi>7. delta_esperado es lineal.
    {
      const baselineEffects = usePharmacologyStore.getState().systemicEffects;
      usePharmacologyStore.getState().updateSystemicEffects({ ...baselineEffects, diureticEffect: 3 });
      const initial = 10.0;
      pat.updateVitals({ evlwi: initial });
      const RATE = 0.0008;
      const N = 432000; // 1800 s sim — evlwi baja ~1.44, se mantiene >7
      for (let i = 0; i < N; i++) CardiovascularEngine.getInstance().updateHemodynamics(DT_FINE);
      const obs = usePatientStore.getState().vitals.evlwi - initial;
      const deltaEsperado = -RATE * (N * DT_FINE);
      pushRow('evlwi', 'lineal', deltaEsperado, deltaEsperado, obs);
      // Restaurar diureticEffect=0 para no contaminar los campos siguientes
      // (RenalEngine lo lee para uoTarget; el bug real era que esta linea
      // antes re-escribia el mismo objeto ya mutado, no lo restauraba).
      usePharmacologyStore.getState().updateSystemicEffects(baselineEffects);
    }

    // ═══ urineOutput (RenalEngine, tau=30) ══════════════════════════════════
    {
      const MAP_FIXED = 90;
      const initial = 0.1;
      pat.updateVitals({ urineOutput: initial, meanArterialPressure: MAP_FIXED, creatinine: 1.0 });
      // uoTarget: MAP=90 >= MAP_PLATEAU_MIN(80) → bonus=(90-80)*0.008=0.08; baselineCrCl=1.0
      const target = (1.0 + 0.08) * 1.0;
      const gap = target - initial;
      const N = 21600; // 90 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ meanArterialPressure: MAP_FIXED }); // pin driver
        RenalEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.urineOutput - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / 30);
      pushRow('urineOutput', 'exp', gap, gap * frac, obs);
    }

    // ═══ creatinine (CrosstalkEngine, CRRT dose=25 mL/kg/h) ═════════════════
    {
      useCRRTStore.getState().setActive(true); // defaults: CVVHDF, dose_mLkgh=25
      const initial = 5.0;
      pat.updateVitals({ creatinine: initial, weight: 70 });
      // dCr/dt = -k*Cr (decae hacia 0) — k = qEff_Ls*sc/vdCr_L
      const weightKg = 70;
      const qEff_Ls = (25 * weightKg) / 3_600_000;
      const sc = 1.0; // CVVHDF !== 'CVVHD'
      const vdCr_L = weightKg * 0.7;
      const k = (qEff_Ls * sc) / vdCr_L;
      const tau = 1 / k;
      const target = 0;
      const gap = target - initial;
      const N = 288000; // 1200 s sim
      for (let i = 0; i < N; i++) CrosstalkEngine.getInstance().update(DT_FINE);
      const obs = usePatientStore.getState().vitals.creatinine - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / tau);
      pushRow('creatinine (CRRT)', 'exp', gap, gap * frac, obs);
      useCRRTStore.getState().setActive(false);
    }

    // ═══ lactate (AcidBaseEngine, ODE DO2-dependiente) ══════════════════════
    {
      AcidBaseEngine.getInstance().reset();
      const scenario = { cardiacOutput: 2.2, spo2: 82, paO2: 48 };
      const initial = 8.0;
      pat.updateVitals({ lactate: initial, ...scenario });
      const { eq, tau } = lactateEquilibrium(scenario.cardiacOutput, scenario.spo2, scenario.paO2, 70, 5000);
      const gap = eq - initial;
      const N = 432000; // 1800 s sim
      for (let i = 0; i < N; i++) AcidBaseEngine.getInstance().update(DT_FINE);
      const obs = usePatientStore.getState().vitals.lactate - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / tau);
      pushRow('lactate', 'exp', gap, gap * frac, obs);
    }

    // ═══ hco3 (AcidBaseEngine, tau renal — control, ya corregido en C1) ═════
    {
      AcidBaseEngine.getInstance().reset();
      const paCO2Fixed = 60;
      const initial = 24.0;
      pat.updateVitals({
        hco3: initial, paCO2: paCO2Fixed, lactate: 1.0,
        cardiacOutput: 5.0, spo2: 98, paO2: 95, urineOutput: 1.0,
      });
      // renalTgt con acidCoeff≈RESP_ACID_ACUTE(0.10) al inicio de la ventana
      // (chronicityFrac≈0, ventana << TAU_CHRONIC_S=259200s)
      const target = 24.0 + 0.10 * (paCO2Fixed - 40);
      const gap = target - initial;
      const K_RENAL = 0.00008;
      const tau = 1 / K_RENAL;
      const N = 432000; // 1800 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ paCO2: paCO2Fixed }); // pin driver
        AcidBaseEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.hco3 - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / tau);
      pushRow('hco3 (control, C1)', 'exp', gap, gap * frac, obs);
    }

    // ═══ magnesiumMgdL (PharmacologyEngine, decaimiento natural 0.05 mg/dL/h) ═
    // Rama "sin infusion activa" (mgCpRatio<=0.01, cpRatio es privado del
    // motor y no se puede fijar desde afuera) — decaimiento natural puro,
    // no depende de Cp. Modelo lineal (no exponencial): no hay termino
    // proporcional a (target-actual).
    {
      usePathologyStore.getState().resetAllPathologies();
      useCRRTStore.getState().setActive(false);
      usePharmacologyStore.getState().resetAll();
      const initial = 5.0;
      pat.updateVitals({ magnesiumMgdL: initial });
      const RATE = 0.05; // mg/dL/h (crrtActive=false)
      const N = 432000; // 1800 s sim
      for (let i = 0; i < N; i++) PharmacologyEngine.getInstance().update(DT_FINE);
      const obs = usePatientStore.getState().vitals.magnesiumMgdL - initial;
      const deltaEsperado = -RATE * (N * DT_FINE) / 3600;
      pushRow('magnesiumMgdL', 'lineal', deltaEsperado, deltaEsperado, obs);
    }

    // ═══ kPlasma (RenalEngine, recuperacion natural K+ 4c) ══════════════════
    // kDrift = (4.0-kNow)*8e-6*dt → exponencial, tau=1/8e-6=125000s.
    {
      usePharmacologyStore.getState().resetAll(); // diureticEffect=0,beta2=0 → activa rama 4c
      const MAP_FIXED = 90;
      const initial = 3.0;
      pat.updateVitals({
        kPlasma: initial, meanArterialPressure: MAP_FIXED,
        urineOutput: 1.0, creatinine: 1.0,
      });
      const target = 4.0;
      const gap = target - initial;
      const K_K = 8e-6;
      const tau = 1 / K_K;
      const N = 432000; // 1800 s sim
      for (let i = 0; i < N; i++) {
        pat.updateVitals({ meanArterialPressure: MAP_FIXED }); // pin (consistencia con RenalEngine)
        RenalEngine.getInstance().update(DT_FINE);
      }
      const obs = usePatientStore.getState().vitals.kPlasma - initial;
      const frac = 1 - Math.exp(-(N * DT_FINE) / tau);
      pushRow('kPlasma', 'exp', gap, gap * frac, obs);
    }

    // ═══ creatinine (MicrobiologyEngine, nefrotoxicidad ATB) ════════════════
    // amphotericin_b: nephroStressorRate=0.010 Cr/h, rama "tasa base" (no es
    // vancomicina/aminoglucosido/colistina, sin logica de MAP/trough extra).
    // update() esta gateado por sepsis.isActive — se activa sepsis solo para
    // levantar ese gate, no para modelar la nefrotoxicidad en si.
    {
      usePathologyStore.getState().activatePathology('sepsis', null, 0.75);
      useMicrobiologyStore.getState().startAntibiotic('amphotericin_b', useTimeStore.getState().ticks, false);
      const initial = 1.0;
      pat.updateVitals({ creatinine: initial });
      const RATE = 0.010; // Cr/h
      const N = 432000; // 1800 s sim
      for (let i = 0; i < N; i++) MicrobiologyEngine.getInstance().update(DT_FINE);
      const obs = usePatientStore.getState().vitals.creatinine - initial;
      const deltaEsperado = RATE * (N * DT_FINE) / 3600;
      pushRow('creatinine (ATB nefrotox)', 'lineal', deltaEsperado, deltaEsperado, obs);
      // Limpieza — no contaminar el bloque siguiente (heartRate).
      useMicrobiologyStore.getState().resetMicrobiology();
      usePathologyStore.getState().resetAllPathologies();
    }

    // ═══ heartRate (CardiovascularEngine, banda muerta HR_HOMEO) ════════════
    // HR solo se actualiza ~1x/sim-segundo (noiseTimer >= NOISE_INT=1.0), con
    // drift=(target-actual)*0.05 + ruido uniforme[-1,1]. tau efectivo =
    // NOISE_INT/-ln(1-0.05) ≈ 19.5s. El ruido (irreducible, no depende de dt)
    // impone un piso de banda muerta — no se espera ratio~1 tan limpio como
    // los campos deterministicos. targetRef se asienta empiricamente dejando
    // el sistema converger con gap≈0 antes de forzar el gap de prueba.
    // El ruido (this.pendingNoise = random()*2-1) es irreducible y no depende
    // de dt: la varianza estacionaria teorica del proceso AR(1) resultante es
    // Var[U(-1,1)]/(1-0.95^2) ≈ 3.42 → std ≈ 1.85 bpm. Una sola corrida puede
    // caer a 2+ std del centro por puro azar — se promedian 5 corridas
    // independientes para no reportar una muestra ruidosa como si fuera la
    // banda muerta real.
    {
      const TRIALS = 5;
      const deadBands: number[] = [];
      let lastGap = 0, lastObs = 0, lastFrac = 0;
      for (let trial = 0; trial < TRIALS; trial++) {
        usePathologyStore.getState().resetAllPathologies();
        usePharmacologyStore.getState().resetAll();
        pat.updateVitals({ heartRate: 75, cardiacOutput: 5.0, meanArterialPressure: 90 });
        const N_SETTLE = 240 * 120; // 120 s para asentar target con gap≈0
        for (let i = 0; i < N_SETTLE; i++) CardiovascularEngine.getInstance().updateHemodynamics(DT_FINE);
        const targetRef = usePatientStore.getState().vitals.heartRate;

        const gap = 8;
        pat.updateVitals({ heartRate: targetRef - gap });
        const N = 240 * 300; // 300 s (V3: gap inicial 8 bpm, ventana 300s)
        const tau = 1 / -Math.log(1 - 0.05);
        for (let i = 0; i < N; i++) CardiovascularEngine.getInstance().updateHemodynamics(DT_FINE);
        const finalHR = usePatientStore.getState().vitals.heartRate;
        const frac = 1 - Math.exp(-(N * DT_FINE) / tau);
        deadBands.push(Math.abs(finalHR - targetRef));
        lastGap = gap; lastObs = finalHR - (targetRef - gap); lastFrac = frac;
      }
      const meanDeadBand = deadBands.reduce((a, b) => a + b, 0) / TRIALS;
      pushRow('heartRate', 'exp', lastGap, lastGap * lastFrac, lastObs);
      console.log(`DEAD BAND heartRate (${TRIALS} corridas): [${deadBands.map(d => d.toFixed(2)).join(', ')}] bpm — media=${meanDeadBand.toFixed(3)} bpm (piso teorico de ruido ≈1.85 bpm std; "<1bpm" de V3 es optimista frente a ese piso)`);
    }

    // ═══ Reporte ═════════════════════════════════════════════════════════
    console.table(rows);

    // Diagnostico puro — no debe fallar nunca.
    expect(rows.length).toBe(14);
  }, 600_000); // ~4M ticks totales — corrida larga a proposito (diagnostico)
});
