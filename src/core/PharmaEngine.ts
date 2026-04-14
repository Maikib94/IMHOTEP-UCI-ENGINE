import { usePatientStore } from '../store/usePatientStore';

const K_ELIM    = 0.002;
const K_UPTAKE  = 0.005;
const PLASMA_MAX = 3.0;

export class PharmaEngine {
  private static instance: PharmaEngine | null = null;
  private constructor() {}

  public static getInstance(): PharmaEngine {
    if (PharmaEngine.instance === null) PharmaEngine.instance = new PharmaEngine();
    return PharmaEngine.instance;
  }

  public update(dt: number): void {
    const store   = usePatientStore.getState();
    const inf     = store.infusions;
    const ad      = store.activeDrugs;
    const setDrug = store.setActiveDrug;
    const decay   = 1 - K_ELIM * dt;

    setDrug('noradrenaline', Math.max(0, Math.min(PLASMA_MAX,
      ad.noradrenaline * decay + inf.noradrenaline * K_UPTAKE * dt)));

    setDrug('propofol', Math.max(0, Math.min(PLASMA_MAX,
      ad.propofol * decay + inf.propofol * K_UPTAKE * dt)));

    setDrug('dobutamine', Math.max(0, Math.min(PLASMA_MAX,
      ad.dobutamine * decay + inf.dobutamine * K_UPTAKE * dt)));
  }
}