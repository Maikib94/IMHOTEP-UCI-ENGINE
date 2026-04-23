// src/core/RespiratoryEngine.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  RespiratoryEngine — wrapper sobre VentilatorSV800Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Esta clase mantiene la interfaz pública original (calculatePhysics,
//  update, LungMechanics, VentilatorSettings) que consumen:
//    - InstructorPanel.tsx  (respiratoryMechanics useMemo)
//    - VentilatorSV800.tsx  (display digital)
//    - CardiovascularEngine (lee vitals.pplat, meanAirwayPressure)
//
//  Internamente, delega TODA la física al SV800Engine (ODE 1 kHz, ATRC,
//  PRVC, AMV, triggering). Los vitales del paciente (pPlat, Pmean, Peak,
//  PaO₂, PaCO₂, deltaP, mechanicalPower) se actualizan a partir de las
//  métricas por respiración del motor + modelo de intercambio gaseoso.
//
//  Intercambio gaseoso:
//    PaO₂  — modelo shunt de Riley (Qs/Qt, lungShuntFraction) con FiO₂
//    PaCO₂ — V_E alveolar vs producción CO₂ (VCO₂)
//    SpO₂  — curva de Severinghaus (disociación Hb)
// ═══════════════════════════════════════════════════════════════════════════════

import {
  usePatientStore,
  computeDeviceFiO2,
  computeDevicePEEP,
  computeEffectiveFiO2AndMechanics,
} from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import {
  VentilatorSV800Engine,
  deriveMechanicsFromPathology,
  type SV800Settings,
  type VentMode,
} from './VentilatorSV800Engine';

import type { VentilatorMode } from '../store/usePatientStore';

// ─── Ring buffer de ondas (Fase 3) ──────────────────────────────────────────

export interface WaveformSample {
  t: number;        // tiempo de simulación (s)
  pressure: number; // cmH₂O
  flow: number;     // L/min (+inspiración / -espiración)
  volume: number;   // mL
}

// ─── Interfaces preservadas para no romper consumidores existentes ──────────

export interface VentilatorSettings {
  mode: 'VCV' | 'PCV' | 'PSV';
  fio2: number;
  peep: number;
  vt: number;
  rr: number;
  tInsp: number;
  pSupport: number;
}

export interface LungMechanics {
  compliance: number;
  resistance: number;
  p01: number;
  autoPeep: number;
  pPeak: number;
  pPlat: number;
  pMean: number;
  rsbi: number;
  isRecruiting: boolean;
}

// ─── Mapeo de modo SV800 desde el store ─────────────────────────────────────
//
//  El store actualmente permite solo 'VC-AC' | 'PS'. Para PRVC/AMV la UI del
//  componente VentilatorSV800 setea `ventilator.mode` junto con un flag
//  interno del propio engine (SV800Settings.mode). Mientras la UI no migre,
//  exponemos este mapeo como función pura.
//
function mapLegacyMode(m: VentilatorMode): VentMode {
  switch (m) {
    case 'PC-AC': return 'PCV';
    case 'PSV':   return 'PSV';
    case 'CPAP':  return 'PSV';
    case 'SIMV':  return 'VCV';
    default:      return 'VCV';
  }
}

// ─── CONSTANTES DE INTERCAMBIO GASEOSO ──────────────────────────────────────
const PB = 760;                // mmHg (presión barométrica nivel del mar)
const PH2O = 47;               // mmHg (vapor de agua)
const RQ = 0.8;                // cociente respiratorio
const VCO2_BASE_MLMIN = 200;   // mL/min (producción CO₂ basal 70 kg)
const HB_NORMAL = 14;          // g/dL

export class RespiratoryEngine {
  private static instance: RespiratoryEngine | null = null;
  private sv800 = VentilatorSV800Engine.getInstance();

  // Settings "ampliados" SV800 — se configuran vía setSV800Mode() o UI.
  private sv800Settings: SV800Settings = {
    mode: 'VCV',
    fio2: 0.21,
    peep: 5,
    vtTarget: 500,
    rrSet: 14,
    pInspSet: 15,
    pSupport: 10,
    tInspSet: 1.0,
    pMaxAlarm: 40,
    atrcEnabled: false,
    atrcTubeId: 8.0,
    atrcCompensation: 0.80,
    triggerType: 'flow',
    flowTriggerLpm: 2.0,
    pressTriggerCmH2O: 1.5,
    amvMinuteVentTarget: 7.0,
    amvWeightKg: 70,
  };

