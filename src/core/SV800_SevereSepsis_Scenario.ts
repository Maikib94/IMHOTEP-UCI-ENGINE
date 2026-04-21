// src/core/__tests__/SV800_SevereSepsis_Scenario.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  Test Case — Escenario "Sepsis Severa" 20 segundos
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Equivalente TypeScript al bloque  `if __name__ == "__main__":`  del prompt
//  original. Ejecuta el VentilatorSV800Engine de forma **aislada** (sin los
//  stores Zustand ni React) para verificar la física cruda:
//
//    - Paciente: Crs = 20 mL/cmH₂O, Raw = 15 cmH₂O/L/s, paralizado (NMBA)
//    - Modo: PRVC  |  VT objetivo: 420 mL (6 mL/kg · 70 kg)
//    - PEEP: 12  |  RR: 22  |  T_insp: 0.9 s  |  FiO₂: 0.80
//    - ATRC: tubo 8.0 mm, compensación 80%
//    - Alarma presión máxima: 40 cmH₂O (P_max efectivo = 35)
//
//  CÓMO EJECUTAR:
//      npx ts-node src/core/__tests__/SV800_SevereSepsis_Scenario.ts
//
//  SALIDA ESPERADA:
//    Tabla con 20s de evolución (~7 respiraciones) mostrando
//    cómo el controlador PRVC converge al VT objetivo respetando
//    el límite P_max − 5 = 35 cmH₂O.
//
// ═══════════════════════════════════════════════════════════════════════════════

import {
  VentilatorSV800Engine,
  type SV800Settings,
  type PatientMechanics,
} from '../VentilatorSV800Engine';

// ─── CONFIGURACIÓN DEL ESCENARIO ────────────────────────────────────────────

const settings: SV800Settings = {
  mode: 'PRVC',
  fio2: 0.80,
  peep: 12,
  vtTarget: 420,        // 6 mL/kg × 70 kg  (ARDSnet)
  rrSet: 22,
  pInspSet: 15,
  pSupport: 0,
  tInspSet: 0.9,
  pMaxAlarm: 40,        // P_max efectivo = 35 cmH₂O
  atrcEnabled: true,
  atrcTubeId: 8.0,
  atrcCompensation: 0.80,
  triggerType: 'flow',
  flowTriggerLpm: 2.0,
  pressTriggerCmH2O: 1.5,
  amvMinuteVentTarget: 7.5,
  amvWeightKg: 70,
};

const mechanics: PatientMechanics = {
  crs: 20,                // mL/cmH₂O — SDRA moderado-severo + compliance sepsis
  raw: 15,                // cmH₂O/L/s — edema pequeña vía aérea + moco
  eCw_eTot: 0.55,         // pared torácica relativa más rígida (sepsis + SDRA)
  pMusAmplitude: 0,       // paralizado (NMBA cisatracurio)
  pMusDriveHz: 0,
  vAnat: 2.2 * 70,        // 154 mL espacio muerto anatómico
};

// ─── RUN ────────────────────────────────────────────────────────────────────

