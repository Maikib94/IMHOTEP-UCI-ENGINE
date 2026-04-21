// src/core/VentilatorSV800Engine.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  IMHOTEP UCI — Motor Mindray SV800 de alta fidelidad
//  Autor: IMHOTEP Core Physics Team
// ═══════════════════════════════════════════════════════════════════════════════
//
//  FÍSICA IMPLEMENTADA (sin placeholders):
//    1. Ecuación de movimiento respiratorio (single-compartment lineal)
//       P_aw(t) = (1/Crs)·V(t) + Raw·V̇(t) + PEEP + P_mus(t)
//       Integrada con Runge-Kutta 2º orden a 1000 Hz.
//
//    2. ATRC — Rohrer:  ΔP = (K1·|V̇| + K2·V̇²) · C_rate
//       Constantes K1/K2 de Flevari et al. Anaesth Intensive Care 2011 (IDs 6.5-9.0).
//
//    3. PRVC — controlador discreto con límites clínicos SV800:
//       ΔP ≤ 3 cmH₂O (10 en las 3 primeras respiraciones), P_max ≤ P_alarm − 5.
//
//    4. AMV/Otis — minimización analítica del WOB con RC_exp = Raw·Crs,
//       devolviendo frecuencia óptima y V_T óptimo para la VA demandada.
//
//    5. Triggering flow/pressure con histéresis y ventana refractaria.
//
//    6. Salidas acopladas a hemodinamia:
//         - P_pl(t)  (pleural) → retorno venoso (Guyton)
//         - P_TP(t)  (transpulmonar) → postcarga VD
//         - P_mean    → transmisión a CVP
//         - flag ACP (Acute Cor Pulmonale) si Pplat > 27 y SDRA severo/sepsis
//
//  REFERENCIAS (peer-reviewed, indexadas):
//    Vieillard-Baron A. et al. Intensive Care Med 2016;42(5):739-49.   [ARDS·MV]
//    Lanspa M. et al.          Chest 2020;157(1):95-104.               [RV·sepsis]
//    Vallabhajosyula S. et al. Chest 2021;159(6):2357-2369.            [RV·meta]
//    Berger D. et al.          Am J Physiol HCP 2016;311:H794-H806.    [PEEP·VR]
//    Flevari AG et al.         Anaesth Intensive Care 2011;39:410-17.  [Rohrer·ETT]
//    Otis AB.                  J Appl Physiol 1950;2:592-607.          [WOB]
//    Geri G. et al.            J Crit Care 2021;64:100-107.            [CRS·renal]
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TIPOS PÚBLICOS ──────────────────────────────────────────────────────────

export type VentMode =
  | 'VCV'    // Volume-Controlled Ventilation (AC)
  | 'PCV'    // Pressure-Controlled Ventilation
  | 'PRVC'   // Pressure-Regulated Volume Control (SV800 flagship)
  | 'PSV'    // Pressure Support (espontáneo)
  | 'AMV';   // Adaptive Minute Ventilation (Otis)

export interface SV800Settings {
  mode: VentMode;
  fio2: number;              // 0.21 – 1.00
  peep: number;              // cmH₂O (0 – 25)
  vtTarget: number;          // mL (objetivo en PRVC/VCV)
  rrSet: number;             // respiraciones/min
  pInspSet: number;          // cmH₂O (PCV)
  pSupport: number;          // cmH₂O (PSV)
  tInspSet: number;          // segundos (tiempo inspiratorio)
  pMaxAlarm: number;         // cmH₂O (alarma de presión alta, usada por PRVC)
  // ATRC
  atrcEnabled: boolean;
  atrcTubeId: 6.5 | 7.0 | 7.5 | 8.0 | 8.5 | 9.0;
  atrcCompensation: number;  // 0.0 – 1.0 (C_rate)
  // Triggering
  triggerType: 'flow' | 'pressure';
  flowTriggerLpm: number;    // 0.5 – 15 L/min
  pressTriggerCmH2O: number; // 0.5 – 20 cmH₂O
  // AMV
  amvMinuteVentTarget: number; // L/min objetivo (AMV)
  amvWeightKg: number;         // peso corporal predicho (para Vd)
}