  // ── Ring buffer (Fase 3) ────────────────────────────────────────────────────
  private ringBuffer: WaveformSample[] = [];
  private readonly RING_CAPACITY = 500;
  private readonly SAMPLE_RATE = 50;   // muestras por segundo de simulación
  private cyclePhase = 0;              // fracción 0–1 dentro del ciclo respiratorio
  private absoluteTime = 0;           // tiempo acumulado de simulación (s)

  // ── Maniobras de pausa (Fase 3) ─────────────────────────────────────────────
  private maneuverElapsed = 0;        // s transcurridos desde inicio de maniobra
  private activatedManeuver: 'NONE' | 'INSPIRATORY' | 'EXPIRATORY' = 'NONE';

  private constructor() {}
  public static getInstance(): RespiratoryEngine {
    if (!RespiratoryEngine.instance) RespiratoryEngine.instance = new RespiratoryEngine();
    return RespiratoryEngine.instance;
  }

  public getWaveform(): ReadonlyArray<WaveformSample> { return this.ringBuffer; }

  public reset(): void {
    this.sv800.reset(this.sv800Settings.peep);
    this.ringBuffer = [];
    this.cyclePhase = 0;
    this.absoluteTime = 0;
  }

  /** API nueva — permite al componente SV800 activar modos avanzados. */
  public setSV800(partial: Partial<SV800Settings>): void {
    this.sv800Settings = { ...this.sv800Settings, ...partial };
  }
  public getSV800Settings(): SV800Settings { return this.sv800Settings; }
  public getSV800Engine(): VentilatorSV800Engine { return this.sv800; }

  /** API preservada: método estático usado por InstructorPanel para "que pasaría si...". */
  public calculatePhysics(
    settings: VentilatorSettings,
    sdraSeverity: 'none' | 'mild' | 'moderate' | 'severe',
    patientEffort: number,
    _dt: number,
  ): LungMechanics {
    const sevMap = { none: 0, mild: 0.25, moderate: 0.55, severe: 0.85 };
    const mechanics = deriveMechanicsFromPathology({
      ardsActive: sdraSeverity !== 'none',
      ardsSeverity: sevMap[sdraSeverity],
      sepsisActive: false, sepsisSeverity: 0,
      hypovolemicFraction: 0,
      isSedated: patientEffort < 1, nmbaFraction: 0,
    });

    // Cálculo estático rápido (sin simular ciclos, para previsualización UI):
    const vtL = settings.vt / 1000;
    const flowLPS = vtL / Math.max(0.1, settings.tInsp);
    const pPlat = settings.peep + settings.vt / mechanics.crs;
    const pPeak = pPlat + flowLPS * mechanics.raw;
    const tTotal = 60 / Math.max(4, settings.rr);
    const pMean = settings.peep + (pPeak - settings.peep) * (settings.tInsp / tTotal);
    const tExp = tTotal - settings.tInsp;
    const tau = (mechanics.raw * mechanics.crs) / 1000;
    const autoPeep = tExp < 3 * tau ? 2 * Math.exp(-tExp / Math.max(0.01, tau)) : 0;
    const p01 = (patientEffort * 0.5) + (sdraSeverity === 'severe' ? 3 : 0);
    const rsbi = vtL > 0 ? settings.rr / vtL : 0;

    return {
      compliance: mechanics.crs,
      resistance: mechanics.raw,
      p01, autoPeep, pPeak, pPlat, pMean, rsbi, isRecruiting: false,
    };
  }

