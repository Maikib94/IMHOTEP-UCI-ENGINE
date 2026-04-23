// src/core/PharmacologyEngine.ts
//
// ARQUITECTURA DATA-DRIVEN:
//   Este engine itera automáticamente sobre DRUG_CATALOG.
//   Para añadir una droga: solo agregar entrada en DRUG_CATALOG (usePharmacologyStore).
//   Este archivo NO necesita modificarse al agregar nuevos fármacos.
//
import { usePharmacologyStore, DrugId, PDSystemicEffects, DRUG_CATALOG } from '../store/usePharmacologyStore';

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
  // Antiarrítmicos (Fase 4)
  // Amiodarona: dosis ref 60 mg/h ≡ 1 mg/min (máx infusión UCI).
  //   Bolo 150 mg → cpRatio = 150/(60 × 1.5h) ≈ 1.67 → efecto Hill visible.
  //   Ref: AHA ACLS 2023; Goodman & Gilman 13ª cap. Antiarrítmicos.
  amiodarone:     60.0,    // mg/h
  // Digoxina: dosis ref 0.05 mg/h (ultra-baja → alta sensibilidad para simulación).
  //   Bolo 0.25 mg → cpRatio = 0.25/(0.05 × 2h) = 2.5 → efecto Hill claro.
  //   Ventana terapéutica: cpRatio ≈ 0.67-1.67 (0.8-2.0 ng/mL equiv).
  //   Ref: Goodman & Gilman 13ª cap. Glucósidos cardíacos; KDIGO 2024.
  digoxin:         0.05,   // mg/h
};

export class PharmacologyEngine {
  private static instance: PharmacologyEngine | null = null;

  // cpRatio: concentración plasmática normalizada por droga (0 = ausente, 1 = dosis max std)
  // Cp > 1.0 posible en sobredosis o bolos. 3.0 = techo numérico.
  private cpRatio: Record<DrugId, number>;

  private constructor() {
    this.cpRatio = Object.keys(DRUG_MAX_DOSES).reduce((acc, k) => {
      acc[k as DrugId] = 0;
      return acc;
    }, {} as Record<DrugId, number>);
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

    // ─── Procesar bolos pendientes ────────────────────────────────────────────
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

    // ─── PK Unicompartimental de Primer Orden ─────────────────────────────────
    // dC/dt = k*(Target - C)  →  C(t+dt) ≈ C + k*(Target - C)*dt
    // k = ln(2)/t½  (constante de eliminación)
    const dtMin = dtSeconds / 60;

    for (const dId of Object.keys(this.cpRatio) as DrugId[]) {
      const currentRate = infusionRates[dId] || 0;
      const maxRate     = DRUG_MAX_DOSES[dId] || 1;
      const targetRatio = currentRate / maxRate;
      const halfLife    = DRUG_CATALOG[dId].halfLifeMin;
      const k           = 0.693 / halfLife;

      this.cpRatio[dId] += (k * targetRatio - k * this.cpRatio[dId]) * dtMin;
      if (this.cpRatio[dId] < 0.0001) this.cpRatio[dId] = 0;
    }

    // Publicar concentraciones plasmáticas (para visualización/debug)
    store.updatePlasmaConcentrations({ ...this.cpRatio });

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
    };

    usePharmacologyStore.getState().updateSystemicEffects(effects);
  }

  public reset(): void {
    Object.keys(this.cpRatio).forEach(k => {
      this.cpRatio[k as DrugId] = 0;
    });
    usePharmacologyStore.getState().resetAll();
  }
}
