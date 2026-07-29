// src/core/AcidBaseEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Solo lee PDSystemicEffects.metabolicStress — nunca plasmaConcentrations.
//   PRIS modelado en DrugPDProfile.metabolicStress (propofol, thiopental).
//
import { usePatientStore }      from '../store/usePatientStore';
import { usePathologyStore }    from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';

const HH_PKA             = 6.1;
const CO2_ALPHA          = 0.0307;
const HCO3_NORMAL        = 24.0;
const PACO2_NORMAL       = 40.0;
const NA_BASELINE        = 140;
const CL_BASELINE        = 104;
const AG_NORMAL          = 12;
const BV_BASE            = 5000;
const HB_NORMAL          = 14.0;
const LACTATE_NORMAL     = 1.0;
const LACTATE_MIN        = 0.3;
const LACTATE_MAX        = 20.0;
const K_LACTATE          = 0.004;
const MAP_PERF_THR       = 65;
const CO_PERF_THR        = 4.0;
const LAC_MAP_COEFF      = 0.15;
const LAC_CO_COEFF       = 3.0;
const BICARB_BUFFER      = 0.50;
const RESP_ACID_COMP     = 0.35;
const RESP_ALK_COMP      = 0.50;
const RENAL_HCO3_MAX     = 38.0;
const RENAL_HCO3_MIN     = 14.0;
const K_RENAL            = 0.00008;
const K_RENAL_IMPAIRED   = 0.00002;
const URINE_OLIGO_THR    = 0.3;
const HCO3_MIN           = 5.0;
const HCO3_MAX           = 45.0;
const PH_MIN             = 6.80;
const PH_MAX             = 7.80;
const BE_HCO3_INTERCEPT  = 24.4;
const BE_HB_COEFF        = 1.43;
const BE_CONST_COEFF     = 7.7;
const BE_PH_REF          = 7.4;
const DD_DENOM_MIN       = 0.5;

export class AcidBaseEngine {
  private static instance: AcidBaseEngine | null = null;
  private constructor() {}

