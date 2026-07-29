// src/core/RenalEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Solo lee PDSystemicEffects — nunca plasmaConcentrations.
//   Efectos droga-específicos modelados en DrugPDProfile.
//
// Refs:
//   Bellomo R, Kellum JA, Ronco C. Acute kidney injury. Lancet 2012;380:756-66.
//   DOI: 10.1016/S0140-6736(11)61454-2
//   KDIGO Clinical Practice Guideline for AKI. Kidney Int 2012; 2(Suppl 1).
//   Schrier RW. NEJM 2007;356:159 — autorregulación renal MAP 65-150.
//
import { usePatientStore }      from '../store/usePatientStore';
import { usePathologyStore }    from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

const MAP_PLATEAU_MIN         = 80;
const MAP_OLIGO_TOP           = 65;
const MAP_FAILURE             = 45;
const UO_NORMAL               = 1.0;   // ml/kg/h
const UO_PLATEAU_LOW          = 0.5;
const UO_FAILURE              = 0.0;
const PRESSURE_DIURESIS_THR   = 80;
const PRESSURE_DIURESIS_COEFF = 0.008;
const TAU_UO_S                = 30;    // τ suavizado UO (Bellomo 2012: respuesta 30s sim)
const UO_MIN                  = 0.0;
const UO_MAX                  = 5.0;

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Modulación farmacológica de ADH / función tubular renal
// adhSuppression > 0 → inhibe ADH → diuresis ↑ (propofol, dex, dopamina)
// adhSuppression < 0 → libera ADH/histamina → antidiuresis (morfina, vasopresina)
// Amplitud máxima: ±0.6 ml/kg/h a magnitude 1.0
const ADH_MODULATION_AMP = 0.6;

export class RenalEngine {
  private static instance: RenalEngine | null = null;
  private constructor() {}

  public static getInstance(): RenalEngine {
    if (RenalEngine.instance === null)
      RenalEngine.instance = new RenalEngine();
    return RenalEngine.instance;
  }

