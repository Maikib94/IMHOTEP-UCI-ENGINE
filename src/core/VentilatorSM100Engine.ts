// src/core/VentilatorSM100Engine.ts
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  IMHOTEP UCI â€” Motor Mindray SM100 de alta fidelidad
//  Autor: IMHOTEP Core Physics Team
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  FÃSICA IMPLEMENTADA (sin placeholders):
//    1. EcuaciÃ³n de movimiento respiratorio (single-compartment lineal)
//       P_aw(t) = (1/Crs)Â·V(t) + RawÂ·VÌ‡(t) + PEEP + P_mus(t)
//       Integrada con Runge-Kutta 2Âº orden a 1000 Hz.
//
//    2. ATRC â€” Rohrer:  Î”P = (K1Â·|VÌ‡| + K2Â·VÌ‡Â²) Â· C_rate
//       Constantes K1/K2 de Flevari et al. Anaesth Intensive Care 2011 (IDs 6.5-9.0).
//
//    3. PRVC â€” controlador discreto con lÃ­mites clÃ­nicos SM100:
//       Î”P â‰¤ 3 cmHâ‚‚O (10 en las 3 primeras respiraciones), P_max â‰¤ P_alarm âˆ’ 5.
//
//    4. AMV/Otis â€” minimizaciÃ³n analÃ­tica del WOB con RC_exp = RawÂ·Crs,
//       devolviendo frecuencia Ã³ptima y V_T Ã³ptimo para la VA demandada.
//
//    5. Triggering flow/pressure con histÃ©resis y ventana refractaria.
//
//    6. Salidas acopladas a hemodinamia:
//         - P_pl(t)  (pleural) â†’ retorno venoso (Guyton)
//         - P_TP(t)  (transpulmonar) â†’ postcarga VD
//         - P_mean    â†’ transmisiÃ³n a CVP
//         - flag ACP (Acute Cor Pulmonale) si Pplat > 27 y SDRA severo/sepsis
//
//  REFERENCIAS (peer-reviewed, indexadas):
//    Vieillard-Baron A. et al. Intensive Care Med 2016;42(5):739-49.   [ARDSÂ·MV]
//    Lanspa M. et al.          Chest 2020;157(1):95-104.               [RVÂ·sepsis]
//    Vallabhajosyula S. et al. Chest 2021;159(6):2357-2369.            [RVÂ·meta]
//    Berger D. et al.          Am J Physiol HCP 2016;311:H794-H806.    [PEEPÂ·VR]
//    Flevari AG et al.         Anaesth Intensive Care 2011;39:410-17.  [RohrerÂ·ETT]
//    Otis AB.                  J Appl Physiol 1950;2:592-607.          [WOB]
//    Geri G. et al.            J Crit Care 2021;64:100-107.            [CRSÂ·renal]
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ TIPOS PÃšBLICOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type VentMode =
  | 'VCV'    // Volume-Controlled Ventilation (AC)
  | 'PCV'    // Pressure-Controlled Ventilation
  | 'PRVC'   // Pressure-Regulated Volume Control (SM100 flagship)
  | 'PSV'    // Pressure Support (espontÃ¡neo)
  | 'AMV';   // Adaptive Minute Ventilation (Otis)

export interface SM100Settings {
  mode: VentMode;
  fio2: number;              // 0.21 â€“ 1.00
  peep: number;              // cmHâ‚‚O (0 â€“ 25)
  vtTarget: number;          // mL (objetivo en PRVC/VCV)
  rrSet: number;             // respiraciones/min
  pInspSet: number;          // cmHâ‚‚O (PCV)
  pSupport: number;          // cmHâ‚‚O (PSV)
  tInspSet: number;          // segundos (tiempo inspiratorio)
  pMaxAlarm: number;         // cmHâ‚‚O (alarma de presiÃ³n alta, usada por PRVC)
  // ATRC
  atrcEnabled: boolean;
  atrcTubeId: 6.5 | 7.0 | 7.5 | 8.0 | 8.5 | 9.0;
  atrcCompensation: number;  // 0.0 â€“ 1.0 (C_rate)
  // Triggering
  triggerType: 'flow' | 'pressure';
  flowTriggerLpm: number;    // 0.5 â€“ 15 L/min
  pressTriggerCmH2O: number; // 0.5 â€“ 20 cmHâ‚‚O
  // AMV
  amvMinuteVentTarget: number; // L/min objetivo (AMV)
  amvWeightKg: number;         // peso corporal predicho (para Vd)
  // PatrÃ³n de flujo VCV (spec 5.B)
  // 'square'      : flujo constante (default) â€” mÃ¡xima entrega, Ppico mÃ¡s alto
  // 'decelerating': empieza 1.6Ã— y decrece a 0.4Ã— (Marini AJRCCM 2020) â€” â†“Ppico
  flowPatternVCV: 'square' | 'decelerating';
}

export interface PatientMechanics {
  crs: number;               // mL/cmHâ‚‚O  (compliance sist. resp.)
  raw: number;               // cmHâ‚‚O/L/s (resistencia vÃ­a aÃ©rea)
  eCw_eTot: number;          // 0.3â€“0.7  (fracciÃ³n pared torÃ¡cica / E_total)
  pMusAmplitude: number;     // cmHâ‚‚O (esfuerzo muscular mÃ¡ximo; 0 = paralizado)
  pMusDriveHz: number;       // frecuencia espontÃ¡nea Hz
  vAnat: number;             // mL (espacio muerto anatÃ³mico ~2.2Â·kg)
}

