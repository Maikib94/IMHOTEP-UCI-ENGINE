import { usePatientStore } from '../store/usePatientStore';

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

    const mapDeficit  = Math.max(0, MAP_PERF_THR - v.meanArterialPressure);
    const coDeficit   = Math.max(0, CO_PERF_THR  - v.cardiacOutput);
    const lacTgt      = Math.min(LACTATE_MAX,
      LACTATE_NORMAL + mapDeficit * LAC_MAP_COEFF + coDeficit * LAC_CO_COEFF
    );
    const newLactate  = Math.max(LACTATE_MIN, Math.min(LACTATE_MAX,
      v.lactate + (lacTgt - v.lactate) * K_LACTATE * dt
    ));

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