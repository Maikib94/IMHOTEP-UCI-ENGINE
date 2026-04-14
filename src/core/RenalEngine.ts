import { usePatientStore } from '../store/usePatientStore';

const MAP_PLATEAU_MIN         = 80;
const MAP_OLIGO_TOP           = 65;
const MAP_FAILURE             = 45;
const UO_NORMAL               = 1.0;
const UO_PLATEAU_LOW          = 0.5;
const UO_FAILURE              = 0.0;
const PRESSURE_DIURESIS_THR   = 80;
const PRESSURE_DIURESIS_COEFF = 0.008;
const K_TUBULAR               = 0.02;
const UO_MIN                  = 0.0;
const UO_MAX                  = 5.0;

export class RenalEngine {
  private static instance: RenalEngine | null = null;
  private constructor() {}

  public static getInstance(): RenalEngine {
    if (RenalEngine.instance === null)
      RenalEngine.instance = new RenalEngine();
    return RenalEngine.instance;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;
    const map   = v.meanArterialPressure;

    let uoTarget: number;

    if (map >= MAP_PLATEAU_MIN) {
      const bonus = Math.max(0, (map - PRESSURE_DIURESIS_THR) * PRESSURE_DIURESIS_COEFF);
      uoTarget = UO_NORMAL + bonus;

    } else if (map >= MAP_OLIGO_TOP) {
      const t  = (map - MAP_OLIGO_TOP) / (MAP_PLATEAU_MIN - MAP_OLIGO_TOP);
      uoTarget = UO_PLATEAU_LOW + t * (UO_NORMAL - UO_PLATEAU_LOW);

    } else if (map >= MAP_FAILURE) {
      const t      = (map - MAP_FAILURE) / (MAP_OLIGO_TOP - MAP_FAILURE);
      const smooth = t * t * (3 - 2 * t);
      uoTarget = UO_FAILURE + smooth * (UO_PLATEAU_LOW - UO_FAILURE);

    } else {
      uoTarget = UO_FAILURE;
    }

    const newUO = Math.max(UO_MIN, Math.min(UO_MAX,
      v.urineOutput + (uoTarget - v.urineOutput) * K_TUBULAR * dt
    ));

    upd({ urineOutput: parseFloat(newUO.toFixed(2)) });
  }
}