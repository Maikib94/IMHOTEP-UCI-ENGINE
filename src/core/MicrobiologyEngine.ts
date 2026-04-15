// src/core/MicrobiologyEngine.ts
// Blueprint 021 — Motor de Microbiología y Farmacocinética Antimicrobiana
//
// Tick order en CronosEngine:
//   MicrobiologyEngine → PathologyEngine → PharmacologyEngine → Cardiovascular → ...
//   DEBE correr ANTES de PathologyEngine para que sepsisProgressionModifier
//   esté actualizado cuando PathologyEngine calcule newSev.
//
// Bibliografía:
//   - Sanford Guide 2025: CIM, breakpoints CLSI, PK/PD targets
//   - SSC 2021/2025: Bundle Hora-1, clearance de lactato
//   - Protocolo ROSE (Malbrain 2014): fases de fluidoterapia
//   - Pinsky: fluid responsiveness, dependencia de precarga
//   - ATLS 11ª Ed.: tiempos de intervención
//   - Estudio MERINO (Harris NEJM 2018): Pip/Tazo vs Carbapenémico en BLEE

import { usePatientStore } from '../store/usePatientStore';
import { usePathologyStore } from '../store/usePathologyStore';
import { useTimeStore } from '../store/useTimeStore';
import {
  useMicrobiologyStore,
  PATHOGEN_CATALOG,
  ANTIBIOTIC_CATALOG,
  type ActiveAntibiotic,
  type Culture,
  type CultureResult,
  type ROSEState,
  type TreatmentEfficacy,
  type SensitivityClass,
} from '../store/useMicrobiologyStore';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES PK/PD
// ══════════════════════════════════════════════════════════════════════════════

const LN2 = Math.log(2);

// Targets PK/PD (Sanford 2025)
const TIME_DEP_TARGET = 0.40;   // T>MIC ≥ 40% del intervalo = eficaz
const AUC_MIC_TARGET = 400;    // AUC24/MIC ≥ 400 = eficaz (Vanco SSC 2025)
const CONC_MIC_TARGET = 8;      // Cmax/MIC ≥ 8 = eficaz (Colistina)
const VANCO_TROUGH_TOXIC = 20;     // μg/mL — nefrotoxicidad (SSC 2025)

// sepsisProgressionModifier valores
const MOD_NONE = 1.0;   // Sin ATB — progresión normal
const MOD_MISMATCH = 1.2;   // ATB resistente — presión selectiva, empeora
const MOD_SUBOPTIMAL = 0.3;   // ATB sensible pero PK/PD no alcanza target
const MOD_EMPIRIC_MATCH = -0.3;   // ATB sensible + PK/PD ok, sin antibiograma
const MOD_TARGETED = -0.5;   // ATB dirigido post-antibiograma

// ROSE thresholds (SSC + Pinsky + SATI)
const ROSE_MAP_STABLE = 65;    // PAM meta SSC
const ROSE_MAP_STABLE_DUR = 1800;  // 30 min simulados para considerar estable
const ROSE_LACTATE_CLEAR = 2.0;   // mmol/L — meta de clearance SSC
const ROSE_CLEARANCE_PCT = 0.30;  // 30% clearance en 2h = respuesta
const ROSE_STAB_NO_BOLUS = 21600; // 6h simuladas sin bolus = estable
const ROSE_EDEMA_DIVISOR = 7000;  // fluidBalance / (weight*100) normalizado

