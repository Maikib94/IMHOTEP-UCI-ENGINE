// src/core/PharmacologyEngine.ts
//
// ARQUITECTURA DATA-DRIVEN:
//   Este engine itera automáticamente sobre DRUG_CATALOG.
//   Para añadir una droga: solo agregar entrada en DRUG_CATALOG (usePharmacologyStore).
//   Este archivo NO necesita modificarse al agregar nuevos fármacos.
//
import { usePharmacologyStore, type DrugId, type PDSystemicEffects, DRUG_CATALOG } from '../store/usePharmacologyStore';
import { usePatientStore } from '../store/usePatientStore';
import { useTimeStore }    from '../store/useTimeStore';
import { useCRRTStore }    from '../store/useCRRTStore';

// Dosis de referencia para normalizar cpRatio.
// stdMaxDose define cuándo cpRatio = 1.0 (dosis clínica alta estándar).
// Cp > 1.0 indica dosis supramáxima (PRIS, toxicidad, etc.).
export const DRUG_MAX_DOSES: Record<DrugId, number> = {
  // Vasopresores
  noradrenaline:   0.5,    // mcg/kg/min
  adrenaline:      0.5,    // mcg/kg/min
  vasopressin:     4.0,    // U/h
  methylene_blue:  2.0,    // mg/kg/h
  // Inotrópicos
  dobutamine:      15.0,   // mcg/kg/min
  dopamine:        20.0,   // mcg/kg/min
  milrinone:       0.75,   // mcg/kg/min
  levosimendan:    0.2,    // mcg/kg/min
  // Sedantes
  propofol:        4.0,    // mg/kg/h
  midazolam:       0.2,    // mg/kg/h
  ketamine:        2.0,    // mg/kg/h
  dexmedetomidine: 1.5,    // mcg/kg/h
  thiopental:      5.0,    // mg/kg/h
  // Analgésicos
  morphine:        10.0,   // mg/h
  fentanyl:        3.0,    // mcg/kg/h
  remifentanil:    0.5,    // mcg/kg/min
  // BNM
  atracurium:      0.6,    // mg/kg/h
  cisatracurium:   0.3,    // mg/kg/h
  rocuronium:      0.6,    // mg/kg/h
  pancuronium:     0.1,    // mg/kg/h
  // Antiarrítmicos
  // Amiodarona: dosis ref 60 mg/h ≡ 1 mg/min (máx infusión UCI).
  //   Bolo 150 mg → cpRatio = 150/(60 × 40h) ≈ 0.063 (t½ terminal 2400 min).
  //   Usando halfLifeH efectivo del DRUG_CATALOG para bolo visible → se usa 1.5h en UI.
  //   Ref: AHA ACLS 2023; Goodman & Gilman 13ª cap. Antiarrítmicos.
  amiodarone:     60.0,    // mg/h
  // Digoxina: dosis ref 0.01 mg/h = 0.24 mg/día (mantenimiento terapéutico alto-normal).
  //   Bolo 0.5 mg → cpRatio = 0.5/(0.01 × 36h) = 1.39 → efecto Hill+PD visible.
  //   Ventana terapéutica: cpRatio 0.67-1.67 (0.8-2.0 ng/mL equiv).
  //   Ref: Kotecha JAMA 2020; Goodman & Gilman 13ª cap. Glucósidos cardíacos.
  digoxin:          0.01,  // mg/h
  // Esmolol: dosis ref 200 µg/kg/min (máx infusión; Schwartz Am J Cardiol 1985).
  //   Bolo 500 µg/kg → ratio = 35000/(200×0.15h) ≈ 1167 — se normaliza cpRatio.
  //   t½ = 9 min → efecto revertido en <10 min al suspender.
  esmolol:        200.0,   // µg/kg/min
  metoprolol_iv:    2.0,   // mg/h
  diltiazem_iv:    10.0,   // mg/h
  // Diuréticos
  furosemide_iv:    20.0,  // mg/h (máx infusión continua: 20 mg/h)
  furosemide_oral:   7.0,  // mg/h (160 mg/d ÷ 24h ≈ 6.7 mg/h oral equiv)
  // Diuréticos adicionales
  hydrochlorothiazide_oral: 4.2,  // mg/h (100 mg/d ÷ 24h)
  metolazone_oral:          0.42, // mg/h (10 mg/d ÷ 24h)
  spironolactone_oral:      4.2,  // mg/h (100 mg/d ÷ 24h)
  acetazolamide_iv:        20.8,  // mg/h (500 mg/d ÷ 24h; bolo hasta 500 mg)
  acetazolamide_oral:      10.4,  // mg/h (250 mg/d ÷ 24h; TID)
  // Antibióticos IV — max doses para normalizar cpRatio (Roberts ICM 2025)
  meropenem_iv:          250.0,  // mg/h (6 g/d extendida → 250 mg/h equiv)
  piperacillin_tazo_iv:  675.0,  // mg/h (16.2 g/d → 675 mg/h infusión continua)
  vancomycin_iv:          62.5,  // mg/h (1500 mg/24h → 62.5 mg/h)
  cefepime_iv:            83.3,  // mg/h (2 g/8h = 6 g/d → 250 mg/h; max seg.)
  levofloxacin_iv:        31.25, // mg/h (750 mg/d ÷ 24h)
  linezolid_iv:           25.0,  // mg/h (600 mg/12h = 1200 mg/d ÷ 24h = 50; max 25/h)
  fluconazole_iv:         16.7,  // mg/h (400 mg/d ÷ 24h)
  caspofungin_iv:          2.1,  // mg/h (50 mg/d ÷ 24h)
  // Corticoides
  hydrocortisone:    50.0, // mg/h (200 mg/d continua → 8.3 mg/h; pico 50 mg/h para bolo)
  methylprednisolone:125.0,// mg/h (bolo 1 g puntual; infusión ≤ 125 mg/h)
  dexamethasone:      0.5, // mg/h (6 mg/d RECOVERY = 0.25 mg/h; máx 0.5 mg/h)
  prednisolone_oral:  2.5, // mg/h (60 mg/d oral ÷ 24h = 2.5 mg/h)
  // Aerosoles
  salbutamol_neb:     0.6,  // mg/h (5 mg/8h → 0.6 mg/h equiv continuo)
  ipratropium_neb:    0.08, // mg/h (0.5 mg/6h → 0.083 mg/h)
  nac_neb:            0.075,// mg/h (600 mg/8h → 0.075 mg/h equiv continuo)
  adrenaline_neb:     0.5,  // mg/h (5 mg dosis única → 0.5 mg/h ref equiv)
  // Antiarrítmicos orales
  amiodarone_oral:   50.0, // mg/h (loading 800 mg/d → 33 mg/h; máx 50)
  digoxin_oral:       0.01,// mg/h (mantenimiento 0.25 mg/d = 0.010 mg/h)
  // Antihipertensivos orales
  enalapril_oral:     2.0, // mg/h (40 mg/d ÷ 24 = 1.67 mg/h)
  losartan_oral:      5.0, // mg/h (100 mg/d ÷ 24 = 4.2 mg/h)
  amlodipine_oral:    0.5, // mg/h (10 mg/d ÷ 24 = 0.42 mg/h)
  atenolol_oral:      5.0, // mg/h (100 mg/d ÷ 24 = 4.2 mg/h)
  carvedilol_oral:    3.0, // mg/h (50 mg/d → 2.1 mg/h; máx 3)
  // Insulinas
  insulin_nph:        1.7, // UI/h (40 UI/d ÷ 24)
  insulin_regular_iv: 10.0,// UI/h (protocolo hiperinsulinemia: 1-10 UI/h)
  insulin_glargine:   1.7, // UI/h (40 UI/d ÷ 24)
  // Profilaxis
  enoxaparin:         3.0, // mg/h (40 mg SC/d → 1.67 mg/h; terapéutico máx 3)
  pantoprazole:       8.0, // mg/h (40-80 mg/d → bolo 8 mg/h infusión)
  // Hiperosmolar
  mannitol:           2.0, // g/kg
  // Endocrino
  dextrose_50:        50,   // g (bolo)
  levothyroxine_iv:   0.5,  // mg (bolo); DRUG_MAX × halfLifeH = normalización cpRatio
  propylthiouracil_oral: 1500, // mg/día equiv → 62.5 mg/h
  methimazole_oral:   120,  // mg/día equiv → 5 mg/h
  // Hematológico
  tranexamic_acid_iv: 4000, // mg/24h → 167 mg/h
  vitamin_k_iv:       50,   // mg
  pcc_4factor:        50,   // U/kg equiv
  desmopressin_iv:    0.4,  // mcg/kg
  argatroban_iv:      15,   // mcg/kg/min
  rasburicase_iv:     0.5,  // mg/kg/día
  // Obstétrico
  oxytocin_iv:        40,   // U/h
  methylergonovine_im: 1,   // mg total
  misoprostol_rectal: 1.0,  // mg total (1000 mcg)
  carbetocin_iv:      0.1,  // mg (100 mcg)
  magnesium_sulfate_iv: 3,  // g/h mantenimiento
};

