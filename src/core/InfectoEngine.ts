// src/core/InfectoEngine.ts
// Blueprint 022-A — Motor de Infectología con Desafío de Decisión Clínica Empírica
//
// FUNCIONALIDADES:
//   - hiddenPathogen: patógeno oculto asignado al inicio (no visible hasta cultivo+)
//   - coverageCalculation: compara ATBs activos vs sensibilidad del germen oculto
//   - Evolución clínica 24hs: sin cobertura → empeoramiento cardiovascular (Shock Séptico)
//   - Cultivos con delay 48hs: cultureStatus Pendiente/Listo con ETA display
//   - Factor de ingreso: 15% probabilidad de cultivo positivo pre-existente
//   - Falsos negativos: probabilidad incluso si germen presente
//   - Integración con CardiovascularEngine para señal de cobertura insuficiente
//
// Bibliografía:
//   - Kumar A CCM 2006: cada hora sin ATB en Shock Séptico → ↑7.6% mortalidad
//   - SSC Bundle 2025: ATB dentro de 1h del reconocimiento
//   - IDSA/SCCM Sepsis Guidelines 2021: cobertura empírica y de-escalada guiada por cultivo
//   - Sanford Guide 2025: MIC/breakpoints

import { usePatientStore }    from '../store/usePatientStore';
import { usePathologyStore }  from '../store/usePathologyStore';
import { useTimeStore }       from '../store/useTimeStore';
import {
  useMicrobiologyStore,
  PATHOGEN_CATALOG,
  ANTIBIOTIC_CATALOG,
  type CultureSiteType,
} from '../store/useMicrobiologyStore';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES DE LÓGICA EMPÍRICA
// ══════════════════════════════════════════════════════════════════════════════

/** Umbral en segundos simulados (24h) para activar deterioro por cobertura nula */
const COVERAGE_FAILURE_THRESHOLD_S = 24 * 3600;

/** Umbral de 6hs para deterioro temprano si mismatch severo (patógeno XDR) */
const EARLY_FAILURE_XDR_THRESHOLD_S = 6 * 3600;

/** Tasa de deterioro del inotropismo basal por hora sin cobertura (fracción/s) */
const INOTROPY_DECAY_RATE = 0.00001; // ~3.6% por hora

/** Tasa de aumento de permeabilidad capilar por hora sin cobertura (mL/min por s) */
const CAPILLARY_LEAK_INCREMENT = 0.000016; // ~0.058 mL/min por hora

/** Tasa de recuperación cuando se inicia cobertura correcta (fracción/s) */
const INOTROPY_RECOVERY_RATE = 0.000005;

/** Aumento de frecuencia cardíaca objetivo por deterioro (bpm/s) */
const HR_SEPTIC_DRIVE_RATE = 0.0005;

/** Severidad máxima de sepsis alcanzable por el motor de infectología */
const SEPSIS_SEVERITY_CAP = 0.95;

/** Probabilidad de falso negativo en cultivo (germen presente pero no crece) */
const FALSE_NEGATIVE_PROBABILITY = 0.12; // 12% — IDSA CLABSI guidelines

/** Factor de ingreso: 15% de pacientes tienen cultivo positivo pre-existente */
const ADMISSION_POSITIVE_CULTURE_PROBABILITY = 0.15;

// Tabla de patógenos de alta frecuencia en UCI para asignación inicial
// (cuando sepsis activa sin patógeno ya definido por MicrobiologyEngine)
const HIGH_FREQUENCY_UCI_PATHOGENS: Array<{ id: string; weight: number }> = [
  { id: 'saureus_mrsa',      weight: 0.18 },
  { id: 'kpneumo_esbl',      weight: 0.15 },
  { id: 'ecoli_wild',        weight: 0.12 },
  { id: 'paeru_mdr',         weight: 0.11 },
  { id: 'saureus_mssa',      weight: 0.10 },
  { id: 'acinetobacter_xdr', weight: 0.08 },
  { id: 'kpneumo_kpc',       weight: 0.07 },
  { id: 'candida_albicans',  weight: 0.06 },
  { id: 'spneumo',           weight: 0.06 },
  { id: 'efaecium_vre',      weight: 0.05 },
  { id: 'kpneumo_ndm',       weight: 0.02 },
];

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS EXPORTADOS
// ══════════════════════════════════════════════════════════════════════════════

