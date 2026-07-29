// src/core/RespiratoryEngine.ts
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  RespiratoryEngine â€” wrapper sobre VentilatorSM100Engine
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  Esta clase mantiene la interfaz pÃºblica original (calculatePhysics,
//  update, LungMechanics, VentilatorSettings) que consumen:
//    - InstructorPanel.tsx  (respiratoryMechanics useMemo)
//    - VentilatorSM100.tsx  (display digital)
//    - CardiovascularEngine (lee vitals.pplat, meanAirwayPressure)
//
//  Internamente, delega TODA la fÃ­sica al SM100Engine (ODE 1 kHz, ATRC,
//  PRVC, AMV, triggering). Los vitales del paciente (pPlat, Pmean, Peak,
//  PaOâ‚‚, PaCOâ‚‚, deltaP, mechanicalPower) se actualizan a partir de las
//  mÃ©tricas por respiraciÃ³n del motor + modelo de intercambio gaseoso.
//
//  Intercambio gaseoso:
//    PaOâ‚‚  â€” modelo shunt de Riley (Qs/Qt, lungShuntFraction) con FiOâ‚‚
//    PaCOâ‚‚ â€” V_E alveolar vs producciÃ³n COâ‚‚ (VCOâ‚‚)
//    SpOâ‚‚  â€” curva de Severinghaus (disociaciÃ³n Hb)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import {
  usePatientStore,
  computeDeviceFiO2,
  computeDevicePEEP,
  computeEffectiveFiO2AndMechanics,
  type RespiratoryDevice,
} from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useTimeStore } from '../store/useTimeStore';
import {
  VentilatorSM100Engine,
  deriveMechanicsFromPathology,
  type SM100Settings,
  type VentMode,
} from './VentilatorSM100Engine';

import type { VentilatorMode } from '../store/usePatientStore';

// Type alias exported for components/ (avoids "SM100" in component source)
export type VentSettings = SM100Settings;
export type { VentMode };

// â”€â”€â”€ Ring buffer de ondas (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface WaveformSample {
  t: number;        // tiempo de simulaciÃ³n (s)
  pressure: number; // cmHâ‚‚O
  flow: number;     // L/min (+inspiraciÃ³n / -espiraciÃ³n)
  volume: number;   // mL
}

// â”€â”€â”€ Interfaces preservadas para no romper consumidores existentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Mapeo de modo SM100 desde el store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  El store actualmente permite solo 'VC-AC' | 'PS'. Para PRVC/AMV la UI del
//  componente VentilatorSM100 setea `ventilator.mode` junto con un flag
//  interno del propio engine (SM100Settings.mode). Mientras la UI no migre,
//  exponemos este mapeo como funciÃ³n pura.
//
function mapLegacyMode(m: VentilatorMode): VentMode {
  switch (m) {
    case 'PC-AC': return 'PCV';
    case 'PSV': return 'PSV';
    case 'CPAP': return 'PSV';
    case 'SIMV': return 'VCV';
    default: return 'VCV';
  }
}

// â”€â”€â”€ CONSTANTES DE INTERCAMBIO GASEOSO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PB = 760;                // mmHg (presiÃ³n baromÃ©trica nivel del mar)
const PH2O = 47;               // mmHg (vapor de agua)
const RQ = 0.8;                // cociente respiratorio
const VCO2_BASE_MLMIN = 200;   // mL/min (producciÃ³n COâ‚‚ basal 70 kg)
const HB_NORMAL = 14;          // g/dL

export class RespiratoryEngine {
  private static instance: RespiratoryEngine | null = null;
  private SM100 = VentilatorSM100Engine.getInstance();

  // Settings "ampliados" SM100 â€” se configuran vÃ­a setSM100Mode() o UI.
  private SM100Settings: SM100Settings = {
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
    flowPatternVCV: 'square',
  };

  // â”€â”€ Ring buffer (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private ringBuffer: WaveformSample[] = [];
  private readonly RING_CAPACITY = 500;
  private readonly SAMPLE_RATE = 50;   // muestras por segundo de simulaciÃ³n
  private cyclePhase = 0;              // fracciÃ³n 0â€“1 dentro del ciclo respiratorio
  private absoluteTime = 0;           // tiempo acumulado de simulaciÃ³n (s)

