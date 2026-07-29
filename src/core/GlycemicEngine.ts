// src/core/GlycemicEngine.ts
//
// Modelo Bergman ICING-adaptado para críticos.
// Ref: Lin J et al. Comput Methods Programs Biomed 2011 (ICING model).
//      Limbachia J, Clin Ther 2023 (corticoid hyperglycemia equivalences).
//      ADA 2024 (glycemic targets in ICU); NICE-SUGAR NEJM 2009.
//
// ODEs (G en mg/dL, X en 1/min, I en mU/L; integración en minutos):
//   dG/dt = −p1·(G − Gb) − X·G + EGP_stress + corticoid_drive − SI·I·G
//   dX/dt = −p2·X + p3·(I − Ib)
//   dI/dt = −n·I + insulin_input / V_I
//
// SI modulado por DM1/DM2/cirrosis desde perfil del paciente.
// EGP_stress amplificado por sepsis, trauma y fragilidad.
// Corticoid drive derivado de dosis activa en prednisona-equivalente.

import { useGlycemicStore }   from '../store/useGlycemicStore';
import { usePatientStore }    from '../store/usePatientStore';
import { usePathologyStore }  from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

// ─── Parámetros ICING calibrados ─────────────────────────────────────────────
//  Ref primaria: Lin J et al. Comput Methods Programs Biomed 2011;102:192-205.
//  DOI: 10.1016/j.cmpb.2010.12.008 — 173 pacientes, 42941h, error 1h-ahead 2.80%
//  Actualización 2026-04-29: P1=0.006 (pG Lin tabla 2); SI=1.5e-4 (S_I mediana críticos)
//  Lin J 2008 DOI: 10.1016/j.cmpb.2007.04.006 — S_I críticos 5-10× menor que sanos
const P1    = 0.006;    // 1/min  — glucose effectiveness pG (Lin 2011: 0.006; prev 0.005)
const P2    = 0.030;    // 1/min  — eliminación insulina remota X
const P3    = 1.0e-5;   // sensibilidad insulina → X (1/min²·(mU/L)⁻¹)
const N     = 0.150;    // 1/min  — eliminación insulina plasmática (nK+nL combinado Lin)
const SI    = 1.5e-4;   // L/(mU·min) — S_I mediana críticos (Lin 2011; prev 1.0e-4)
const Gb    = 90;       // mg/dL  — set-point glucosa (normoglicemia crítica)
const Ib    = 5;        // mU/L   — insulina plasmática basal
const V_I   = 0.142;    // L/kg   — volumen distribución insulina (Bergman 1989)

// ─── Factores de equivalencia a prednisona (Limbachia Clin Ther 2023) ────────
//  Anti-inflammatory equivalences (standard reference: Brunton 2018)
const HC_PRED_EQUIV  = 0.25;   // 1 mg HC = 0.25 mg pred-equiv
const MP_PRED_EQUIV  = 1.25;   // 1 mg MP = 1.25 mg pred-equiv
const DEX_PRED_EQUIV = 6.70;   // 1 mg Dexa = 6.7 mg pred-equiv

// Corticoid drive: ~5 mg/dL por mg-pred equiv por día
// = 5/1440 mg/dL/min → calibrado: dexa 6mg/d → +30-40 mg/dL en 4h sim (DM2)
const PRED_DRIVE_COEFF = 5 / 1440; // mg/dL/min per mg-pred-equiv per day

// Drug-specific glucose-raising potency multipliers (Limbachia Clin Ther 2023):
//   Dexa vs HC: +16.6 mg/dL more at clinical doses → DEX_GLUCOSE_MULT = 1.25
//   MP vs HC:   +23.9 mg/dL more at clinical doses → MP_GLUCOSE_MULT = 1.50
//   HC and Pred: reference = 1.00
//   Ref: Limbachia V et al. Clin Ther 2023;45(8):754-60. DOI: 10.1016/j.clinthera.2023.06.015
//        BIBLIOGRAPHY_DELTA.md §3.5
const HC_GLUCOSE_MULT  = 1.00;
const MP_GLUCOSE_MULT  = 1.50;
const DEX_GLUCOSE_MULT = 1.25;

export class GlycemicEngine {
  private static instance: GlycemicEngine | null = null;
  private constructor() {}

  public static getInstance(): GlycemicEngine {
    if (!GlycemicEngine.instance) GlycemicEngine.instance = new GlycemicEngine();
    return GlycemicEngine.instance;
  }

  public reset(): void {
    useGlycemicStore.getState().reset();
  }