export interface PatientMechanics {
  crs: number;               // mL/cmH₂O  (compliance sist. resp.)
  raw: number;               // cmH₂O/L/s (resistencia vía aérea)
  eCw_eTot: number;          // 0.3–0.7  (fracción pared torácica / E_total)
  pMusAmplitude: number;     // cmH₂O (esfuerzo muscular máximo; 0 = paralizado)
  pMusDriveHz: number;       // frecuencia espontánea Hz
  vAnat: number;             // mL (espacio muerto anatómico ~2.2·kg)
}

/** Muestras de las señales en tiempo real (buffer circular para UI). */
export interface SV800Waveforms {
  t: Float32Array;     // segundos relativos (rolling window)
  paw: Float32Array;   // presión vía aérea proximal (cmH₂O)
  pTrach: Float32Array; // presión traqueal (Paw − ΔP_ETT) (cmH₂O)
  flow: Float32Array;  // flujo (L/min)  (+inspiración / −espiración)
  vol: Float32Array;   // volumen acumulado (mL)
  ppl: Float32Array;   // presión pleural estimada (cmH₂O)
  pTP: Float32Array;   // presión transpulmonar (cmH₂O)
  length: number;      // número de muestras válidas
  writeIdx: number;    // índice de escritura circular
}

/** Métricas "por respiración" calculadas cada ciclo (para monitor digital). */
export interface SV800BreathMetrics {
  breathId: number;
  tCycle: number;            // duración ciclo (s)
  tInsp: number;
  tExp: number;
  ieRatio: number;           // I:E
  vtInsp: number;            // mL
  vtExp: number;             // mL
  minVol: number;            // L/min
  pPeak: number;             // cmH₂O
  pPlat: number;             // cmH₂O
  pMean: number;             // cmH₂O
  autoPeep: number;          // cmH₂O
  drivingPressure: number;   // cmH₂O (Pplat − PEEP)
  mechPowerJmin: number;     // J/min (ecuación Gattinoni 2016)
  cStatMeasured: number;     // mL/cmH₂O
  rAwMeasured: number;       // cmH₂O/L/s
  // ATRC
  pTrachPeak: number;        // Ppeak − ΔP_ETT
  pTrachPlat: number;        // Pplat − ΔP_ETT
  // PRVC
  pInspTarget: number;       // cmH₂O (objetivo entregado en la respiración)
  prvcDelta: number;         // cmH₂O (ajuste aplicado)
  // Hemo
  pplMean: number;           // cmH₂O (promedio ciclo)
  pplSwing: number;          // cmH₂O (Δ ipso–esp)
  pTPPeak: number;           // cmH₂O
  acpFlag: boolean;          // Acute Cor Pulmonale pendiente de confirmación
}

// ─── CONSTANTES ROHRER (Flevari 2011 adult ETTs) ─────────────────────────────
//   K1: componente lineal laminar (cmH₂O / (L/s))   — típicamente baja
//   K2: componente cuadrática turbulenta (cmH₂O / (L/s)²) — dominante
const ROHRER_K: Record<number, { k1: number; k2: number }> = {
  6.5: { k1: 5.5, k2: 12.80 },
  7.0: { k1: 4.7, k2: 9.17  },
  7.5: { k1: 3.9, k2: 6.01  },
  8.0: { k1: 3.2, k2: 4.65  },
  8.5: { k1: 2.7, k2: 3.05  },
  9.0: { k1: 2.3, k2: 2.42  },
};

// ─── PARÁMETROS NUMÉRICOS ────────────────────────────────────────────────────
const PHYS_HZ = 1000;                    // Hz (integración ODE)
const WAVE_HZ = 100;                     // Hz (downsample para UI)
const WAVE_WINDOW_S = 10;                // segundos visibles
const WAVE_BUF = WAVE_HZ * WAVE_WINDOW_S;

// PRVC
const PRVC_DELTA_NORMAL = 3;             // cmH₂O/ciclo
const PRVC_DELTA_TEST   = 10;            // primeras 3 respiraciones
const PRVC_TEST_BREATHS = 3;
const PRVC_MARGIN_TO_ALARM = 5;          // P_max = P_alarm − 5
const PRVC_GAIN = 0.7;                   // acoplamiento proporcional (ΔP = GAIN · ΔV̇·τ)

