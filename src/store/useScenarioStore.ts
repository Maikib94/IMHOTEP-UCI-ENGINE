import { create } from 'zustand';
import type { Vitals, RespiratorySupport, Ventilator, GeneratedPatient, HomeMed, ComorbidityId } from './usePatientStore';
import type { PathologyModifiers, PathologyDomain } from './usePathologyStore';
import type { DrugId } from './usePharmacologyStore';
import type { GenerationConstraints } from '../scenarios/PatientFactory';
import type { LauncherConfig } from '../core/SimulationLauncher';
import { severityEffective as scaleSeverity } from '../utils/severityCurve';
import {
  type ClinicalCategory,
  CLINICAL_CATEGORY_META,
  normalizeCategory,
} from '../types/ClinicalCategory';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/**
 * ScenarioCategory = ClinicalCategory + legacy strings (retro-compat).
 * El LEGACY_CATEGORY_MAP en types/ClinicalCategory.ts mapea los legacy al
 * canónico en runtime (normalizeCategory). Los archivos de escenarios NO se editan.
 */
export type ScenarioCategory =
  | ClinicalCategory
  | 'sepsis' | 'respiratory' | 'surgical' | 'burns' | 'metabolic';

/** Re-export de metadata para consumidores que importan de useScenarioStore */
export const CATEGORY_META = CLINICAL_CATEGORY_META;

export { normalizeCategory };

// Drenajes quirúrgicos — estado del dren post-operatorio
export type SurgicalDrainStatus = 'none' | 'in_situ' | 'recently_removed' | 'high_output' | 'serosanguinolent' | 'purulent';

export interface PathologyConfig {
  domain: PathologyDomain;
  subtype: string | null;
  baseSeverity: number;  // 0-1, antes de escalar por dificultad
}

export interface ScenarioDefinition {
  id: string;
  category: ScenarioCategory;
  name: string;
  description: string;
  baseSeverity: number;   // 0-1 — severidad máxima teórica del escenario
  tags: string[];
  pathologyConfigs: PathologyConfig[];
  initialVitals: Partial<Vitals>;
  initialModifiers?: Partial<PathologyModifiers>;
  recommendedRespSupport?: RespiratorySupport;
  ventilatorPreset?: Partial<Ventilator>;
  isVentilatorConnected?: boolean;
  initialBloodVolumeMl?: number;
  clinicalNotes: string;
  references: string[];
  // ── Metadata quirúrgica ──────────────────────────────────────────────────
  surgicalDrainStatus?: SurgicalDrainStatus;
  // ── Metadata neurocrítica ────────────────────────────────────────────────
  icpCatheterRequired?: boolean;
  icpCatheterType?: 'parenchymal' | 'intraventricular' | null;
  evdActive?: boolean;                   // drenaje ventricular externo
  icpDrainageThreshold_mmHg?: number;    // umbral de drenaje EVD (ej. 20 mmHg)
}

// ─── Escalado logístico de dificultad ─────────────────────────────────────────
//
//  severity_effective = baseSeverity × (1 / (1 + e^(-k × (d − x0))))
//  k = 0.6,  x0 = 5.5  (BIBLIOGRAPHY.md — diseño pedagógico IMHOTEP)
//
//  Dificultad 1  → factor ≈ 0.063  (caso docente, hemodinamia estable)
//  Dificultad 5  → factor ≈ 0.426  (complejidad media)
//  Dificultad 5.5→ factor = 0.500  (punto de inflexión)
//  Dificultad 8  → factor ≈ 0.818  (crítico)
//  Dificultad 10 → factor ≈ 0.937  (catastrófico)
//
/** Re-export para componentes UI */
export { scaleSeverity };

export const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1:  { label: 'Docente',      color: '#34d399' },
  3:  { label: 'Rutinario',    color: '#22d3ee' },
  5:  { label: 'Complejo',     color: '#fbbf24' },
  7:  { label: 'Crítico',      color: '#f97316' },
  10: { label: 'Catastrófico', color: '#ef4444' },
};

export function getDifficultyLabel(d: number): { label: string; color: string } {
  if (d <= 1)  return DIFFICULTY_LABELS[1];
  if (d <= 2)  return DIFFICULTY_LABELS[1];
  if (d <= 4)  return DIFFICULTY_LABELS[3];
  if (d <= 6)  return DIFFICULTY_LABELS[5];
  if (d <= 8)  return DIFFICULTY_LABELS[7];
  return DIFFICULTY_LABELS[10];
}

// CATEGORY_META is now re-exported from types/ClinicalCategory via line 20 above

