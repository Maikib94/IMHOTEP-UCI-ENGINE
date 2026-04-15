import { usePatientStore } from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import type { PupilState }  from '../store/usePatientStore';

// Umbrales MAP (hipoperfusión cerebral — Guyton §62)
const MAP_MILD    = 65;
const MAP_MOD     = 50;
const MAP_SEVERE  = 40;

// Umbrales SpO2 (hipoxia cerebral)
const SPO2_MILD   = 90;  const SPO2_D_MILD   = 2;
const SPO2_MOD    = 80;  const SPO2_D_MOD    = 4;
const SPO2_SEVERE = 70;  const SPO2_D_SEVERE = 6;

// Sedation Effect Thresholds (Normalized from PD)
const SED_MILD    = 0.3;
const SED_MOD     = 0.7;
const SED_COMA    = 1.1;

const GCS_MAX = 15;
const GCS_MIN = 3;

// K = 0.08 → τ = 12.5 s sim ≈ 3 s real a 1x.
const K_GCS = 0.08;

export class NeuroEngine {
  private static instance: NeuroEngine | null = null;
  private gcsFloat: number = GCS_MAX;

  private constructor() {}

  public static getInstance(): NeuroEngine {
    if (NeuroEngine.instance === null)
      NeuroEngine.instance = new NeuroEngine();
    return NeuroEngine.instance;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const upd   = store.updateVitals;

    // Efecto PD Sedación
    const { systemicEffects: pd } = usePharmacologyStore.getState();

    // Coma profundo por sedación: efecto inmediato
    if (pd.sedation >= SED_COMA) {
      this.gcsFloat = GCS_MIN;
      upd({ gcs: GCS_MIN, pupilState: 'miotic' as PupilState });
      return;
    }

    // ─── 1. MAP → GCS directo (hipoperfusión cerebral) ───────────────────
    const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
    let gcsFromMAP = GCS_MAX;
    if (map < MAP_SEVERE) {
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((MAP_SEVERE - map) / 2) - 8);
    } else if (map < MAP_MOD) {
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((50 - map) / 2));
    } else if (map < MAP_MILD) {
      gcsFromMAP = GCS_MAX - 2;
    }

    // ─── 2. SpO2 → penalización sumable ──────────────────────────────────
    const spo2 = isFinite(v.spo2) ? v.spo2 : 98;
    let spo2Pen = 0;
    if      (spo2 < SPO2_SEVERE) spo2Pen = SPO2_D_SEVERE;
    else if (spo2 < SPO2_MOD)    spo2Pen = SPO2_D_MOD;
    else if (spo2 < SPO2_MILD)   spo2Pen = SPO2_D_MILD;

    // ─── 3. Sedación (PD) → penalización sumable ─────────────────────────
    let sedPen = 0;
    if      (pd.sedation >= SED_MOD)  sedPen = 7;
    else if (pd.sedation >= SED_MILD) sedPen = 3;

    // ─── 4. Target final ─────────────────────────────────────────────────
    const gcsTgt = Math.max(GCS_MIN, gcsFromMAP - spo2Pen - sedPen);

    // ─── 5. Sincronizar gcsFloat si hay drift con el store ────────────────
    if (Math.abs(this.gcsFloat - v.gcs) > 3) this.gcsFloat = v.gcs;

    // ─── 6. Convergencia con float (evita rounding-lock) ─────────────────
    this.gcsFloat = Math.max(GCS_MIN, Math.min(GCS_MAX,
      this.gcsFloat + (gcsTgt - this.gcsFloat) * K_GCS * dt
    ));
    const newGCS = Math.round(this.gcsFloat);

    // ─── 7. Pupilas ───────────────────────────────────────────────────────
    let pupilState: PupilState;
    if      (pd.sedation >= SED_MILD) pupilState = 'miotic';
    else if (newGCS <= 8)              pupilState = 'unreactive';
    else if (newGCS <= 12)             pupilState = 'sluggish';
    else                               pupilState = 'reactive';

    upd({ gcs: newGCS, pupilState });
  }
}