  /** Update llamado por CronosEngine cada tick. */
  public update(dt: number): void {
    const pat = usePatientStore.getState();
    const { vitals, ventilator, bloodVolume } = pat;

    // ── Maniobras de pausa del operador (Fase 3) ─────────────────────────────
    // Duraciones: INSPIRATORY = 2 s, EXPIRATORY = 3 s (spec)
    const requestedManeuver = ventilator.pauseManeuver;
    if (requestedManeuver !== 'NONE') {
      // Primer tick de la maniobra: registrar y arrancar timer
      if (this.activatedManeuver === 'NONE') {
        this.activatedManeuver = requestedManeuver;
        this.maneuverElapsed = 0;
      }
      this.maneuverElapsed += dt;
      const duration = this.activatedManeuver === 'INSPIRATORY' ? 2 : 3;

      if (this.maneuverElapsed < duration) {
        // Durante la maniobra: no generar nuevas muestras, mantener curva congelada
        return;
      }

      // Maniobra completada: medir y publicar
      if (this.activatedManeuver === 'INSPIRATORY') {
        // Pplat medido = presión elástica pura (flujo=0): Vt/C + PEEP
        const crs  = Math.max(10, ventilator.vt / Math.max(1, vitals.pplat - ventilator.peep));
        const pplat = Math.round((ventilator.vt / crs + ventilator.peep) * 10) / 10;
        pat.updateVitals({ pplat });
      } else {
        // autoPEEP medido al final de la espiración con válvulas cerradas
        const rr = Math.max(4, ventilator.setRR);
        const T  = 60 / rr;
        const tI = Math.max(0.2, ventilator.iTime);
        const tE = Math.max(0.1, T - tI);
        const fl_s = Math.max(0.05, ventilator.flowRate / 60);
        const R  = Math.max(2, (vitals.ppico - vitals.pplat) / fl_s);
        const C  = Math.max(10, ventilator.vt / Math.max(1, vitals.pplat - ventilator.peep));
        const tau = Math.max(0.05, R * C / 1000);
        const autoPEEP = Math.round(Math.max(0, ventilator.vt * Math.exp(-tE / tau) / C) * 10) / 10;
        pat.applyVentOutputs({
          fio2Effective: ventilator.fio2Effective,
          pPeak: ventilator.pPeak,
          pPlateau: ventilator.pPlateau,
          pMean: ventilator.pMean,
          minuteVentilation: ventilator.minuteVentilation,
          autoPEEP,
        });
      }

      // Resetear maniobra
      this.activatedManeuver = 'NONE';
      this.maneuverElapsed   = 0;
      pat.triggerPauseManeuver('NONE');
      return;
    }
    // Sin maniobra activa — resetear estado interno
    if (this.activatedManeuver !== 'NONE') {
      this.activatedManeuver = 'NONE';
      this.maneuverElapsed   = 0;
    }
    const isArmConnected = pat.isVentilatorConnected;
    const path = usePathologyStore.getState();
    const pharm = usePharmacologyStore.getState();

    // ── 1. Sincronizar sv800Settings con store ───────────────────────────────
    const device = pat.respiratoryDevice;

    // Fase 4: usar computeEffectiveFiO2AndMechanics para o2Support extendido.
    // Si o2Support es INVASIVE_ARM o el campo no está inicializado, cae al
    // comportamiento legacy (isArmConnected / computeDeviceFiO2).
    const o2Support = ventilator.o2Support ?? 'INVASIVE_ARM';
    const useNewO2  = o2Support !== 'INVASIVE_ARM';

    let effectiveFiO2: number;
    let devicePeep:    number;
    let mechCFactor = 1.0;

    if (useNewO2) {
      const o2 = computeEffectiveFiO2AndMechanics(o2Support, ventilator, device);
      effectiveFiO2 = o2.fio2Eff;
      devicePeep    = o2.peepEff;
      mechCFactor   = o2.cFactor;
    } else {
      effectiveFiO2 = isArmConnected ? ventilator.fio2 : computeDeviceFiO2(device);
      devicePeep    = isArmConnected ? 0 : computeDevicePEEP(device);
    }

    this.sv800Settings.fio2 = effectiveFiO2;
    this.sv800Settings.peep = isArmConnected ? ventilator.peep : devicePeep;
    this.sv800Settings.vtTarget = ventilator.vt;
    this.sv800Settings.rrSet = ventilator.setRR;
    this.sv800Settings.pSupport = ventilator.pressureSupport;
    if (ventilator.ieRatio > 0) {
      const tCycle = 60 / Math.max(4, ventilator.setRR);
      this.sv800Settings.tInspSet = tCycle * ventilator.ieRatio / (1 + ventilator.ieRatio);
    }
    if (ventilator.pControl > 0) this.sv800Settings.pInspSet = ventilator.pControl;

    if (this.sv800Settings.mode !== 'PRVC' &&
        this.sv800Settings.mode !== 'AMV' &&
        this.sv800Settings.mode !== 'PCV') {
      this.sv800Settings.mode = mapLegacyMode(ventilator.mode);
    }

    // ── 2. Mecánica del paciente ─────────────────────────────────────────────
    // ARM conectado: la máquina toma el control — ignorar NMB/sedación para
    // el esfuerzo del paciente (VCV entrega el volumen sin importar Pmus).
    const mechanics = deriveMechanicsFromPathology({
      weightKg: vitals.weight,
      ardsActive: path.ards.isActive,
      ardsSeverity: path.ards.severity,
      sepsisActive: path.sepsis.isActive,
      sepsisSeverity: path.sepsis.severity,
      hypovolemicFraction: Math.max(0, (5000 - bloodVolume) / 5000),
      isSedated: isArmConnected ? false : pharm.systemicEffects.sedation > 0.5,
      nmbaFraction: isArmConnected ? 0  : pharm.systemicEffects.nmba,
    });

    const effCrs = Math.min(
      mechanics.crs * mechCFactor,
      50 * (path.modifiers.complianceMultiplier || 1) * mechCFactor,
    );
    const mechanicsEff = { ...mechanics, crs: effCrs };

    // ── 3. AMV ───────────────────────────────────────────────────────────────
    if (this.sv800Settings.mode === 'AMV') {
      const rec = this.sv800.computeOtisAMV(
        this.sv800Settings.amvMinuteVentTarget,
        this.sv800Settings.amvWeightKg,
        mechanicsEff,
      );
      this.sv800Settings.rrSet = Math.round(rec.fOpt);
      this.sv800Settings.vtTarget = Math.round(rec.vtOpt);
    }

    // ── 4. Avanzar motor físico ──────────────────────────────────────────────
    this.sv800.update(dt, this.sv800Settings, mechanicsEff);

    // ── 4b. Ring buffer analítico (Fase 3) — 50 muestras/s sim ──────────────
    this.computeAnalyticalSamples(dt, mechanicsEff.crs, mechanicsEff.raw, ventilator, isArmConnected);

    // ── 5. Publicar vitales ──────────────────────────────────────────────────
    const breath = this.sv800.getLastBreath();
    const rawMV  = breath.minVol ?? 0;

    if (isArmConnected) {
      // Ventilador controla: RR = set, volúmenes garantizados
      if (breath.breathId > 0) {
        pat.updateVitals({
          pplat:              Math.round(breath.pPlat * 10) / 10,
          ppico:              Math.round(breath.pPeak * 10) / 10,
          meanAirwayPressure: Math.round(breath.pMean * 10) / 10,
          deltaP:             Math.round(breath.drivingPressure * 10) / 10,
          mechanicalPower:    Math.round(breath.mechPowerJmin * 10) / 10,
          respiratoryRate:    Math.round(60 / Math.max(0.5, breath.tCycle)),
        });
      }
      this.updateGasExchange(dt, mechanicsEff.crs, rawMV);
    } else {
      // Sin ARM: NMB/sedación reducen drive respiratorio → apnea posible
      const nmba      = pharm.systemicEffects.nmba;
      const respDepr  = pharm.systemicEffects.respDepressionIdx;
      const driveFactor = Math.max(0, 1 - nmba * 0.92 - respDepr * 0.45);

      if (breath.breathId > 0) {
        const spontRR = Math.round(
          Math.round(60 / Math.max(0.5, breath.tCycle)) * driveFactor
        );
        pat.updateVitals({
          pplat:              Math.round(breath.pPlat  * 10) / 10,
          ppico:              Math.round(breath.pPeak  * 10) / 10,
          meanAirwayPressure: Math.round(breath.pMean  * 10) / 10,
          deltaP:             Math.round(breath.drivingPressure * 10) / 10,
          mechanicalPower:    Math.round(breath.mechPowerJmin   * 10) / 10,
          respiratoryRate:    spontRR,
        });
      }
      this.updateGasExchange(dt, mechanicsEff.crs, rawMV * driveFactor);
    }

    // ── 6. Publicar outputs al ventilador del store (Fase 3) ─────────────────
    const rr = Math.max(4, ventilator.setRR);
    pat.applyVentOutputs({
      fio2Effective: effectiveFiO2,
      pPeak:             breath.breathId > 0 ? Math.round(breath.pPeak * 10) / 10 : 0,
      pPlateau:          breath.breathId > 0 ? Math.round(breath.pPlat * 10) / 10 : 0,
      pMean:             breath.breathId > 0 ? Math.round(breath.pMean * 10) / 10 : 0,
      autoPEEP:          breath.breathId > 0 ? Math.round((breath.autoPeep ?? 0) * 10) / 10 : 0,
      minuteVentilation: breath.breathId > 0 ? Math.round(rawMV * 10) / 10
                         : Math.round(ventilator.vt * rr / 1000 * 10) / 10,
    });
  }