export type CoverageStatus =
  | 'no_sepsis'           // Sepsis no activa — motor en espera
  | 'no_pathogen'         // Patógeno oculto no asignado todavía
  | 'no_treatment'        // Sin ATB activo — deterioro inminente
  | 'mismatch'            // ATB activo pero resistente — presión selectiva
  | 'suboptimal'          // ATB S pero PK/PD subóptimo
  | 'adequate'            // Cobertura empírica adecuada — mejoría esperada
  | 'targeted';           // Tratamiento dirigido por antibiograma

export interface CoverageResult {
  status:           CoverageStatus;
  hoursUncovered:   number;        // horas sin cobertura adecuada (0 si cubierto)
  deteriorationPct: number;        // 0-1: fracción de deterioro acumulado
  riskMessage:      string;        // Texto para UI clínica
  isXdrRisk:        boolean;       // patógeno XDR/PDR → deterioro acelerado
}

export interface InfectoEngineState {
  coverageStatus:        CoverageStatus;
  hoursUncoveredElapsed: number;       // segundos acumulados sin cobertura
  deteriorationLevel:    number;       // 0-1
  inotropyDebuff:        number;       // 0-1 (reducción del inotropismo basal)
  capillaryLeakDebuff:   number;       // mL/min adicional de fuga capilar
  admissionCultureReady: boolean;      // cultivo positivo disponible al ingreso
  admissionPathogenId:   string | null;
  coverageResult:        CoverageResult;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export class InfectoEngine {
  private static instance: InfectoEngine | null = null;

  // Estado interno del engine (no persiste en store para evitar renders)
  private hoursUncoveredElapsed = 0;
  private deteriorationLevel = 0;
  private inotropyDebuff = 0;
  private capillaryLeakDebuff = 0;
  private admissionCultureReady = false;
  private admissionPathogenId: string | null = null;
  private initialized = false;
  private previousCoverageAdequate = false;

  private constructor() {}

  public static getInstance(): InfectoEngine {
    if (!InfectoEngine.instance)
      InfectoEngine.instance = new InfectoEngine();
    return InfectoEngine.instance;
  }

  /** Reiniciar estado interno al cargar nuevo escenario */
  public reset(): void {
    this.hoursUncoveredElapsed = 0;
    this.deteriorationLevel = 0;
    this.inotropyDebuff = 0;
    this.capillaryLeakDebuff = 0;
    this.admissionCultureReady = false;
    this.admissionPathogenId = null;
    this.initialized = false;
    this.previousCoverageAdequate = false;
  }

  public update(dt: number): void {
    const micro  = useMicrobiologyStore.getState();
    const path   = usePathologyStore.getState();
    const sepsis = path.sepsis;

    if (!sepsis.isActive) {
      // Recuperar gradualmente si sepsis se desactiva
      this.inotropyDebuff      = Math.max(0, this.inotropyDebuff - INOTROPY_RECOVERY_RATE * dt * 2);
      this.capillaryLeakDebuff = Math.max(0, this.capillaryLeakDebuff - 0.00003 * dt);
      this._publishToPathology(path);
      return;
    }

    // ── 1. INICIALIZACIÓN: factor de ingreso ─────────────────────────────────
    if (!this.initialized) {
      this._handleAdmissionFactor(micro.hiddenPathogenId);
      this.initialized = true;
    }

    // ── 2. VERIFICAR COBERTURA vs PATÓGENO OCULTO ────────────────────────────
    const pathogenId = micro.hiddenPathogenId;
    const atbs = micro.activeAntibiotics;

    const coverage = this._computeCoverage(pathogenId, atbs);

    // ── 3. EVOLUCIÓN CLÍNICA BASADA EN COBERTURA ─────────────────────────────
    const isXdr = this._isXdrPathogen(pathogenId);
    const coverageAdequate = (coverage === 'adequate' || coverage === 'targeted');

    if (coverageAdequate) {
      // Tratamiento correcto → recuperación gradual
      this.hoursUncoveredElapsed = Math.max(0, this.hoursUncoveredElapsed - dt * 0.1);
      this.deteriorationLevel    = Math.max(0, this.deteriorationLevel - 0.000003 * dt);
      this.inotropyDebuff        = Math.max(0, this.inotropyDebuff - INOTROPY_RECOVERY_RATE * dt);
      this.capillaryLeakDebuff   = Math.max(0, this.capillaryLeakDebuff - 0.00002 * dt);

      // Primera vez que se cubre → mejorar marcadores de sepsis
      if (!this.previousCoverageAdequate) {
        this._triggerCoverageImprovement(path, sepsis.severity);
      }
    } else {
      // Sin cobertura → deterioro progresivo
      const earlyThreshold = isXdr ? EARLY_FAILURE_XDR_THRESHOLD_S : COVERAGE_FAILURE_THRESHOLD_S;

      this.hoursUncoveredElapsed += dt;

      // Deterioro comienza después del umbral de 24hs (6hs para XDR)
      if (this.hoursUncoveredElapsed >= earlyThreshold) {
        const decayMultiplier = isXdr ? 2.5 : 1.0;

        // ── Inotropismo (caída de SV y CO) ────────────────────────────────
        this.inotropyDebuff = Math.min(
          0.60, // cap: -60% inotropismo máximo
          this.inotropyDebuff + INOTROPY_DECAY_RATE * decayMultiplier * dt,
        );

        // ── Permeabilidad capilar (caída de precarga, edema) ──────────────
        this.capillaryLeakDebuff = Math.min(
          5.0, // cap: 5 mL/min adicional máximo
          this.capillaryLeakDebuff + CAPILLARY_LEAK_INCREMENT * decayMultiplier * dt,
        );

        // ── Aumentar severidad de sepsis ───────────────────────────────────
        this.deteriorationLevel = Math.min(
          1.0,
          this.deteriorationLevel + 0.000002 * decayMultiplier * dt,
        );

        if (this.hoursUncoveredElapsed >= earlyThreshold + 3600) {
          this._triggerSepticProgression(path, sepsis, isXdr);
        }
      }
    }

    this.previousCoverageAdequate = coverageAdequate;

    // ── 4. PUBLICAR EFECTOS A PathologyStore ─────────────────────────────────
    this._publishToPathology(path);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FACTOR DE INGRESO (15% cultivo positivo disponible al ingreso)
  // ════════════════════════════════════════════════════════════════════════════

  private _handleAdmissionFactor(currentHiddenId: string | null): void {
    if (Math.random() < ADMISSION_POSITIVE_CULTURE_PROBABILITY) {
      // Elegir patógeno ponderado
      const pathogenId = currentHiddenId ?? this._pickWeightedPathogen();
      if (pathogenId && PATHOGEN_CATALOG[pathogenId]) {
        this.admissionCultureReady = true;
        this.admissionPathogenId   = pathogenId;

        // Asignar si no hay patógeno definido
        if (!currentHiddenId) {
          useMicrobiologyStore.getState().assignPathogen(pathogenId);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CÁLCULO DE COBERTURA vs PATÓGENO OCULTO
  // ════════════════════════════════════════════════════════════════════════════

  private _computeCoverage(
    pathogenId: string | null,
    atbs: ReturnType<typeof useMicrobiologyStore.getState>['activeAntibiotics'],
  ): CoverageStatus {
    if (!pathogenId || !PATHOGEN_CATALOG[pathogenId]) {
      return atbs.length > 0 ? 'no_pathogen' : 'no_treatment';
    }

    if (atbs.length === 0) return 'no_treatment';

    const pathogen = PATHOGEN_CATALOG[pathogenId];
    let bestSensitivity = 'none';

    for (const atb of atbs) {
      const def  = ANTIBIOTIC_CATALOG[atb.antibioticId];
      const sens = pathogen.sensitivities[atb.antibioticId];
      if (!def || !sens) continue;

      if (sens.sensitivity === 'S') {
        // Verificar PK/PD básico
        const pkOk = this._checkPkPd(atb, def, sens.mic);
        if (pkOk) {
          bestSensitivity = 'adequate';
        } else if (bestSensitivity !== 'adequate') {
          bestSensitivity = 'suboptimal';
        }
      } else if (sens.sensitivity === 'I' && bestSensitivity === 'none') {
        bestSensitivity = 'suboptimal';
      }
    }

    switch (bestSensitivity) {
      case 'adequate': return 'adequate';
      case 'suboptimal': return 'suboptimal';
      case 'none': return 'mismatch';
      default: return 'no_treatment';
    }
  }

  private _checkPkPd(
    atb: { serumConcentration: number; tAboveMIC: number; auc24: number },
    def: { pkpdType: string },
    mic: number,
  ): boolean {
    switch (def.pkpdType) {
      case 'time': return atb.tAboveMIC >= 0.35;
      case 'auc':  return mic > 0 && (atb.auc24 / mic) >= 350;
      case 'conc': return mic > 0 && (atb.serumConcentration / mic) >= 6;
      default:     return atb.serumConcentration > mic;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private _isXdrPathogen(pathogenId: string | null): boolean {
    if (!pathogenId || !PATHOGEN_CATALOG[pathogenId]) return false;
    const ph = PATHOGEN_CATALOG[pathogenId].phenotype;
    return ph === 'xdr' || ph === 'carbapenemase';
  }

  private _pickWeightedPathogen(): string {
    const total = HIGH_FREQUENCY_UCI_PATHOGENS.reduce((s, p) => s + p.weight, 0);
    let rng = Math.random() * total;
    for (const { id, weight } of HIGH_FREQUENCY_UCI_PATHOGENS) {
      rng -= weight;
      if (rng <= 0) return id;
    }
    return HIGH_FREQUENCY_UCI_PATHOGENS[0].id;
  }

  private _triggerSepticProgression(
    path: ReturnType<typeof usePathologyStore.getState>,
    sepsis: { severity: number },
    isXdr: boolean,
  ): void {
    const newSeverity = Math.min(
      SEPSIS_SEVERITY_CAP,
      sepsis.severity + (isXdr ? 0.00004 : 0.000015),
    );
    path.setSepsisSeverity(newSeverity);

    // Reducir SVR (vasoplegia séptica)
    const pat = usePatientStore.getState();
    const currentSvr = pat.vitals.baseSvr ?? 1200;
    const newSvr = Math.max(400, currentSvr - (isXdr ? 3.0 : 1.2));
    pat.updateVitals({ baseSvr: newSvr });
  }

  private _triggerCoverageImprovement(
    path: ReturnType<typeof usePathologyStore.getState>,
    currentSeverity: number,
  ): void {
    // Leve mejora de severidad al iniciar cobertura correcta
    const newSeverity = Math.max(0.05, currentSeverity - 0.02);
    path.setSepsisSeverity(newSeverity);
  }

  private _publishToPathology(
    path: ReturnType<typeof usePathologyStore.getState>,
  ): void {
    // Actualizar modificadores del PathologyStore con los debuffs calculados
    const currentMods = path.modifiers;

    // capillaryLeakRate: mL/min base + debuff
    const newCapillaryLeak = Math.max(
      0,
      currentMods.capillaryLeakRate,
    ) + this.capillaryLeakDebuff;

    // svr → se afecta vía hyperdynamicFactor (vasodilatación séptica)
    const infectedHyperdynamic = Math.max(
      0.75,
      currentMods.hyperdynamicFactor - this.deteriorationLevel * 0.25,
    );

    path.updateModifiers({
      ...currentMods,
      capillaryLeakRate:  Math.min(10, newCapillaryLeak),
      hyperdynamicFactor: infectedHyperdynamic,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS PARA UI Y CardiovascularEngine
  // ════════════════════════════════════════════════════════════════════════════

  public getState(): InfectoEngineState {
    const micro    = useMicrobiologyStore.getState();
    const path     = usePathologyStore.getState();
    const sepsis   = path.sepsis;
    const atbs     = micro.activeAntibiotics;
    const pathId   = micro.hiddenPathogenId;

    if (!sepsis.isActive) {
      return {
        coverageStatus:        'no_sepsis',
        hoursUncoveredElapsed: 0,
        deteriorationLevel:    0,
        inotropyDebuff:        0,
        capillaryLeakDebuff:   0,
        admissionCultureReady: this.admissionCultureReady,
        admissionPathogenId:   this.admissionPathogenId,
        coverageResult:        this._buildCoverageResult('no_sepsis', pathId),
      };
    }

    const status = this._computeCoverage(pathId, atbs);

    return {
      coverageStatus:        status,
      hoursUncoveredElapsed: this.hoursUncoveredElapsed,
      deteriorationLevel:    this.deteriorationLevel,
      inotropyDebuff:        this.inotropyDebuff,
      capillaryLeakDebuff:   this.capillaryLeakDebuff,
      admissionCultureReady: this.admissionCultureReady,
      admissionPathogenId:   this.admissionPathogenId,
      coverageResult:        this._buildCoverageResult(status, pathId),
    };
  }

  /** Debuff de inotropismo para CardiovascularEngine */
  public getInotropyDebuff(): number {
    return this.inotropyDebuff;
  }

  /** Debuff de permeabilidad capilar para CardiovascularEngine */
  public getCapillaryLeakDebuff(): number {
    return this.capillaryLeakDebuff;
  }

  private _buildCoverageResult(
    status: CoverageStatus,
    pathogenId: string | null,
  ): CoverageResult {
    const pathogen = pathogenId && PATHOGEN_CATALOG[pathogenId]
      ? PATHOGEN_CATALOG[pathogenId]
      : null;

    const isXdrRisk = this._isXdrPathogen(pathogenId);
    const hoursUncovered = this.hoursUncoveredElapsed / 3600;

    let riskMessage = '';
    switch (status) {
      case 'no_sepsis':
        riskMessage = 'Sepsis no activa — motor en espera';
        break;
      case 'no_pathogen':
        riskMessage = 'Patógeno aún no asignado — esperar resultado de cultivo';
        break;
      case 'no_treatment':
        riskMessage = hoursUncovered >= 1
          ? `⚠️ ${hoursUncovered.toFixed(1)}h sin ATB — ↑${(hoursUncovered * 7.6).toFixed(0)}% mortalidad (Kumar CCM 2006)`
          : 'Sin tratamiento antibiótico — iniciar empírico urgente';
        break;
      case 'mismatch':
        riskMessage = `⛔ ATB activo RESISTENTE${pathogen ? ` (${pathogen.displayName})` : ''} — presión selectiva + deterioro`;
        break;
      case 'suboptimal':
        riskMessage = `⚠️ Cobertura subóptima — PK/PD insuficiente${isXdrRisk ? ' (XDR/PDR: considerar rescate)' : ''}`;
        break;
      case 'adequate':
        riskMessage = pathogen
          ? `✅ Cobertura empírica activa (${pathogen.displayName}) — vigilar evolución clínica`
          : '✅ Cobertura empírica activa';
        break;
      case 'targeted':
        riskMessage = '✅ Tratamiento dirigido por antibiograma — de-escalada si clínica lo permite';
        break;
    }

    return {
      status,
      hoursUncovered,
      deteriorationPct: this.deteriorationLevel,
      riskMessage,
      isXdrRisk,
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE CÁLCULO DE FALSO NEGATIVO
// Para usar desde el componente de cultivos al procesar resultados
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determina si un cultivo positivo debe reportarse como falso negativo.
 * Simula las causas clínicas: antibióticos previos, técnica de toma, tiempo de incubación.
 *
 * @param siteType - Tipo de cultivo
 * @param hasRecentAtbs - Antibióticos activos en las últimas 48h (reducen sensibilidad)
 * @returns true = reportar como NEGATIVO (falso negativo)
 */
export function shouldFalseNegative(
  siteType: CultureSiteType,
  hasRecentAtbs: boolean,
): boolean {
  // Mayor probabilidad de FN con ATBs previos
  const baseProbability = hasRecentAtbs ? FALSE_NEGATIVE_PROBABILITY * 2.5 : FALSE_NEGATIVE_PROBABILITY;

  // Cultivos cualitativos tienen mayor tasa de FN que cuantitativos
  const quantitativeSites: CultureSiteType[] = ['bal', 'tip_cvc', 'tip_arterial', 'tip_hd', 'tip_picc'];
  const fnProbability = quantitativeSites.includes(siteType)
    ? baseProbability * 0.6
    : baseProbability;

  return Math.random() < fnProbability;
}