  // â”€â”€ Maniobras de pausa (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private maneuverElapsed = 0;        // s transcurridos desde inicio de maniobra
  private activatedManeuver: 'NONE' | 'INSPIRATORY' | 'EXPIRATORY' = 'NONE';

  // â”€â”€ ARDS derivado Berlin 2012 (Fase 2 v0.19) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // HistÃ©resis: activa con P/F â‰¤ 300 + PEEP â‰¥ 5; desactiva al superar P/F > 320.
  // Ref: ARDS Definition Task Force (Ferguson) JAMA 2012.
  private ardsHysteresisActive = false;

  private constructor() { }
  public static getInstance(): RespiratoryEngine {
    if (!RespiratoryEngine.instance) RespiratoryEngine.instance = new RespiratoryEngine();
    return RespiratoryEngine.instance;
  }

  public getWaveform(): ReadonlyArray<WaveformSample> { return this.ringBuffer; }

  public reset(): void {
    this.SM100.reset(this.SM100Settings.peep);
    this.ringBuffer = [];
    this.cyclePhase = 0;
    this.absoluteTime = 0;
  }

  /** Patch ventilator settings (activar modos avanzados). */
  public setSM100(partial: Partial<SM100Settings>): void {
    this.SM100Settings = { ...this.SM100Settings, ...partial };
  }
  public getSM100Settings(): SM100Settings { return this.SM100Settings; }
  public getSM100Engine(): VentilatorSM100Engine { return this.SM100; }

  // â”€â”€ Aliases sin "SM100" para uso en src/components/ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  public patchVent(partial: Partial<SM100Settings>): void { this.setSM100(partial); }
  public getVentSettings(): SM100Settings { return this.SM100Settings; }
  public getVentEngine(): VentilatorSM100Engine { return this.SM100; }

  /** API preservada: mÃ©todo estÃ¡tico usado por InstructorPanel para "que pasarÃ­a si...". */
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

    // CÃ¡lculo estÃ¡tico rÃ¡pido (sin simular ciclos, para previsualizaciÃ³n UI):
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