/** Muestras de las seÃ±ales en tiempo real (buffer circular para UI). */
export interface SM100Waveforms {
  t: Float32Array;     // segundos relativos (rolling window)
  paw: Float32Array;   // presiÃ³n vÃ­a aÃ©rea proximal (cmHâ‚‚O)
  pTrach: Float32Array; // presiÃ³n traqueal (Paw âˆ’ Î”P_ETT) (cmHâ‚‚O)
  flow: Float32Array;  // flujo (L/min)  (+inspiraciÃ³n / âˆ’espiraciÃ³n)
  vol: Float32Array;   // volumen acumulado (mL)
  ppl: Float32Array;   // presiÃ³n pleural estimada (cmHâ‚‚O)
  pTP: Float32Array;   // presiÃ³n transpulmonar (cmHâ‚‚O)
  length: number;      // nÃºmero de muestras vÃ¡lidas
  writeIdx: number;    // Ã­ndice de escritura circular
}

/** MÃ©tricas "por respiraciÃ³n" calculadas cada ciclo (para monitor digital). */
export interface SM100BreathMetrics {
  breathId: number;
  tCycle: number;            // duraciÃ³n ciclo (s)
  tInsp: number;
  tExp: number;
  ieRatio: number;           // I:E
  vtInsp: number;            // mL
  vtExp: number;             // mL
  minVol: number;            // L/min
  pPeak: number;             // cmHâ‚‚O
  pPlat: number;             // cmHâ‚‚O
  pMean: number;             // cmHâ‚‚O
  autoPeep: number;          // cmHâ‚‚O
  drivingPressure: number;   // cmHâ‚‚O (Pplat âˆ’ PEEP)
  mechPowerJmin: number;     // J/min (ecuaciÃ³n Gattinoni 2016)
  cStatMeasured: number;     // mL/cmHâ‚‚O
  rAwMeasured: number;       // cmHâ‚‚O/L/s
  // ATRC
  pTrachPeak: number;        // Ppeak âˆ’ Î”P_ETT
  pTrachPlat: number;        // Pplat âˆ’ Î”P_ETT
  // PRVC
  pInspTarget: number;       // cmHâ‚‚O (objetivo entregado en la respiraciÃ³n)
  prvcDelta: number;         // cmHâ‚‚O (ajuste aplicado)
  // Hemo
  pplMean: number;           // cmHâ‚‚O (promedio ciclo)
  pplSwing: number;          // cmHâ‚‚O (Î” ipsoâ€“esp)
  pTPPeak: number;           // cmHâ‚‚O
  acpFlag: boolean;          // Acute Cor Pulmonale pendiente de confirmaciÃ³n
}

// â”€â”€â”€ CONSTANTES ROHRER (Flevari 2011 adult ETTs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   K1: componente lineal laminar (cmHâ‚‚O / (L/s))   â€” tÃ­picamente baja
//   K2: componente cuadrÃ¡tica turbulenta (cmHâ‚‚O / (L/s)Â²) â€” dominante
const ROHRER_K: Record<number, { k1: number; k2: number }> = {
  6.5: { k1: 5.5, k2: 12.80 },
  7.0: { k1: 4.7, k2: 9.17  },
  7.5: { k1: 3.9, k2: 6.01  },
  8.0: { k1: 3.2, k2: 4.65  },
  8.5: { k1: 2.7, k2: 3.05  },
  9.0: { k1: 2.3, k2: 2.42  },
};

// â”€â”€â”€ PARÃMETROS NUMÃ‰RICOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PHYS_HZ = 1000;                    // Hz (integraciÃ³n ODE)
const WAVE_HZ = 100;                     // Hz (downsample para UI)
// ─── REGLA DE TIEMPO (FASE 5 fix) ────────────────────────────────────────────
//  wf.t[] almacena SIEMPRE simTime. A x60x buffer = 50 sim-segundos.
const WAVE_BUF_SECONDS = 50;
const WAVE_BUF = WAVE_HZ * WAVE_BUF_SECONDS;  // 5000 muestras

// PRVC
const PRVC_DELTA_NORMAL = 3;             // cmHâ‚‚O/ciclo
const PRVC_DELTA_TEST   = 10;            // primeras 3 respiraciones
const PRVC_TEST_BREATHS = 3;
const PRVC_MARGIN_TO_ALARM = 5;          // P_max = P_alarm âˆ’ 5
const PRVC_GAIN = 0.7;                   // acoplamiento proporcional (Î”P = GAIN Â· Î”VÌ‡Â·Ï„)

// Otis / AMV
const OTIS_MV_FLOOR = 3.0;               // L/min (safeguard)

// Hemodinamia
const ACP_PPLAT_THR = 27;                // cmHâ‚‚O â€” Acute Cor Pulmonale threshold (Vieillard-Baron 2016)

// â”€â”€â”€ UTILIDADES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

