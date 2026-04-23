// src/core/PrognosisEngine.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
//  PrognosisEngine — SOFA 2.0, APACHE II y motor de desenlaces ISDA
// ═══════════════════════════════════════════════════════════════════════════════
//
//  SOFA 2.0: Vincent et al. JAMA 1996; Singer et al. JAMA 2016.
//  APACHE II: Knaus WA et al. Crit Care Med 1985;13:818-29.
//  Mortalidad SOFA ≥11: ~50-70% (Seymour JAMA 2016; Raith JAMA 2017).
//
// ═══════════════════════════════════════════════════════════════════════════════

import { usePatientStore } from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { usePrognosisStore, SOFAComponents, OutcomeType } from '../store/usePrognosisStore';
import { useTimeStore } from '../store/useTimeStore';

// Resolución del chequeo de desenlace: cada 600 ticks simulados (~10 min)
const OUTCOME_CHECK_INTERVAL = 600;

export class PrognosisEngine {
  private static instance: PrognosisEngine | null = null;
  private outcomeTimer = 0;
  private rng: () => number = Math.random;

  private constructor() {}
  public static getInstance(): PrognosisEngine {
    if (!PrognosisEngine.instance) PrognosisEngine.instance = new PrognosisEngine();
    return PrognosisEngine.instance;
  }

  public update(dt: number): void {
    const prog = usePrognosisStore.getState();
    if (!prog.isActive || prog.outcome !== 'ongoing') return;

    this.outcomeTimer += dt;

    // Recalcular scores cada intervalo
    if (this.outcomeTimer >= OUTCOME_CHECK_INTERVAL) {
      this.outcomeTimer = 0;
      this.recalculate();
    }
  }

  private recalculate(): void {
    const pat = usePatientStore.getState();
    const { vitals, ventilator, isVentilatorConnected } = pat;
    const pharm = usePharmacologyStore.getState();
    const drugs = pharm.infusionRates;
    const time = useTimeStore.getState();

    const icuDaysSim = time.ticks / 86400;  // ticks son segundos simulados

    // ─── SOFA 2.0 ──────────────────────────────────────────────────────────
    const pf = vitals.paO2 / Math.max(0.21, ventilator.fio2);

    const respScore = this.sofaRespiratory(pf, isVentilatorConnected);
    const cardioScore = this.sofaCardiovascular(
      vitals.meanArterialPressure,
      drugs['dopamine'] || 0,
      drugs['dobutamine'] || 0,
      drugs['noradrenaline'] || 0,
      drugs['adrenaline'] || 0,
    );
    const cnsScore = this.sofaCNS(vitals.gcs);
    const renalScore = this.sofaRenal(vitals.creatinine, vitals.urineOutput);

    const components: SOFAComponents = {
      respiratory: respScore,
      coagulation: 0,
      liver: 0,
      cardiovascular: cardioScore,
      cns: cnsScore,
      renal: renalScore,
    };
    const sofaTotal = respScore + cardioScore + cnsScore + renalScore;

    // ─── APACHE II ─────────────────────────────────────────────────────────
    const apacheTotal = this.calculateAPACHEII(vitals, ventilator.fio2, isVentilatorConnected);

    // ─── Calidad del Manejo ────────────────────────────────────────────────
    const mgmt = this.assessManagement(vitals, drugs, isVentilatorConnected, ventilator);

    usePrognosisStore.getState().updateScores(sofaTotal, components, apacheTotal, mgmt, icuDaysSim);

    // ─── Motor de Desenlaces ───────────────────────────────────────────────
    this.evaluateOutcome(sofaTotal, mgmt, icuDaysSim);
  }

  // ─── SOFA COMPONENTES ────────────────────────────────────────────────────

  private sofaRespiratory(pf: number, onMV: boolean): number {
    if (pf >= 400) return 0;
    if (pf >= 300) return 1;
    if (pf >= 200) return 2;
    if (pf >= 100 && onMV) return 3;
    if (onMV) return 4;
    return 2;
  }