  // ─── RING BUFFER ANALÍTICO ────────────────────────────────────────────────
  //
  //  Genera muestras de P/Flow/V usando la ecuación de movimiento (Otis/Rohrer).
  //  Fórmulas según especificación (Fase 3):
  //
  //  VCV (flujo cuadrado):
  //    Flow_insp = Vt/Ti    (constante)
  //    V(t) = Flow × t      (rampa)
  //    P(t) = V(t)/C + R×Flow + PEEP
  //
  //  PCV (presión constante):
  //    τ = R × C / 1000
  //    Flow(t) = (Pinsp/R) × exp(-t/τ)
  //    V(t) = Pinsp × C × (1 - exp(-t/τ))
  //
  private computeAnalyticalSamples(
    dt: number,
    crs: number,
    raw: number,
    ventilator: { mode: string; setRR: number; vt: number; peep: number; iTime: number;
                  pControl: number; pressureSupport: number; flowRate: number },
    _isArmConnected: boolean,
  ): void {
    const rr = Math.max(4, ventilator.setRR);
    const T  = 60 / rr;
    const tI = Math.max(0.2, ventilator.iTime > 0.1 ? ventilator.iTime : this.sv800Settings.tInspSet);
    const tiFrac = Math.max(0.1, Math.min(0.85, tI / T));
    const peep = this.sv800Settings.peep;
    const vtMl = ventilator.vt;
    const pInsp = this.sv800Settings.pInspSet;
    const tau = Math.max(0.01, raw * crs / 1000);

    const numSamples = Math.max(1, Math.round(dt * this.SAMPLE_RATE));
    const sampleDt   = dt / numSamples;

    for (let i = 0; i < numSamples; i++) {
      const ph = this.cyclePhase;
      let pressure: number, flow: number, volume: number;

      if (ph < tiFrac) {
        const t = (ph / tiFrac) * tI;

        if (ventilator.mode === 'VC-AC' || ventilator.mode === 'SIMV') {
          const flowLPS = (vtMl / 1000) / Math.max(0.01, tI);
          flow     = flowLPS * 60;
          volume   = flowLPS * t * 1000;
          pressure = volume / crs + flowLPS * raw + peep;
        } else if (ventilator.mode === 'PC-AC') {
          const flowLPS = (pInsp / Math.max(0.5, raw)) * Math.exp(-t / tau);
          flow     = flowLPS * 60;
          volume   = pInsp * crs * (1 - Math.exp(-t / tau));
          pressure = peep + pInsp;
        } else {
          // PSV / CPAP — sinusoide
          const frac = ph / tiFrac;
          const ps   = Math.max(0, ventilator.pressureSupport);
          const flowLPS = (Math.PI * vtMl / 1000 / Math.max(0.01, tI)) * Math.sin(Math.PI * frac);
          flow     = flowLPS * 60;
          volume   = vtMl * (1 - Math.cos(Math.PI * frac)) / 2;
          pressure = peep + ps * Math.sin(Math.PI * frac);
        }
      } else {
        const tExp = (ph - tiFrac) * T;
        const vtAch = ventilator.mode === 'PC-AC'
          ? pInsp * crs * (1 - Math.exp(-tI / tau))
          : vtMl;
        const flowLPS = -(vtAch / 1000 / tau) * Math.exp(-tExp / tau);
        volume   = Math.max(0, vtAch * Math.exp(-tExp / tau));
        pressure = Math.max(peep - 0.5, volume / crs + flowLPS * raw + peep);
        flow     = flowLPS * 60;
      }

      this.absoluteTime += sampleDt;
      if (this.ringBuffer.length >= this.RING_CAPACITY) this.ringBuffer.shift();
      this.ringBuffer.push({
        t: this.absoluteTime,
        pressure: Math.round(pressure * 10) / 10,
        flow:     Math.round(flow * 10) / 10,
        volume:   Math.round(volume * 10) / 10,
      });

      this.cyclePhase = (this.cyclePhase + sampleDt / T) % 1;
    }
  }