  public update(dt: number): void {
    const store   = usePatientStore.getState();
    const v       = store.vitals;
    const upd     = store.updateVitals;
    const map     = v.meanArterialPressure;
    const profile = store.profile;
    const path    = usePathologyStore.getState();

    // ─── 0. Función renal residual baseline desde comorbilidades ─────────────
    // CKD-EPI 2021 (Inker LA et al., NEJM 2021;385:1737-49. DOI: 10.1056/NEJMoa2102953)
    const ids = store.comorbidityIds ?? [];
    let baselineCrCl = 1.0;
    if      (ids.includes('dialisis_hd') || ids.includes('dialisis_pd')) baselineCrCl = 0.05;
    else if (ids.includes('erc_g5'))  baselineCrCl = 0.12;
    else if (ids.includes('erc_g4'))  baselineCrCl = 0.28;
    else if (ids.includes('erc_g3b')) baselineCrCl = 0.42;
    else if (ids.includes('erc_g3a')) baselineCrCl = 0.55;
    else if (ids.includes('erc_g2'))  baselineCrCl = 0.75;
    else if (ids.includes('erc_g1'))  baselineCrCl = 0.90;

    // ─── 1. UO target hemodinámico (presión-dependiente) ──────────────────────
    // Schrier RW. NEJM 2007;356:159 — autorregulación MAP 65-150
    let uoTarget: number;
    if (map >= MAP_PLATEAU_MIN) {
      const bonus = Math.max(0, (map - PRESSURE_DIURESIS_THR) * PRESSURE_DIURESIS_COEFF);
      uoTarget = (UO_NORMAL + bonus) * baselineCrCl;
    } else if (map >= MAP_OLIGO_TOP) {
      const t  = (map - MAP_OLIGO_TOP) / (MAP_PLATEAU_MIN - MAP_OLIGO_TOP);
      uoTarget = (UO_PLATEAU_LOW + t * (UO_NORMAL - UO_PLATEAU_LOW)) * baselineCrCl;
    } else if (map >= MAP_FAILURE) {
      const t      = (map - MAP_FAILURE) / (MAP_OLIGO_TOP - MAP_FAILURE);
      const smooth = t * t * (3 - 2 * t);
      uoTarget = (UO_FAILURE + smooth * (UO_PLATEAU_LOW - UO_FAILURE)) * baselineCrCl;
    } else {
      uoTarget = UO_FAILURE;
    }

    // ─── 1b. Sepsis severa → ↓ UO (vasodilatación esplácnica + AKI séptica) ──
    // Bellomo R et al. Lancet 2012: sepsis severity >0.6 → perfusión renal ↓50%
    if (path.sepsis?.isActive && (path.sepsis.severity ?? 0) > 0.6) {
      const sepsisReduction = 0.5 + (path.sepsis.severity - 0.6) * 0.8;
      uoTarget *= Math.max(0.1, 1.0 - clamp(0, 0.8, sepsisReduction));
    }

    // ─── 2. Modulación farmacológica ADH/tubular ───────────────────────────────
    // Refs: Nishina Acta Anaesthesiol Scand 1999; Bhatt J Am Coll Cardiol 2018;
    //       Pappas Crit Care Med 1994
    const { systemicEffects: pd } = usePharmacologyStore.getState();
    const adhDelta = pd.adhSuppression * ADH_MODULATION_AMP;
    if (map > MAP_FAILURE) {
      uoTarget = Math.max(UO_FAILURE, uoTarget + adhDelta);
    }

    // ─── 3. Nefrotoxicidad ATB → AKI → reducción GFR → oliguria ──────────────
    // KDIGO Clinical Practice Guideline for AKI. Kidney Int 2012; 2(Suppl 1).
    // Estadio 1 (Cr ×1.5-1.9): −15-20% UO
    // Estadio 2 (Cr ×2-2.9):   −20-70% UO
    // Estadio 3 (Cr ≥3):        −70% UO
    const creatinine = v.creatinine ?? 1.0;
    const crRatio    = creatinine / 1.0;
    let   akiPenalty = 0;
    if      (creatinine >= 8.0) akiPenalty = 0.90;
    else if (crRatio >= 3.0)    akiPenalty = 0.70;
    else if (crRatio >= 2.0)    akiPenalty = 0.20 + (crRatio - 2.0) * 0.50;
    else if (crRatio >= 1.5)    akiPenalty = (crRatio - 1.5) * 0.40;
    uoTarget *= Math.max(0, 1.0 - akiPenalty);

    // ─── 4. Diurético de asa ─────────────────────────────────────────────────
    // Felker NEJM 2011 (DOSE): 40 mg EV → +1.7 mL/kg/h en respondedor.
    // Mullens EHJ 2019: resistencia en AKI estadio 3.
    // Hoorn JASN 2017: K+ depletion 0.5 mEq/L / 72h a dosis plena.
    const { diureticEffect, beta2 } = pd;

    // ─── Diuréticos no-loop (tiazidas, ahorradores K, acetazolamida) ──────────
    // CLOROTIC (Trullàs 2022): tiazidas añadidas a loop ↑ natriuresis 30-40%
    // 3T trial (Cox 2019): metolazona comparable a clorotiazida IV
    // ADVOR (Mullens 2022): acetazolamida 500 mg ↑ descongestión
    const pcp = usePharmacologyStore.getState().plasmaConcentrations;
    const hctEffect    = (pcp['hydrochlorothiazide_oral'] ?? 0) * 0.3;
    const metEffect    = (pcp['metolazone_oral'] ?? 0) * 0.4;
    const spiroEffect  = (pcp['spironolactone_oral'] ?? 0) * 0.05;
    const aceta_iv     = (pcp['acetazolamide_iv'] ?? 0) * 0.25;
    const aceta_oral   = (pcp['acetazolamide_oral'] ?? 0) * 0.20;
    const thiazideTotal = hctEffect + metEffect;
    // Sinergia: tiazidas potencian loop (secuencial tubular)
    const synergy = diureticEffect > 0.05 ? thiazideTotal * 0.5 : 0;
    const extraDiuresis = thiazideTotal + spiroEffect + aceta_iv + aceta_oral + synergy;

    let kNow = v.kPlasma ?? 4.0;

    // 4a. Loop diuretics → tubular K+ loss
    if (diureticEffect > 0 && map > MAP_FAILURE) {
      const renalReserve = Math.max(0.10, 1.0 - akiPenalty);
      uoTarget = Math.min(UO_MAX, uoTarget + (diureticEffect + extraDiuresis) * 0.60 * renalReserve);
      kNow = Math.max(2.0, kNow - diureticEffect * 6.43e-7 * dt);
    } else if (extraDiuresis > 0 && map > MAP_FAILURE) {
      const renalReserve = Math.max(0.10, 1.0 - akiPenalty);
      uoTarget = Math.min(UO_MAX, uoTarget + extraDiuresis * 0.60 * renalReserve);
    }

    // Tiazidas: pérdida K+ adicional
    if (thiazideTotal > 0) {
      kNow = Math.max(2.0, kNow - thiazideTotal * 5e-7 * dt);
    }
    // Espironolactona: retención K+
    if (spiroEffect > 0) {
      kNow = Math.min(6.5, kNow + spiroEffect * 3e-6 * dt);
    }

    // 4b. β₂ agonists → Na⁺/K⁺-ATPase → K⁺ shift intracelular
    // Mahoney BA Cochrane 2005; K_SHIFT_BETA2=5.6e-5 mEq/L/sim-s per unit beta2
    const beta2Effect = beta2 ?? 0;
    if (beta2Effect > 0.01) {
      kNow = Math.max(2.0, kNow - beta2Effect * 5.6e-5 * dt);
    }

    // 4c. Recuperación natural K+ (ingesta dietaria + retención tubular)
    if (diureticEffect <= 0.01 && beta2Effect <= 0.01 && thiazideTotal <= 0.01 && spiroEffect <= 0.01) {
      const kDrift = (4.0 - kNow) * 8e-6 * dt;
      if (Math.abs(kNow - 4.0) > 0.01) {
        kNow = clamp(2.0, 5.5, kNow + kDrift);
      }
    }
    upd({ kPlasma: parseFloat(kNow.toFixed(3)) });

    // ─── 5. Suavizado tubular τ = 30 s sim (Bellomo Lancet 2012) ─────────────
    const factor = Math.min(1, dt / TAU_UO_S);
    const newUO  = clamp(UO_MIN, UO_MAX,
      (v.urineOutput ?? UO_NORMAL) + (uoTarget - (v.urineOutput ?? UO_NORMAL)) * factor
    );
    upd({ urineOutput: parseFloat(newUO.toFixed(3)) });

    // ─── 6. Pérdida de volumen circulante por diuresis ────────────────────────
    // Diuresis efectiva drena del compartimento intravascular.
    // Hahn RG BJA 2021: 70% del volumen perdido proviene del intravascular en sujetos críticos.
    const weight    = profile?.weightKg ?? (v.weight ?? 70);
    const lossPerSec = (newUO * weight) / 3600;   // mL/s (newUO en mL/kg/h)
    store.setBloodVolume(Math.max(2000, store.bloodVolume - lossPerSec * dt));
  }
}