// ─── 3.E: Home-med steady-state pre-loading ───────────────────────────────────
//
//  Fórmula: Cp_ss = F × (D/τ) / (ke_eff × maxRate)
//  donde ke_eff = 0.693 × clMod / t½_h  →  Cp_ss = F × (D/τ) × t½_h / (0.693 × clMod × maxRate)
//
//  clMod < 1 (p.ej. ERC G5: 0.10) → acumulación 10× → se recorta en setInitialCpRatios (cap 1.5).
//  Ref: Shargel Applied Biopharmaceutics 8ª (fórmula SS dosis múltiple).

const FREQ_TO_H: Readonly<Record<string, number>> = { q24h: 24, q12h: 12, q8h: 8, q6h: 6 };

// Mapea nombres de HomeMed.drug → DrugId del engine (solo los que tienen PK modelado)
const HOME_MED_DRUG_MAP: Readonly<Record<string, string>> = {
  furosemida:     'furosemide_oral',
  enalapril:      'enalapril_oral',
  carvedilol:     'carvedilol_oral',
  amiodarone:     'amiodarone_oral',
  losartan:       'losartan_oral',
  amlodipine:     'amlodipine_oral',
  atenolol:       'atenolol_oral',
  insulina_basal: 'insulin_glargine',
  prednisolona:   'prednisolone_oral',
  dexametasona:   'dexamethasone',
} as const;

