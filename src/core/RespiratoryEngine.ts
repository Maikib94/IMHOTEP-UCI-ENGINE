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

import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import {
  VentilatorSV800Engine,
  deriveMechanicsFromPathology,
  type SV800Settings,
  type VentMode,
} from './VentilatorSV800Engine';

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
function mapLegacyMode(m: 'VC-AC' | 'PS'): VentMode {
  return m === 'PS' ? 'PSV' : 'VCV';
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

  private constructor() {}
  public static getInstance(): RespiratoryEngine {
    if (!RespiratoryEngine.instance) RespiratoryEngine.instance = new RespiratoryEngine();
    return RespiratoryEngine.instance;
  }

  public reset(): void {
    this.sv800.reset(this.sv800Settings.peep);
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
    const path = usePathologyStore.getState();
    const pharm = usePharmacologyStore.getState();

    // ── 1. Sincronizar sv800Settings con store legacy ────────────────────────
    // Si la UI legacy cambia PEEP/VT/FiO₂, propagamos al SV800.
    this.sv800Settings.fio2 = ventilator.fio2;
    this.sv800Settings.peep = ventilator.peep;
    this.sv800Settings.vtTarget = ventilator.vt;
    this.sv800Settings.rrSet = ventilator.setRR;
    this.sv800Settings.pSupport = ventilator.pressureSupport;

    // Modo — si el usuario está en modo legacy, preservamos VCV/PSV.
    // El componente SV800 (nueva UI) sobrescribe con PRVC/AMV via setSV800().
    if (this.sv800Settings.mode !== 'PRVC' &&
        this.sv800Settings.mode !== 'AMV' &&
        this.sv800Settings.mode !== 'PCV') {
      this.sv800Settings.mode = mapLegacyMode(ventilator.mode);
    }

    // ── 2. Construir mecánica del paciente desde patologías y fármacos ──────
    const mechanics = deriveMechanicsFromPathology({
      weightKg: vitals.weight,
      ardsActive: path.ards.isActive,
      ardsSeverity: path.ards.severity,
      sepsisActive: path.sepsis.isActive,
      sepsisSeverity: path.sepsis.severity,
      hypovolemicFraction: Math.max(0, (5000 - bloodVolume) / 5000),
      isSedated: pharm.systemicEffects.sedation > 0.5,
      nmbaFraction: pharm.systemicEffects.nmba,
    });

    // ── 3. Aplicar modificador de compliance de patologías (legacy coherence) ─
    //      path.modifiers.complianceMultiplier ya incorpora severidad ARDS.
    //      Usamos el menor entre ambos para no doble-contar.
    const effCrs = Math.min(
      mechanics.crs,
      50 * (path.modifiers.complianceMultiplier || 1),
    );
    const mechanicsEff = { ...mechanics, crs: effCrs };

    // ── 4. AMV: recalcular Vt/f óptimos cada 10 s de tiempo simulado ─────────
    if (this.sv800Settings.mode === 'AMV') {
      const rec = this.sv800.computeOtisAMV(
        this.sv800Settings.amvMinuteVentTarget,
        this.sv800Settings.amvWeightKg,
        mechanicsEff,
      );
      this.sv800Settings.rrSet = Math.round(rec.fOpt);
      this.sv800Settings.vtTarget = Math.round(rec.vtOpt);
    }

    // ── 5. Avanzar motor físico ─────────────────────────────────────────────
    this.sv800.update(dt, this.sv800Settings, mechanicsEff);

    // ── 6. Publicar vitales desde la última respiración completa ─────────────
    const breath = this.sv800.getLastBreath();
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

    // ── 7. Intercambio gaseoso (PaO₂, PaCO₂, SpO₂) ──────────────────────────
    this.updateGasExchange(dt, mechanicsEff.crs, breath.minVol || 0);
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
    const fio2 = pat.ventilator.fio2;

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