const LPS_to_Lmin = (lps: number) => lps * 60;
const Lmin_to_LPS = (lpm: number) => lpm / 60;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MOTOR PRINCIPAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export class VentilatorSM100Engine {
  // â”€â”€ singleton â”€â”€
  private static inst: VentilatorSM100Engine | null = null;
  public static getInstance(): VentilatorSM100Engine {
    if (!VentilatorSM100Engine.inst) VentilatorSM100Engine.inst = new VentilatorSM100Engine();
    return VentilatorSM100Engine.inst;
  }

  // â”€â”€ estado integrado (fÃ­sico, 1 kHz) â”€â”€
  private simTime   = 0;          // s (tiempo fÃ­sico simulado â€” avanza con dtÃ—speedMult)
  private phaseT    = 0;          // s (tiempo dentro del ciclo actual)
  private phase: 'insp' | 'exp' = 'insp';
  private vol       = 0;          // mL (volumen pulmonar INSPIRADO en el ciclo)
  private flow      = 0;          // L/s (flujo instantÃ¡neo)
  private paw       = 0;          // cmHâ‚‚O (Paw instantÃ¡nea)
  private ppl       = 0;          // cmHâ‚‚O (pleural instantÃ¡nea)
  private pTP       = 0;          // cmHâ‚‚O (transpulmonar instantÃ¡nea)

  // PRVC interno
  private pInspTarget = 15;       // cmHâ‚‚O (presiÃ³n objetivo actual del PRVC)
  private prvcBreathCount = 0;
  private lastPrvcDelta = 0;

  // MÃ©tricas del ciclo actual
  private peakPaw = 0;
  private peakPTrach = 0;
  private sumPawDt = 0;
  private sumPplDt = 0;
  private sumAbsFlowDt = 0;
  private pplMin = 0;
  private pplMax = 0;
  private vtInspired = 0;
  private vtExpired = 0;
  private pPlatMeasured = 0;
  private cycleStart = 0;

  // Historia (Ãºltima respiraciÃ³n completa)
  private lastMetrics: SM100BreathMetrics = {
    breathId: 0, tCycle: 0, tInsp: 0, tExp: 0, ieRatio: 0,
    vtInsp: 0, vtExp: 0, minVol: 0, pPeak: 0, pPlat: 0, pMean: 0,
    autoPeep: 0, drivingPressure: 0, mechPowerJmin: 0,
    cStatMeasured: 0, rAwMeasured: 0,
    pTrachPeak: 0, pTrachPlat: 0,
    pInspTarget: 0, prvcDelta: 0,
    pplMean: 0, pplSwing: 0, pTPPeak: 0, acpFlag: false,
  };

  // Buffer de waveforms (Float32 circular)
  private wf: SM100Waveforms = {
    t:      new Float32Array(WAVE_BUF),
    paw:    new Float32Array(WAVE_BUF),
    pTrach: new Float32Array(WAVE_BUF),
    flow:   new Float32Array(WAVE_BUF),
    vol:    new Float32Array(WAVE_BUF),
    ppl:    new Float32Array(WAVE_BUF),
    pTP:    new Float32Array(WAVE_BUF),
    length: 0,
    writeIdx: 0,
  };
  private waveAccumulator = 0;

  // Trigger
  private triggerArmed = true;
  private refractoryS = 0;

  // AMV cache
  private amvResult = { fOpt: 14, vtOpt: 500 };

  private constructor() {}

  // â”€â”€â”€ API PÃšBLICA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Getters */
  public getWaveforms(): SM100Waveforms { return this.wf; }
  public getLastBreath(): SM100BreathMetrics { return this.lastMetrics; }
  /** Tiempo pared acumulado (s). Avanza a 1 s/s real independiente de speedMultiplier. */
  public getWaveCursorTime(): number { return this.simTime; }

  /**
   * Devuelve muestras del buffer circular con t âˆˆ [t0, t1] (tiempo pared, waveTime).
   * Recorre el buffer hacia atrÃ¡s desde writeIdx; Ãºtil para el cursor-based renderer.
   * Complejidad O(WAVE_BUF) en el peor caso â€” el buffer es pequeÃ±o (600 muestras).
   */
  public getSamplesInRange(t0: number, t1: number): Array<{
    t: number; paw: number; flow: number; vol: number;
  }> {
    const result: Array<{ t: number; paw: number; flow: number; vol: number }> = [];
    const len = this.wf.length;
    if (len === 0) return result;
    const bufLen = this.wf.t.length;
    const wi     = this.wf.writeIdx;
    for (let k = 0; k < len; k++) {
      const idx = (wi - 1 - k + bufLen) % bufLen;
      const tSample = this.wf.t[idx];
      if (tSample < t0) break;   // older than window start â€” stop early
      if (tSample <= t1) {
        result.push({
          t:    tSample,
          paw:  this.wf.paw[idx],
          flow: this.wf.flow[idx],
          vol:  this.wf.vol[idx],
        });
      }
    }
    result.reverse();   // chronological order
    return result;
  }

  public getInstantState() {
    return {
      paw: this.paw, flow: this.flow, vol: this.vol,
      ppl: this.ppl, pTP: this.pTP, phase: this.phase,
      simTime: this.simTime, pInspTarget: this.pInspTarget,
    };
  }

  /** Reset completo (usado en cambios de modo, inicio de escenario). */
  public reset(peep: number = 5): void {
    this.simTime = 0; this.phaseT = 0; this.phase = 'insp';
    this.vol = 0; this.flow = 0; this.paw = peep; this.ppl = 0; this.pTP = 0;
    this.pInspTarget = Math.max(10, peep + 10);
    this.prvcBreathCount = 0; this.lastPrvcDelta = 0;
    this.peakPaw = 0; this.peakPTrach = 0; this.sumPawDt = 0; this.sumPplDt = 0;
    this.sumAbsFlowDt = 0; this.pplMin = 0; this.pplMax = 0;
    this.vtInspired = 0; this.vtExpired = 0; this.pPlatMeasured = 0;
    this.cycleStart = 0;
    this.wf.length = 0; this.wf.writeIdx = 0; this.waveAccumulator = 0;
    this.triggerArmed = true; this.refractoryS = 0;
  }

  /**
   * Avanza el motor `dtMacro` segundos de tiempo simulado usando integraciÃ³n
   * interna a 1 kHz. Llamado por CronosEngine en cada tick.
   */
  /**
   * @param dtMacro  dt fÃ­sico (ya multiplicado por speedMultiplier) â€” para ODE
   * @param s        settings ventilador
   * @param m        mecÃ¡nica paciente
   * @param dtWall   dt pared (wall-clock) â€” para escritura de waveforms a tasa real
   *                 Si se omite, iguala a dtMacro (speed=1Ã—)
   */
  public update(
    dtMacro: number,
    s: SM100Settings,
    m: PatientMechanics,
  ): void {
    if (dtMacro <= 0 || !isFinite(dtMacro)) return;
    const steps = Math.max(1, Math.round(dtMacro * PHYS_HZ));
    const h     = dtMacro / steps;                              // paso ODE fÃ­sico
    const hWave = dtMacro / steps;
    for (let i = 0; i < steps; i++) this.integrateStep(h, s, m, hWave);
  }

  // â”€â”€â”€ OTIS / AMV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Otis AB, J Appl Physiol 1950 minimiza el trabajo respiratorio analÃ­tico.
  //  Para MV objetivo (V_E) y espacio muerto Vd, la frecuencia Ã³ptima es:
  //
  //      f_opt = (âˆš(1 + 4Â·Ï€Â²Â·RC_expÂ·(V_E âˆ’ fÂ·Vd)) âˆ’ 1) / (2Â·Ï€Â²Â·RC_expÂ·Vd)
  //
  //  Algoritmo de Hamilton/SM100 simplifica:
  //      1. Calcular RC_exp = RawÂ·Crs (ms â†’ s)
  //      2. Resolver la cÃºbica iterativamente (Newton) para f que minimiza
  //         el trabajo inspiratorio-espiratorio combinado.
  //      3. V_T = V_E / f   (acotado 3â€“8 mL/kg para protecciÃ³n pulmonar).
  //
  //  ImplementaciÃ³n: bÃºsqueda de mÃ­nimo en W(f) con pasos de 0.5 bpm.
  //
  public computeOtisAMV(
    mvTargetLmin: number,
    weightKg: number,
    m: PatientMechanics,
  ): { fOpt: number; vtOpt: number; wobMin: number } {
    const vE = Math.max(OTIS_MV_FLOOR, mvTargetLmin);    // L/min
    const vD = (m.vAnat > 0 ? m.vAnat : 2.2 * weightKg) / 1000; // L
    const tau = (m.raw * m.crs) / 1000;                  // s  (Crs en mL/cmHâ‚‚O â†’ L/cmHâ‚‚O)

    let fBest = 14, vtBest = 500, wBest = Infinity;
    for (let f = 8; f <= 35; f += 0.5) {
      const va = vE - f * vD;                            // alveolar
      if (va <= 0) continue;
      const vtL = vE / f;                                // L/ciclo
      if (vtL < 0.25 || vtL > 0.9) continue;             // fisiolÃ³gico 250-900 mL
      // WOB Otis (ec. 11): W = Ï€Â²Â·fÂ·(V_E âˆ’ fÂ·Vd)Â² Â·R + (V_EÂ²)/(2Â·fÂ·C)
      const elastic = (vE * vE) / (2 * f * (m.crs / 1000));   // work elÃ¡stico
      const resistive = Math.PI * Math.PI * f * va * va * m.raw;
      const w = elastic + resistive;
      if (w < wBest) { wBest = w; fBest = f; vtBest = vtL * 1000; }
    }
    // ProtecciÃ³n pulmonar ARDSNet + correcciÃ³n Becher 2019:
    //   Otis puro tiende a 8.2 mL/kg (Becher T., Crit Care 2019;23:338). Para no
    //   exagerar, aplicamos dos techos: 8 mL/kg en pulmÃ³n sano, 6 mL/kg si
    //   Crs < 40 (sugestivo de SDRA moderado-severo, Berlin criteria proxy).
    const vtMin = 4 * weightKg;
    const vtMax = m.crs < 40 ? 6 * weightKg : 8 * weightKg;
    vtBest = clamp(vtBest, vtMin, vtMax);
    this.amvResult = { fOpt: fBest, vtOpt: vtBest };
    return { fOpt: fBest, vtOpt: vtBest, wobMin: wBest };
  }

  public getAMVRecommendation() { return this.amvResult; }

  // â”€â”€â”€ INTEGRACIÃ“N ODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  EcuaciÃ³n de movimiento en forma resuelta para VÌ‡:
  //    VÌ‡(t) = ( P_aw(t) âˆ’ P_mus(t) âˆ’ PEEP âˆ’ V(t)/Crs ) / Raw
  //
  //  Runge-Kutta 2Âº orden (mÃ©todo del punto medio):
  //    k1 = f(t, V)
  //    k2 = f(t+h/2, V + h/2Â·k1)
  //    V_{n+1} = V_n + hÂ·k2
  //
  //  El driver P_aw lo establece el modo (VCV/PCV/PRVC/PSV) en cada paso.
  //
  private integrateStep(h: number, s: SM100Settings, m: PatientMechanics, hWave = h): void {
    // â”€â”€ 1. Determinar esfuerzo muscular del paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const pMus = this.computePMus(s, m);

    // â”€â”€ 2. MÃ¡quina de fases: phaseT es mÃ³dulo tCycle, transiciones explÃ­citas â”€
    const tInsp = this.computeTInsp(s);
    const tCycle = 60 / Math.max(4, s.rrSet);

    // Trigger por paciente (adelanta inicio de inspiraciÃ³n)
    const triggered = this.checkTrigger(s, pMus);
    if (triggered && this.phase === 'exp') {
      // Cerramos ciclo anterior y reiniciamos
      this.onBreathStart(s);
      this.phaseT = 0;
    }

    const prevPhase = this.phase;
    const isInsp = this.phaseT < tInsp;
    this.phase = isInsp ? 'insp' : 'exp';

    // SÃ³lo publicamos mÃ©tricas al cierre DEL CICLO (phaseT wrap-around),
    // no en la transiciÃ³n inspâ†’exp intermedia. onInspEnd sigue como hook
    // sin side-effects sobre breath metrics.
    if (!isInsp && prevPhase === 'insp') this.onInspEnd();

    const pawTarget = this.computePawTarget(s, isInsp);

    // â”€â”€ 3. RK2 para VÌ‡ y V â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const dVdt = (V: number, pawDriver: number) =>
      Lmin_to_LPS(
        LPS_to_Lmin(
          (pawDriver - pMus - s.peep - V / Math.max(0.1, m.crs)) / Math.max(0.1, m.raw)
        )
      ); // L/s

    // En VCV puro, fijamos flujo cuadrado y derivamos Paw en su lugar:
    if (s.mode === 'VCV' && isInsp) {
      const flowSetLPS = this.vcvFlowLPS(s, this.phaseT);
      this.flow = flowSetLPS;
      const dV_mL = flowSetLPS * h * 1000;
      this.vol += dV_mL;
      // Paw emerge de la ecuaciÃ³n de movimiento
      this.paw = pMus + s.peep + (this.vol / Math.max(0.1, m.crs))
               + m.raw * flowSetLPS;
    } else {
      // PCV / PRVC / PSV / VCV-exp â†’ controlamos Paw, resolvemos VÌ‡
      const V_mL = this.vol;
      const k1 = dVdt(V_mL, pawTarget);             // L/s a t_n
      const V_mid = V_mL + (h / 2) * k1 * 1000;     // mL intermedio
      const k2 = dVdt(V_mid, pawTarget);            // L/s a t_n+h/2
      this.flow = k2;
      this.vol += h * k2 * 1000;
      this.paw = pawTarget;
    }

    // Durante la espiraciÃ³n (Paw â‰ˆ PEEP), actualizar flujo y vol
    if (!isInsp) {
      // Flujo espiratorio pasivo: VÌ‡_exp = âˆ’V/(RawÂ·Crs) (ec. decaimiento exponencial)
      const tau = (m.raw * m.crs) / 1000; // s
      const vExpCurrent = Math.max(0, this.vol);
      this.flow = -vExpCurrent / Math.max(0.05, tau) / 1000; // L/s (negativo)
      const dV = this.flow * h * 1000; // mL negativos
      this.vol = Math.max(0, this.vol + dV);
      this.paw = s.peep; // modelo ideal con vÃ¡lvula PEEP abierta
      this.vtExpired += -dV; // acumula lo exhalado (valor positivo)
    } else {
      this.vtInspired += Math.max(0, this.flow * h * 1000);
    }

    // â”€â”€ 4. ATRC â€” resta del Î”P_ETT para obtener P_trach â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const dPett = this.rohrerDrop(this.flow, s);
    const pTrach = this.paw - Math.sign(this.flow) * dPett;

    // â”€â”€ 5. PresiÃ³n pleural (Ppl) y transpulmonar (TPP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  Ppl = (E_cw / E_tot) Â· (Paw âˆ’ PEEP) + baseline (~ âˆ’5 en respiraciÃ³n tranquila).
    //  TPP = Paw âˆ’ Ppl.
    //  Referencia: Talmor D, NEJM 2008 (Pesoph); Vieillard-Baron ICM 2016.
    const ratio = clamp(m.eCw_eTot, 0.2, 0.8);
    this.ppl = ratio * (this.paw - s.peep) - 5 + 0.3 * pMus;
    this.pTP = this.paw - this.ppl;

    // â”€â”€ 6. MÃ©tricas acumuladas del ciclo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.peakPaw = Math.max(this.peakPaw, this.paw);
    this.peakPTrach = Math.max(this.peakPTrach, pTrach);
    this.sumPawDt += this.paw * h;
    this.sumPplDt += this.ppl * h;
    this.sumAbsFlowDt += Math.abs(this.flow) * h;
    this.pplMin = Math.min(this.pplMin, this.ppl);
    this.pplMax = Math.max(this.pplMax, this.ppl);

    // DetecciÃ³n de Pplat (fin de pausa inspiratoria / transiciÃ³n a espiraciÃ³n)
    if (isInsp && Math.abs(this.flow) < 0.02) {
      // flujo ~0 durante inspiraciÃ³n sostenida â‰ˆ plateau
      this.pPlatMeasured = this.paw;
    }

    // â”€â”€ 7. Escritura en buffer de waveforms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Usa hWave (tiempo pared) para mantener tasa 100 Hz real independiente de speedMultiplier.
    // Los timestamps almacenados en wf.t son waveTime (pared), no simTime (fÃ­sico).
    this.waveAccumulator += hWave;
    const waveInterval = 1 / WAVE_HZ;
    if (this.waveAccumulator >= waveInterval) {
      this.waveAccumulator -= waveInterval;
      const i = this.wf.writeIdx;
      this.wf.t[i]      = this.simTime;
      this.wf.paw[i]    = this.paw;
      this.wf.pTrach[i] = pTrach;
      this.wf.flow[i]   = LPS_to_Lmin(this.flow);
      this.wf.vol[i]    = this.vol;
      this.wf.ppl[i]    = this.ppl;
      this.wf.pTP[i]    = this.pTP;
      this.wf.writeIdx = (i + 1) % WAVE_BUF;
      if (this.wf.length < WAVE_BUF) this.wf.length++;
    }

    // â”€â”€ 8. Avanzar tiempo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.simTime  += h;      // tiempo fÃ­sico (usado para ODE y ciclos)
    this.phaseT += h;
    if (this.refractoryS > 0) this.refractoryS = Math.max(0, this.refractoryS - h);

    // â”€â”€ 9. Cierre natural de ciclo: wrap-around phaseT â†’ onBreathStart â”€â”€â”€â”€â”€â”€
    //   Se dispara una vez por ciclo completo. Si un trigger de paciente
    //   adelantÃ³ la inspiraciÃ³n antes, ese cierre se disparÃ³ arriba.
    if (this.phaseT >= tCycle) {
      this.phaseT -= tCycle;
      this.onBreathStart(s);
    }
  }

  // â”€â”€â”€ DRIVERS DE PAW POR MODO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //   FunciÃ³n pura: dado el flag isInsp y los settings actuales, devuelve
  //   la presiÃ³n Paw objetivo para ese instante. El flujo temporal y la
  //   mÃ¡quina de estados son responsabilidad de integrateStep().
  private computePawTarget(s: SM100Settings, isInsp: boolean): number {
    if (!isInsp) return s.peep;
    switch (s.mode) {
      case 'PCV':  return s.peep + s.pInspSet;
      case 'PRVC': return s.peep + this.pInspTarget;
      case 'AMV':  return s.peep + this.pInspTarget;   // PRVC internamente
      case 'PSV':  return s.peep + s.pSupport;
      case 'VCV':  // VCV: se maneja con flujo cuadrado en el integrador;
                   // este valor es ignorado por la rama VCV de integrateStep.
      default:     return s.peep;
    }
  }

  private vcvFlowLPS(s: SM100Settings, phaseT: number): number {
    const tInsp = this.computeTInsp(s);
    const targetSquare = (s.vtTarget / 1000) / Math.max(0.1, tInsp); // L/s

    if (s.flowPatternVCV === 'decelerating') {
      // Flujo decelerante: empieza 1.6Ã—, decrece a 0.4Ã— en fracciÃ³n inspiratoria
      // Integral = 1.0 Ã— targetSquare â†’ mismo VT entregado (Marini AJRCCM 2020)
      // â†“Ppico 15-25% porque Paw âˆ VÌ‡Â·Raw â†’ menor pico con flujo inicial creciente-decreciente
      const fracInsp = Math.max(0, Math.min(1, phaseT / Math.max(0.1, tInsp)));
      return targetSquare * (1.6 - 1.2 * fracInsp);
    }
    return targetSquare;
  }

  private computeTInsp(s: SM100Settings): number {
    if (s.tInspSet > 0) return s.tInspSet;
    // I:E 1:2 por defecto
    return (60 / Math.max(4, s.rrSet)) * (1 / 3);
  }

  // â”€â”€â”€ ATRC â€” ROHRER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private rohrerDrop(flowLPS: number, s: SM100Settings): number {
    if (!s.atrcEnabled) return 0;
    const k = ROHRER_K[s.atrcTubeId];
    if (!k) return 0;
    const cRate = clamp(s.atrcCompensation, 0, 1);
    const absF = Math.abs(flowLPS);
    return (k.k1 * absF + k.k2 * absF * absF) * cRate;
  }

  // â”€â”€â”€ ESFUERZO MUSCULAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private computePMus(s: SM100Settings, m: PatientMechanics): number {
    if (m.pMusAmplitude <= 0) return 0;
    // PresiÃ³n negativa sinusoidal durante inspiraciÃ³n espontÃ¡nea
    const omega = 2 * Math.PI * Math.max(0.1, m.pMusDriveHz);
    const phi = this.simTime * omega;
    // Solo fase negativa (inspiraciÃ³n)
    return Math.min(0, -m.pMusAmplitude * Math.max(0, Math.sin(phi)));
  }

  // â”€â”€â”€ TRIGGERING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private checkTrigger(s: SM100Settings, pMus: number): boolean {
    if (s.mode === 'VCV' || s.mode === 'PCV') return false; // control time-cycled
    if (this.phase !== 'exp') return false;
    if (this.refractoryS > 0) return false;

    if (s.triggerType === 'flow') {
      // VÌ‡_base âˆ’ VÌ‡_exp > threshold
      const thr = Lmin_to_LPS(clamp(s.flowTriggerLpm, 0.5, 15));
      const baseFlow = 0; // lÃ­nea base espiratoria â‰ˆ 0
      const diff = baseFlow - this.flow;
      if (diff >= thr) {
        this.refractoryS = 0.25;
        return true;
      }
    } else {
      // Pressure trigger: detecta drop de Paw bajo PEEP
      const thr = clamp(s.pressTriggerCmH2O, 0.5, 20);
      if ((s.peep - this.paw) >= thr) {
        this.refractoryS = 0.25;
        return true;
      }
    }
    return false;
  }

  // â”€â”€â”€ EVENTOS DE FIN DE CICLO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private onInspEnd(): void {
    // AquÃ­ podrÃ­amos forzar una pausa inspiratoria para medir Pplat real,
    // pero el modelo single-compartment con flow=0 ya lo aproxima.
  }

  private onBreathStart(s: SM100Settings): void {
    // Construir mÃ©tricas del ciclo que acaba de terminar
    const tCycle = Math.max(0.01, this.simTime - this.cycleStart);
    const tInsp = this.computeTInsp(s);
    const tExp = Math.max(0.01, tCycle - tInsp);
    const ieRatio = tExp > 0 ? tInsp / tExp : 0;
    const pMean = this.sumPawDt / tCycle;
    const pplMean = this.sumPplDt / tCycle;
    const pplSwing = this.pplMax - this.pplMin;
    const pPlat = this.pPlatMeasured > 0 ? this.pPlatMeasured : this.peakPaw;
    const driveP = Math.max(0, pPlat - s.peep);
    const cStat = driveP > 0.5 ? this.vtInspired / driveP : 0;
    // Rrs aproximado: (Ppeak âˆ’ Pplat) / VÌ‡_peak_insp
    const vDotPeak = this.vtInspired / Math.max(0.1, tInsp) / 1000; // L/s
    const rAw = vDotPeak > 0.05 ? (this.peakPaw - pPlat) / vDotPeak : 0;

    // auto-PEEP: estimaciÃ³n si tExp < 3Â·Ï„
    const tau = (rAw * cStat) / 1000;
    const autoPeep = tExp < 3 * tau ? 2 * Math.exp(-tExp / Math.max(0.01, tau)) : 0;

    // Mechanical Power (Gattinoni 2016):
    // MP(J/min) = 0.098 Â· RR Â· V_T(L) Â· (PEEP + (Pplat âˆ’ PEEP)/2 + RrsÂ·VÌ‡)
    const rr = 60 / tCycle;
    const mp = 0.098 * rr * (this.vtInspired / 1000)
             * (s.peep + driveP / 2 + rAw * vDotPeak);

    // ATRC aplicado a pico/plateau
    const pTrachPeak = this.peakPTrach;
    const pTrachPlat = pPlat - this.rohrerDrop(0.01, s); // ~K1Â·Îµ

    // Flag Acute Cor Pulmonale (Vieillard-Baron 2016: Pplat > 27 + SDRA mod/sev)
    const acpFlag = pPlat > ACP_PPLAT_THR;

    const prevPrvcTarget = this.pInspTarget;
    let prvcDelta = 0;

    // â”€â”€ PRVC: ajustar presiÃ³n objetivo para prÃ³ximo ciclo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (s.mode === 'PRVC' || s.mode === 'AMV') {
      const vtGoal = (s.mode === 'AMV') ? this.amvResult.vtOpt : s.vtTarget;
      prvcDelta = this.computePRVCAdjustment(this.vtInspired, vtGoal, s);
      const pMax = Math.max(5, s.pMaxAlarm - PRVC_MARGIN_TO_ALARM);
      this.pInspTarget = clamp(this.pInspTarget + prvcDelta, 2, pMax);
      this.prvcBreathCount++;
      this.lastPrvcDelta = prvcDelta;
    }

    this.lastMetrics = {
      breathId: this.lastMetrics.breathId + 1,
      tCycle, tInsp, tExp, ieRatio,
      vtInsp: this.vtInspired, vtExp: this.vtExpired,
      minVol: (this.vtInspired / 1000) * rr,
      pPeak: this.peakPaw, pPlat, pMean,
      autoPeep, drivingPressure: driveP, mechPowerJmin: mp,
      cStatMeasured: cStat, rAwMeasured: rAw,
      pTrachPeak, pTrachPlat,
      pInspTarget: prevPrvcTarget,
      prvcDelta,
      pplMean, pplSwing, pTPPeak: this.peakPaw - this.pplMin,
      acpFlag,
    };

    // Reset contadores para el prÃ³ximo ciclo
    this.cycleStart = this.simTime;
    this.peakPaw = 0; this.peakPTrach = 0;
    this.sumPawDt = 0; this.sumPplDt = 0; this.sumAbsFlowDt = 0;
    this.pplMin = 0; this.pplMax = 0;
    this.vtInspired = 0; this.vtExpired = 0; this.pPlatMeasured = 0;
    this.vol = 0;
  }

  // â”€â”€â”€ PRVC â€” CONTROLADOR DISCRETO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Criterio SM100 (Mindray Operator's Manual):
  //    - Ajuste proporcional al error |V_T_real âˆ’ V_T_target|.
  //    - LÃ­mite de paso: Â±3 cmHâ‚‚O, salvo las 3 primeras respiraciones
  //      "test breaths" donde Â±10 cmHâ‚‚O estÃ¡n permitidos.
  //    - Nunca exceder P_alarm âˆ’ 5 cmHâ‚‚O.
  //    - Si V_T real ya estÃ¡ en rango Â±10% del objetivo, no se ajusta.
  //
  private computePRVCAdjustment(
    vtActual: number, vtTarget: number, s: SM100Settings,
  ): number {
    const err = vtTarget - vtActual; // mL positivo si necesitamos mÃ¡s volumen
    const tolerance = 0.10 * vtTarget; // 10% de banda muerta
    if (Math.abs(err) < tolerance) return 0;

    // Ganancia proporcional: aproximamos que 50 mL â‰ˆ 2 cmHâ‚‚O
    // (pendiente de la curva V-P lineal a Crs â‰ˆ 25-60 mL/cmHâ‚‚O)
    let delta = PRVC_GAIN * (err / 25); // cmHâ‚‚O

    const maxStep = (this.prvcBreathCount < PRVC_TEST_BREATHS)
      ? PRVC_DELTA_TEST : PRVC_DELTA_NORMAL;
    delta = clamp(delta, -maxStep, maxStep);
    return delta;
  }
}