  // ─── INTERCAMBIO GASEOSO ─────────────────────────────────────────────────
  //
  //  PaO₂ — modelo de shunt de Riley:
  //
  //     CaO₂ = (1 − Qs/Qt)·CcO₂ + (Qs/Qt)·CvO₂
  //     PAO₂ = FiO₂·(PB − PH₂O) − PaCO₂/RQ
  //     PaO₂ se obtiene invirtiendo la curva Severinghaus de CcO₂.
  //
  //  PaCO₂ — estado estable:
  //
  //     PaCO₂ = (VCO₂ · 0.863) / V_E_alveolar
  //     donde V_E_alv = (V_T − V_D) · f / 1000   (L/min)
  //
  private updateGasExchange(dt: number, crs: number, mvLmin: number): void {
    const pat = usePatientStore.getState();
    const v = pat.vitals;
    const path = usePathologyStore.getState();
    const shunt = path.modifiers.lungShuntFraction;
    const fio2 = pat.isVentilatorConnected
      ? pat.ventilator.fio2
      : computeDeviceFiO2(pat.respiratoryDevice);

    // PAO₂ (alveolar) — gas alveolar
    const pao2Alv = fio2 * (PB - PH2O) - v.paCO2 / RQ;

    // CcO₂ (end-capilar) saturación ≈ 100% si PAO₂ > 100
    const ccO2 = this.hbContent(Math.min(100, pao2Alv), HB_NORMAL);
    // CvO₂ (mixed venous) estimado con SvO₂ ≈ 70% basal
    const pvO2 = 40;
    const cvO2 = this.hbContent(pvO2, HB_NORMAL) * 0.70 + 0.003 * pvO2;
    // CaO₂ por mezcla
    const caO2 = (1 - shunt) * ccO2 + shunt * cvO2;
    // Invertir a PaO₂: asumimos saturación ≈ caO₂ / (1.34·Hb)
    const sa = Math.min(1.0, caO2 / (1.34 * HB_NORMAL));
    const paO2 = this.severinghausInv(sa);
    const spo2 = Math.round(sa * 100);

    // PaCO₂ — demanda vs ventilación alveolar
    // Dead space fraction Vd/Vt crece con SDRA (hasta 0.60 en severo)
    const vdvt = path.ards.isActive ? 0.30 + path.ards.severity * 0.30 : 0.30;
    const mvAlv = Math.max(0.5, mvLmin * (1 - vdvt));
    const vco2 = VCO2_BASE_MLMIN * (1 + 0.3 * Math.max(0, (v.temperature - 37)));
    const paCO2Target = (vco2 * 0.863) / mvAlv;

    // Suavizado exponencial (τ ≈ 30 s)
    const tauGas = 30;
    const newPaO2 = v.paO2 + (paO2 - v.paO2) * (dt / tauGas);
    const newPaCO2 = v.paCO2 + (paCO2Target - v.paCO2) * (dt / tauGas);
    const newSpO2 = v.spo2 + (spo2 - v.spo2) * (dt / 5);

    pat.updateVitals({
      paO2: Math.round(Math.max(35, Math.min(500, newPaO2))),
      paCO2: Math.round(Math.max(15, Math.min(120, newPaCO2))),
      spo2: Math.round(Math.max(60, Math.min(100, newSpO2))),
    });
  }

  /** Contenido arterial de O₂ (mL O₂ / dL sangre) vía Severinghaus. */
  private hbContent(po2: number, hb: number): number {
    const s = this.severinghaus(po2);
    return 1.34 * hb * s + 0.003 * po2;
  }

  /** Severinghaus 1979: SaO₂ = 1 / (1 + exp(−(0.385·ln(PaO₂) − 3.32))) */
  private severinghaus(po2: number): number {
    const x = Math.max(1, po2);
    const k = 23400;
    const y = k / (Math.pow(x, 3) + 150 * x);
    return 1 / (1 + y);
  }

  /** Inversa aproximada — newton con cota. */
  private severinghausInv(sa: number): number {
    let lo = 20, hi = 500;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const s = this.severinghaus(mid);
      if (s < sa) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
}