function runScenario() {
  console.log('═'.repeat(95));
  console.log(' IMHOTEP UCI — Test Case: Sepsis Severa + SDRA (20 s)');
  console.log(' Mindray SV800 · PRVC · ATRC tubo 8.0 mm @ 80%');
  console.log('═'.repeat(95));
  console.log(` Paciente: Crs=${mechanics.crs} mL/cmH₂O | Raw=${mechanics.raw} cmH₂O/L/s`);
  console.log(` Ajustes:  VT*=${settings.vtTarget} mL | PEEP=${settings.peep} | RR=${settings.rrSet}`);
  console.log(`           FiO₂=${settings.fio2.toFixed(2)} | T_insp=${settings.tInspSet}s | P_max=${settings.pMaxAlarm}`);
  console.log(`           τ = R·Crs = ${((mechanics.raw * mechanics.crs)/1000).toFixed(2)}s`);
  console.log(' Runge-Kutta 2º orden @ 1000 Hz');
  console.log('─'.repeat(95));
  console.log(
    ' breath | Ppeak | Pplat | ΔP   | Pmean | PRVC    | P_target | VT_del | Cstat | MP    | ACP',
  );
  console.log(
    '        |cmH₂O | cmH₂O |cmH₂O |cmH₂O  | Δ       |  cmH₂O   |   mL   |mL/cmH | J/min |',
  );
  console.log('─'.repeat(95));

  const engine = VentilatorSV800Engine.getInstance();
  engine.reset(settings.peep);

  // Simulamos 20 segundos llamando al engine con pasos de 100 ms (macrotick)
  const TOTAL_S = 20;
  const MACRO_DT = 0.100; // 100 ms macro (engine internamente integra a 1 kHz)
  const STEPS = TOTAL_S / MACRO_DT;

  let lastBreathId = 0;
  for (let i = 0; i < STEPS; i++) {
    engine.update(MACRO_DT, settings, mechanics);
    const m = engine.getLastBreath();
    if (m.breathId !== lastBreathId && m.breathId > 0) {
      lastBreathId = m.breathId;
      const dsign = m.prvcDelta >= 0 ? '+' : '';
      const acp = m.acpFlag ? 'YES⚠' : ' ok';
      console.log(
        `  #${String(m.breathId).padStart(2)}   |` +
        ` ${m.pPeak.toFixed(1).padStart(5)} |` +
        ` ${m.pPlat.toFixed(1).padStart(5)} |` +
        ` ${m.drivingPressure.toFixed(1).padStart(4)} |` +
        ` ${m.pMean.toFixed(1).padStart(5)} |` +
        ` ${dsign}${m.prvcDelta.toFixed(2).padStart(5)} |` +
        `  ${m.pInspTarget.toFixed(1).padStart(5)}   |` +
        `  ${m.vtInsp.toFixed(0).padStart(4)}  |` +
        `  ${m.cStatMeasured.toFixed(1).padStart(4)} |` +
        ` ${m.mechPowerJmin.toFixed(1).padStart(5)} | ${acp}`
      );
    }
  }

  console.log('─'.repeat(95));
  const finalMetrics = engine.getLastBreath();
  console.log(' RESUMEN FINAL:');
  console.log(`   · VT entregado:      ${finalMetrics.vtInsp.toFixed(0)} mL  (objetivo: ${settings.vtTarget})`);
  console.log(`   · Pplat final:       ${finalMetrics.pPlat.toFixed(1)} cmH₂O  (ARDSnet: < 30 ✓/✗)`);
  console.log(`   · ΔP (driving):      ${finalMetrics.drivingPressure.toFixed(1)} cmH₂O  (protector: < 15)`);
  console.log(`   · Cstat medida:      ${finalMetrics.cStatMeasured.toFixed(1)} mL/cmH₂O`);
  console.log(`   · Mechanical Power:  ${finalMetrics.mechPowerJmin.toFixed(1)} J/min  (Gattinoni 2016: < 17)`);
  console.log(`   · P_trach peak:      ${finalMetrics.pTrachPeak.toFixed(1)} cmH₂O  (post-ATRC)`);
  console.log(`   · Ppl swing:         ${finalMetrics.pplSwing.toFixed(1)} cmH₂O  (retorno venoso proxy)`);
  console.log(`   · ACP risk flag:     ${finalMetrics.acpFlag ? 'YES ⚠  (Pplat > 27 + sustrato severo)' : 'no'}`);
  console.log('═'.repeat(95));
}

// Auto-ejecutar si se corre directamente (Node.js)
declare const require: unknown;
declare const module: { id?: string } | undefined;
if (typeof require !== 'undefined'
    && typeof module !== 'undefined'
    && (module as { id?: string })?.id === '.') {
  runScenario();
}

// Exportar para uso en tests de Vitest/Jest
export { runScenario, settings, mechanics };