// Maduración de cultivos
const CULTURE_DELAY_S = 172800;    // 48h simuladas a velocidad 1x

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export class MicrobiologyEngine {
  private static instance: MicrobiologyEngine | null = null;
  private constructor() { }

  public static getInstance(): MicrobiologyEngine {
    if (!MicrobiologyEngine.instance)
      MicrobiologyEngine.instance = new MicrobiologyEngine();
    return MicrobiologyEngine.instance;
  }

  public update(dt: number): void {
    const micro = useMicrobiologyStore.getState();
    const sepsis = usePathologyStore.getState().sepsis;

    // Solo correr si hay sepsis activa
    if (!sepsis.isActive) return;

    const simElapsed = useTimeStore.getState().simulatedElapsed;

    // 1. Farmacocinética de antibióticos activos
    const updatedATBs = this.updatePK(micro.activeAntibiotics, simElapsed, dt);

    // 2. Madurar cultivos
    const updatedCultures = this.matureCultures(
      micro.cultures, micro.hiddenPathogenId, simElapsed
    );

    // 3. Eficacia del tratamiento
    const hasCultureResult = updatedCultures.some(
      (c) => c.result !== null && c.result.isPositive
    );
    const { efficacy, modifier } = this.computeEfficacy(
      updatedATBs, micro.hiddenPathogenId, hasCultureResult
    );

    // 4. Protocolo ROSE
    const updatedROSE = this.updateROSE(micro.rose, simElapsed, dt);

    // 5. Nefrotoxicidad
    this.checkToxicity(updatedATBs, dt);

    // 6. Escribir estado
    micro._engineUpdate({
      activeAntibiotics: updatedATBs,
      cultures: updatedCultures,
      treatmentEfficacy: efficacy,
      sepsisProgressionModifier: modifier,
      rose: updatedROSE,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. FARMACOCINÉTICA — Decaimiento exponencial + redosificación automática
  // ════════════════════════════════════════════════════════════════════════════

  private updatePK(
    atbs: ActiveAntibiotic[],
    simElapsed: number,
    dt: number,
  ): ActiveAntibiotic[] {
    return atbs.map((atb) => {
      const def = ANTIBIOTIC_CATALOG[atb.antibioticId];
      if (!def) return atb;

      const halfLifeS = def.halfLifeHours * 3600;
      const doseIntervalS = def.doseIntervalHours * 3600;
      const kElim = LN2 / halfLifeS;

      // Decaimiento exponencial: C(t) = C0 · e^(-k·dt)
      let conc = atb.serumConcentration * Math.exp(-kElim * dt);

      // Auto-redosificación: si pasó el intervalo, administrar nueva dosis
      let lastDoseAt = atb.lastDoseAt;
      const timeSinceDose = simElapsed - lastDoseAt;

      if (timeSinceDose >= doseIntervalS) {
        // Nueva dosis: sumar Cmax al nivel residual
        conc += def.peakConcentration;
        lastDoseAt = simElapsed;
      }

      conc = Math.max(0, conc);

      // Trough: nivel justo antes de la siguiente dosis (estimación)
      const timeToNextDose = doseIntervalS - (simElapsed - lastDoseAt);
      const trough = conc * Math.exp(-kElim * timeToNextDose);

      // AUC24 simplificada (trapezoidal acumulada en ventana de 24h)
      // Aproximación: AUC24 ≈ conc_promedio × 24h
      // conc_promedio para 1er orden: Cmax / (kElim × doseInterval) × (1 - e^(-kElim × interval))
      const avgConc = def.peakConcentration *
        (1 - Math.exp(-kElim * doseIntervalS)) / (kElim * doseIntervalS);
      const auc24 = avgConc * 24;

      // T>MIC: fracción del intervalo donde concentración > MIC del patógeno
      const tAboveMIC = this.computeTAboveMIC(atb, def, conc, kElim, doseIntervalS);

      return {
        ...atb,
        lastDoseAt,
        serumConcentration: Math.round(conc * 100) / 100,
        troughLevel: Math.round(Math.max(0, trough) * 100) / 100,
        auc24: Math.round(auc24 * 10) / 10,
        timeSinceLastDose: simElapsed - lastDoseAt,
        tAboveMIC,
      };
    });
  }

  /**
   * Calcula T>MIC para antibióticos tiempo-dependientes.
   * Para un decaimiento monoexponencial:
   *   T>MIC = ln(Cmax/MIC) / kElim  (si Cmax > MIC)
   * Expresado como fracción del intervalo de dosis.
   */
  private computeTAboveMIC(
    atb: ActiveAntibiotic,
    def: { peakConcentration: number; pkpdType: string },
    _currentConc: number,
    kElim: number,
    doseIntervalS: number,
  ): number {
    if (def.pkpdType !== 'time') return 0;

    // Obtener MIC del patógeno oculto para este ATB
    const micro = useMicrobiologyStore.getState();
    if (!micro.hiddenPathogenId) return 0;

    const pathogen = PATHOGEN_CATALOG[micro.hiddenPathogenId];
    if (!pathogen) return 0;

    const sens = pathogen.sensitivities[atb.antibioticId];
    if (!sens || sens.sensitivity === 'R' || sens.sensitivity === 'INTRINSEC_R') return 0;

    const mic = sens.mic;
    if (def.peakConcentration <= mic) return 0;

    // Tiempo que la concentración está sobre MIC tras cada dosis
    const tAboveMICSeconds = Math.log(def.peakConcentration / mic) / kElim;
    let fraction = tAboveMICSeconds / doseIntervalS;

    // Bonus por infusión extendida (Meropenem 3h, Pip/Tazo extendida)
    if (atb.extendedInfusion) {
      const bonus = ANTIBIOTIC_CATALOG[atb.antibioticId]?.extendedBonus ?? 0;
      fraction += bonus;
    }

    return Math.max(0, Math.min(1, fraction));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MADURAR CULTIVOS — tras 48h simuladas revelan el patógeno oculto
  // ════════════════════════════════════════════════════════════════════════════

  private matureCultures(
    cultures: Culture[],
    pathogenId: string | null,
    simElapsed: number,
  ): Culture[] {
    // Override pedagógico: resultados instantáneos
    const instantResults = usePatientStore.getState().instantResults ?? false;

    return cultures.map((cx) => {
      // Ya tiene resultado — no reprocesar
      if (cx.result !== null) return cx;

      // ¿Listo?
      const ready = instantResults ? true : (simElapsed >= cx.readyAt);
      if (!ready) return cx;

      // Generar resultado
      if (!pathogenId || !PATHOGEN_CATALOG[pathogenId]) {
        // Sin patógeno asignado → cultivo negativo
        return {
          ...cx, result: {
            isPositive: false,
            pathogenId: '',
            pathogenName: '',
            gramStainDesc: 'Sin desarrollo',
            sensitivities: {},
            mics: {},
          }
        };
      }

      const pathogen = PATHOGEN_CATALOG[pathogenId];
      const sensitivities: Record<string, SensitivityClass> = {};
      const mics: Record<string, number> = {};

      for (const [atbId, info] of Object.entries(pathogen.sensitivities)) {
        sensitivities[atbId] = info.sensitivity;
        mics[atbId] = info.mic;
      }

      const result: CultureResult = {
        isPositive: true,
        pathogenId: pathogen.id,
        pathogenName: pathogen.displayName,
        gramStainDesc: pathogen.gramStainDesc,
        sensitivities,
        mics,
      };

      return { ...cx, result };
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. EFICACIA DEL TRATAMIENTO — Sanford: ATB vs Patógeno vs PK/PD
  // ════════════════════════════════════════════════════════════════════════════

  private computeEfficacy(
    atbs: ActiveAntibiotic[],
    pathogenId: string | null,
    hasCultureResult: boolean,
  ): { efficacy: TreatmentEfficacy; modifier: number } {

    // Sin antibióticos → sin efecto
    if (atbs.length === 0) {
      return { efficacy: 'none', modifier: MOD_NONE };
    }

    // Sin patógeno asignado → efecto empírico neutro (no podemos evaluar match) 
    if (!pathogenId || !PATHOGEN_CATALOG[pathogenId]) {
      return { efficacy: 'none', modifier: MOD_NONE };
    }

    const pathogen = PATHOGEN_CATALOG[pathogenId];
    let bestContribution = -Infinity;
    let anyMismatch = false;

    for (const atb of atbs) {
      const def = ANTIBIOTIC_CATALOG[atb.antibioticId];
      const sens = pathogen.sensitivities[atb.antibioticId];
      if (!def || !sens) continue;

      // ── Resistencia: contribución negativa ─────────────────────────────
      if (sens.sensitivity === 'R' || sens.sensitivity === 'INTRINSEC_R') {
        anyMismatch = true;
        bestContribution = Math.max(bestContribution, -0.1);
        continue;
      }

      // ── Intermedio: contribución parcial ───────────────────────────────
      if (sens.sensitivity === 'I') {
        bestContribution = Math.max(bestContribution, 0.3);
        continue;
      }

      // ── Sensible: evaluar PK/PD target ─────────────────────────────────
      let pkpdMet = false;

      switch (def.pkpdType) {
        case 'time':
          pkpdMet = atb.tAboveMIC >= TIME_DEP_TARGET;
          break;
        case 'auc':
          pkpdMet = sens.mic > 0 && (atb.auc24 / sens.mic) >= AUC_MIC_TARGET;
          break;
        case 'conc':
          pkpdMet = sens.mic > 0 && (atb.serumConcentration / sens.mic) >= CONC_MIC_TARGET;
          break;
      }

      if (pkpdMet) {
        bestContribution = Math.max(bestContribution, 1.0);
      } else {
        // Sensible pero PK insuficiente
        bestContribution = Math.max(bestContribution, 0.5);
      }
    }

    // ── Traducir contribución a efficacy + modifier ──────────────────────
    if (bestContribution >= 1.0) {
      // ATB sensible + PK/PD óptimo
      const efficacy: TreatmentEfficacy = hasCultureResult ? 'targeted' : 'empiric_match';
      const modifier = hasCultureResult ? MOD_TARGETED : MOD_EMPIRIC_MATCH;
      return { efficacy, modifier };
    }

    if (bestContribution >= 0.3) {
      // Intermedio o subóptimo — freno parcial
      return { efficacy: 'suboptimal', modifier: MOD_SUBOPTIMAL };
    }

    if (anyMismatch) {
      // Todos los ATB son R → presión selectiva
      return { efficacy: 'mismatch', modifier: MOD_MISMATCH };
    }

    return { efficacy: 'none', modifier: MOD_NONE };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. PROTOCOLO ROSE — gestión de fluidos (SSC + Pinsky + Malbrain)
  // ════════════════════════════════════════════════════════════════════════════

  private updateROSE(rose: ROSEState, simElapsed: number, _dt: number): ROSEState {
    const pat = usePatientStore.getState();
    const v = pat.vitals;
    const map = v.meanArterialPressure;
    const lac = v.lactate ?? 1.0;
    const wt = v.weight || 70;

    const updated = { ...rose };

    // ── Fluid balance ────────────────────────────────────────────────────
    updated.totalFluidGiven = pat.crystalloidAccumulated ?? 0;
    updated.fluidBalance = updated.totalFluidGiven;  // simplificado (sin pérdidas insensibles)

    // ── Pulmonary edema risk (Pinsky: >10 mL/kg = riesgo) ────────────────
    //   Normalizado: 7000 mL en 70kg = risk 1.0
    updated.pulmonaryEdemaRisk = Math.max(0, Math.min(1,
      updated.fluidBalance / (wt * 100)
    ));

    // ── MAP stability tracking ───────────────────────────────────────────
    if (map >= ROSE_MAP_STABLE) {
      if (updated.mapStableSince === null) {
        updated.mapStableSince = simElapsed;
      }
    } else {
      updated.mapStableSince = null;
    }

    const mapStableDuration = updated.mapStableSince !== null
      ? simElapsed - updated.mapStableSince
      : 0;

    // ── Lactate clearance (ventana de 2h simuladas = 7200s) ──────────────
    if (simElapsed - updated.lastLactateSampleAt >= 7200) {
      if (updated.lastLactateValue > 0) {
        updated.lactateClearancePct =
          (updated.lastLactateValue - lac) / updated.lastLactateValue;
      }
      updated.lastLactateValue = lac;
      updated.lastLactateSampleAt = simElapsed;
    }

    // ── Transiciones de fase ─────────────────────────────────────────────
    switch (updated.currentPhase) {
      case 'R':
        // R → O: MAP ≥ 65 estable 30 min simulados
        if (mapStableDuration >= ROSE_MAP_STABLE_DUR) {
          updated.currentPhase = 'O';
          updated.phaseEnteredAt = simElapsed;
        }
        break;

      case 'O':
        // O → S: lactato < 2 mmol/L O clearance > 30% en 2h
        if (lac < ROSE_LACTATE_CLEAR || updated.lactateClearancePct >= ROSE_CLEARANCE_PCT) {
          updated.currentPhase = 'S';
          updated.phaseEnteredAt = simElapsed;
        }
        // Regresión: si MAP cae de vuelta → volver a R
        if (map < ROSE_MAP_STABLE && updated.mapStableSince === null) {
          updated.currentPhase = 'R';
          updated.phaseEnteredAt = simElapsed;
        }
        break;

      case 'S':
        // S → E: 6h simuladas sin fluidos adicionales (simplificado: si balance no aumentó)
        if (simElapsed - updated.phaseEnteredAt >= ROSE_STAB_NO_BOLUS) {
          updated.currentPhase = 'E';
          updated.phaseEnteredAt = simElapsed;
        }
        // Regresión: si MAP cae → volver a O o R
        if (map < ROSE_MAP_STABLE) {
          updated.currentPhase = 'O';
          updated.phaseEnteredAt = simElapsed;
        }
        break;

      case 'E':
        // E es la fase final — regresión si MAP cae
        if (map < ROSE_MAP_STABLE) {
          updated.currentPhase = 'S';
          updated.phaseEnteredAt = simElapsed;
        }
        break;
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. NEFROTOXICIDAD — Vancomicina (trough) + Colistina (siempre)
  // ════════════════════════════════════════════════════════════════════════════

  private checkToxicity(atbs: ActiveAntibiotic[], dt: number): void {
    // Placeholder: en Fase 3 se conectará con RenalEngine
    // Por ahora solo calculamos y logeamos — la conexión al RenalEngine
    // se hará cuando modifiquemos ese archivo
    for (const atb of atbs) {
      const def = ANTIBIOTIC_CATALOG[atb.antibioticId];
      if (!def || !def.nephrotoxic) continue;

      if (def.id === 'vancomycin' && atb.troughLevel > VANCO_TROUGH_TOXIC) {
        // Trough > 20 μg/mL → nefrotóxico
        // TODO: RenalEngine.addToxicityStressor(def.nephroStressorRate * dt)
      }

      if (def.id === 'colistin') {
        // Siempre nefrotóxico mientras esté activa
        // TODO: RenalEngine.addToxicityStressor(def.nephroStressorRate * dt)
      }
    }
  }
}