// â”€â”€â”€ HELPERS DE PATOLOGÃA (usados externamente para configurar mechanics) â”€â”€â”€â”€

/**
 * Construye el objeto `PatientMechanics` a partir de los modificadores
 * globales de patologÃ­a. Se usa en `RespiratoryEngine` para mantener la
 * coherencia con `PathologyEngine`.
 *
 * Relaciones:
 *   - Crs_base = 50 mL/cmHâ‚‚O (adulto 70 kg sano)
 *   - Raw_base = 5  cmHâ‚‚O/L/s
 *   - SDRA severo: Crs Ã— 0.30, Raw +2   (ARDSnet 2000; Vieillard-Baron 2016)
 *   - Sepsis + SDRA: pared torÃ¡cica mÃ¡s "rÃ­gida" â†’ E_cw/E_tot â†“ de 0.7 a 0.5
 *   - Shock hemorrÃ¡gico: sin cambio intrÃ­nseco pulmonar, pero Ppl cae (baja
 *     presiÃ³n abdominal por hipovolemia). Modelamos con pMusAmplitude â†‘ si
 *     el paciente no estÃ¡ relajado (shock â†’ taquipnea compensatoria).
 */
export function deriveMechanicsFromPathology(params: {
  weightKg?: number;
  ardsSeverity: number;       // 0â€“1
  ardsActive: boolean;
  sepsisSeverity: number;     // 0â€“1
  sepsisActive: boolean;
  hypovolemicFraction: number; // (BV_base âˆ’ BV_curr)/BV_base  (0â€“0.5)
  isSedated: boolean;
  nmbaFraction: number;        // 0â€“1 (parÃ¡lisis NMBA)
}): PatientMechanics {
  const w = params.weightKg ?? 70;

  // Base
  let crs = 50;
  let raw = 5;
  let eCw = 0.7;
  let pMusAmp = params.isSedated ? 0 : 3.5;   // cmHâ‚‚O esfuerzo (negativo)
  let pMusHz = 14 / 60;                       // 14 rpm basal

  // SDRA: compliance â†“, R ligeramente â†‘ (por edema pequeÃ±as vÃ­as)
  if (params.ardsActive) {
    const sev = clamp(params.ardsSeverity, 0, 1);
    crs *= (1 - sev * 0.70);                  // hasta Ã—0.30
    raw += sev * 5;                           // +5 en severo
    eCw = 0.7 - sev * 0.2;                    // pared torÃ¡cica efectiva menor
  }

  // Sepsis (sin SDRA): FC aumenta â†’ si no sedado, mÃ¡s demanda ventilatoria
  if (params.sepsisActive && !params.isSedated) {
    pMusHz = 14 / 60 + clamp(params.sepsisSeverity, 0, 1) * 0.25; // hasta 29 rpm
    pMusAmp *= (1 + 0.5 * params.sepsisSeverity);
  }

  // NMBA (vecuronio/cisatracurio pleno) â†’ esfuerzo muscular anulado
  if (params.nmbaFraction > 0.6) pMusAmp = 0;

  // Shock hemorrÃ¡gico: hipovolemia â†’ presiÃ³n intraabdominal â†“ pero sin cambio
  // intrÃ­nseco en compliance. Sin embargo la respuesta ventilatoria es de
  // taquipnea (acidosis lÃ¡ctica). Ya modelado vÃ­a pMusHz si sepsisActive.
  if (!params.isSedated && params.hypovolemicFraction > 0.10) {
    pMusHz += params.hypovolemicFraction * 0.2; // taquipnea compensatoria
    pMusAmp += params.hypovolemicFraction * 2;
  }

  return {
    crs: clamp(crs, 8, 120),
    raw: clamp(raw, 2, 40),
    eCw_eTot: clamp(eCw, 0.3, 0.8),
    pMusAmplitude: clamp(pMusAmp, 0, 15),
    pMusDriveHz: clamp(pMusHz, 0.1, 0.7),    // 6â€“42 rpm
    vAnat: 2.2 * w,
  };
}

