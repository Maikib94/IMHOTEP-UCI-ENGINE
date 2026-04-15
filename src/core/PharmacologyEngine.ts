import { usePharmacologyStore, DrugId, PDSystemicEffects, DRUG_CATALOG } from '../store/usePharmacologyStore';

// standardMaxDose: representa el techo típico (o dosis alta estándar) para la droga.
// Cuando el input == standardMaxDose, el efecto normalizado (0 a 1.0) tenderá a 1.0 en estado estacionario.
const DRUG_MAX_DOSES: Record<DrugId, number> = {
  // Vasopresores
  noradrenaline:   0.5,    // mcg/kg/min (0.5 es dosis alta)
  adrenaline:      0.5,    // mcg/kg/min
  vasopressin:     4.0,    // U/h (aprox 0.06 U/min, 4 U/h es shock refractario)
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
};

export class PharmacologyEngine {
  private static instance: PharmacologyEngine | null = null;
  // Guardamos un estado rápido de "efecto normalizado" interno (Concentración Plasmática Relativa)
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

    // Mapeo PK (Primer Orden / Unicompartimental Normalizado)
    for (const dId of Object.keys(this.cpRatio) as DrugId[]) {
      const currentRate = infusionRates[dId] || 0;
      const maxRate = DRUG_MAX_DOSES[dId];
      // Target Ratio can go above 1.0 if user inputs extreme doses, scaling linear/exponential.
      const targetRatio = currentRate / (maxRate || 1); 

      // dtMinutes
      const dtMin = dtSeconds / 60;
      
      const halfLife = DRUG_CATALOG[dId].halfLifeMin;
      const k = 0.693 / halfLife; // Constante de eliminación

      // EDO simplificada: dC/dt = k * Target - k * C
      // En un paso dt: C = C + (k * Target - k * C) * dt
      this.cpRatio[dId] += (k * targetRatio - k * this.cpRatio[dId]) * dtMin;
      
      // Sanitizar nan/negativos
      if (this.cpRatio[dId] < 0.0001) this.cpRatio[dId] = 0;
    }

    // Actualizar el estado visual base
    store.updatePlasmaConcentrations({ ...this.cpRatio });

    // Mapeo PD (Farmacodinámico) cruzando perfiles de receptores
    this.computePharmacodynamics();
  }

  private computePharmacodynamics() {
    const c = this.cpRatio;
    
    // Función sigmoidea para bloquear excesos irreales y simular saturación
    const saturate = (x: number, steepness = 2, max = 2.0) => max / (1 + Math.exp(-steepness * (x - 1))) - (max / (1 + Math.exp(steepness)));

    // EFECTOS VASOACTIVOS
    // Nora es mixto, pero predominantemente alpha1 (+1.5x SVR)
    // Adrenalina es mixto beta1/alpha1
    let alpha1 = 
      c.noradrenaline * 1.5 + 
      c.adrenaline * 1.0 + 
      (c.dopamine > 0.5 ? (c.dopamine - 0.5) * 1.0 : 0); // Dopamina a dosis altas cruza a alpha
      
    let beta1 = 
      c.dobutamine * 1.5 + 
      c.milrinone * 1.2 + 
      c.levosimendan * 1.0 + 
      c.adrenaline * 1.5 + 
      (c.dopamine < 0.5 ? c.dopamine * 2.0 : 1.0); // Dopamina dosis inotrópica
      
    // Vasopressin and Methylene Blue act bypassing adrenergic (V1, Nitric Oxide pathway)
    let vasoplegiaRev = c.vasopressin * 1.5 + c.methylene_blue * 2.0;

    // EFECTOS NEUROLÓGICOS & SEDANTES
    // Propofol, Midazolam, Thiopental -> GABA
    let sed = c.propofol * 1.2 + c.midazolam * 1.0 + c.thiopental * 1.5 + c.ketamine * 0.8;
    let dex = c.dexmedetomidine * 1.0; // Alpha2 agonista (sedación ligera sin depresión resp profunda)
    
    // Analgésicos -> Mu (depresor resp potente)
    let analg = c.fentanyl * 1.5 + c.remifentanil * 1.5 + c.morphine * 1.0 + c.ketamine * 0.8;

    // BLOQUEO NEUROMUSCULAR (Interfiere directo en la musculatura de rescate ventilatorio y esfuerzo inspiratorio)
    let nmbaTotal = c.rocuronium + c.cisatracurium + c.atracurium + c.pancuronium;
    // Saturar rápido (curva empinada: con 0.5 ratio, ya bloquea 80%)
    let nmbaEffect = Math.min(1.0, Math.pow(nmbaTotal, 0.5) * 1.2); 

    const effects: PDSystemicEffects = {
      alpha1: saturate(alpha1, 1.5, 3.0),
      beta1: saturate(beta1, 1.5, 3.0),
      beta2: c.adrenaline > 0 ? 1.0 : 0, // placeholder — salbutamol not yet implemented
      vasoplegiaRev: saturate(vasoplegiaRev, 2.0, 3.0),
      sedation: Math.min(2.0, sed + dex * 0.5),
      analgesia: Math.min(2.0, analg),
      nmba: Math.max(0, Math.min(1.0, nmbaEffect)),
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