  private sofaCardiovascular(
    map: number,
    dopamine: number,
    dobutamine: number,
    norad: number,
    adren: number,
  ): number {
    if (norad > 0.1 || adren > 0.1 || dopamine > 15) return 4;
    if (norad > 0 || adren > 0 || dopamine > 5) return 3;
    if (dobutamine > 0 || dopamine > 0) return 2;
    if (map < 70) return 1;
    return 0;
  }

  private sofaCNS(gcs: number): number {
    if (gcs >= 15) return 0;
    if (gcs >= 13) return 1;
    if (gcs >= 10) return 2;
    if (gcs >= 6)  return 3;
    return 4;
  }

  private sofaRenal(creatinine: number, urineOutputMlH: number): number {
    const uoMlDay = urineOutputMlH * 24;
    if (creatinine >= 5.0) return 4;
    if (creatinine >= 3.5 || uoMlDay < 200) return 3;
    if (creatinine >= 2.0 || uoMlDay < 500) return 2;
    if (creatinine >= 1.2) return 1;
    return 0;
  }

  // ─── APACHE II (simplificado con vitales disponibles) ────────────────────

  private calculateAPACHEII(
    vitals: ReturnType<typeof usePatientStore.getState>['vitals'],
    fio2: number,
    onMV: boolean,
  ): number {
    let score = 0;

    // Temperatura
    const t = vitals.temperature;
    if (t >= 41 || t < 30) score += 4;
    else if (t >= 39 || t <= 31.9) score += 3;
    else if (t >= 38.5 || t <= 33.9) score += 1;

    // MAP
    const map = vitals.meanArterialPressure;
    if (map < 50) score += 4;
    else if (map <= 69) score += 2;
    else if (map >= 160) score += 4;
    else if (map >= 130) score += 3;
    else if (map >= 110) score += 2;

    // FC
    const hr = vitals.heartRate;
    if (hr >= 180 || hr < 40) score += 4;
    else if (hr >= 140 || hr <= 54) score += 3;
    else if (hr >= 110 || hr <= 69) score += 2;

    // FR
    const rr = vitals.respiratoryRate;
    if (rr >= 50 || rr < 6) score += 4;
    else if (rr >= 35) score += 3;
    else if (rr <= 9) score += 2;
    else if (rr >= 25 || rr <= 11) score += 1;

    // Oxigenación
    const pf = vitals.paO2 / Math.max(0.21, fio2);
    if (onMV && fio2 >= 0.5) {
      if (pf < 200) score += 3;
      else if (pf < 350) score += 2;
    } else {
      if (vitals.paO2 < 55) score += 4;
      else if (vitals.paO2 < 60) score += 3;
      else if (vitals.paO2 < 70) score += 1;
    }

    // pH
    const ph = vitals.pH;
    if (ph < 7.15 || ph >= 7.70) score += 4;
    else if (ph < 7.25 || ph >= 7.60) score += 3;
    else if (ph < 7.33 || ph >= 7.50) score += 1;

    // Creatinina
    const cr = vitals.creatinine;
    if (cr >= 3.5) score += 4;
    else if (cr >= 2.0) score += 3;
    else if (cr >= 1.5) score += 2;
    else if (cr < 0.6) score += 2;

    // GCS: 15 - GCS
    score += Math.max(0, 15 - vitals.gcs);

    // Puntos por edad (asumir 55 años si no disponible → 3 puntos)
    score += 3;

    return Math.min(71, score);
  }