function computeSSCpRatios(
  homeMeds: HomeMed[],
  comorbIds: ComorbidityId[],
  catalog: Record<string, { halfLifeMin: number; oralBioavailability?: number; eliminationRoute?: string }>,
  maxDoses: Record<string, number>,
): Partial<Record<DrugId, number>> {
  // Mirror clearance fractions from PharmacologyEngine (2.C) for accurate initial load
  const renalFraction = Math.min(1.0, Math.max(0.05,
    comorbIds.includes('dialisis_hd') ? 0.05 :
    comorbIds.includes('dialisis_pd') ? 0.08 :
    comorbIds.includes('erc_g5')      ? 0.10 :
    comorbIds.includes('erc_g4')      ? 0.22 :
    comorbIds.includes('erc_g3b')     ? 0.37 :
    comorbIds.includes('erc_g3a')     ? 0.52 :
    comorbIds.includes('erc_g2')      ? 0.72 : 1.0,
  ));
  const hepaticFraction =
    comorbIds.includes('cirrosis_c') ? 0.40 :
    comorbIds.includes('cirrosis_b') ? 0.65 :
    comorbIds.includes('cirrosis_a') ? 0.85 : 1.0;

  const result: Partial<Record<DrugId, number>> = {};
  for (const med of homeMeds) {
    const drugId = HOME_MED_DRUG_MAP[med.drug] as DrugId | undefined;
    if (!drugId) continue;
    const tau_h = FREQ_TO_H[med.freq];
    if (!tau_h) continue; // skip PRN
    const def = catalog[drugId];
    if (!def) continue;
    const F = def.oralBioavailability ?? 1.0;
    if (F <= 0) continue;
    const maxRate = maxDoses[drugId];
    if (!maxRate) continue;
    const t_half_h = def.halfLifeMin / 60;
    const route = def.eliminationRoute ?? 'hepatic';
    let clMod = 1.0;
    if (route === 'renal'    || route === 'mixed') clMod *= renalFraction;
    if (route === 'hepatic'  || route === 'mixed') clMod *= hepaticFraction;
    clMod = Math.max(0.05, clMod);
    const cpSS = F * (med.dose / tau_h) * t_half_h / (0.693 * clMod * maxRate);
    if (isFinite(cpSS) && cpSS > 0) {
      result[drugId] = Math.min(1.5, Math.max(result[drugId] ?? 0, cpSS));
    }
  }
  return result;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ScenarioStoreState {
  activeScenario: ScenarioDefinition | null;
  activePatient: GeneratedPatient | null;
  difficulty: number;             // 1–10
  isSimulationStarted: boolean;
  generationMode: 'baseline' | 'random';
  /** Sim tick when the current scenario was started (for clinical day calculation) */
  scenarioStartTick: number;
  /** Set when applyScenario() fails — shown as banner in ScenarioSelectorModal */
  launchError: string | null;

  selectScenario: (scenario: ScenarioDefinition) => void;
  selectPatient: (p: GeneratedPatient | null) => void;
  setDifficulty: (d: number) => void;
  setGenerationMode: (mode: 'baseline' | 'random') => void;
  regenerateRandomPatient: (constraints?: GenerationConstraints) => void;
  applyScenario: (launcherConfig?: LauncherConfig) => void;
  clearLaunchError: () => void;
  resetSimulation: () => void;
}

export const useScenarioStore = create<ScenarioStoreState>((set, get) => ({
  activeScenario: null,
  activePatient: null,
  difficulty: 5,
  isSimulationStarted: false,
  generationMode: 'baseline',
  scenarioStartTick: 0,
  launchError: null,

  selectScenario: (scenario) => set({ activeScenario: scenario }),
  selectPatient: (p) => set({ activePatient: p }),
  setGenerationMode: (mode) => set({ generationMode: mode }),

  regenerateRandomPatient: (constraints) => {
    import('../scenarios/PatientFactory').then(({ generatePatient }) => {
      const cat = get().activeScenario?.category;
      const p = generatePatient({ scenarioCategory: cat, ...constraints });
      set({ activePatient: p });
    });
  },

  setDifficulty: (d) => set({ difficulty: Math.max(1, Math.min(10, d)) }),

  clearLaunchError: () => set({ launchError: null }),

  applyScenario: (launcherConfig?: LauncherConfig) => {
    const { activeScenario, activePatient, difficulty } = get();
    if (!activeScenario) return;

    // Clear any previous launch error
    set({ launchError: null });

    // Importaciones dinámicas — evita módulos circulares en inicialización
    Promise.all([
      import('./usePatientStore'),
      import('./usePathologyStore'),
      import('./useTimeStore'),
      import('../core/PharmacologyEngine'),
      import('./usePharmacologyStore'),
      import('../core/GlycemicEngine'),
      import('../core/AcidBaseEngine'),
      import('../scenarios/PatientFactory'),
    ]).then(([
      { usePatientStore },
      { usePathologyStore },
      { useTimeStore },
      { PharmacologyEngine, DRUG_MAX_DOSES },
      { usePharmacologyStore, DRUG_CATALOG },
      { GlycemicEngine },
      { AcidBaseEngine },
      { generatePatient },
    ]) => {
      const patient   = usePatientStore.getState();
      const pathology = usePathologyStore.getState();
      const time      = useTimeStore.getState();

      // 0. Alias defensivo — add fallbacks where scenario fields could be missing
      const scenario = {
        ...activeScenario,
        pathologyConfigs:  activeScenario.pathologyConfigs  ?? [],
        tags:              activeScenario.tags               ?? [],
        initialVitals:     activeScenario.initialVitals      ?? {},
        clinicalNotes:     activeScenario.clinicalNotes      ?? '',
        references:        activeScenario.references         ?? [],
        baseSeverity:      activeScenario.baseSeverity       ?? 0.5,
      };

      // 1. Reset limpio
      time.pause();
      time.reset();
      pathology.resetAllPathologies();
      patient.resetFluidTracking();
      patient.setBloodVolume(scenario.initialBloodVolumeMl ?? 5000);
      usePharmacologyStore.getState().resetAll();
      PharmacologyEngine.getInstance().reset();
      GlycemicEngine.getInstance().reset();
      AcidBaseEngine.getInstance().reset();
      // Reset cross-cutting engines
      import('../core/ImagingEngine').then(({ ImagingEngine }) => ImagingEngine.getInstance().reset());
      import('../store/useECMOStore').then(({ useECMOStore }) => useECMOStore.getState().resetECMO());
      import('../store/useCRRTStore').then(({ useCRRTStore }) => useCRRTStore.getState().resetCRRT());
      import('../store/useMonitoringStore').then(({ useMonitoringStore }) => useMonitoringStore.getState().clearMonitoring());
      // Reset AcuteMortalityEngine — limpia dangerCounters, activeAlerts e isDeceased para el nuevo caso
      import('../core/AcuteMortalityEngine').then(({ AcuteMortalityEngine }) => AcuteMortalityEngine.getInstance().reset());

      // 2. Vitales iniciales
      if (Object.keys(scenario.initialVitals).length > 0) {
        patient.updateVitals(scenario.initialVitals);
      }

      // 3. Ventilador / soporte respiratorio
      // Default a FALSE cuando no especificado → evita herencia del caso anterior.
      // Solo se conecta ARM si la narrativa lo justifica explícitamente (FASE 2.B).
      patient.setVentilatorConnected(scenario.isVentilatorConnected ?? false);
      if (scenario.ventilatorPreset) {
        patient.setVentilatorSettings(scenario.ventilatorPreset);
      }
      if (scenario.recommendedRespSupport) {
        patient.setRespiratorySupport(scenario.recommendedRespSupport);
      }

      // 4. Activar patologías con severidad escalada por dificultad
      for (const cfg of scenario.pathologyConfigs) {
        const effectiveSev = scaleSeverity(cfg.baseSeverity, difficulty);
        pathology.activatePathology(cfg.domain, cfg.subtype, effectiveSev);
      }

      // 5. Override de modificadores iniciales si el escenario los provee
      if (scenario.initialModifiers) {
        const { NEUTRAL_MODIFIERS } = { NEUTRAL_MODIFIERS: { svrMultiplier: 1.0, capillaryLeakRate: 0, hyperdynamicFactor: 1.0, lungShuntFraction: 0.05, complianceMultiplier: 1.0 } };
        pathology.updateModifiers({ ...NEUTRAL_MODIFIERS, ...scenario.initialModifiers });
      }

      // 6. Aplicar perfil de paciente (override biométrico + hostSensitivity)
      //    Si no hay paciente seleccionado, auto-generar uno coherente con el escenario.
      //    Esto previene el estado "Generando perfil..." permanente en PatientInfoModal.
      // Force female patient for obstetric scenarios
      let patientToApply = activePatient;
      if (scenario.category === 'obstetricia' && activePatient && (activePatient as {sex?: string}).sex !== 'F') {
        console.warn('[IMHOTEP·SCENARIO] Paciente regenerado — obstétrico requiere sexo F');
        patientToApply = null as never;
      }
      patientToApply = patientToApply ?? generatePatient({
        scenarioCategory: scenario.category,
        forcedSex: scenario.category === 'obstetricia' ? 'F' : undefined,
      });
      if (patientToApply !== activePatient) {
        set({ activePatient: patientToApply });
      }

      if (Object.keys(patientToApply.baseVitals).length > 0) {
        patient.updateVitals(patientToApply.baseVitals);
      }
      patient.setProfile(patientToApply);

      // 3.E: Pre-cargar medicación crónica en estado estable
      //  Cp_ss = F × (D/τ) × t½_h / (0.693 × clMod × maxRate)
      //  Ref: Shargel Applied Biopharmaceutics 8ª (SS dosis múltiple oral)
      if (patientToApply.homeMeds?.length) {
        const ssMap = computeSSCpRatios(
          patientToApply.homeMeds,
          patientToApply.comorbidityIds ?? [],
          DRUG_CATALOG as Record<string, { halfLifeMin: number; oralBioavailability?: number; eliminationRoute?: string }>,
          DRUG_MAX_DOSES as Record<string, number>,
        );
        PharmacologyEngine.getInstance().setInitialCpRatios(ssMap);
      }

      // 7. Aplicar configuración de launcher (O2 strategy, ARM, FiO₂…)
      //    DEBE ir DESPUÉS de todo el setup del escenario para no ser sobrescrito.
      if (launcherConfig) {
        import('../core/SimulationLauncher').then(({ applyLauncherConfig }) => {
          applyLauncherConfig(launcherConfig);
        });
      }

      // 8a. Auto-sincronización Fase 6 — category del escenario → caseCategory
      //  Esto activa las visibilidades condicionales de Fase 2 (curva PIC, ART)
      //  y los hallazgos deterministas de ImagingEngine (Fase 3).
      const canonicalCat = normalizeCategory(scenario.category as string);
      pathology.setCaseCategory(canonicalCat);

      // 8. Arrancar simulación
      set({ isSimulationStarted: true, scenarioStartTick: time.ticks });
      time.start();
    }).catch((err: unknown) => {
      // Surface the error — prevents silent "nothing happens" UX on crash
      const message = err instanceof Error ? err.message : String(err);
      console.error('[IMHOTEP·LAUNCH] applyScenario failed:', err);
      set({ launchError: message, isSimulationStarted: false });
    });
  },

  resetSimulation: () => {
    Promise.all([
      import('./usePatientStore'),
      import('./usePathologyStore'),
      import('./useTimeStore'),
      import('./useMortalityStore'),
    ]).then(([{ usePatientStore }, { usePathologyStore }, { useTimeStore }, { useMortalityStore }]) => {
      useTimeStore.getState().pause();
      useTimeStore.getState().reset();
      usePathologyStore.getState().resetAllPathologies();
      usePatientStore.getState().resetFluidTracking();
      // Reset motor de mortalidad aguda — limpia dangerCounters e isDeceased
      useMortalityStore.getState().reset();
    });
    set({ isSimulationStarted: false, activeScenario: null, activePatient: null, launchError: null, scenarioStartTick: 0 });
  },
}));
