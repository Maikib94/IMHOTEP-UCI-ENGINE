// src/core/SM100_SevereSepsis_Scenario.ts
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Test Case â€” Escenario "Sepsis Severa" 20 segundos
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  Equivalente TypeScript al bloque  `if __name__ == "__main__":`  del prompt
//  original. Ejecuta el VentilatorSM100Engine de forma **aislada** (sin los
//  stores Zustand ni React) para verificar la fÃ­sica cruda:
//
//    - Paciente: Crs = 20 mL/cmHâ‚‚O, Raw = 15 cmHâ‚‚O/L/s, paralizado (NMBA)
//    - Modo: PRVC  |  VT objetivo: 420 mL (6 mL/kg Â· 70 kg)
//    - PEEP: 12  |  RR: 22  |  T_insp: 0.9 s  |  FiOâ‚‚: 0.80
//    - ATRC: tubo 8.0 mm, compensaciÃ³n 80%
//    - Alarma presiÃ³n mÃ¡xima: 40 cmHâ‚‚O (P_max efectivo = 35)
//
//  CÃ“MO EJECUTAR:
//      npx ts-node src/core/SM100_SevereSepsis_Scenario.ts
//
//  SALIDA ESPERADA:
//    Tabla con 20s de evoluciÃ³n (~7 respiraciones) mostrando
//    cÃ³mo el controlador PRVC converge al VT objetivo respetando
//    el lÃ­mite P_max âˆ’ 5 = 35 cmHâ‚‚O.
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import {
  VentilatorSM100Engine,
  type SM100Settings,
  type PatientMechanics,
} from './VentilatorSM100Engine';

// â”€â”€â”€ CONFIGURACIÃ“N DEL ESCENARIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const settings: SM100Settings = {
  mode: 'PRVC',
  fio2: 0.80,
  peep: 12,
  vtTarget: 420,        // 6 mL/kg Ã— 70 kg  (ARDSnet)
  rrSet: 22,
  pInspSet: 15,
  pSupport: 0,
  tInspSet: 0.9,
  pMaxAlarm: 40,        // P_max efectivo = 35 cmHâ‚‚O
  atrcEnabled: true,
  atrcTubeId: 8.0,
  atrcCompensation: 0.80,
  triggerType: 'flow',
  flowTriggerLpm: 2.0,
  pressTriggerCmH2O: 1.5,
  amvMinuteVentTarget: 7.5,
  amvWeightKg: 70,
  flowPatternVCV: 'square',
};

const mechanics: PatientMechanics = {
  crs: 20,                // mL/cmHâ‚‚O â€” SDRA moderado-severo + compliance sepsis
  raw: 15,                // cmHâ‚‚O/L/s â€” edema pequeÃ±a vÃ­a aÃ©rea + moco
  eCw_eTot: 0.55,         // pared torÃ¡cica relativa mÃ¡s rÃ­gida (sepsis + SDRA)
  pMusAmplitude: 0,       // paralizado (NMBA cisatracurio)
  pMusDriveHz: 0,
  vAnat: 2.2 * 70,        // 154 mL espacio muerto anatÃ³mico
};

// â”€â”€â”€ RUN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runScenario() {
  console.log('â•'.repeat(95));
  console.log(' IMHOTEP UCI â€” Test Case: Sepsis Severa + SDRA (20 s)');
  console.log(' Simulador SM100 Â· PRVC Â· ATRC tubo 8.0 mm @ 80%');
  console.log('â•'.repeat(95));
  console.log(` Paciente: Crs=${mechanics.crs} mL/cmHâ‚‚O | Raw=${mechanics.raw} cmHâ‚‚O/L/s`);
  console.log(` Ajustes:  VT*=${settings.vtTarget} mL | PEEP=${settings.peep} | RR=${settings.rrSet}`);
  console.log(`           FiOâ‚‚=${settings.fio2.toFixed(2)} | T_insp=${settings.tInspSet}s | P_max=${settings.pMaxAlarm}`);
  console.log(`           Ï„ = RÂ·Crs = ${((mechanics.raw * mechanics.crs) / 1000).toFixed(2)}s`);
  console.log(' Runge-Kutta 2Âº orden @ 1000 Hz');
  console.log('â”€'.repeat(95));
  console.log(
    ' breath | Ppeak | Pplat | Î”P   | Pmean | PRVC    | P_target | VT_del | Cstat | MP    | ACP',
  );
  console.log(
    '        |cmHâ‚‚O | cmHâ‚‚O |cmHâ‚‚O |cmHâ‚‚O  | Î”       |  cmHâ‚‚O   |   mL   |mL/cmH | J/min |',
  );
  console.log('â”€'.repeat(95));

  const engine = VentilatorSM100Engine.getInstance();
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
      const acp = m.acpFlag ? 'YESâš ' : ' ok';
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

  console.log('â”€'.repeat(95));
  const finalMetrics = engine.getLastBreath();
  console.log(' RESUMEN FINAL:');
  console.log(`   Â· VT entregado:      ${finalMetrics.vtInsp.toFixed(0)} mL  (objetivo: ${settings.vtTarget})`);
  console.log(`   Â· Pplat final:       ${finalMetrics.pPlat.toFixed(1)} cmHâ‚‚O  (ARDSnet: < 30 âœ“/âœ—)`);
  console.log(`   Â· Î”P (driving):      ${finalMetrics.drivingPressure.toFixed(1)} cmHâ‚‚O  (protector: < 15)`);
  console.log(`   Â· Cstat medida:      ${finalMetrics.cStatMeasured.toFixed(1)} mL/cmHâ‚‚O`);
  console.log(`   Â· Mechanical Power:  ${finalMetrics.mechPowerJmin.toFixed(1)} J/min  (Gattinoni 2016: < 17)`);
  console.log(`   Â· P_trach peak:      ${finalMetrics.pTrachPeak.toFixed(1)} cmHâ‚‚O  (post-ATRC)`);
  console.log(`   Â· Ppl swing:         ${finalMetrics.pplSwing.toFixed(1)} cmHâ‚‚O  (retorno venoso proxy)`);
  console.log(`   Â· ACP risk flag:     ${finalMetrics.acpFlag ? 'YES âš   (Pplat > 27 + sustrato severo)' : 'no'}`);
  console.log('â•'.repeat(95));
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
