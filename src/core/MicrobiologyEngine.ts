// src/core/MicrobiologyEngine.ts
// Blueprint 021-C — Motor de Microbiología Completo
//
// NOVEDADES v021-C:
//   - cultivos retornan en 48h con patógeno ALEATORIO ponderado por sitio (ENVIN-HELICS 2023)
//   - auto-asignación de patógeno al activar sepsis (1ra vez)
//   - virulenceMultiplier: XDR/PDR patógenos aceleran progresión séptica
//   - nefrotoxicidad real: Vancomicina trough + Colistina + Aminoglucósidos → ↑Cr
//   - alerta de cobertura insuficiente exportada al store
//   - PK multicompartimento simplificada (V1, kElim)
//
// Bibliografía:
//   - Sanford Guide 2025, IDSA guidelines, ENVIN-HELICS 2023
//   - Estudio MERINO (Harris, NEJM 2018), REPROVE, ASPECT-NP, CREDIBLE-CR
//   - IDSA XDR-GNB Guidance 2023 (CAZ-AVI + ATM, Cefiderocol)
//   - Roberts JA: Optimizing Antibiotics in ICU (Intensive Care Med 2012)

import { usePatientStore }    from '../store/usePatientStore';
import { usePathologyStore }  from '../store/usePathologyStore';
import { useTimeStore }       from '../store/useTimeStore';
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
  type CultureSiteType,
} from '../store/useMicrobiologyStore';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES PK/PD (Sanford 2025)
// ══════════════════════════════════════════════════════════════════════════════

const LN2                = Math.log(2);
const TIME_DEP_TARGET    = 0.40;  // T>MIC ≥ 40% del intervalo
const AUC_MIC_TARGET     = 400;   // AUC24/MIC ≥ 400 (Vanco ASHP/IDSA 2020)
const CONC_MIC_TARGET    = 8;     // Cmax/MIC ≥ 8 (Colistina, Aminoglucósidos)
const VANCO_TROUGH_TOXIC = 20;    // μg/mL — nefrotóxico (ASHP/IDSA 2020)

// Modificadores de progresión de sepsis por efficacy del tratamiento
const MOD_NONE          =  1.0;   // Sin ATB → progresión normal
const MOD_MISMATCH      =  1.25;  // ATB R → presión selectiva + peor
const MOD_SUBOPTIMAL    =  0.25;  // ATB S pero PK subóptima → freno parcial
const MOD_EMPIRIC_MATCH = -0.30;  // ATB S + PK ok + sin antibiograma
const MOD_TARGETED      = -0.55;  // ATB S + PK ok + antibiograma confirmado

// ROSE thresholds
const ROSE_MAP_STABLE     = 65;
const ROSE_MAP_STABLE_DUR = 1800;
const ROSE_LACTATE_CLEAR  = 2.0;
const ROSE_CLEARANCE_PCT  = 0.30;
const ROSE_STAB_NO_BOLUS  = 21600;

// Virulencia multiplicativa por fenotipo (acelera sepsis en ausencia de ATB activo)
const VIRULENCE_BY_PHENOTYPE: Record<string, number> = {
  wild:         1.0,
  esbl:         1.1,
  mrsa:         1.15,
  mdr:          1.25,
  carbapenemase:1.3,
  xdr:          1.45,
};

// ══════════════════════════════════════════════════════════════════════════════
// TABLAS DE PROBABILIDAD DE PATÓGENOS POR SITIO DE CULTIVO
// Basado en: ENVIN-HELICS 2023, EPIC-III 2023, SCOPE 2021, IDSA guidelines
// ══════════════════════════════════════════════════════════════════════════════

type SiteOddsTable = Record<string, number>; // pathogenId → peso (0–1, se normaliza internamente)