// ─── Cola de bolos lentos (Fase 3 v0.19) ─────────────────────────────────────
// Permite simular bolos de administración extendida (p.ej. amiodarona 150 mg en 10 min).
// Cada entrada se infunde linealmente distribuyendo el cpRatio total sobre durationSec.
interface SlowBolus {
  readonly drug: DrugId;
  readonly totalRatio: number;  // cpRatio total que se distribuirá
  readonly durationSec: number; // duración total en segundos de simulación
  elapsedSec: number;           // tiempo transcurrido
}

export class PharmacologyEngine {
  private static instance: PharmacologyEngine | null = null;

  // cpRatio: concentración plasmática normalizada (0 = ausente, 1 = dosis max std)
  private cpRatio: Record<DrugId, number>;

  // Depósito GI para drogas orales (depot model 3.B)
  // Unidades: mismas que DRUG_MAX_DOSES. Se llena desde infusionRates; ka drena hacia plasma.
  private depotConc: Record<DrugId, number>;

  // Cola de bolos lentos
  private slowBolusQueue: SlowBolus[] = [];

  private constructor() {
    this.cpRatio = Object.keys(DRUG_MAX_DOSES).reduce((acc, k) => {
      acc[k as DrugId] = 0;
      return acc;
    }, {} as Record<DrugId, number>);
    this.depotConc = { ...this.cpRatio };  // initialise all to 0
  }