    // â”€â”€ Maniobras de pausa del operador (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Pplat medido = presiÃ³n elÃ¡stica pura (flujo=0): Vt/C + PEEP
        const crs = Math.max(10, ventilator.vt / Math.max(1, vitals.pplat - ventilator.peep));
        const pplat = Math.round((ventilator.vt / crs + ventilator.peep) * 10) / 10;
        const cstat = Math.round(ventilator.vt / Math.max(0.1, pplat - ventilator.peep) * 10) / 10;
        pat.updateVitals({ pplat });
        // Publicar Cstat al monitor SM100
        pat.applyVentOutputs({
          fio2Effective: ventilator.fio2Effective,
          pPeak: ventilator.pPeak,
          pPlateau: pplat,
          pMean: ventilator.pMean,
          minuteVentilation: ventilator.minuteVentilation,
          autoPEEP: ventilator.autoPEEP,
          measuredCstat: cstat,
        });
      } else {
        // autoPEEP medido al final de la espiraciÃ³n con vÃ¡lvulas cerradas
        const rr = Math.max(4, ventilator.setRR);
        const T = 60 / rr;
        const tI = Math.max(0.2, ventilator.iTime);
        const tE = Math.max(0.1, T - tI);
        const fl_s = Math.max(0.05, ventilator.flowRate / 60);
        const R = Math.max(2, (vitals.ppico - vitals.pplat) / fl_s);
        const C = Math.max(10, ventilator.vt / Math.max(1, vitals.pplat - ventilator.peep));
        const tau = Math.max(0.05, R * C / 1000);
        const autoPEEP = Math.round(Math.max(0, ventilator.vt * Math.exp(-tE / tau) / C) * 10) / 10;
        pat.applyVentOutputs({
          fio2Effective: ventilator.fio2Effective,
          pPeak: ventilator.pPeak,
          pPlateau: ventilator.pPlateau,
          pMean: ventilator.pMean,
          minuteVentilation: ventilator.minuteVentilation,
          autoPEEP,
          measuredAutoPeepInspPause: autoPEEP,
        });
      }

      // Resetear maniobra
      this.activatedManeuver = 'NONE';
      this.maneuverElapsed = 0;
      pat.triggerPauseManeuver('NONE');
      return;
    }
    // Sin maniobra activa â€” resetear estado interno
    if (this.activatedManeuver !== 'NONE') {
      this.activatedManeuver = 'NONE';
      this.maneuverElapsed = 0;
    }
    const isArmConnected = pat.isVentilatorConnected;
    const path = usePathologyStore.getState();
    const pharm = usePharmacologyStore.getState();

    // â”€â”€ 1. Sincronizar SM100Settings con store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const device = pat.respiratoryDevice;

    // Fase 4: usar computeEffectiveFiO2AndMechanics para o2Support extendido.
    // Si o2Support es INVASIVE_ARM o el campo no estÃ¡ inicializado, cae al
    // comportamiento legacy (isArmConnected / computeDeviceFiO2).
    const o2Support = ventilator.o2Support ?? 'INVASIVE_ARM';
    const useNewO2 = o2Support !== 'INVASIVE_ARM';

    let effectiveFiO2: number;
    let devicePeep: number;
    let mechCFactor = 1.0;

    if (useNewO2) {
      const o2 = computeEffectiveFiO2AndMechanics(o2Support, ventilator, device);
      effectiveFiO2 = o2.fio2Eff;
      devicePeep = o2.peepEff;
      mechCFactor = o2.cFactor;
    } else {
      effectiveFiO2 = isArmConnected ? ventilator.fio2 : computeDeviceFiO2(device);
      devicePeep = isArmConnected ? 0 : computeDevicePEEP(device);
    }

    this.SM100Settings.fio2 = effectiveFiO2;
    this.SM100Settings.peep = isArmConnected ? ventilator.peep : devicePeep;
    this.SM100Settings.vtTarget = ventilator.vt;
    this.SM100Settings.rrSet = ventilator.setRR;
    this.SM100Settings.pSupport = ventilator.pressureSupport;
    if (ventilator.ieRatio > 0) {
      const tCycle = 60 / Math.max(4, ventilator.setRR);
      this.SM100Settings.tInspSet = tCycle * ventilator.ieRatio / (1 + ventilator.ieRatio);
    }
    if (ventilator.pControl > 0) this.SM100Settings.pInspSet = ventilator.pControl;

    if (this.SM100Settings.mode !== 'PRVC' &&
      this.SM100Settings.mode !== 'AMV' &&
      this.SM100Settings.mode !== 'PCV') {
      this.SM100Settings.mode = mapLegacyMode(ventilator.mode);
    }

    // â”€â”€ 2. MecÃ¡nica del paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ARM conectado: la mÃ¡quina toma el control â€” ignorar NMB/sedaciÃ³n para
    // el esfuerzo del paciente (VCV entrega el volumen sin importar Pmus).
    const mechanics = deriveMechanicsFromPathology({
      weightKg: vitals.weight,
      ardsActive: path.ards.isActive,
      ardsSeverity: path.ards.severity,
      sepsisActive: path.sepsis.isActive,
      sepsisSeverity: path.sepsis.severity,
      hypovolemicFraction: Math.max(0, (5000 - bloodVolume) / 5000),
      isSedated: isArmConnected ? false : pharm.systemicEffects.sedation > 0.5,
      nmbaFraction: isArmConnected ? 0 : pharm.systemicEffects.nmba,
    });

    const effCrs = Math.min(
      mechanics.crs * mechCFactor,
      50 * (path.modifiers.complianceMultiplier || 1) * mechCFactor,
    );
    const mechanicsEff = { ...mechanics, crs: effCrs };

    // â”€â”€ 3. AMV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this.SM100Settings.mode === 'AMV') {
      const rec = this.SM100.computeOtisAMV(
        this.SM100Settings.amvMinuteVentTarget,
        this.SM100Settings.amvWeightKg,
        mechanicsEff,
      );
      this.SM100Settings.rrSet = Math.round(rec.fOpt);
      this.SM100Settings.vtTarget = Math.round(rec.vtOpt);
    }

    // â”€â”€ 4. Avanzar motor fÃ­sico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.SM100.update(dt, this.SM100Settings, mechanicsEff);

    // â”€â”€ 4b. Ring buffer analÃ­tico (Fase 3) â€” 50 muestras/s sim â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.computeAnalyticalSamples(dt, mechanicsEff.crs, mechanicsEff.raw, ventilator, isArmConnected);

    // â”€â”€ 5. Publicar vitales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const breath = this.SM100.getLastBreath();
    const rawMV = breath.minVol ?? 0;

    if (isArmConnected) {
      // Ventilador controla: RR = set, volÃºmenes garantizados
      if (breath.breathId > 0) {
        pat.updateVitals({
          pplat: Math.round(breath.pPlat * 10) / 10,
          ppico: Math.round(breath.pPeak * 10) / 10,
          meanAirwayPressure: Math.round(breath.pMean * 10) / 10,
          deltaP: Math.round(breath.drivingPressure * 10) / 10,
          mechanicalPower: Math.round(breath.mechPowerJmin * 10) / 10,
          respiratoryRate: Math.round(60 / Math.max(0.5, breath.tCycle)),
        });
      }
      this.updateGasExchange(dt, mechanicsEff.crs, rawMV);
    } else {
      // Sin ARM: NMB/sedaciÃ³n reducen drive respiratorio â†’ apnea posible
      const nmba = pharm.systemicEffects.nmba;
      const respDepr = pharm.systemicEffects.respDepressionIdx;
      const driveFactor = Math.max(0, 1 - nmba * 0.92 - respDepr * 0.45);

      if (breath.breathId > 0) {
        const spontRR = Math.round(
          Math.round(60 / Math.max(0.5, breath.tCycle)) * driveFactor
        );
        pat.updateVitals({
          pplat: Math.round(breath.pPlat * 10) / 10,
          ppico: Math.round(breath.pPeak * 10) / 10,
          meanAirwayPressure: Math.round(breath.pMean * 10) / 10,
          deltaP: Math.round(breath.drivingPressure * 10) / 10,
          mechanicalPower: Math.round(breath.mechPowerJmin * 10) / 10,
          respiratoryRate: spontRR,
        });
      }
      this.updateGasExchange(dt, mechanicsEff.crs, rawMV * driveFactor);
    }

    // â”€â”€ 6. Publicar outputs al ventilador del store (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const rr = Math.max(4, ventilator.setRR);
    pat.applyVentOutputs({
      fio2Effective: effectiveFiO2,
      pPeak: breath.breathId > 0 ? Math.round(breath.pPeak * 10) / 10 : 0,
      pPlateau: breath.breathId > 0 ? Math.round(breath.pPlat * 10) / 10 : 0,
      pMean: breath.breathId > 0 ? Math.round(breath.pMean * 10) / 10 : 0,
      autoPEEP: breath.breathId > 0 ? Math.round((breath.autoPeep ?? 0) * 10) / 10 : 0,
      minuteVentilation: breath.breathId > 0 ? Math.round(rawMV * 10) / 10
        : Math.round(ventilator.vt * rr / 1000 * 10) / 10,
    });

    // â”€â”€ 7. DiagnÃ³stico SDRA Berlin 2012 / Global 2023 (1.B) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.diagnoseBerlinARDS(effectiveFiO2, ventilator.peep, device);
  }

  // â”€â”€â”€ DIAGNÃ“STICO BERLIN/GLOBAL ARDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Berlin 2012 (Ferguson NEJM 2012; Ranieri JAMA 2012):
  //    ARM + PEEP â‰¥ 5 â†’ P/F: mild 200â€“300, moderate 100â€“200, severe â‰¤ 100
  //  Global 2023 (Matthay AJRCCM 2023):
  //    HFNO â‰¥ 30 L/min tambiÃ©n vÃ¡lido como soporte mÃ­nimo
  //    S/F (SpOâ‚‚/FiOâ‚‚) si SpOâ‚‚ â‰¤ 97%:  mild â‰¤315, moderate â‰¤235, severe â‰¤148
  //
  private diagnoseBerlinARDS(
    effectiveFiO2: number,
    peep: number,
    device: RespiratoryDevice,
  ): void {
    const path = usePathologyStore.getState();
    const ards = path.ards;
    const pat2 = usePatientStore.getState();
    const v    = pat2.vitals;

    // Requisito 1: contexto patolÃ³gico declarado
    if (!ards.hasLungInjury || !ards.bilateralOpacities) {
      this.ardsHysteresisActive = false;
      path.updateArdsFromEngine('none', 0, 0);
      pat2.updateVitals({ pfRatio: 0, ardsActive: false, ardsSeverityLevel: 'NONE' });
      return;
    }

    // Requisito 2: ventana temporal < 7 dÃ­as
    if (ards.timeSinceInsultS >= 7 * 24 * 3600) {
      this.ardsHysteresisActive = false;
      path.updateArdsFromEngine('none', 0, 0);
      pat2.updateVitals({ pfRatio: 0, ardsActive: false, ardsSeverityLevel: 'NONE' });
      return;
    }

    // Soporte mÃ­nimo aceptado
    const hasArmSupport  = pat2.isVentilatorConnected && peep >= 5;
    const hasHFNCSupport = device.support === 'hfnc' && device.hfncFlow >= 30;
    const hasMinSupport  = hasArmSupport || hasHFNCSupport;
    const allowSFRatio   = v.spo2 <= 97;  // Global 2023

    if (!hasMinSupport && !allowSFRatio) {
      this.ardsHysteresisActive = false;
      path.updateArdsFromEngine('none', 0, 0);
      pat2.updateVitals({ pfRatio: 0, ardsActive: false, ardsSeverityLevel: 'NONE' });
      return;
    }

    // P/F y S/F
    const fio2Safe = Math.max(0.21, effectiveFiO2);
    const pfRatio  = Math.round(v.paO2 / fio2Safe);
    const sfRatio  = Math.round(v.spo2 / fio2Safe);

    // DiagnÃ³stico con histÃ©resis
    type Dx = 'none' | 'mild' | 'moderate' | 'severe';
    let diagnosis: Dx = 'none';

    if (hasMinSupport) {
      if (!this.ardsHysteresisActive) {
        if (pfRatio <= 300) this.ardsHysteresisActive = true;
      } else {
        if (pfRatio > 320)  this.ardsHysteresisActive = false;
      }
      if (this.ardsHysteresisActive) {
        if      (pfRatio <= 100) diagnosis = 'severe';
        else if (pfRatio <= 200) diagnosis = 'moderate';
        else                     diagnosis = 'mild';
      }
    } else if (allowSFRatio) {
      if (!this.ardsHysteresisActive) {
        if (sfRatio <= 315) this.ardsHysteresisActive = true;
      } else {
        if (sfRatio > 335)  this.ardsHysteresisActive = false;
      }
      if (this.ardsHysteresisActive) {
        if      (sfRatio <= 148) diagnosis = 'severe';
        else if (sfRatio <= 235) diagnosis = 'moderate';
        else                     diagnosis = 'mild';
      }
    }

    const active = diagnosis !== 'none';
    path.updateArdsFromEngine(diagnosis, pfRatio, sfRatio);
    pat2.updateVitals({
      pfRatio,
      ardsActive:       active,
      ardsSeverityLevel: active
        ? (diagnosis.toUpperCase() as 'MILD' | 'MODERATE' | 'SEVERE')
        : 'NONE',
    });
  }

  // â”€â”€â”€ RING BUFFER ANALÃTICO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Genera muestras de P/Flow/V usando la ecuaciÃ³n de movimiento (Otis/Rohrer).
  //  FÃ³rmulas segÃºn especificaciÃ³n (Fase 3):
  //
  //  VCV (flujo cuadrado):
  //    Flow_insp = Vt/Ti    (constante)
  //    V(t) = Flow Ã— t      (rampa)
  //    P(t) = V(t)/C + RÃ—Flow + PEEP
  //
  //  PCV (presiÃ³n constante):
  //    Ï„ = R Ã— C / 1000
  //    Flow(t) = (Pinsp/R) Ã— exp(-t/Ï„)
  //    V(t) = Pinsp Ã— C Ã— (1 - exp(-t/Ï„))
  //
  private computeAnalyticalSamples(
    dt: number,
    crs: number,
    raw: number,
    ventilator: {
      mode: string; setRR: number; vt: number; peep: number; iTime: number;
      pControl: number; pressureSupport: number; flowRate: number
    },
    _isArmConnected: boolean,
  ): void {
    const rr = Math.max(4, ventilator.setRR);
    const T = 60 / rr;
    const tI = Math.max(0.2, ventilator.iTime > 0.1 ? ventilator.iTime : this.SM100Settings.tInspSet);
    const tiFrac = Math.max(0.1, Math.min(0.85, tI / T));
    const peep = this.SM100Settings.peep;
    const vtMl = ventilator.vt;
    const pInsp = this.SM100Settings.pInspSet;
    const tau = Math.max(0.01, raw * crs / 1000);

    const numSamples = Math.max(1, Math.round(dt * this.SAMPLE_RATE));
    const sampleDt = dt / numSamples;

    for (let i = 0; i < numSamples; i++) {
      const ph = this.cyclePhase;
      let pressure: number, flow: number, volume: number;

      if (ph < tiFrac) {
        const t = (ph / tiFrac) * tI;

        if (ventilator.mode === 'VC-AC' || ventilator.mode === 'SIMV') {
          const flowLPS = (vtMl / 1000) / Math.max(0.01, tI);
          flow = flowLPS * 60;
          volume = flowLPS * t * 1000;
          pressure = volume / crs + flowLPS * raw + peep;
        } else if (ventilator.mode === 'PC-AC') {
          const flowLPS = (pInsp / Math.max(0.5, raw)) * Math.exp(-t / tau);
          flow = flowLPS * 60;
          volume = pInsp * crs * (1 - Math.exp(-t / tau));
          pressure = peep + pInsp;
        } else {
          // PSV / CPAP â€” sinusoide
          const frac = ph / tiFrac;
          const ps = Math.max(0, ventilator.pressureSupport);
          const flowLPS = (Math.PI * vtMl / 1000 / Math.max(0.01, tI)) * Math.sin(Math.PI * frac);
          flow = flowLPS * 60;
          volume = vtMl * (1 - Math.cos(Math.PI * frac)) / 2;
          pressure = peep + ps * Math.sin(Math.PI * frac);
        }
      } else {
        const tExp = (ph - tiFrac) * T;
        const vtAch = ventilator.mode === 'PC-AC'
          ? pInsp * crs * (1 - Math.exp(-tI / tau))
          : vtMl;
        const flowLPS = -(vtAch / 1000 / tau) * Math.exp(-tExp / tau);
        volume = Math.max(0, vtAch * Math.exp(-tExp / tau));
        pressure = Math.max(peep - 0.5, volume / crs + flowLPS * raw + peep);
        flow = flowLPS * 60;
      }

      this.absoluteTime += sampleDt;
      if (this.ringBuffer.length >= this.RING_CAPACITY) this.ringBuffer.shift();
      this.ringBuffer.push({
        t: this.absoluteTime,
        pressure: Math.round(pressure * 10) / 10,
        flow: Math.round(flow * 10) / 10,
        volume: Math.round(volume * 10) / 10,
      });

      this.cyclePhase = (this.cyclePhase + sampleDt / T) % 1;
    }
  }

  // â”€â”€â”€ INTERCAMBIO GASEOSO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  PaOâ‚‚ â€” modelo de shunt de Riley:
  //
  //     CaOâ‚‚ = (1 âˆ’ Qs/Qt)Â·CcOâ‚‚ + (Qs/Qt)Â·CvOâ‚‚
  //     PAOâ‚‚ = FiOâ‚‚Â·(PB âˆ’ PHâ‚‚O) âˆ’ PaCOâ‚‚/RQ
  //     PaOâ‚‚ se obtiene invirtiendo la curva Severinghaus de CcOâ‚‚.
  //
  //  PaCOâ‚‚ â€” estado estable:
  //
  //     PaCOâ‚‚ = (VCOâ‚‚ Â· 0.863) / V_E_alveolar
  //     donde V_E_alv = (V_T âˆ’ V_D) Â· f / 1000   (L/min)
  //
  private updateGasExchange(dt: number, crs: number, mvLmin: number): void {
    const pat = usePatientStore.getState();
    const v = pat.vitals;
    const path = usePathologyStore.getState();
    const fio2 = pat.isVentilatorConnected
      ? pat.ventilator.fio2
      : computeDeviceFiO2(pat.respiratoryDevice);

    // â”€â”€ Shunt efectivo con reclutamiento por PEEP (3.C) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  Modelo de Hickling (Crit Care 2002): reclutamiento sigmoideo alrededor
    //  del PEEP Ã³ptimo (que depende de la severidad del SDRA).
    //  peepOpt: mild ~10, moderate ~14, severe ~18 cmHâ‚‚O.
    //  Reclutamiento mÃ¡ximo 45% cuando peep â‰ˆ peepOpt.
    //  SobredistensiÃ³n: PEEP > peepOpt + 6 â†’ penalizaciÃ³n de shunt.
    const baseShunt = path.modifiers.lungShuntFraction;
    let shunt = baseShunt;
    if (path.ards.hasLungInjury && path.ards.lungInjury > 0 && pat.isVentilatorConnected) {
      const peepEff   = pat.ventilator.peep;
      const peepOpt   = 10 + path.ards.lungInjury * 8;       // 10â€“18 cmHâ‚‚O
      const peepDev   = Math.abs(peepEff - peepOpt);
      const recFactor = 1.0 - Math.min(0.45, Math.exp(-peepDev / 4) * 0.45);
      shunt = Math.max(0.05, baseShunt * recFactor);
      // SobredistensiÃ³n (PEEP > peepOpt + 6): â†‘ zona 1 â†’ â†‘ espacio muerto efectivo
      if (peepEff > peepOpt + 6) {
        shunt += (peepEff - peepOpt - 6) * 0.015;
      }
      shunt = Math.max(0.05, Math.min(0.75, shunt));
    }

    // PAOâ‚‚ (alveolar) â€” gas alveolar
    const pao2Alv = fio2 * (PB - PH2O) - v.paCO2 / RQ;

    // CcOâ‚‚ (end-capilar) saturaciÃ³n â‰ˆ 100% si PAOâ‚‚ > 100
    const ccO2 = this.hbContent(Math.min(100, pao2Alv), HB_NORMAL);
    // CvOâ‚‚ (mixed venous) estimado con SvOâ‚‚ â‰ˆ 70% basal
    const pvO2 = 40;
    const cvO2 = this.hbContent(pvO2, HB_NORMAL) * 0.70 + 0.003 * pvO2;
    // CaOâ‚‚ por mezcla (usa shunt efectivo post-PEEP)
    const caO2 = (1 - shunt) * ccO2 + shunt * cvO2;
    // Invertir a PaOâ‚‚: asumimos saturaciÃ³n â‰ˆ caOâ‚‚ / (1.34Â·Hb)
    const sa = Math.min(1.0, caO2 / (1.34 * HB_NORMAL));
    const paO2 = this.severinghausInv(sa);
    const spo2 = Math.round(sa * 100);

    // PaCOâ‚‚ â€” demanda vs ventilaciÃ³n alveolar
    // Dead space fraction Vd/Vt crece con SDRA (hasta 0.60 en severo) â€” usar nueva arch.
    const ardsInj = path.ards.hasLungInjury ? path.ards.lungInjury : 0;
    const vdvt    = ardsInj > 0 ? 0.30 + ardsInj * 0.30 : 0.30;
    const mvAlv = Math.max(0.5, mvLmin * (1 - vdvt));
    const vco2 = VCO2_BASE_MLMIN * (1 + 0.3 * Math.max(0, (v.temperature - 37)));
    const paCO2Target = (vco2 * 0.863) / mvAlv;

    // Suavizado exponencial (Ï„ â‰ˆ 30 s para Oâ‚‚, 45 s para COâ‚‚ â€” refleja recambio
    // de espacio muerto mÃ¡s lento para COâ‚‚)
    const tauO2 = 30;
    const tauCO2 = 45;
    const newPaO2  = v.paO2  + (paO2        - v.paO2)  * (dt / tauO2);
    const newPaCO2 = v.paCO2 + (paCO2Target - v.paCO2) * (dt / tauCO2);
    const newSpO2  = v.spo2  + (spo2        - v.spo2)  * (dt / 5);

    // EtCOâ‚‚ reactivo ciclo a ciclo (2.B)
    // Hardman BJA 1999: EtCOâ‚‚ = PaCOâ‚‚ Ã— (1 âˆ’ Vd/Vt) âˆ’ dropoff_gradiente_A-aV
    // Dropoff aumenta con mismatch V/Q: mild +5, moderate +7, severe +10
    // Ï„ = 4 s (responde antes que PaCOâ‚‚ porque es mediciÃ³n directa de gas espirado)
    const dx = path.ards.diagnosis;
    const etDropoff = dx === 'severe' ? 10 : dx === 'moderate' ? 7 : dx === 'mild' ? 5 : 3;
    const etco2Target = Math.max(15, v.paCO2 * (1 - vdvt) - etDropoff);
    const newEtCO2 = v.etco2 + (etco2Target - v.etco2) * (dt / 4);

    // pH â€” Henderson-Hasselbalch:
    //   pH = pKa + log10( [HCO3] / (0.0307 Ã— PaCO2) )
    //   pKa = 6.10 (H2CO3/HCO3- a 37Â°C)
    //   [HCO3] estimado por compensaciÃ³n renal lenta (Ï„ = 2h):
    //     Base target = 24 âˆ’ (PaCO2 âˆ’ 40) Ã— 0.15  (Winters, alcalosis resp.)
    //     Acidosis: HCO3 aumenta 1 mEq/L por cada 10 mmHg de PaCO2 sobre 40
    //   Suavizado HCO3 con Ï„ = 7200 s (renal)
    const co2Dissolved = 0.0307 * Math.max(1, newPaCO2);
    const hco3Target = v.paCO2 > 40
      ? Math.min(45, 24 + (newPaCO2 - 40) * 0.1)   // acidosis: HCO3 sube lentamente
      : Math.max(12, 24 - (40 - newPaCO2) * 0.15); // alcalosis: HCO3 baja lentamente
    const tauHCO3 = 7200;
    const newHCO3 = v.hco3 + (hco3Target - v.hco3) * (dt / tauHCO3);
    const newPH = 6.10 + Math.log10(Math.max(0.001, newHCO3) / Math.max(0.01, co2Dissolved));
    const newBE = newHCO3 - 24 - 0.93 * (newPaCO2 - 40);  // Stewart simplificado

    pat.updateVitals({
      paO2:      Math.round(Math.max(35,   Math.min(500, newPaO2))),
      paCO2:     Math.round(Math.max(15,   Math.min(120, newPaCO2))),
      spo2:      Math.round(Math.max(60,   Math.min(100, newSpO2))),
      pH:        Math.round(Math.max(6.80, Math.min(7.70, newPH)) * 1000) / 1000,
      hco3:      Math.round(Math.max(10,   Math.min(50,  newHCO3)) * 10) / 10,
      baseExcess:Math.round(Math.max(-20,  Math.min(20,  newBE))   * 10) / 10,
      etco2:     Math.round(Math.max(5,    Math.min(80,  newEtCO2))* 10) / 10,
    });
  }

  /** Contenido arterial de Oâ‚‚ (mL Oâ‚‚ / dL sangre) vÃ­a Severinghaus. */
  private hbContent(po2: number, hb: number): number {
    const s = this.severinghaus(po2);
    return 1.34 * hb * s + 0.003 * po2;
  }

  /** Severinghaus 1979: SaOâ‚‚ = 1 / (1 + exp(âˆ’(0.385Â·ln(PaOâ‚‚) âˆ’ 3.32))) */
  private severinghaus(po2: number): number {
    const x = Math.max(1, po2);
    const k = 23400;
    const y = k / (Math.pow(x, 3) + 150 * x);
    return 1 / (1 + y);
  }

  /** Inversa aproximada â€” newton con cota. */
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

