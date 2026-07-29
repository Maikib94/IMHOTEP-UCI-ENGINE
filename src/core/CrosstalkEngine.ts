// src/core/CrosstalkEngine.ts
//
// Acoplamiento fisiológico-farmacológico entre ECMO, CRRT y el resto de
// los motores (Ventilator, Cardio, Pharma, Electrolytes).
// Llamado por CronosEngine.tick DESPUÉS de Respiratory, Cardio, Renal, Pharma.
//
// Referencias:
//   ECMO-Vent: Grotberg J Crit Care 2023;27:289. DOI:10.1186/s13054-023-04574-8
//              Combes A ICM 2020;46:2464-76. DOI:10.1007/s00134-020-06290-1
//              Araos J BJA 2021;127:807-14. DOI:10.1016/j.bja.2021.07.031
//              Rodriguez Y Ann Intensive Care 2025;15:32.
//              Guervilly C Crit Care 2022;26:380.
//   CRRT-PK:   Hoff BM Ann Pharmacother 2020;54:43-55.
//              Roberts JA ICM 2025;51:185-96. DOI:10.1007/s00134-024-...
//              Wieringa A CMI 2025. DOI:10.1016/j.cmi.2025.10.001
//   CRRT-Elec: KDIGO AKI 2012; ADQI 2021.