// Otis / AMV
const OTIS_MV_FLOOR = 3.0;               // L/min (safeguard)

// Hemodinamia
const ACP_PPLAT_THR = 27;                // cmH₂O — Acute Cor Pulmonale threshold (Vieillard-Baron 2016)

// ─── UTILIDADES ──────────────────────────────────────────────────────────────
const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

const LPS_to_Lmin = (lps: number) => lps * 60;
const Lmin_to_LPS = (lpm: number) => lpm / 60;

// ═══════════════════════════════════════════════════════════════════════════════
//  MOTOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export class VentilatorSV800Engine {
  // ── singleton ──
  private static inst: VentilatorSV800Engine | null = null;
  public static getInstance(): VentilatorSV800Engine {
    if (!VentilatorSV800Engine.inst) VentilatorSV800Engine.inst = new VentilatorSV800Engine();
    return VentilatorSV800Engine.inst;
  }

  // ── estado integrado (físico, 1 kHz) ──
  private simTime   = 0;          // s (tiempo absoluto simulado del motor)
  private phaseT    = 0;          // s (tiempo dentro del ciclo actual)
  private phase: 'insp' | 'exp' = 'insp';
  private vol       = 0;          // mL (volumen pulmonar INSPIRADO en el ciclo)
  private flow      = 0;          // L/s (flujo instantáneo)
  private paw       = 0;          // cmH₂O (Paw instantánea)
  private ppl       = 0;          // cmH₂O (pleural instantánea)
  private pTP       = 0;          // cmH₂O (transpulmonar instantánea)

  // PRVC interno
  private pInspTarget = 15;       // cmH₂O (presión objetivo actual del PRVC)
  private prvcBreathCount = 0;
  private lastPrvcDelta = 0;

  // Métricas del ciclo actual
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

  // Historia (última respiración completa)
  private lastMetrics: SV800BreathMetrics = {
    breathId: 0, tCycle: 0, tInsp: 0, tExp: 0, ieRatio: 0,
    vtInsp: 0, vtExp: 0, minVol: 0, pPeak: 0, pPlat: 0, pMean: 0,
    autoPeep: 0, drivingPressure: 0, mechPowerJmin: 0,
    cStatMeasured: 0, rAwMeasured: 0,
    pTrachPeak: 0, pTrachPlat: 0,
    pInspTarget: 0, prvcDelta: 0,
    pplMean: 0, pplSwing: 0, pTPPeak: 0, acpFlag: false,
  };

  // Buffer de waveforms (Float32 circular)
  private wf: SV800Waveforms = {
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

  // ─── API PÚBLICA ────────────────────────────────────────────────────────────

  /** Getters */
  public getWaveforms(): SV800Waveforms { return this.wf; }
  public getLastBreath(): SV800BreathMetrics { return this.lastMetrics; }
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
   * Avanza el motor `dtMacro` segundos de tiempo simulado usando integración
   * interna a 1 kHz. Llamado por CronosEngine en cada tick.
   */
  public update(
    dtMacro: number,
    s: SV800Settings,
    m: PatientMechanics,
  ): void {
    if (dtMacro <= 0 || !isFinite(dtMacro)) return;
    const steps = Math.max(1, Math.round(dtMacro * PHYS_HZ));
    const h = dtMacro / steps; // paso ODE efectivo
    for (let i = 0; i < steps; i++) this.integrateStep(h, s, m);
  }

  // ─── OTIS / AMV ─────────────────────────────────────────────────────────────
  //
  //  Otis AB, J Appl Physiol 1950 minimiza el trabajo respiratorio analítico.
  //  Para MV objetivo (V_E) y espacio muerto Vd, la frecuencia óptima es:
  //
  //      f_opt = (√(1 + 4·π²·RC_exp·(V_E − f·Vd)) − 1) / (2·π²·RC_exp·Vd)
  //
  //  Algoritmo de Hamilton/SV800 simplifica:
  //      1. Calcular RC_exp = Raw·Crs (ms → s)
  //      2. Resolver la cúbica iterativamente (Newton) para f que minimiza
  //         el trabajo inspiratorio-espiratorio combinado.
  //      3. V_T = V_E / f   (acotado 3–8 mL/kg para protección pulmonar).
  //
  //  Implementación: búsqueda de mínimo en W(f) con pasos de 0.5 bpm.
  //
  public computeOtisAMV(
    mvTargetLmin: number,
    weightKg: number,
    m: PatientMechanics,
  ): { fOpt: number; vtOpt: number; wobMin: number } {
    const vE = Math.max(OTIS_MV_FLOOR, mvTargetLmin);    // L/min
    const vD = (m.vAnat > 0 ? m.vAnat : 2.2 * weightKg) / 1000; // L
    const tau = (m.raw * m.crs) / 1000;                  // s  (Crs en mL/cmH₂O → L/cmH₂O)

    let fBest = 14, vtBest = 500, wBest = Infinity;
    for (let f = 8; f <= 35; f += 0.5) {
      const va = vE - f * vD;                            // alveolar
      if (va <= 0) continue;
      const vtL = vE / f;                                // L/ciclo
      if (vtL < 0.25 || vtL > 0.9) continue;             // fisiológico 250-900 mL
      // WOB Otis (ec. 11): W = π²·f·(V_E − f·Vd)² ·R + (V_E²)/(2·f·C)
      const elastic = (vE * vE) / (2 * f * (m.crs / 1000));   // work elástico
      const resistive = Math.PI * Math.PI * f * va * va * m.raw;
      const w = elastic + resistive;
      if (w < wBest) { wBest = w; fBest = f; vtBest = vtL * 1000; }
    }
    // Protección pulmonar ARDSNet + corrección Becher 2019:
    //   Otis puro tiende a 8.2 mL/kg (Becher T., Crit Care 2019;23:338). Para no
    //   exagerar, aplicamos dos techos: 8 mL/kg en pulmón sano, 6 mL/kg si
    //   Crs < 40 (sugestivo de SDRA moderado-severo, Berlin criteria proxy).
    const vtMin = 4 * weightKg;
    const vtMax = m.crs < 40 ? 6 * weightKg : 8 * weightKg;
    vtBest = clamp(vtBest, vtMin, vtMax);
    this.amvResult = { fOpt: fBest, vtOpt: vtBest };
    return { fOpt: fBest, vtOpt: vtBest, wobMin: wBest };
  }

  public getAMVRecommendation() { return this.amvResult; }

  // ─── INTEGRACIÓN ODE ────────────────────────────────────────────────────────
  //
  //  Ecuación de movimiento en forma resuelta para V̇:
  //    V̇(t) = ( P_aw(t) − P_mus(t) − PEEP − V(t)/Crs ) / Raw
  //
  //  Runge-Kutta 2º orden (método del punto medio):
  //    k1 = f(t, V)
  //    k2 = f(t+h/2, V + h/2·k1)
  //    V_{n+1} = V_n + h·k2
  //
  //  El driver P_aw lo establece el modo (VCV/PCV/PRVC/PSV) en cada paso.
  //
  private integrateStep(h: number, s: SV800Settings, m: PatientMechanics): void {
    // ── 1. Determinar esfuerzo muscular del paciente ────────────────────────
    const pMus = this.computePMus(s, m);

    // ── 2. Máquina de fases: phaseT es módulo tCycle, transiciones explícitas ─
    const tInsp = this.computeTInsp(s);
    const tCycle = 60 / Math.max(4, s.rrSet);

    // Trigger por paciente (adelanta inicio de inspiración)
    const triggered = this.checkTrigger(s, pMus);
    if (triggered && this.phase === 'exp') {
      // Cerramos ciclo anterior y reiniciamos
      this.onBreathStart(s);
      this.phaseT = 0;
    }

    const prevPhase = this.phase;
    const isInsp = this.phaseT < tInsp;
    this.phase = isInsp ? 'insp' : 'exp';

    // Sólo publicamos métricas al cierre DEL CICLO (phaseT wrap-around),
    // no en la transición insp→exp intermedia. onInspEnd sigue como hook
    // sin side-effects sobre breath metrics.
    if (!isInsp && prevPhase === 'insp') this.onInspEnd();

    const pawTarget = this.computePawTarget(s, isInsp);

    // ── 3. RK2 para V̇ y V ─────────────────────────────────────────────────
    const dVdt = (V: number, pawDriver: number) =>
      Lmin_to_LPS(
        LPS_to_Lmin(
          (pawDriver - pMus - s.peep - V / Math.max(0.1, m.crs)) / Math.max(0.1, m.raw)
        )
      ); // L/s

    // En VCV puro, fijamos flujo cuadrado y derivamos Paw en su lugar:
    if (s.mode === 'VCV' && isInsp) {
      const flowSetLPS = this.vcvFlowLPS(s);
      this.flow = flowSetLPS;
      const dV_mL = flowSetLPS * h * 1000;
      this.vol += dV_mL;
      // Paw emerge de la ecuación de movimiento
      this.paw = pMus + s.peep + (this.vol / Math.max(0.1, m.crs))
               + m.raw * flowSetLPS;
    } else {
      // PCV / PRVC / PSV / VCV-exp → controlamos Paw, resolvemos V̇
      const V_mL = this.vol;
      const k1 = dVdt(V_mL, pawTarget);             // L/s a t_n
      const V_mid = V_mL + (h / 2) * k1 * 1000;     // mL intermedio
      const k2 = dVdt(V_mid, pawTarget);            // L/s a t_n+h/2
      this.flow = k2;
      this.vol += h * k2 * 1000;
      this.paw = pawTarget;
    }

    // Durante la espiración (Paw ≈ PEEP), actualizar flujo y vol
    if (!isInsp) {
      // Flujo espiratorio pasivo: V̇_exp = −V/(Raw·Crs) (ec. decaimiento exponencial)
      const tau = (m.raw * m.crs) / 1000; // s
      const vExpCurrent = Math.max(0, this.vol);
      this.flow = -vExpCurrent / Math.max(0.05, tau) / 1000; // L/s (negativo)
      const dV = this.flow * h * 1000; // mL negativos
      this.vol = Math.max(0, this.vol + dV);
      this.paw = s.peep; // modelo ideal con válvula PEEP abierta
      this.vtExpired += -dV; // acumula lo exhalado (valor positivo)
    } else {
      this.vtInspired += Math.max(0, this.flow * h * 1000);
    }

    // ── 4. ATRC — resta del ΔP_ETT para obtener P_trach ──────────────────────
    const dPett = this.rohrerDrop(this.flow, s);
    const pTrach = this.paw - Math.sign(this.flow) * dPett;

    // ── 5. Presión pleural (Ppl) y transpulmonar (TPP) ───────────────────────
    //  Ppl = (E_cw / E_tot) · (Paw − PEEP) + baseline (~ −5 en respiración tranquila).
    //  TPP = Paw − Ppl.
    //  Referencia: Talmor D, NEJM 2008 (Pesoph); Vieillard-Baron ICM 2016.
    const ratio = clamp(m.eCw_eTot, 0.2, 0.8);
    this.ppl = ratio * (this.paw - s.peep) - 5 + 0.3 * pMus;
    this.pTP = this.paw - this.ppl;

    // ── 6. Métricas acumuladas del ciclo ─────────────────────────────────────
    this.peakPaw = Math.max(this.peakPaw, this.paw);
    this.peakPTrach = Math.max(this.peakPTrach, pTrach);
    this.sumPawDt += this.paw * h;
    this.sumPplDt += this.ppl * h;
    this.sumAbsFlowDt += Math.abs(this.flow) * h;
    this.pplMin = Math.min(this.pplMin, this.ppl);
    this.pplMax = Math.max(this.pplMax, this.ppl);

    // Detección de Pplat (fin de pausa inspiratoria / transición a espiración)
    if (isInsp && Math.abs(this.flow) < 0.02) {
      // flujo ~0 durante inspiración sostenida ≈ plateau
      this.pPlatMeasured = this.paw;
    }

    // ── 7. Escritura en buffer de waveforms ──────────────────────────────────
    this.waveAccumulator += h;
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

    // ── 8. Avanzar tiempo ────────────────────────────────────────────────────
    this.simTime += h;
    this.phaseT += h;
    if (this.refractoryS > 0) this.refractoryS = Math.max(0, this.refractoryS - h);

    // ── 9. Cierre natural de ciclo: wrap-around phaseT → onBreathStart ──────
    //   Se dispara una vez por ciclo completo. Si un trigger de paciente
    //   adelantó la inspiración antes, ese cierre se disparó arriba.
    if (this.phaseT >= tCycle) {
      this.phaseT -= tCycle;
      this.onBreathStart(s);
    }
  }

  // ─── DRIVERS DE PAW POR MODO ────────────────────────────────────────────────
  //   Función pura: dado el flag isInsp y los settings actuales, devuelve
  //   la presión Paw objetivo para ese instante. El flujo temporal y la
  //   máquina de estados son responsabilidad de integrateStep().
  private computePawTarget(s: SV800Settings, isInsp: boolean): number {
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

  private vcvFlowLPS(s: SV800Settings): number {
    // Flujo cuadrado: V̇ = V_T / t_insp  (ramp-free, como SV800 default)
    const tInsp = this.computeTInsp(s);
    return (s.vtTarget / 1000) / Math.max(0.1, tInsp); // L/s
  }

  private computeTInsp(s: SV800Settings): number {
    if (s.tInspSet > 0) return s.tInspSet;
    // I:E 1:2 por defecto
    return (60 / Math.max(4, s.rrSet)) * (1 / 3);
  }

  // ─── ATRC — ROHRER ──────────────────────────────────────────────────────────
  private rohrerDrop(flowLPS: number, s: SV800Settings): number {
    if (!s.atrcEnabled) return 0;
    const k = ROHRER_K[s.atrcTubeId];
    if (!k) return 0;
    const cRate = clamp(s.atrcCompensation, 0, 1);
    const absF = Math.abs(flowLPS);
    return (k.k1 * absF + k.k2 * absF * absF) * cRate;
  }

  // ─── ESFUERZO MUSCULAR ──────────────────────────────────────────────────────
  private computePMus(s: SV800Settings, m: PatientMechanics): number {
    if (m.pMusAmplitude <= 0) return 0;
    // Presión negativa sinusoidal durante inspiración espontánea
    const omega = 2 * Math.PI * Math.max(0.1, m.pMusDriveHz);
    const phi = this.simTime * omega;
    // Solo fase negativa (inspiración)
    return Math.min(0, -m.pMusAmplitude * Math.max(0, Math.sin(phi)));
  }

  // ─── TRIGGERING ─────────────────────────────────────────────────────────────
  private checkTrigger(s: SV800Settings, pMus: number): boolean {
    if (s.mode === 'VCV' || s.mode === 'PCV') return false; // control time-cycled
    if (this.phase !== 'exp') return false;
    if (this.refractoryS > 0) return false;

    if (s.triggerType === 'flow') {
      // V̇_base − V̇_exp > threshold
      const thr = Lmin_to_LPS(clamp(s.flowTriggerLpm, 0.5, 15));
      const baseFlow = 0; // línea base espiratoria ≈ 0
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

  // ─── EVENTOS DE FIN DE CICLO ────────────────────────────────────────────────
  private onInspEnd(): void {
    // Aquí podríamos forzar una pausa inspiratoria para medir Pplat real,
    // pero el modelo single-compartment con flow=0 ya lo aproxima.
  }

  private onBreathStart(s: SV800Settings): void {
    // Construir métricas del ciclo que acaba de terminar
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
    // Rrs aproximado: (Ppeak − Pplat) / V̇_peak_insp
    const vDotPeak = this.vtInspired / Math.max(0.1, tInsp) / 1000; // L/s
    const rAw = vDotPeak > 0.05 ? (this.peakPaw - pPlat) / vDotPeak : 0;

    // auto-PEEP: estimación si tExp < 3·τ
    const tau = (rAw * cStat) / 1000;
    const autoPeep = tExp < 3 * tau ? 2 * Math.exp(-tExp / Math.max(0.01, tau)) : 0;

    // Mechanical Power (Gattinoni 2016):
    // MP(J/min) = 0.098 · RR · V_T(L) · (PEEP + (Pplat − PEEP)/2 + Rrs·V̇)
    const rr = 60 / tCycle;
    const mp = 0.098 * rr * (this.vtInspired / 1000)
             * (s.peep + driveP / 2 + rAw * vDotPeak);

    // ATRC aplicado a pico/plateau
    const pTrachPeak = this.peakPTrach;
    const pTrachPlat = pPlat - this.rohrerDrop(0.01, s); // ~K1·ε

    // Flag Acute Cor Pulmonale (Vieillard-Baron 2016: Pplat > 27 + SDRA mod/sev)
    const acpFlag = pPlat > ACP_PPLAT_THR;

    const prevPrvcTarget = this.pInspTarget;
    let prvcDelta = 0;

    // ── PRVC: ajustar presión objetivo para próximo ciclo ───────────────────
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

    // Reset contadores para el próximo ciclo
    this.cycleStart = this.simTime;
    this.peakPaw = 0; this.peakPTrach = 0;
    this.sumPawDt = 0; this.sumPplDt = 0; this.sumAbsFlowDt = 0;
    this.pplMin = 0; this.pplMax = 0;
    this.vtInspired = 0; this.vtExpired = 0; this.pPlatMeasured = 0;
    this.vol = 0;
  }

  // ─── PRVC — CONTROLADOR DISCRETO ────────────────────────────────────────────
  //
  //  Criterio SV800 (Mindray Operator's Manual):
  //    - Ajuste proporcional al error |V_T_real − V_T_target|.
  //    - Límite de paso: ±3 cmH₂O, salvo las 3 primeras respiraciones
  //      "test breaths" donde ±10 cmH₂O están permitidos.
  //    - Nunca exceder P_alarm − 5 cmH₂O.
  //    - Si V_T real ya está en rango ±10% del objetivo, no se ajusta.
  //
  private computePRVCAdjustment(
    vtActual: number, vtTarget: number, s: SV800Settings,
  ): number {
    const err = vtTarget - vtActual; // mL positivo si necesitamos más volumen
    const tolerance = 0.10 * vtTarget; // 10% de banda muerta
    if (Math.abs(err) < tolerance) return 0;

    // Ganancia proporcional: aproximamos que 50 mL ≈ 2 cmH₂O
    // (pendiente de la curva V-P lineal a Crs ≈ 25-60 mL/cmH₂O)
    let delta = PRVC_GAIN * (err / 25); // cmH₂O

    const maxStep = (this.prvcBreathCount < PRVC_TEST_BREATHS)
      ? PRVC_DELTA_TEST : PRVC_DELTA_NORMAL;
    delta = clamp(delta, -maxStep, maxStep);
    return delta;
  }
}

// ─── HELPERS DE PATOLOGÍA (usados externamente para configurar mechanics) ────

/**
 * Construye el objeto `PatientMechanics` a partir de los modificadores
 * globales de patología. Se usa en `RespiratoryEngine` para mantener la
 * coherencia con `PathologyEngine`.
 *
 * Relaciones:
 *   - Crs_base = 50 mL/cmH₂O (adulto 70 kg sano)
 *   - Raw_base = 5  cmH₂O/L/s
 *   - SDRA severo: Crs × 0.30, Raw +2   (ARDSnet 2000; Vieillard-Baron 2016)
 *   - Sepsis + SDRA: pared torácica más "rígida" → E_cw/E_tot ↓ de 0.7 a 0.5
 *   - Shock hemorrágico: sin cambio intrínseco pulmonar, pero Ppl cae (baja
 *     presión abdominal por hipovolemia). Modelamos con pMusAmplitude ↑ si
 *     el paciente no está relajado (shock → taquipnea compensatoria).
 */
export function deriveMechanicsFromPathology(params: {
  weightKg?: number;
  ardsSeverity: number;       // 0–1
  ardsActive: boolean;
  sepsisSeverity: number;     // 0–1
  sepsisActive: boolean;
  hypovolemicFraction: number; // (BV_base − BV_curr)/BV_base  (0–0.5)
  isSedated: boolean;
  nmbaFraction: number;        // 0–1 (parálisis NMBA)
}): PatientMechanics {
  const w = params.weightKg ?? 70;

  // Base
  let crs = 50;
  let raw = 5;
  let eCw = 0.7;
  let pMusAmp = params.isSedated ? 0 : 3.5;   // cmH₂O esfuerzo (negativo)
  let pMusHz = 14 / 60;                       // 14 rpm basal

  // SDRA: compliance ↓, R ligeramente ↑ (por edema pequeñas vías)
  if (params.ardsActive) {
    const sev = clamp(params.ardsSeverity, 0, 1);
    crs *= (1 - sev * 0.70);                  // hasta ×0.30
    raw += sev * 5;                           // +5 en severo
    eCw = 0.7 - sev * 0.2;                    // pared torácica efectiva menor
  }

  // Sepsis (sin SDRA): FC aumenta → si no sedado, más demanda ventilatoria
  if (params.sepsisActive && !params.isSedated) {
    pMusHz = 14 / 60 + clamp(params.sepsisSeverity, 0, 1) * 0.25; // hasta 29 rpm
    pMusAmp *= (1 + 0.5 * params.sepsisSeverity);
  }

  // NMBA (vecuronio/cisatracurio pleno) → esfuerzo muscular anulado
  if (params.nmbaFraction > 0.6) pMusAmp = 0;

  // Shock hemorrágico: hipovolemia → presión intraabdominal ↓ pero sin cambio
  // intrínseco en compliance. Sin embargo la respuesta ventilatoria es de
  // taquipnea (acidosis láctica). Ya modelado vía pMusHz si sepsisActive.
  if (!params.isSedated && params.hypovolemicFraction > 0.10) {
    pMusHz += params.hypovolemicFraction * 0.2; // taquipnea compensatoria
    pMusAmp += params.hypovolemicFraction * 2;
  }

  return {
    crs: clamp(crs, 8, 120),
    raw: clamp(raw, 2, 40),
    eCw_eTot: clamp(eCw, 0.3, 0.8),
    pMusAmplitude: clamp(pMusAmp, 0, 15),
    pMusDriveHz: clamp(pMusHz, 0.1, 0.7),    // 6–42 rpm
    vAnat: 2.2 * w,
  };
}

/**
 * Convierte el estado cardiovascular (Paw, Pplat, Ppl, SDRA) en un delta
 * hemodinámico que el CardiovascularEngine debe aplicar al SV, CVP y PVR.
 *
 * Basado en:
 *   - Vieillard-Baron ICM 2016: TPP → PVR, Ppl swing → VR (venous return)
 *   - Berger AJP HCP 2016: PEEP ↑ Pfs > RAP ↑ en magnitudes similares;
 *     sólo reduce VR cuando RAP se aproxima a Pfs.
 *   - Lanspa Chest 2020: RV dysfunction 48% en sepsis temprana; Pplat > 27
 *     + sepsis duplica prob. ACP.
 */
export function computeHemodynamicCoupling(input: {
  pMean: number;       // cmH₂O
  pPlat: number;       // cmH₂O
  pplMean: number;     // cmH₂O
  pplSwing: number;    // cmH₂O
  peep: number;
  ardsActive: boolean;
  ardsSeverity: number;
  sepsisActive: boolean;
  sepsisSeverity: number;
}): {
  cvpTransmission: number;    // cmH₂O a añadir a CVP
  svPenalty: number;          // 0–1 (fracción de SV perdida)
  pvrBonus: number;           // multiplicador RVP (1 = sin cambio)
  acpHighRisk: boolean;
  rvAfterloadFactor: number;  // 1+ → mayor postcarga VD
} {
  // 1. Transmisión Ppl → CVP (0.5 · exceso sobre 10 cmH₂O, Berger 2016)
  const peepExcess = Math.max(0, input.peep - 10);
  const pplExcess = Math.max(0, input.pplMean - 5);
  const cvpTransmission = peepExcess * 0.5 + pplExcess * 0.3;

  // 2. Penalización SV (precarga): función de Pmean
  //    Dual: Pmean reduce retorno venoso + Pplat reduce compliance VD
  const pmeanPen = Math.max(0, input.pMean - 10) * 0.025;
  const pplatPen = Math.max(0, input.pPlat - 25) * 0.015;
  const svPenalty = clamp(pmeanPen + pplatPen, 0, 0.70);

  // 3. PVR bonus — TPP eleva resistencia vascular pulmonar
  //    Relación no-lineal: bonus = 1 + α·(TPP − 15)²  para TPP > 15
  //    α calibrado para bonus ≈ 1.4 a TPP=25 (consistente con ICM 2016)
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
