// src/dev/validation.ts
// Validación manual de fórmulas clínicas — ejecutar desde consola del navegador:
//   import('./dev/validation').then(m => m.runAll())

import { usePatientStore } from '../store/usePatientStore';

// ─── Fase 3: Validación P_peak / P_plateau (ecuación de movimiento) ──────────
//
//  Caso 1 — VCV: Vt=500, PEEP=5, C=50, R=10, RR=12, Ti=1s
//    → P_peak ≈ 18 cmH₂O, P_plateau ≈ 15 cmH₂O
//
//  Caso 2 — PCV: Pinsp=15, PEEP=5, C=50, R=10, Ti=1s
//    → Vt_entregado ≈ 463 mL  (τ = R×C/1000 = 0.5 s)
//
export function validatePhase3(): void {
  const C_rs = 50;   // mL/cmH₂O
  const R    = 10;   // cmH₂O/(L/s)

  // Caso 1 — VCV
  const vtMl    = 500;
  const peep    = 5;
  const ti      = 1.0;   // s
  const flowLPS = (vtMl / 1000) / ti;  // L/s
  const pPlat   = peep + vtMl / C_rs;
  const pPeak   = pPlat + flowLPS * R;
  console.log('[Fase 3] VCV caso 1');
  console.log(`  Vt=500, PEEP=5, C=50, R=10, Ti=1 → P_peak=${pPeak.toFixed(1)} (esperado ≈18), P_plat=${pPlat.toFixed(1)} (esperado ≈15)`);

  // Caso 2 — PCV
  const pinsp   = 15;
  const tau     = R * C_rs / 1000;   // 0.5 s
  const vtPCV   = pinsp * C_rs * (1 - Math.exp(-ti / tau));
  console.log('[Fase 3] PCV caso 2');
  console.log(`  Pinsp=15, PEEP=5, C=50, R=10, Ti=1, τ=${tau}s → Vt=${vtPCV.toFixed(0)} mL (esperado ≈463)`);
}

// ─── Fase 5: Impacto PEEP → MAP ──────────────────────────────────────────────
//
//  Objetivo: PEEP 5 → MAP ≈85; PEEP 20 → MAP ≈65–70
//  Fórmula: SV_adj = SV_base × (1 − 0.025 × max(0, pMean−5))
//           CO = SV_adj × HR / 1000
//           MAP = CO × SVR / 80
//
export function validatePhase5(): void {
  const HR    = 75;
  const SVR   = 1295;
  const BV    = 5000;
  const SV_BASE = 70 * (BV / 5000);   // 70 mL

  const peepValues = [5, 10, 15, 20];
  console.log('[Fase 5] PEEP → pMean → MAP (paciente euvolémico, HR=75, SVR=1295)');

  for (const peep of peepValues) {
    // pMean estimado: PEEP + (Ppeak-PEEP)/2 × tieFrac ≈ PEEP + 3 (VCV típico)
    const pMean = peep + 3;
    const penalty = 0.025 * Math.max(0, pMean - 5);
    const sv = Math.max(10, SV_BASE * (1 - penalty));
    const co = sv * HR / 1000;
    const map = Math.round((co * SVR) / 80);
    console.log(`  PEEP ${peep} → pMean=${pMean} → SVpenalty=${(penalty*100).toFixed(1)}% → SV=${sv.toFixed(0)} → CO=${co.toFixed(2)} → MAP=${map} mmHg`);
  }
}

// ─── Fase 4: FiO₂ efectiva por soporte ───────────────────────────────────────
export function validatePhase4(): void {
  console.log('[Fase 4] FiO₂ efectiva por dispositivo');
  console.log('  NONE → 0.21');
  for (let flow = 1; flow <= 6; flow++) {
    const fio2 = Math.min(0.44, 0.21 + 0.04 * flow);
    console.log(`  Cánula ${flow} L/min → FiO₂ ${fio2.toFixed(2)}`);
  }
  for (const flow of [10, 15]) {
    const fio2 = Math.min(0.90, 0.60 + ((flow - 10) / 5) * 0.30);
    console.log(`  Reservorio ${flow} L/min → FiO₂ ${fio2.toFixed(2)}`);
  }
}

// ─── Live: leer MAP actual del store ─────────────────────────────────────────
export function readCurrentMAP(): void {
  const { vitals, ventilator } = usePatientStore.getState();
  console.log(`[Live] MAP=${vitals.meanArterialPressure} mmHg, PEEP=${ventilator.peep}, pMean=${ventilator.pMean}`);
}

export function runAll(): void {
  validatePhase3();
  validatePhase4();
  validatePhase5();
  readCurrentMAP();
}