  // ─── EVALUACIÓN DEL MANEJO ───────────────────────────────────────────────
  //
  //  Puntúa positivamente:
  //    • Vasopresores iniciados ante MAP <65 mmHg (protocolizado SSC)
  //    • Ventilación protectora: Vt ≤ 8 mL/kg = ≤ 560 mL (70 kg), pplat ≤ 28
  //    • PEEP ≥ 5 cuando hay SDRA activo
  //    • Temperatura controlada (<39 °C)
  //    • Creatinina estable o en descenso
  //
  private assessManagement(
    vitals: ReturnType<typeof usePatientStore.getState>['vitals'],
    drugs: Record<string, number>,
    onMV: boolean,
    vent: ReturnType<typeof usePatientStore.getState>['ventilator'],
  ): number {
    let pts = 0;
    let maxPts = 0;

    // Vasopresores ante hipotensión severa
    maxPts += 2;
    if (vitals.meanArterialPressure < 65) {
      const vasoOn = (drugs['noradrenaline'] || 0) > 0 || (drugs['vasopressin'] || 0) > 0;
      if (vasoOn) pts += 2;
    } else {
      pts += 2; // MAP ok, no se necesitaban
    }

    // Ventilación protectora
    if (onMV) {
      maxPts += 3;
      if (vent.vt <= 560) pts += 1;
      if (vitals.pplat <= 28) pts += 1;
      if (vent.peep >= 5) pts += 1;
    }

    // Temperatura
    maxPts += 1;
    if (vitals.temperature < 39.5) pts += 1;

    // Acidosis controlada
    maxPts += 1;
    if (vitals.pH >= 7.25) pts += 1;

    return maxPts > 0 ? pts / maxPts : 0.5;
  }

  // ─── MOTOR DE DESENLACES ESTOCÁSTICO ──────────────────────────────────────
  //
  //  Probabilidad diaria de óbito = f(SOFA, manejo) — calibrado con:
  //    SOFA 0-6:  mortalidad 1-5%  (Raith JAMA 2017)
  //    SOFA 7-9:  ~15-20%
  //    SOFA 10-12: ~30-40%
  //    SOFA ≥13:   ~50-70%
  //
  //  Manejo óptimo reduce la mortalidad un 40% relativo.
  //
  private evaluateOutcome(sofa: number, mgmt: number, icuDays: number): void {
    const prog = usePrognosisStore.getState();

    // Mortalidad base diaria (por unidad de tiempo simulado en días)
    let dailyMortality = 0;
    if (sofa >= 13) dailyMortality = 0.060;
    else if (sofa >= 10) dailyMortality = 0.035;
    else if (sofa >= 7) dailyMortality = 0.018;
    else if (sofa >= 4) dailyMortality = 0.008;
    else dailyMortality = 0.002;

    // Reducción por buen manejo (hasta 40% relativo)
    dailyMortality *= (1 - mgmt * 0.40);

    // Calcular prob del chequeo actual (proporcional a tiempo entre checks)
    const checkIntervalDays = OUTCOME_CHECK_INTERVAL / 86400;
    const pDeath = 1 - Math.pow(1 - dailyMortality, checkIntervalDays);

    // Probabilidad de óbito
    if (this.rng() < pDeath) {
      prog.setOutcome('death', icuDays);
      // Actualizamos vitales (sistema de óbito)
      usePatientStore.getState().updateVitals({
        heartRate: 0, systolicBP: 0, diastolicBP: 0,
        meanArterialPressure: 0, cardiacOutput: 0,
        spo2: 0, respiratoryRate: 0,
      });
      return;
    }

    // Trayectorias de recuperación (sólo evaluar tras 5+ días UCI)
    if (icuDays >= 5 && sofa <= 6 && mgmt >= 0.7) {
      const pRecovery = (mgmt - 0.5) * 0.04 * checkIntervalDays;
      if (this.rng() < pRecovery) {
        let outcome: OutcomeType;
        if (sofa >= 4) {
          outcome = 'trach_late_discharge';
        } else if (icuDays >= 10) {
          outcome = 'late_discharge';
        } else {
          outcome = 'discharge';
        }
        prog.setOutcome(outcome, icuDays);
      }
    }
  }
}