const SITE_PATHOGEN_ODDS: Partial<Record<CultureSiteType, SiteOddsTable>> = {

  // ── Hemocultivos periféricos (SCOPE 2021 / Weinstein 1997) ────────────────
  blood_peripheral_1: {
    saureus_mrsa:            0.18,
    saureus_mssa:            0.14,
    kpneumo_esbl:            0.12,
    ecoli_wild:              0.10,
    kpneumo_kpc:             0.07,
    kpneumo_ndm:             0.04,
    candida_albicans:        0.08,
    candida_auris:           0.03,
    paeru_mdr:               0.06,
    acinetobacter_xdr:       0.04,
    spneumo:                 0.05,
    listeria_monocytogenes:  0.02,
    efaecium_vre:            0.05,
    NEGATIVE:                0.02,  // 2% racha negativa (bacteriemia transitoria)
  },
  blood_peripheral_2: {
    saureus_mrsa:            0.18,
    saureus_mssa:            0.14,
    kpneumo_esbl:            0.12,
    ecoli_wild:              0.10,
    kpneumo_kpc:             0.07,
    kpneumo_ndm:             0.04,
    candida_albicans:        0.08,
    candida_auris:           0.03,
    paeru_mdr:               0.06,
    acinetobacter_xdr:       0.04,
    spneumo:                 0.05,
    listeria_monocytogenes:  0.02,
    efaecium_vre:            0.05,
    NEGATIVE:                0.02,
  },

  // ── Retrocultivos / CLABSI (CDC NHSN 2022 — CVC top germs) ──────────────
  retroculture_cvc: {
    saureus_mrsa:            0.25,
    saureus_mssa:            0.15,
    kpneumo_esbl:            0.12,
    kpneumo_kpc:             0.08,
    candida_albicans:        0.10,
    paeru_mdr:               0.08,
    ecoli_wild:              0.06,
    acinetobacter_xdr:       0.05,
    efaecium_vre:            0.06,
    NEGATIVE:                0.05,
  },
  retroculture_arterial: {
    saureus_mrsa:            0.22,
    saureus_mssa:            0.18,
    kpneumo_esbl:            0.15,
    ecoli_wild:              0.10,
    paeru_mdr:               0.10,
    candida_albicans:        0.08,
    NEGATIVE:                0.17,
  },
  retroculture_hd: {
    saureus_mrsa:            0.28,
    saureus_mssa:            0.15,
    kpneumo_esbl:            0.15,
    ecoli_wild:              0.08,
    candida_albicans:        0.10,
    paeru_mdr:               0.08,
    efaecium_vre:            0.08,
    NEGATIVE:                0.08,
  },

  // ── Tips catéter — cultivo Maki (igual distribución retrocultivo) ─────────
  tip_cvc:      { saureus_mrsa: 0.28, saureus_mssa: 0.18, kpneumo_esbl: 0.12, paeru_mdr: 0.10, candida_albicans: 0.08, ecoli_wild: 0.06, efaecium_vre: 0.08, NEGATIVE: 0.10 },
  tip_arterial: { saureus_mrsa: 0.25, saureus_mssa: 0.20, kpneumo_esbl: 0.15, paeru_mdr: 0.10, ecoli_wild: 0.10, NEGATIVE: 0.20 },
  tip_hd:       { saureus_mrsa: 0.30, saureus_mssa: 0.15, kpneumo_esbl: 0.15, ecoli_wild: 0.08, efaecium_vre: 0.12, NEGATIVE: 0.20 },
  tip_picc:     { saureus_mrsa: 0.22, saureus_mssa: 0.20, kpneumo_esbl: 0.12, ecoli_wild: 0.10, NEGATIVE: 0.36 },

  // ── LCR (IDSA Meningitis/Encephalitis 2017 + EPIC-III) ──────────────────
  csf: {
    spneumo:                 0.35,
    listeria_monocytogenes:  0.15,
    kpneumo_esbl:            0.08,
    cryptococcus_neoformans: 0.12,
    saureus_mrsa:            0.05,
    paeru_mdr:               0.05,
    NEGATIVE:                0.20,
  },

  // ── Líquidos corporales ───────────────────────────────────────────────────
  fluid_abdominal: {
    ecoli_wild:              0.25,
    kpneumo_esbl:            0.18,
    paeru_mdr:               0.12,
    candida_albicans:        0.10,
    saureus_mrsa:            0.08,
    acinetobacter_xdr:       0.06,
    NEGATIVE:                0.21,
  },
  fluid_pericardial: {
    spneumo:                 0.20,
    saureus_mrsa:            0.20,
    saureus_mssa:            0.15,
    kpneumo_esbl:            0.10,
    ecoli_wild:              0.08,
    NEGATIVE:                0.27,
  },
  fluid_pleural: {
    spneumo:                 0.22,
    kpneumo_esbl:            0.15,
    ecoli_wild:              0.12,
    saureus_mrsa:            0.12,
    paeru_mdr:               0.08,
    acinetobacter_xdr:       0.06,
    NEGATIVE:                0.25,
  },

  // ── Vía aérea — NAV (ENVIN-HELICS 2023) ──────────────────────────────────
  tracheal_secretion: {
    paeru_mdr:               0.28,
    acinetobacter_xdr:       0.18,
    kpneumo_esbl:            0.15,
    saureus_mrsa:            0.12,
    kpneumo_kpc:             0.08,
    paeru_pdr:               0.05,
    ecoli_wild:              0.06,
    spneumo:                 0.05,
    NEGATIVE:                0.03,
  },
  bal: {
    paeru_mdr:               0.28,
    acinetobacter_xdr:       0.18,
    kpneumo_esbl:            0.15,
    saureus_mrsa:            0.12,
    kpneumo_kpc:             0.08,
    paeru_pdr:               0.05,
    ecoli_wild:              0.06,
    aspergillus_fumigatus:   0.04,
    NEGATIVE:                0.04,
  },
  // ── Urocultivos — Wen Y et al. PLoS ONE 2025; Islam MA et al. PLoS ONE 2022 ──
  // Comunidad: E. coli 51.6%, K. pneumoniae 11.9%, S. saprophyticus 8.3%
  // Hospital/ESBL: Shkalim Zemer V et al. Pathogens 2024 — ESBL 6→25%
  urine_catheter: {
    ecoli_wild:              0.35,   // E. coli sensible comunidad
    ecoli_esbl:              0.15,   // E. coli ESBL (catéter = riesgo nosocomial)
    kpneumo_esbl:            0.15,   // K. pneumoniae ESBL
    paeru_mdr:               0.10,   // P. aeruginosa (catéter prolongado)
    efaecium_vre:            0.10,   // Enterococcus (sonda prolongada)
    candida_albicans:        0.08,   // Candida (catéter + ATB previo)
    NEGATIVE:                0.07,
  },
  urine_midstream: {
    ecoli_wild:              0.52,   // E. coli comunidad predominante
    kpneumo_community:       0.13,
    efaecalis:               0.08,
    spneumo:                 0.04,   // S. agalactiae proxy
    paeru_mdr:               0.04,
    candida_albicans:        0.03,
    NEGATIVE:                0.16,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// SELECCIÓN PONDERADA (weighted random)
// ══════════════════════════════════════════════════════════════════════════════

function weightedPick(table: SiteOddsTable): string {
  const entries = Object.entries(table);
  const total   = entries.reduce((s, [, w]) => s + w, 0);
  let   rng     = Math.random() * total;
  for (const [pathogenId, weight] of entries) {
    rng -= weight;
    if (rng <= 0) return pathogenId;
  }
  return entries[entries.length - 1][0];
}

// Seleccionar pathogen para un sitio dado; si hiddenPathogenId ya está asignado → usarlo
function pickPathogenForSite(
  siteType: CultureSiteType,
  hiddenId: string | null,
): string | null {
  // Si ya hay patógeno asignado → coherencia pedagógica
  if (hiddenId && PATHOGEN_CATALOG[hiddenId]) return hiddenId;

  const table = SITE_PATHOGEN_ODDS[siteType];
  if (!table) return null;

  const pick = weightedPick(table);
  return pick === 'NEGATIVE' ? null : pick;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export class MicrobiologyEngine {
  private static instance: MicrobiologyEngine | null = null;
  private previousSepsisActive = false;

  private constructor() {}

  public static getInstance(): MicrobiologyEngine {
    if (!MicrobiologyEngine.instance)
      MicrobiologyEngine.instance = new MicrobiologyEngine();
    return MicrobiologyEngine.instance;
  }

  public update(dt: number): void {
    const micro  = useMicrobiologyStore.getState();
    const sepsis = usePathologyStore.getState().sepsis;

    const simElapsed = useTimeStore.getState().simulatedElapsed;

    // ── Auto-asignación de patógeno al ACTIVAR sepsis por primera vez ──────
    if (sepsis.isActive && !this.previousSepsisActive) {
      this.autoAssignPathogenOnSepsisStart(micro.hiddenPathogenId, simElapsed);
    }
    this.previousSepsisActive = sepsis.isActive;

    // Solo continuar si sepsis activa
    if (!sepsis.isActive) return;

    // 1. PK antibióticos activos
    const updatedATBs = this.updatePK(micro.activeAntibiotics, simElapsed, dt);

    // 2. Madurar cultivos con RNG ponderado por sitio
    const { updatedCultures, pathogenActuallyAssigned } = this.matureCulturesWithRng(
      micro.cultures,
      micro.hiddenPathogenId,
      simElapsed,
    );

    // Si maturación reveló un pathogen nuevo → guardar en store
    if (pathogenActuallyAssigned && pathogenActuallyAssigned !== micro.hiddenPathogenId) {
      useMicrobiologyStore.getState().assignPathogen(pathogenActuallyAssigned);
    }

    // 3. Eficacia del tratamiento
    const effectivePathogenId = pathogenActuallyAssigned ?? micro.hiddenPathogenId;
    const hasCultureResult = updatedCultures.some(
      (c) => c.result !== null && c.result.isPositive
    );
    const { efficacy, modifier } = this.computeEfficacy(
      updatedATBs,
      effectivePathogenId,
      hasCultureResult,
    );

    // 4. Virulencia del patógeno: multiplica el modificador cuando sin cobertura
    const virulenceBoost = this.computeVirulenceBoost(effectivePathogenId, efficacy);
    const finalModifier  = modifier > 0 ? modifier * virulenceBoost : modifier;

    // 5. ROSE
    const updatedROSE = this.updateROSE(micro.rose, simElapsed, dt);

    // 6. Nefrotoxicidad real → creatinina
    this.applyNephrotoxicity(updatedATBs, dt);

    // 7. Revelar germen cuando primer cultivo positivo resuelve
    // (FASE 6.A): revealedGerm permanece null hasta que el laboratorio entrega resultado.
    const firstPositive = updatedCultures.find(c => c.status === 'positive' && c.result?.isPositive);
    const newRevealedGerm = firstPositive?.result?.pathogenId ?? null;
    if (newRevealedGerm && newRevealedGerm !== micro.revealedGerm) {
      useMicrobiologyStore.getState().revealGerm(newRevealedGerm);
    }

    // 6.C: appropriateCoverage — true si ATBs cubren el germen real
    const appropriateCoverage = efficacy === 'empiric_match' || efficacy === 'targeted';

    // 8. Escribir estado
    micro._engineUpdate({
      activeAntibiotics:         updatedATBs,
      cultures:                  updatedCultures,
      treatmentEfficacy:         efficacy,
      sepsisProgressionModifier: finalModifier,
      rose:                      updatedROSE,
      appropriateCoverage,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUTO-ASIGNACIÓN DE PATÓGENO AL ACTIVAR SEPSIS
  // ════════════════════════════════════════════════════════════════════════════

  private autoAssignPathogenOnSepsisStart(
    currentHiddenId: string | null,
    simElapsed: number,
  ): void {
    const micro = useMicrobiologyStore.getState();

    // Registrar el momento de activación de sepsis para Time-to-Antibiotic
    if (micro.sscBundle.sepsisActivatedAt === 0) {
      micro._engineUpdate({
        sscBundle: { ...micro.sscBundle, sepsisActivatedAt: simElapsed },
      });
    }

    if (currentHiddenId && PATHOGEN_CATALOG[currentHiddenId]) return; // ya asignado

    const pick = this.selectGermByProfile();
    if (pick && pick !== 'NEGATIVE' && PATHOGEN_CATALOG[pick]) {
      useMicrobiologyStore.getState().assignPathogen(pick);
    }
  }

  /**
   * Selecciona germen ocultando la verdad epidemiológica según:
   *   1. Exposición hospitalaria (comorbilidades del paciente)
   *   2. Foco anatómico (subtype de sepsis)
   *   3. Dificultad del escenario (resistencia)
   *
   * FASE 6.B — Refs: Tamma PD et al. CID 2024 (IDSA AMR guidance);
   *            ENVIN-HELICS 2023; Sanford Guide 2025.
   */
  private selectGermByProfile(): string | null {
    const pat      = usePatientStore.getState();
    const pathology = usePathologyStore.getState();
    const comorbIds = pat.comorbidityIds ?? [];

    // 1. Detección de exposición hospitalaria
    const hospitalExposure =
      comorbIds.includes('dialisis_hd')                ||
      comorbIds.includes('dialisis_pd')                ||
      comorbIds.includes('inmunosupresion_trasplante') ||
      comorbIds.includes('inmunosupresion_qt')         ||
      comorbIds.includes('inmunosupresion_hiv');

    // 2. Foco infeccioso desde patología activa
    const sepsisSubtype = (pathology.sepsis?.isActive ? pathology.sepsis : null);

    // Mapear foco a tabla de sitio de cultivo:
    // Usamos las tablas de SITE_PATHOGEN_ODDS para gérmenes representativos de cada foco.
    type FocusKey = 'pulmonary' | 'urinary' | 'abdominal' | 'default';
    const focusKey: FocusKey =
      sepsisSubtype ? (
        /pulmon|neumon/i.test(JSON.stringify(sepsisSubtype)) ? 'pulmonary' :
        /urin|itu|pielonefr/i.test(JSON.stringify(sepsisSubtype)) ? 'urinary' :
        /abdom|periton|intraabdom/i.test(JSON.stringify(sepsisSubtype)) ? 'abdominal' :
        'default'
      ) : 'default';

    // 3. Tablas de gérmenes por foco (comunitario vs hospitalario)
    const COMMUNITY_POOLS: Record<FocusKey, string[]> = {
      pulmonary: ['spneumoniae', 'haemophilus_influenzae', 'spneumoniae', 'kpneumoniae_wild'],
      urinary:   ['ecoli_esbl', 'ecoli_wild', 'ecoli_wild', 'kpneumoniae_wild'],
      abdominal: ['ecoli_wild', 'ecoli_esbl', 'saureus_mssa', 'kpneumoniae_wild'],
      default:   ['ecoli_wild', 'spneumoniae', 'saureus_mssa', 'kpneumoniae_wild'],
    };
    const HOSPITAL_POOLS: Record<FocusKey, string[]> = {
      pulmonary: ['pseudomonas_aeruginosa', 'kpneumoniae_kpc', 'saureus_mrsa', 'acinetobacter_baumanii_xdr'],
      urinary:   ['ecoli_esbl', 'kpneumoniae_kpc', 'pseudomonas_aeruginosa', 'efaecium_vre'],
      abdominal: ['ecoli_esbl', 'kpneumoniae_kpc', 'efaecium_vre', 'candida_albicans'],
      default:   ['saureus_mrsa', 'pseudomonas_aeruginosa', 'kpneumoniae_kpc', 'ecoli_esbl'],
    };

    const pool = hospitalExposure ? HOSPITAL_POOLS[focusKey] : COMMUNITY_POOLS[focusKey];

    // 4. Filtrar a gérmenes que existen en el catálogo
    const validPool = pool.filter(id => id in PATHOGEN_CATALOG);

    if (validPool.length === 0) {
      // Fallback a tabla de hemocultivo
      const bloodTable = SITE_PATHOGEN_ODDS['blood_peripheral_1'];
      if (!bloodTable) return null;
      const pick = weightedPick(bloodTable);
      return pick !== 'NEGATIVE' ? pick : null;
    }

    // 5. Selección aleatoria uniforme dentro del pool
    return validPool[Math.floor(Math.random() * validPool.length)];
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

      const halfLifeS     = def.halfLifeHours * 3600;
      const doseIntervalS = def.doseIntervalHours * 3600;
      const kElim         = LN2 / halfLifeS;

      // Decaimiento exponencial
      let conc = atb.serumConcentration * Math.exp(-kElim * dt);

      // Auto-redosificación
      let lastDoseAt  = atb.lastDoseAt;
      const timeSince = simElapsed - lastDoseAt;
      if (timeSince >= doseIntervalS) {
        conc      += def.peakConcentration;
        lastDoseAt = simElapsed;
      }
      conc = Math.max(0, conc);

      // Trough estimado
      const timeToNext = doseIntervalS - (simElapsed - lastDoseAt);
      const trough     = conc * Math.exp(-kElim * Math.max(0, timeToNext));

      // AUC24 simplificada (trapezoidal 1er orden)
      const avgConc = def.peakConcentration *
        (1 - Math.exp(-kElim * doseIntervalS)) / (kElim * doseIntervalS);
      const auc24 = avgConc * 24;

      // T>MIC
      const tAboveMIC = this.computeTAboveMIC(atb, def, conc, kElim, doseIntervalS);

      return {
        ...atb,
        lastDoseAt,
        serumConcentration: Math.round(conc * 100) / 100,
        troughLevel:        Math.round(Math.max(0, trough) * 100) / 100,
        auc24:              Math.round(auc24 * 10) / 10,
        timeSinceLastDose:  simElapsed - lastDoseAt,
        tAboveMIC,
      };
    });
  }

  private computeTAboveMIC(
    atb: ActiveAntibiotic,
    def: { peakConcentration: number; pkpdType: string },
    _currentConc: number,
    kElim: number,
    doseIntervalS: number,
  ): number {
    if (def.pkpdType !== 'time') return 0;

    const micro    = useMicrobiologyStore.getState();
    const pathogen = micro.hiddenPathogenId
      ? PATHOGEN_CATALOG[micro.hiddenPathogenId]
      : null;
    if (!pathogen) return 0;

    const sens = pathogen.sensitivities[atb.antibioticId];
    if (!sens || sens.sensitivity === 'R' || sens.sensitivity === 'INTRINSEC_R') return 0;

    const mic = sens.mic;
    if (def.peakConcentration <= mic) return 0;

    const tAboveMICSeconds = Math.log(def.peakConcentration / mic) / kElim;
    let fraction = tAboveMICSeconds / doseIntervalS;

    if (atb.extendedInfusion) {
      const bonus = ANTIBIOTIC_CATALOG[atb.antibioticId]?.extendedBonus ?? 0;
      fraction   += bonus;
    }

    return Math.max(0, Math.min(1, fraction));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MADURAR CULTIVOS CON RNG PONDERADO
  // ════════════════════════════════════════════════════════════════════════════

  private matureCulturesWithRng(
    cultures: Culture[],
    hiddenPathogenId: string | null,
    simElapsed: number,
  ): { updatedCultures: Culture[]; pathogenActuallyAssigned: string | null } {
    const instantResults = usePatientStore.getState().instantResults ?? false;
    let pathogenActuallyAssigned: string | null = hiddenPathogenId;

    const updatedCultures = cultures.map((cx) => {
      if (cx.result !== null) return cx; // ya procesado

      const ready = instantResults ? true : (simElapsed >= cx.readyAt);
      if (!ready) {
        // Actualizar status visual a 'in_progress' si pasó la mitad del tiempo
        const halfTime = (cx.readyAt - cx.orderedAt) / 2;
        if (simElapsed >= cx.orderedAt + halfTime && cx.status === 'pending') {
          return { ...cx, status: 'in_progress' as const };
        }
        return cx;
      }

      // --- Contaminación hemocultivo: 10% en botella #2 (S. epidermidis) ----
      // Simula contaminante cutáneo en 1/2 botellas — no modifica hiddenPathogenId.
      // Criterio clínico: CoNS en UNA sola botella = probable contaminante (IDSA CLABSI).
      if (cx.siteType === 'blood_peripheral_2' && !hiddenPathogenId && Math.random() < 0.10) {
        return {
          ...cx,
          status: 'positive' as const,
          result: {
            isPositive:    true,
            pathogenId:    's_epidermidis_contaminant',
            pathogenName:  'S. epidermidis (Probable Contaminante)',
            gramStainDesc: 'Cocos Gram+ en pares — flora cutánea normal',
            sensitivities: { vancomycin: 'S' as const, oxacillin: 'S' as const, linezolid: 'S' as const },
            mics:          { vancomycin: 0.5, oxacillin: 0.25, linezolid: 1 },
            clinicalNote:  '⚠️ Crecimiento en BOTELLA 2 únicamente — probablemente contaminante. ' +
                           'Evaluar: ≥2/2 botellas + clínica CLABSI para bacteriemia real (IDSA 2022). ' +
                           'No tratar si botella #1 negativa y sin signos de CLABSI.',
          } as CultureResult,
        };
      }

      // --- Seleccionar patógeno para este cultivo ---
      const resolvedPathogenId = pickPathogenForSite(cx.siteType, hiddenPathogenId);

      // Guardar para retorno (el último cultivo positivo gana)
      if (resolvedPathogenId && resolvedPathogenId !== hiddenPathogenId) {
        pathogenActuallyAssigned = resolvedPathogenId;
      }

      if (!resolvedPathogenId) {
        // Cultivo NEGATIVO
        return {
          ...cx,
          result: {
            isPositive:    false,
            pathogenId:    '',
            pathogenName:  'Sin desarrollo',
            gramStainDesc: 'Sin desarrollo bacteriano/fúngico en 48h',
            sensitivities: {},
            mics:          {},
          } as CultureResult,
          status: 'negative' as const,
        };
      }

      const pathogen = PATHOGEN_CATALOG[resolvedPathogenId];
      if (!pathogen) {
        return { ...cx, status: 'negative' as const, result: { isPositive: false, pathogenId: '', pathogenName: '', gramStainDesc: '', sensitivities: {}, mics: {} } };
      }

      // Construir antibiograma completo
      const sensitivities: Record<string, SensitivityClass> = {};
      const mics: Record<string, number> = {};
      for (const [atbId, info] of Object.entries(pathogen.sensitivities)) {
        sensitivities[atbId] = info.sensitivity;
        mics[atbId]          = info.mic;
      }

      // Añadir nota clínica si patógeno XDR/PDR
      let clinicalNote: string | undefined;
      if (pathogen.phenotype === 'xdr') {
        clinicalNote = `⚠️ Patógeno XDR detectado — revisar opciones de rescate. Mecanismos: ${pathogen.resistanceMechs.join(', ')}`;
      } else if (pathogen.phenotype === 'carbapenemase') {
        clinicalNote = `⚠️ Carbapenemasa detectada — confirmar genotipo (KPC vs MBL). Mecanismos: ${pathogen.resistanceMechs.join(', ')}`;
      }

      // Añadir tinta china si es Cryptococcus y es LCR
      const indiaInk = pathogen.id === 'cryptococcus_neoformans' &&
        (cx.siteType === 'csf' || cx.siteType === 'genexpert_csf');

      const result: CultureResult = {
        isPositive:    true,
        pathogenId:    pathogen.id,
        pathogenName:  pathogen.displayName,
        gramStainDesc: pathogen.gramStainDesc,
        sensitivities,
        mics,
        indiaInk,
        clinicalNote,
      };

      return { ...cx, result, status: 'positive' as const };
    });

    return { updatedCultures, pathogenActuallyAssigned };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. EFICACIA DEL TRATAMIENTO
  // ════════════════════════════════════════════════════════════════════════════

  private computeEfficacy(
    atbs: ActiveAntibiotic[],
    pathogenId: string | null,
    hasCultureResult: boolean,
  ): { efficacy: TreatmentEfficacy; modifier: number } {

    if (atbs.length === 0)                                          return { efficacy: 'none', modifier: MOD_NONE };
    if (!pathogenId || !PATHOGEN_CATALOG[pathogenId])               return { efficacy: 'none', modifier: MOD_NONE };

    const pathogen = PATHOGEN_CATALOG[pathogenId];

    // ── IDSA 2023: Sinergismo CAZ-AVI + Aztreonam para MBL ──────────────────
    // Mecanismo: avibactam (de CAZ-AVI) protege el aztreonam de hidrólisis por
    // serina-β-lactamasas (BLEE/KPC/OXA-48) co-presentes en organismos NDM/VIM.
    // El aztreonam es estable frente a metalo-β-lactamasas (MBL) por su anillo
    // monocíclico. La combinación cubre el fenotipo XDR-MBL que ningún agente
    // simple cubre. Ref: van Duin D, CID 2020; IDSA Guidance XDR-GNB 2023.
    if (this.hasCazAviAzmSynergy(atbs, pathogen)) {
      const eff: TreatmentEfficacy = hasCultureResult ? 'targeted' : 'empiric_match';
      return { efficacy: eff, modifier: hasCultureResult ? MOD_TARGETED : MOD_EMPIRIC_MATCH };
    }

    let   bestContribution = -Infinity;
    let   anyMismatch      = false;

    for (const atb of atbs) {
      const def  = ANTIBIOTIC_CATALOG[atb.antibioticId];
      const sens = pathogen.sensitivities[atb.antibioticId];
      if (!def || !sens) continue;

      if (sens.sensitivity === 'R' || sens.sensitivity === 'INTRINSEC_R') {
        anyMismatch = true;
        bestContribution = Math.max(bestContribution, -0.1);
        continue;
      }
      if (sens.sensitivity === 'I') {
        bestContribution = Math.max(bestContribution, 0.3);
        continue;
      }

      // Sensible — evaluar PK/PD target
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

      bestContribution = Math.max(bestContribution, pkpdMet ? 1.0 : 0.5);
    }

    if (bestContribution >= 1.0) {
      const efficacy: TreatmentEfficacy = hasCultureResult ? 'targeted' : 'empiric_match';
      return { efficacy, modifier: hasCultureResult ? MOD_TARGETED : MOD_EMPIRIC_MATCH };
    }
    if (bestContribution >= 0.3) return { efficacy: 'suboptimal', modifier: MOD_SUBOPTIMAL };
    if (anyMismatch)              return { efficacy: 'mismatch',   modifier: MOD_MISMATCH  };

    return { efficacy: 'none', modifier: MOD_NONE };
  }

  // ── Detección sinergismo CAZ-AVI + Aztreonam (IDSA XDR-GNB 2023) ──────────
  // Condiciones: ambos agentes activos + patógeno porta MBL (NDM/VIM/IMP).
  // CAZ-AVI aporta avibactam que protege ATM de hidrólisis por serina-enzimas
  // co-existentes; ATM cubre MBL porque las metalo-β-lactamasas no lo hidrolizan.
  private hasCazAviAzmSynergy(
    atbs:    ActiveAntibiotic[],
    pathogen: (typeof PATHOGEN_CATALOG)[string],
  ): boolean {
    const hasCazAvi    = atbs.some(a => a.antibioticId === 'ceftazidime_avi');
    const hasAztreonam = atbs.some(a => a.antibioticId === 'aztreonam');
    if (!hasCazAvi || !hasAztreonam) return false;

    // Solo activo si el patógeno porta metalo-β-lactamasa (NDM, VIM, IMP)
    const mblMarkers = ['NDM', 'VIM', 'IMP'];
    return pathogen.resistanceMechs.some(m =>
      mblMarkers.some(mbl => m.toUpperCase().includes(mbl))
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. VIRULENCIA POR FENOTIPO
  // Amplifica el modificador positivo (deterioro) en patógenos más agresivos
  // cuando no hay cobertura efectiva
  // ════════════════════════════════════════════════════════════════════════════

  private computeVirulenceBoost(
    pathogenId: string | null,
    efficacy:   TreatmentEfficacy,
  ): number {
    if (!pathogenId || !PATHOGEN_CATALOG[pathogenId]) return 1.0;
    if (efficacy === 'targeted' || efficacy === 'empiric_match') return 1.0; // tratamiento correcto

    const phenotype = PATHOGEN_CATALOG[pathogenId].phenotype ?? 'wild';
    return VIRULENCE_BY_PHENOTYPE[phenotype] ?? 1.0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. PROTOCOLO ROSE
  // ════════════════════════════════════════════════════════════════════════════

  private updateROSE(rose: ROSEState, simElapsed: number, _dt: number): ROSEState {
    const pat = usePatientStore.getState();
    const v   = pat.vitals;
    const map = v.meanArterialPressure;
    const lac = v.lactate ?? 1.0;
    const wt  = v.weight || 70;

    const updated = { ...rose };

    updated.totalFluidGiven    = pat.crystalloidAccumulated ?? 0;
    updated.fluidBalance       = updated.totalFluidGiven;
    updated.pulmonaryEdemaRisk = Math.max(0, Math.min(1, updated.fluidBalance / (wt * 100)));

    if (map >= ROSE_MAP_STABLE) {
      if (updated.mapStableSince === null) updated.mapStableSince = simElapsed;
    } else {
      updated.mapStableSince = null;
    }
    const mapStableDuration = updated.mapStableSince !== null ?
      simElapsed - updated.mapStableSince : 0;

    if (simElapsed - updated.lastLactateSampleAt >= 7200) {
      if (updated.lastLactateValue > 0) {
        updated.lactateClearancePct = (updated.lastLactateValue - lac) / updated.lastLactateValue;
      }
      updated.lastLactateValue   = lac;
      updated.lastLactateSampleAt = simElapsed;
    }

    switch (updated.currentPhase) {
      case 'R':
        if (mapStableDuration >= ROSE_MAP_STABLE_DUR) { updated.currentPhase = 'O'; updated.phaseEnteredAt = simElapsed; }
        break;
      case 'O':
        if (lac < ROSE_LACTATE_CLEAR || updated.lactateClearancePct >= ROSE_CLEARANCE_PCT) { updated.currentPhase = 'S'; updated.phaseEnteredAt = simElapsed; }
        if (map < ROSE_MAP_STABLE && updated.mapStableSince === null) { updated.currentPhase = 'R'; updated.phaseEnteredAt = simElapsed; }
        break;
      case 'S':
        if (simElapsed - updated.phaseEnteredAt >= ROSE_STAB_NO_BOLUS) { updated.currentPhase = 'E'; updated.phaseEnteredAt = simElapsed; }
        if (map < ROSE_MAP_STABLE) { updated.currentPhase = 'O'; updated.phaseEnteredAt = simElapsed; }
        break;
      case 'E':
        if (map < ROSE_MAP_STABLE) { updated.currentPhase = 'S'; updated.phaseEnteredAt = simElapsed; }
        break;
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 6. NEFROTOXICIDAD REAL → Creatinina
  // Conectado directamente al patient store (updateVitals.creatinine)
  //
  // Modelo lineal acumulativo simplificado:
  //   Δcreatinine/s = nephroStressorRate × (1 + severityBonus)
  //
  // Referencias:
  //   - Papadimitriou-Olivgeris: Vancomycin nephrotoxicity (CMI 2020)
  //   - Pogue JM: Colistin nephrotoxicity meta-analysis (JAC 2011)
  //   - Rea RS: Aminoglycoside-associated nephrotoxicity (Am J Health Syst 2011)
  // ════════════════════════════════════════════════════════════════════════════

  private applyNephrotoxicity(atbs: ActiveAntibiotic[], dt: number): void {
    const pat = usePatientStore.getState();
    const currentCr = pat.vitals.creatinine ?? 1.0;
    let   deltaCr   = 0;

    for (const atb of atbs) {
      const def = ANTIBIOTIC_CATALOG[atb.antibioticId];
      if (!def || !def.nephrotoxic) continue;

      // Vancomicina: nefrotóxico sólo cuando trough > 20 μg/mL (ASHP 2020)
      // nephroStressorRate esta en Cr/h (ver comentario en useMicrobiologyStore.ts);
      // dt viene en segundos — dividir por 3600 para no aplicar la tasa horaria
      // 3600x mas rapido de lo calibrado (C1.7 commit 1, bug de unidades).
      if (atb.antibioticId === 'vancomycin') {
        if (atb.troughLevel > VANCO_TROUGH_TOXIC) {
          // Daño proporcional al exceso de trough
          const excess = atb.troughLevel - VANCO_TROUGH_TOXIC;
          deltaCr += (def.nephroStressorRate / 3600) * (1 + excess / 20) * dt;
        }
        continue;
      }

      // Aminoglucósidos: tóxico por tiempo de exposición (acumulativo)
      if (['amikacin', 'gentamicin', 'tobramycin'].includes(atb.antibioticId)) {
        // Mayor toxicidad si perfusión renal reducida (MAP < 65)
        const map = pat.vitals.meanArterialPressure;
        const renalPerfusionFactor = map < 65 ? 2.0 : 1.0;
        deltaCr += (def.nephroStressorRate / 3600) * renalPerfusionFactor * dt;
        continue;
      }

      // Colistina / Polimixina B: constantemente nefrotóxico
      if (['colistin', 'polymyxin_b'].includes(atb.antibioticId)) {
        const map = pat.vitals.meanArterialPressure;
        const renalFactor = map < 65 ? 2.5 : 1.0;
        deltaCr += (def.nephroStressorRate / 3600) * renalFactor * dt;
        continue;
      }

      // Resto: aplicar tasa base
      deltaCr += (def.nephroStressorRate / 3600) * dt;
    }

    if (deltaCr > 0) {
      // Creatinina sube hasta máx clínico de 15 mg/dL (IRA anúrica terminal)
      const newCr = Math.min(15, currentCr + deltaCr);
      if (newCr !== currentCr) {
        pat.updateVitals({ creatinine: newCr });
      }
    }
  }
}