  /** Carga concentraciones plasmáticas iniciales (estado estable desde medicación crónica). */
  public setInitialCpRatios(map: Partial<Record<DrugId, number>>): void {
    for (const [drug, ratio] of Object.entries(map) as [DrugId, number][]) {
      if (isFinite(ratio) && ratio > 0) {
        this.cpRatio[drug] = Math.min(1.5, ratio);
      }
    }
  }

  /** Resetea el engine a estado limpio (sin fármacos). Llamar al iniciar un nuevo escenario. */
  public reset(): void {
    for (const k of Object.keys(this.cpRatio) as DrugId[]) {
      this.cpRatio[k]  = 0;
      this.depotConc[k] = 0;
    }
    this.slowBolusQueue = [];
  }

  /** Encola un bolo de administración lenta.
   *  @param drug       - identificador del fármaco
   *  @param doseMg     - dosis en mg (o µg según la droga)
   *  @param durationSec - duración de infusión en segundos de simulación
   */
  public queueSlowBolus(drug: DrugId, doseMg: number, durationSec: number, route: 'iv' | 'oral' = 'iv'): void {
    const maxRate   = DRUG_MAX_DOSES[drug] ?? 1;
    const halfLifeH = (DRUG_CATALOG[drug]?.halfLifeMin ?? 60) / 60;
    const totalRatio = Math.min(doseMg / (maxRate * halfLifeH), 6.0);
    if (totalRatio <= 0) return;
    this.slowBolusQueue.push({ drug, totalRatio, durationSec, elapsedSec: 0 });
    usePharmacologyStore.getState().addBolusHistory(drug, doseMg, useTimeStore.getState().ticks, route);
  }