import { useECMOStore }          from '../store/useECMOStore';
import { useCRRTStore }          from '../store/useCRRTStore';
import { usePatientStore }       from '../store/usePatientStore';
import { usePathologyStore }     from '../store/usePathologyStore';
import { usePharmacologyStore, DRUG_CATALOG } from '../store/usePharmacologyStore';
import type { DrugId }           from '../store/usePharmacologyStore';

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export class CrosstalkEngine {
  private static instance: CrosstalkEngine | null = null;

  static getInstance(): CrosstalkEngine {
    if (!CrosstalkEngine.instance) {
      CrosstalkEngine.instance = new CrosstalkEngine();
    }
    return CrosstalkEngine.instance;
  }

  private constructor() {}

  public update(dt: number): void {
    this.couplECMOVentilator(dt);
    this.couplCRRTPharma(dt);
    this.couplCRRTElectrolytes(dt);
    this.couplCRRTRenal(dt);
    this.couplECMOHemodynamics(dt);
  }

  // ─── ECMO VV ↔ Ventilador ──────────────────────────────────────────────────
  //
  // Cuando VV-ECMO está activo, el intercambio gaseoso está dominado por la membrana:
  //   - PaCO₂ controlado por sweep gas (no por VR ventilatorio)
  //   - SaO₂ dominado por O₂ de la membrana mezclado con output nativo
  //   - Driving pressure > 14 con ECMO activo = VILI riesgo (penaliza biotrauma)
  //
  // Araos BJA 2021: PEEP 10 cmH₂O durante ECMO experimental.
  // Rodriguez ECMOVENT 2025: ΔP 8 cmH₂O objetivo bajo ECMO.
  // Guervilly Crit Care 2022: VT ultra-bajo 1-2 mL/kg PBW.

  private couplECMOVentilator(dt: number): void {
    const ecmo = useECMOStore.getState();
    if (!ecmo.active || ecmo.mode !== 'vv') return;

    const pat = usePatientStore.getState();
    const v   = pat.vitals;

    // PaCO₂ dominado por sweep gas — τ = 60s sim
    const metabolicCO2_mLs = 0.24 * (pat.profile?.weightKg ?? 70) / 60;   // ~200 mL/min → mL/s
    const sweepRemoval_mLs = ecmo.sweepFlowLmin * 1000 / 60 * 0.45;        // ~45% CO₂ content
    const co2Balance_norm  = (metabolicCO2_mLs - sweepRemoval_mLs) / 3.5;  // normalizado
    const paCO2Target      = clamp(20, 75, 35 + co2Balance_norm * 20);
    const tau_co2          = 60;
    const newPaCO2         = v.paCO2 + (paCO2Target - v.paCO2) * (dt / tau_co2);

    // SaO₂ efectiva: mezcla flujo ECMO (saturado) + nativo
    const co = Math.max(1, v.cardiacOutput ?? 5);
    const ecmoFraction  = clamp(0, 1, ecmo.bloodFlowLmin / co);
    const nativeFrac    = 1 - ecmoFraction;
    const effectiveSaO2 = ecmo.outputSaO2 * ecmoFraction + (v.spo2 / 100) * nativeFrac;
    const newSaO2       = clamp(70, 100, effectiveSaO2 * 100);

    // paO₂ — Schmidt ICM 2013: membrana contribuye O₂ proporcional a FiO₂ × fracción de flujo
    // paO₂_membrane ≈ membraneFiO₂ × (760 − 47) × 0.95  (eficiencia transferencia 95%)
    const PB = 760, PH2O = 47;
    const paO2Membrane = ecmo.membraneFiO2 * (PB - PH2O) * 0.95;
    const paO2Target   = clamp(60, 600, paO2Membrane * ecmoFraction + (v.paO2 ?? 80) * nativeFrac);
    const newPaO2      = (v.paO2 ?? 80) + (paO2Target - (v.paO2 ?? 80)) * (dt / tau_co2);

    pat.updateVitals({
      paCO2: Math.round(newPaCO2 * 10) / 10,
      spo2:  Math.round(newSaO2 * 10) / 10,
      paO2:  Math.round(newPaO2 * 10) / 10,
    });

    // ΔP monitor — alerta si > 14 cmH₂O durante ECMO
    const dp = (v.pplat ?? 20) - (pat.ventilator.peep ?? 5);
    const highDP = dp > 14;
    if (highDP !== ecmo.drivingPressureAlert) {
      useECMOStore.getState().configure({ drivingPressureAlert: highDP });
    }

    // Biotrauma incremental cuando ΔP alto (Araos 2021 — pressurization penalty)
    if (highDP) {
      const pathStore = usePathologyStore.getState();
      const currentLI = pathStore.ards.lungInjury;
      const increment = 0.0001 * (dp - 14) * dt;
      pathStore.updateLungInjuryFromEngine(
        clamp(0, 1, currentLI + increment),
        pathStore.ards.timeSinceInsultS + dt
      );
    }
  }

  // ─── CRRT ↔ Pharma — clearance aumentado drogas hidrofílicas ───────────────
  //
  // Hoff 2020: clearance adicional = Q_effluent × sieving_coefficient (≈ dialyzability).
  // Roberts ICM 2025: meropenem CRRT eTRCL 50 mL/min → reducir t½ 40-60%.
  // Wieringa 2025: linezolid, fluconazol requieren aumento dosis en CRRT.

  private couplCRRTPharma(dt: number): void {
    const crrt = useCRRTStore.getState();
    if (!crrt.active) return;

    const ph        = usePharmacologyStore.getState();
    const weightKg  = usePatientStore.getState().profile?.weightKg ?? 70;

    // Efluente total L/s
    const qEffluent_Ls = (crrt.dose_mLkgh * weightKg) / 3_600_000;

    const alertDrugs: string[] = [];

    (Object.entries(ph.plasmaConcentrations) as [DrugId, number][]).forEach(([drug, cp]) => {
      if (cp <= 0) return;
      const cat        = DRUG_CATALOG[drug];
      if (!cat) return;
      const dial       = cat.dialyzability ?? 0;
      if (dial <= 0) return;

      const vd         = (cat.vdLkg ?? 1) * weightKg;    // L
      const clearance  = qEffluent_Ls * dial;             // L/s
      const dCp_dt     = -(clearance * cp) / vd;
      const newCp      = Math.max(0, cp + dCp_dt * dt);

      ph.setPlasmaConc(drug, newCp);

      if (dial >= 0.5 && (ph.infusionRates[drug] ?? 0) > 0) {
        alertDrugs.push(drug);
      }
    });

    crrt.setAtbAlert(alertDrugs);
  }

  // ─── CRRT ↔ Electrolitos ───────────────────────────────────────────────────
  //
  // CRRT extrae K⁺ según gradiente de difusión (CVVHD/CVVHDF) o convección (CVVH).
  // Bicarbonato de reposición corrige acidosis metabólica.
  // KDIGO AKI 2012; ADQI 2021.

  private couplCRRTElectrolytes(dt: number): void {
    const crrt = useCRRTStore.getState();
    if (!crrt.active) return;

    const pat = usePatientStore.getState();
    const v   = pat.vitals;

    const weightKg    = pat.profile?.weightKg ?? 70;
    const qEff_mLs    = (crrt.dose_mLkgh * weightKg) / 3_600_000 * 1000; // mL/s

    // K⁺ balance: extracción = q_eff × (K_plasma − K_effluent) / plasma_volume
    const plasmaVol_mL  = 3_000;
    const kCurrent      = v.kPlasma ?? 4.0;
    const kExtract_mEqs = qEff_mLs * (kCurrent - crrt.effluentK_mEqL) / 1000; // mEq/s
    const kDelta        = -(kExtract_mEqs * dt) / (plasmaVol_mL / 1000);       // mEq/L

    const newK = clamp(2.0, 7.0, kCurrent + kDelta);

    // HCO₃ reposición: citrato/bicarb aumenta HCO₃ plasmático
    const hco3Current      = v.hco3 ?? 24;
    const hco3Delivery_mEq = (crrt.effluentBicarb_mmolL * qEff_mLs * dt) / 1000;
    const hco3Delta         = hco3Delivery_mEq / (plasmaVol_mL / 1000);
    const newHco3           = clamp(10, 38, hco3Current + hco3Delta * 0.02); // suavizado

    pat.updateVitals({ kPlasma: newK, hco3: newHco3 });
  }

  // ─── ECMO VA ↔ Hemodinámia ─────────────────────────────────────────────────
  //
  // VV: no altera CO sistémico significativamente (≤ 5%).
  // VA: retorno arterial añade flujo mecánico; reduce poscarga LV.
  //     Riesgo síndrome de arlequín (Harlequin) si cánula femoral: upper body
  //     hipóxico si LV bombea sangre desoxigenada hacia cabeza.

  private couplECMOHemodynamics(dt: number): void {
    const ecmo = useECMOStore.getState();
    if (!ecmo.active || ecmo.mode !== 'va') return;

    const pat = usePatientStore.getState();
    const v   = pat.vitals;

    // Contribución MAP por flujo ECMO (≈ 6 mmHg por L/min en rango típico)
    // Constante calibrada: Combes EOLIA 2020.
    const mapBoostTarget = clamp(60, 130, (v.meanArterialPressure ?? 70) + ecmo.bloodFlowLmin * 6);
    const tau_map = 10;
    const newMap  = (v.meanArterialPressure ?? 70) + (mapBoostTarget - (v.meanArterialPressure ?? 70)) * (dt / tau_map);

    // CO nativo reducido (LV descargado, afterload menor)
    const nativeCO = Math.max(0.5, (v.cardiacOutput ?? 5) - ecmo.bloodFlowLmin * 0.3);

    pat.updateVitals({
      meanArterialPressure: clamp(40, 140, newMap),
      cardiacOutput: nativeCO,
    });
  }

  // ─── CRRT ↔ Renal — clearance creatinina + balance hídrico neto ─────────────
  //
  // KDIGO AKI 2012: clearance creat ≈ Q_efluente × SC (SC=1.0 para moléculas <500 Da).
  // Para CVVHD (difusión): SC ≈ 0.7 (creatinina 113 Da, ligera restricción difusiva).
  // Balance hídrico neto: 100 mL/h extracción neta (programada por default).
  // Ref: KDIGO Kidney Int 2012; Schrier NEJM 2007 (volemia).

  private couplCRRTRenal(dt: number): void {
    const crrt = useCRRTStore.getState();
    if (!crrt.active) return;

    const pat      = usePatientStore.getState();
    const v        = pat.vitals;
    const weight   = pat.profile?.weightKg ?? (v.weight ?? 70);

    // Clearance creatinina efectivo (KDIGO 2012)
    const qEff_Ls   = (crrt.dose_mLkgh * weight) / 3_600_000; // L/s
    const sc        = crrt.mode === 'CVVHD' ? 0.7 : 1.0;
    const vdCr_L    = weight * 0.7;                             // Vd creatinina ≈ 0.7 × weight
    const clearL_s  = qEff_Ls * sc;
    const crNow     = v.creatinine ?? 1.0;
    const dCr       = -(clearL_s * crNow / vdCr_L) * dt;
    const newCr     = Math.max(0.4, crNow + dCr);

    // Balance hídrico neto: 100 mL/h extracción estándar → mL/s
    const netRemoval_mLs = 100 / 3600;
    const newBV = Math.max(2000, pat.bloodVolume - netRemoval_mLs * dt);

    pat.updateVitals({ creatinine: parseFloat(newCr.toFixed(2)) });
    pat.setBloodVolume(newBV);
  }
}