  public update(dtSeconds: number): void {
    const glyc    = useGlycemicStore.getState();
    const pat     = usePatientStore.getState();
    const path    = usePathologyStore.getState();
    const pharm   = usePharmacologyStore.getState();

    const dtMin   = dtSeconds / 60;  // integración en minutos (unidades ICING)
    const weight  = pat.vitals.weight ?? 70;
    const V_total = V_I * weight;    // L (volumen distribución total)

    // ── 1. Sensibilidad individual (SI modulado por comorbilidades) ──────────
    //  Ref: Plank LD CCM 2006 (insulin resistance in critical illness);
    //       Cheatham MM Crit Care 2010 (DM2 in ICU)
    const comorbIds = pat.comorbidityIds ?? [];
    let siMod = 1.0;
    if (comorbIds.includes('dm1'))          siMod = Math.min(siMod, 0.40);
    if (comorbIds.includes('dm2_insulin'))  siMod = Math.min(siMod, 0.35);
    if (comorbIds.includes('dm2_no_insulin')) siMod = Math.min(siMod, 0.50);
    if (comorbIds.includes('cirrosis_c'))   siMod = Math.min(siMod, 0.50);
    if (comorbIds.includes('cirrosis_b'))   siMod = Math.min(siMod, 0.65);
    if (comorbIds.includes('cirrosis_a'))   siMod = Math.min(siMod, 0.75);
    if (comorbIds.includes('obesidad_g3'))  siMod = Math.min(siMod, 0.60);
    if (comorbIds.includes('obesidad_g2'))  siMod = Math.min(siMod, 0.72);
    const SI_eff = SI * siMod;

    // ── 2. EGP_stress — producción hepática endógena elevada en críticos ─────
    //  Ref: McCowen KC Ann Surg 2001; Leverve XM Crit Care 2006
    const sevsep  = path.sepsis.isActive  ? path.sepsis.severity  : 0;
    const ptSev   = path.polytrauma?.isActive ? path.polytrauma.severity : 0;
    const frail   = pat.frailtyContinuous ?? 0;
    // EGP baseline crítico 0.5 mg/dL/min; ampliado × stress
    const egpStress = 0.5 + (sevsep * 1.0) + (ptSev * 0.6) + (frail * 0.2);

    // ── 3. Corticoid drive — hiperglicemia esteroidea ─────────────────────────
    //  Pred-equiv × glucose-specific multiplier per drug (Limbachia 2023 §3.5):
    //    MP and Dexa raise glucose more per pred-equiv unit than HC (see BIBLIOGRAPHY_DELTA §3.5)
    //  Ref: Limbachia V Clin Ther 2023; Clore JN Endocrine 2009 (mechanism)
    const rates = pharm.infusionRates;
    const corticoidDrive =
      (rates['hydrocortisone']     ?? 0) * 24 * HC_PRED_EQUIV  * PRED_DRIVE_COEFF * HC_GLUCOSE_MULT  +
      (rates['methylprednisolone'] ?? 0) * 24 * MP_PRED_EQUIV  * PRED_DRIVE_COEFF * MP_GLUCOSE_MULT  +
      (rates['dexamethasone']      ?? 0) * 24 * DEX_PRED_EQUIV * PRED_DRIVE_COEFF * DEX_GLUCOSE_MULT +
      (rates['prednisolone_oral']  ?? 0) * 24 * 1.0            * PRED_DRIVE_COEFF * HC_GLUCOSE_MULT;

    // Track predEquivPerDay for corticoid suggestion (for HGT frequency tip)
    const predEquivPerDay =
      (rates['hydrocortisone']     ?? 0) * 24 * HC_PRED_EQUIV  +
      (rates['methylprednisolone'] ?? 0) * 24 * MP_PRED_EQUIV  +
      (rates['dexamethasone']      ?? 0) * 24 * DEX_PRED_EQUIV +
      (rates['prednisolone_oral']  ?? 0) * 24 * 1.0;

    // Detectar inicio de corticoide (sugerencia HGT frecuente)
    if (predEquivPerDay > 1 && !glyc.corticoidHGTSuggestion) {
      useGlycemicStore.getState().setCorticoidSuggestion(true);
    }

    // ── 4. Insulin input (mU/min) ────────────────────────────────────────────
    //  Regular IV:   maxDose=10 UI/h → cpRatio×10 UI/h → ×(1000 mU/UI)/60 = ×166.7 mU/min
    //  NPH SC:       lenta, menor absorción pico; ×60 mU/min a dosis max (40 UI/d)
    //  Glargina SC:  peakless, acción ×24h; ×25 mU/min a dosis max
    const cp = pharm.plasmaConcentrations;
    const insulinInput =
      (cp['insulin_regular_iv'] ?? 0) * 166.7 +  // mU/min (IV directo)
      (cp['insulin_nph']        ?? 0) *  40.0  +  // mU/min (SC NPH)
      (cp['insulin_glargine']   ?? 0) *  25.0;    // mU/min (SC Glargina)

    // ── 5. Estado actual ──────────────────────────────────────────────────────
    const G = glyc.bgContinuous;
    const X = glyc.remoteInsulinX;
    const I = glyc.plasmaInsulin;

    // ── 6. ODE Bergman ICING (Euler forward, dtMin) ──────────────────────────
    const dG = (-P1 * (G - Gb) - X * G + egpStress + corticoidDrive - SI_eff * I * G) * dtMin;
    const dX = (-P2 * X + P3 * (I - Ib)) * dtMin;
    const dI = (-N * I + insulinInput / V_total) * dtMin;

    const G_new = Math.max(30, Math.min(600, G + dG));
    const X_new = Math.max(0, X + dX);
    const I_new = Math.max(0, I + dI);

    glyc.recordContinuous(G_new, X_new, I_new);

    // ── 7. Sincronizar vitals.glucoseMgdL ─────────────────────────────────────
    pat.updateVitals({ glucoseMgdL: Math.round(G_new) });
  }
}