/**
 * Convierte el estado cardiovascular (Paw, Pplat, Ppl, SDRA) en un delta
 * hemodinÃ¡mico que el CardiovascularEngine debe aplicar al SV, CVP y PVR.
 *
 * Basado en:
 *   - Vieillard-Baron ICM 2016: TPP â†’ PVR, Ppl swing â†’ VR (venous return)
 *   - Berger AJP HCP 2016: PEEP â†‘ Pfs > RAP â†‘ en magnitudes similares;
 *     sÃ³lo reduce VR cuando RAP se aproxima a Pfs.
 *   - Lanspa Chest 2020: RV dysfunction 48% en sepsis temprana; Pplat > 27
 *     + sepsis duplica prob. ACP.
 */
export function computeHemodynamicCoupling(input: {
  pMean: number;       // cmHâ‚‚O
  pPlat: number;       // cmHâ‚‚O
  pplMean: number;     // cmHâ‚‚O
  pplSwing: number;    // cmHâ‚‚O
  peep: number;
  ardsActive: boolean;
  ardsSeverity: number;
  sepsisActive: boolean;
  sepsisSeverity: number;
}): {
  cvpTransmission: number;    // cmHâ‚‚O a aÃ±adir a CVP
  svPenalty: number;          // 0â€“1 (fracciÃ³n de SV perdida)
  pvrBonus: number;           // multiplicador RVP (1 = sin cambio)
  acpHighRisk: boolean;
  rvAfterloadFactor: number;  // 1+ â†’ mayor postcarga VD
} {
  // 1. TransmisiÃ³n Ppl â†’ CVP (0.5 Â· exceso sobre 10 cmHâ‚‚O, Berger 2016)
  const peepExcess = Math.max(0, input.peep - 10);
  const pplExcess = Math.max(0, input.pplMean - 5);
  const cvpTransmission = peepExcess * 0.5 + pplExcess * 0.3;

  // 2. PenalizaciÃ³n SV (precarga): funciÃ³n de Pmean
  //    Dual: Pmean reduce retorno venoso + Pplat reduce compliance VD
  const pmeanPen = Math.max(0, input.pMean - 10) * 0.025;
  const pplatPen = Math.max(0, input.pPlat - 25) * 0.015;
  const svPenalty = clamp(pmeanPen + pplatPen, 0, 0.70);

  // 3. PVR bonus â€” TPP eleva resistencia vascular pulmonar
  //    RelaciÃ³n no-lineal: bonus = 1 + Î±Â·(TPP âˆ’ 15)Â²  para TPP > 15
  //    Î± calibrado para bonus â‰ˆ 1.4 a TPP=25 (consistente con ICM 2016)
  const tppProxy = input.pPlat - input.pplMean;
  const pvrBonus = tppProxy > 15
    ? 1 + 0.004 * (tppProxy - 15) * (tppProxy - 15)
    : 1.0;

  // 4. Acute Cor Pulmonale: Pplat > 27 + (SDRA mod/sev OR sepsis+SDRA)
  const severeSubstrate =
    (input.ardsActive && input.ardsSeverity > 0.40) ||
    (input.ardsActive && input.sepsisActive);
  const acpHighRisk = input.pPlat > 27 && severeSubstrate;

  // 5. Postcarga VD combinada (PVR + ACP)
  const rvAfterloadFactor = pvrBonus * (acpHighRisk ? 1.25 : 1.0);

  return { cvpTransmission, svPenalty, pvrBonus, acpHighRisk, rvAfterloadFactor };
}