  public static getInstance(): PharmacologyEngine {
    if (PharmacologyEngine.instance === null) {
      PharmacologyEngine.instance = new PharmacologyEngine();
    }
    return PharmacologyEngine.instance;
  }

  public update(dtSeconds: number): void {
    const store = usePharmacologyStore.getState();
    const { infusionRates } = store;

    // ─── Procesar cola de bolos lentos ───────────────────────────────────────
    // Cada bolo lento distribuye su ratio total linealmente durante durationSec.
    if (this.slowBolusQueue.length > 0) {
      const ratioPerSec: Partial<Record<DrugId, number>> = {};
      const stillActive: SlowBolus[] = [];
      for (const sb of this.slowBolusQueue) {
        const remaining = sb.durationSec - sb.elapsedSec;
        if (remaining <= 0) continue;
        const dtClamped = Math.min(dtSeconds, remaining);
        const rateThisTick = (sb.totalRatio / sb.durationSec) * dtClamped;
        ratioPerSec[sb.drug] = (ratioPerSec[sb.drug] ?? 0) + rateThisTick;
        sb.elapsedSec += dtSeconds;
        if (sb.elapsedSec < sb.durationSec) stillActive.push(sb);
      }
      this.slowBolusQueue = stillActive;
      for (const [dId, ratio] of Object.entries(ratioPerSec) as [DrugId, number][]) {
        this.cpRatio[dId] = Math.min(6.0, (this.cpRatio[dId] ?? 0) + ratio);
      }
    }

    // ─── Procesar bolos pendientes (instantáneos) ─────────────────────────────
    const pending = store.pendingBolusRatios;
    const pendingKeys = Object.keys(pending) as DrugId[];
    if (pendingKeys.length > 0) {
      for (const dId of pendingKeys) {
        const ratio = pending[dId];
        if (ratio && ratio > 0) {
          this.cpRatio[dId] = Math.min(3.0, (this.cpRatio[dId] || 0) + ratio);
        }
      }
      store.clearPendingBolusRatios();
    }

    // ─── PK Expandido: IV + Oral + Clearance por comorbilidades + CYP ────────
    //
    //  IV:   dC/dt = k*(target − C)  donde k = ln(2)/t½_eff
    //  Oral: depot += infusionRate×dt; plasma += depot×ka×F×absorpMultiplier×dt
    //  Clearance (2.C): t½_eff escalada por crCl o hepáticaFactor del perfil
    //  CYP (3.D): inhibidores activos aumentan t½ de sustratos
    //  GI shock (3.C): absorpMultiplier cae cuando MAP < 65 o nora alta
    //
    const dtMin = dtSeconds / 60;

    // ── Perfil de paciente para clearance personalizado ────────────────────────
    const patProfile    = usePatientStore.getState().profile;
    const comorbIds     = patProfile?.comorbidityIds ?? [];
    const renalFraction = Math.min(1.0, Math.max(0.05,
      // CrCl: ERC/diálisis reduce; tomar el mínimo de todas las comorbilidades
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

    // ── Absorción GI en shock (3.C) ────────────────────────────────────────────
    //  Cohen-Wolkowiez Crit Care Med: shock esplácnico reduce absorción oral
    const vitalsNow = usePatientStore.getState().vitals;
    const mapNow    = vitalsNow.meanArterialPressure ?? 80;
    const noraCp    = this.cpRatio['noradrenaline'] ?? 0;
    const splanchnicHypo = Math.max(0, (65 - mapNow) / 65)
      + Math.max(0, (noraCp / (DRUG_MAX_DOSES['noradrenaline'] || 1) - 0.3) * 0.5);
    const absorpMultiplier = Math.max(0.20, 1 - splanchnicHypo);

    // ── Interacciones CYP/P-gp (3.D) ──────────────────────────────────────────
    //  Paso 1: computar fuerza inhibidora total por vía
    //  Calibración: amio cpRatio=1 × inhibitionStrength=0.60 → inhibStr=0.60
    //  → tHalfEff_dig = tHalf_dig / (1 − 0.6×0.60) = /0.64 = +56% (→ ~+79% AUC) ✓
    //  Ref: Chen Pharmacotherapy 2025; Nademanee JACC 1984
    const cypInh: Record<string, number> = {};
    for (const dId of Object.keys(this.cpRatio) as DrugId[]) {
      const def = DRUG_CATALOG[dId];
      const inh = def.cypInteractions;
      const str = def.inhibitionStrength ?? 0;
      const cp  = this.cpRatio[dId];
      if (inh && str > 0 && cp > 0.001) {
        for (const [path, role] of Object.entries(inh)) {
          if (role === 'inhibitor') {
            cypInh[path] = (cypInh[path] ?? 0) + cp * str;
          }
        }
      }
    }

    // ── Loop PK principal ──────────────────────────────────────────────────────
    for (const dId of Object.keys(this.cpRatio) as DrugId[]) {
      const def      = DRUG_CATALOG[dId];
      const maxRate  = DRUG_MAX_DOSES[dId] || 1;
      const route    = def.eliminationRoute ?? 'hepatic';
      const isOral   = (def.oralBioavailability ?? 0) > 0;

      // Clearance modifier per comorbidities (2.C)
      let clMod = 1.0;
      if (route === 'renal' || route === 'mixed')   clMod *= renalFraction;
      if (route === 'hepatic' || route === 'mixed') clMod *= hepaticFraction;

      // CYP t½ boost for substrates (3.D)
      let tHalfBoost = 1.0;
      const inh = def.cypInteractions;
      if (inh) {
        for (const [path, role] of Object.entries(inh)) {
          if (role === 'substrate') {
            const inhibStr = Math.min(0.90, cypInh[path] ?? 0);
            tHalfBoost = Math.max(tHalfBoost, 1 / (1 - 0.6 * inhibStr));
          }
        }
      }

      // Effective half-life
      const tHalfEff = Math.max(0.5, def.halfLifeMin * tHalfBoost / Math.max(0.05, clMod));
      const ke       = 0.693 / tHalfEff;  // elimination rate constant

      const currentRate = infusionRates[dId] || 0;

      if (isOral) {
        // ── ORAL MODEL (3.B): depot → plasma ────────────────────────────────
        const F  = def.oralBioavailability!;
        const ka = (def.absorptionRateHr ?? 1.5) / 60;  // per min (at normal perfusion)

        // Load depot from infusion rate (mg/h → mg/min)
        const doseFlux = (currentRate / 60) * dtMin * 60;  // mg entering depot this tick
        if (!isFinite(this.depotConc[dId])) this.depotConc[dId] = 0;
        this.depotConc[dId] = Math.max(0, this.depotConc[dId] + doseFlux);

        // Absorption from depot to plasma — split absorpMultiplier between ka and F_eff:
        //   √absorpMultiplier × √absorpMultiplier = absorpMultiplier (same net effect at SS)
        //   but now Tmax is elongated (slower ka) AND fraction is reduced (lower F_eff).
        //   Ref: Heyland DK ICM 1996 (Tmax×3); Adam M Pharmaceutics 2023 (Cmax/AUC↓50%)
        //        BIBLIOGRAPHY_DELTA.md §2.4
        const sqrtAbsorp = Math.sqrt(absorpMultiplier);
        const kaEff      = ka * sqrtAbsorp;                          // rate slows in shock
        const absFlux    = this.depotConc[dId] * kaEff * dtMin;     // depot drains slower
        const bioFlux    = absFlux * F * sqrtAbsorp;                 // F_eff also reduced
        const ratioFlux  = bioFlux / maxRate;                        // normalised cpRatio delta
        this.cpRatio[dId] = Math.min(3.0, (this.cpRatio[dId] || 0) + ratioFlux);
        this.depotConc[dId] -= absFlux;

        // Plasma elimination
        this.cpRatio[dId] -= ke * this.cpRatio[dId] * dtMin;
      } else {
        // ── IV MODEL: target approach ─────────────────────────────────────────
        const targetRatio = currentRate / maxRate;
        this.cpRatio[dId] += (ke * targetRatio - ke * this.cpRatio[dId]) * dtMin;
      }

      if ((this.cpRatio[dId] ?? 0) < 0.0001) this.cpRatio[dId] = 0;
    }

    // Publicar concentraciones plasmáticas (para visualización/debug)
    store.updatePlasmaConcentrations({ ...this.cpRatio });

    // ─── Sulfato Mg: dinámica de magnesio sérico ──────────────────────────────
    // MAGPIE Lancet 2002; ACOG 222: rango terapéutico 4-7 mg/dL.
    // Toxicidad: pérdida ROT >9, parálisis resp >10, PCR >12.
    {
      const mgCpRatio = this.cpRatio['magnesium_sulfate_iv'] ?? 0;
      const pat2 = usePatientStore.getState();
      const currentMg = pat2.vitals.magnesiumMgdL ?? 2.0;
      const crrtActive = (useCRRTStore ? useCRRTStore.getState().active : false);

      if (mgCpRatio > 0.01) {
        // Infusión activa → sube Mg sérico
        const mgRise = mgCpRatio * 0.5 * dtSeconds / 60; // mg/dL por minuto
        const renal_clearance = crrtActive ? 1.5 : 0.3;   // CRRT aclara rápido
        const newMg = Math.max(2.0, Math.min(20, currentMg + mgRise - renal_clearance * dtSeconds / 3600));
        pat2.updateVitals({ magnesiumMgdL: newMg });
      } else if (currentMg > 2.0) {
        // Decaimiento natural (renal)
        const decay = crrtActive ? 0.6 : 0.05; // mg/dL/h
        const newMg = Math.max(2.0, currentMg - decay * dtSeconds / 3600);
        pat2.updateVitals({ magnesiumMgdL: newMg });
      }
    }

    // ─── Manitol: efecto osmótico directo sobre PIC ───────────────────────────
    // Cook NCS 2020: bolo 0.5 g/kg reduce PIC ~5-15 mmHg por 90 min.
    // Cp proporcional a cpRatio: reducción máx 12 mmHg en pico (cpRatio ≈ 1.0).
    {
      const mannitolCp = this.cpRatio['mannitol'] ?? 0;
      if (mannitolCp > 0.01) {
        const pat = usePatientStore.getState();
        const currentICP = pat.vitals.icp ?? 0;
        if (currentICP > 0) {
          const icpReduction = mannitolCp * 12 * dtSeconds / 60; // gradual reduction over 60s
          pat.updateVitals({ icp: Math.max(0, currentICP - icpReduction) });
        }
      }
    }

    // ─── PD: Computar efectos sistémicos desde perfiles declarativos ──────────
    this.computePharmacodynamics();
  }

  // ─── Motor PD Data-Driven ──────────────────────────────────────────────────
  //
  // Itera sobre todos los fármacos activos y acumula sus efectos usando
  // el DrugPDProfile declarado en DRUG_CATALOG.
  //
  // SATURACIÓN: función sigmoide para evitar efectos infinitos en sobredosis.
  //   saturate(x) → 0 cuando x≈0, tiende a `max` cuando x >> 1.
  //   Cada campo acumulado pasa por su propia saturación con max/steepness propios.
  //
  private computePharmacodynamics(): void {
    const cp = this.cpRatio;

    // Acumuladores lineales (sumas directas de cp[drug]*profile[field])
    let alpha1       = 0;
    let beta1        = 0;
    let beta2        = 0;
    let vasoplegiaRev = 0;
    let vagolyticAcc = 0;
    let mapDelta     = 0;
    let hrDelta      = 0;
    let sedation     = 0;
    let analgesia    = 0;
    let nmbaRaw      = 0;
    let thermoDepr   = 0;
    let adhSuppAcc   = 0;
    let metaStressAcc = 0;
    let respDeprAcc  = 0;
    let diureticAcc  = 0;   // Fase 4.B: loop diuretics
    let antiInflammAcc = 0; // Fase 4.C: corticosteroids

    // ─── Suma data-driven ─────────────────────────────────────────────────────
    for (const dId of Object.keys(DRUG_CATALOG) as DrugId[]) {
      const c  = cp[dId] || 0;
      if (c <= 0) continue;  // optimización: skip fármacos ausentes
      const pd = DRUG_CATALOG[dId].pd;

      alpha1        += c * pd.alpha1;
      beta1         += c * pd.beta1;
      beta2         += c * pd.beta2;
      vasoplegiaRev += c * pd.vasoplegiaRev;
      vagolyticAcc  += c * pd.vagolytic;
      mapDelta      += c * pd.mapDirect;
      hrDelta       += c * pd.hrDirect;
      sedation      += c * pd.sedation;
      analgesia     += c * pd.analgesia;
      nmbaRaw       += c * pd.nmba;

      thermoDepr    += c * pd.thermoDepression;
      adhSuppAcc    += c * pd.adhSuppression;
      respDeprAcc   += c * pd.respDepressionWeight;
      diureticAcc   += c * (pd.diureticStrength ?? 0);
      antiInflammAcc += c * (pd.antiInflammatoryStrength ?? 0);

      // Estrés metabólico (PRIS): solo activo cuando Cp > 1.0 (supramáximo)
      // Escala cuadrática: (Cp - 1.0)² para onset no-lineal clínicamente realista.
      // Ref: Corbett SM, Montoya ID, Moore FA. Propofol-related infusion syndrome
      //      in intensive care patients. Pharmacotherapy 2008.
      if (c > 1.0) {
        const excess = c - 1.0;
        metaStressAcc += excess * excess * pd.metabolicStress;
      }
    }

    // ─── Saturación sigmoidal ─────────────────────────────────────────────────
    // Modelo: saturate(x, steep, max) → max / (1 + e^(-steep*(x-1))) - offset
    // Evita efectos farmacológicos infinitos con sobredosis numéricas.
    const saturate = (x: number, steepness = 2, max = 2.0): number => {
      const offset = max / (1 + Math.exp(steepness));
      return Math.max(0, max / (1 + Math.exp(-steepness * (x - 1))) - offset);
    };

    // BNM: curva empinada — a 0.5 ratio ya bloquea ~80%
    const nmbaEffect = Math.min(1.0, Math.pow(Math.max(0, nmbaRaw), 0.5) * 1.2);

    // Estrés metabólico clampado 0-1 (para cálculos de lactato en AcidBaseEngine)
    const metabolicStress = Math.min(1.0, metaStressAcc);

    // Depresión respiratoria 0-1 (para RespiratoryEngine)
    const respDepressionIdx = Math.min(1.0, respDeprAcc);

    const effects: PDSystemicEffects = {
      alpha1:          saturate(alpha1, 1.5, 3.0),
      beta1:           saturate(beta1, 1.5, 3.0),
      beta2:           Math.min(1.0, beta2),
      vasoplegiaRev:   saturate(vasoplegiaRev, 2.0, 3.0),
      vagolytic:       Math.max(-2.0, Math.min(2.0, vagolyticAcc)),  // puede ser neg (vagotónico)
      mapDirectDelta:  mapDelta,    // sin saturación — mmHg directos, clampado en CardiovascularEngine
      hrDirectDelta:   hrDelta,     // sin saturación — bpm directos, clampado en range [30,220]
      sedation:        Math.min(2.0, sedation),
      analgesia:       Math.min(2.0, analgesia),
      nmba:            Math.max(0, Math.min(1.0, nmbaEffect)),
      thermoDepression: Math.max(-0.5, Math.min(1.0, thermoDepr)), // negativo = ketamina
      adhSuppression:  Math.max(-1.5, Math.min(1.5, adhSuppAcc)),
      metabolicStress,
      respDepressionIdx,
      diureticEffect:         Math.min(6, Math.max(0, diureticAcc)),
      antiInflammatoryEffect: Math.min(1, Math.max(0, antiInflammAcc)),
    };

    usePharmacologyStore.getState().updateSystemicEffects(effects);
  }

}
