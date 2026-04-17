// src/core/RespiratoryEngine.ts
export interface VentilatorSettings {
  mode: 'VCV' | 'PCV' | 'PSV';
  fio2: number;
  peep: number;
  vt: number;
  rr: number;
  tInsp: number;
  pSupport: number;
}

export interface LungMechanics {
  compliance: number;
  resistance: number;
  p01: number;
  autoPeep: number;
  pPeak: number;
  pPlat: number;
  pMean: number;
  rsbi: number;
  isRecruiting: boolean;
}

export class RespiratoryEngine {
  // Patrón Singleton restaurado
  private static instance: RespiratoryEngine | null = null;

  private constructor() { }

  public static getInstance(): RespiratoryEngine {
    if (!RespiratoryEngine.instance) {
      RespiratoryEngine.instance = new RespiratoryEngine();
    }
    return RespiratoryEngine.instance;
  }

  // Función reset solicitada por InstructorPanel
  public reset(): void {
    // Aquí puedes reiniciar estados internos si en el futuro agregas variables persistentes
  }

  // Ahora es un método de instancia (public) en lugar de estático (public static)
  public calculatePhysics(
    settings: VentilatorSettings,
    sdraSeverity: 'none' | 'mild' | 'moderate' | 'severe',
    patientEffort: number,
    dt: number
  ): LungMechanics {

    // 1. Dinámica de Compliance
    let baseCompliance = 60;
    if (sdraSeverity === 'mild') baseCompliance = 40;
    if (sdraSeverity === 'moderate') baseCompliance = 25;
    if (sdraSeverity === 'severe') baseCompliance = 15;

    const resistance = 15;

    // Protecciones contra división por cero (NaN) que podrían crashear React
    const tInsp = settings.tInsp > 0 ? settings.tInsp : 1;
    const rr = settings.rr > 0 ? settings.rr : 12;
    const vtLiters = settings.vt / 1000;

    const flowLPS = vtLiters / tInsp;
    const pPlat = settings.peep + (settings.vt / baseCompliance);
    const pPeak = pPlat + (flowLPS * resistance);

    const tTotal = 60 / rr;
    const pMean = settings.peep + ((pPeak - settings.peep) * (tInsp / tTotal));

    const tExp = tTotal - tInsp;
    const autoPeep = tExp < 1.5 ? (1.5 - tExp) * 5 : 0;

    let p01 = (patientEffort * 0.5) + (sdraSeverity === 'severe' ? 3 : 0);
    if (p01 > 4) baseCompliance *= 0.99;

    const rsbi = vtLiters > 0 ? rr / vtLiters : 0;

    return {
      compliance: baseCompliance,
      resistance,
      p01,
      autoPeep,
      pPeak,
      pPlat,
      pMean,
      rsbi,
      isRecruiting: false
    };
  }
}