  public static getInstance(): AcidBaseEngine {
    if (AcidBaseEngine.instance === null)
      AcidBaseEngine.instance = new AcidBaseEngine();
    return AcidBaseEngine.instance;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;
    const vol   = store.bloodVolume;

    // ─── Lactato: cinética ODE multi-mecanismo ───────────────────────────────────
    //
    // Refs: Vincent JL, De Backer D. Crit Care 2016;20:255.
    //       Bakker J et al., Ann Intensive Care 2013;3:12. DOI: 10.1186/2110-5820-3-12
    //       Levy B et al., NEJM 2018;378:583 (catecolaminas exógenas).
    //       Brealey D et al., Lancet 2002;360:219 (disfunción mitocondrial séptica).
    //       Corbett SM et al., Pharmacotherapy 2008;28:983-8 (PRIS).
    const { systemicEffects: pd } = usePharmacologyStore.getState();
    const path = usePathologyStore.getState();
    const profile = store.profile;
    const weightKg = profile?.weightKg ?? (v.weight ?? 70);

    // 1. DO₂ estimado (mL/kg/min) — CaO₂ = 1.34×Hb×SpO₂ + 0.003×PaO₂
    const hbEst   = 14 * (vol / 5000);  // Hb aproximada desde volemia
    const cao2    = (1.34 * hbEst * (v.spo2 / 100)) + (0.003 * v.paO2);
    const do2Total = cao2 * v.cardiacOutput * 10;   // mL/min
    const do2_kgmin = do2Total / Math.max(1, weightKg);

    // 2. Producción anaerobia (mmol/L/h) — DO₂ crit ~7 mL/kg/min
    const DO2_CRIT = 7.0;
    const anaerobicProd = do2_kgmin < DO2_CRIT
      ? Math.pow(Math.max(0, DO2_CRIT - do2_kgmin), 1.5) * 0.4
      : 0;

    // 3. Disfunción mitocondrial séptica (Brealey Lancet 2002)
    const sepSev = path.sepsis?.isActive ? (path.sepsis?.severity ?? 0) : 0;
    const sepsisProd = sepSev > 0.4 ? (sepSev - 0.4) * 1.0 : 0;

    // 4. Catecolaminas exógenas → gluconeogénesis / ciclo de Cori (Levy NEJM 2018)
    const cateProd = Math.max(0, (pd.beta1 ?? 0) * 0.6 + (pd.beta2 ?? 0) * 0.3);

    // 5. PRIS (pd.metabolicStress > 0 → propofol en dosis supraterapéutica)
    const lacPrisBump = (pd.metabolicStress ?? 0) * 4.0;

    const totalProdH = anaerobicProd + sepsisProd + cateProd + lacPrisBump * 0.1;

    // 6. Aclaramiento hepato-renal: t½ 30 min normal, 2h en hipoperfusión
    const tHalf_h     = do2_kgmin >= DO2_CRIT ? 0.5 : 2.0;
    const k_clearance = Math.LN2 / (tHalf_h * 3600);  // s⁻¹

    // 7. ODE: dL/dt = prod/s − k × (L − baseline)
    const prodPerSec = totalProdH / 3600;
    const dLdt = prodPerSec - k_clearance * Math.max(0, v.lactate - LACTATE_NORMAL);

    // Blend: cinética completa si vitales válidos; fallback MAP/CO si no
    const useDynamic = v.cardiacOutput > 0.5 && v.spo2 > 10 && isFinite(do2_kgmin);
    let newLactate: number;
    if (useDynamic) {
      newLactate = Math.max(LACTATE_MIN, Math.min(LACTATE_MAX, v.lactate + dLdt * dt));
    } else {
      // Fallback legacy (MAP/CO deficit)
      const mapDeficit = Math.max(0, MAP_PERF_THR - v.meanArterialPressure);
      const coDeficit  = Math.max(0, CO_PERF_THR  - v.cardiacOutput);
      const lacTgtFallback = Math.min(LACTATE_MAX,
        LACTATE_NORMAL + mapDeficit * LAC_MAP_COEFF + coDeficit * LAC_CO_COEFF + lacPrisBump
      );
      newLactate = Math.max(LACTATE_MIN, Math.min(LACTATE_MAX,
        v.lactate + (lacTgtFallback - v.lactate) * K_LACTATE * dt
      ));
    }

    const lacDelta      = newLactate - v.lactate;
    const hco3FromLac   = -(lacDelta * BICARB_BUFFER);

    const paCO2Delta    = v.paCO2 - PACO2_NORMAL;
    const renalTgt      = paCO2Delta >= 0
      ? Math.min(RENAL_HCO3_MAX, HCO3_NORMAL + RESP_ACID_COMP * paCO2Delta)
      : Math.max(RENAL_HCO3_MIN, HCO3_NORMAL - RESP_ALK_COMP  * Math.abs(paCO2Delta));

    const kRenal      = v.urineOutput < URINE_OLIGO_THR ? K_RENAL_IMPAIRED : K_RENAL;
    const hco3FromRen = (renalTgt - v.hco3) * kRenal * dt;

    const newHCO3 = Math.max(HCO3_MIN, Math.min(HCO3_MAX,
      v.hco3 + hco3FromLac + hco3FromRen
    ));

    const rawPH  = HH_PKA + Math.log10(Math.max(0.1, newHCO3) / (CO2_ALPHA * Math.max(1, v.paCO2)));
    const newPH  = Math.max(PH_MIN, Math.min(PH_MAX, rawPH));

    const newAG  = Math.max(0, NA_BASELINE - (CL_BASELINE + newHCO3));

    const hb     = HB_NORMAL * (vol / BV_BASE);
    const newBE  = parseFloat((
      (newHCO3 - BE_HCO3_INTERCEPT) +
      (BE_HB_COEFF * hb + BE_CONST_COEFF) * (newPH - BE_PH_REF)
    ).toFixed(1));

    const deltaAG   = newAG - AG_NORMAL;
    const deltaHCO3 = HCO3_NORMAL - newHCO3;
    const newDD     = deltaHCO3 > DD_DENOM_MIN
      ? parseFloat((deltaAG / deltaHCO3).toFixed(2)) : 0;

    upd({
      pH:         parseFloat(newPH.toFixed(3)),
      hco3:       parseFloat(newHCO3.toFixed(1)),
      lactate:    parseFloat(newLactate.toFixed(1)),
      anionGap:   Math.round(newAG),
      baseExcess: newBE,
      deltaDelta: newDD,
    });
  }
}