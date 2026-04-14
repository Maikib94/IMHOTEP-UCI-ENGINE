import { usePatientStore } from '../store/usePatientStore';
import type { PupilState }  from '../store/usePatientStore';

// Umbrales MAP (hipoperfusión cerebral — Guyton §62)
const MAP_MILD    = 65;
const MAP_MOD     = 50;
const MAP_SEVERE  = 40;

// Umbrales SpO2 (hipoxia cerebral)
const SPO2_MILD   = 90;  const SPO2_D_MILD   = 2;
const SPO2_MOD    = 80;  const SPO2_D_MOD    = 4;
const SPO2_SEVERE = 70;  const SPO2_D_SEVERE = 6;

// Propofol
const PROP_MILD   = 0.5; const PROP_D_MILD   = 2;
const PROP_MOD    = 1.5; const PROP_D_MOD    = 5;
const PROP_COMA   = 3.0;

const GCS_MAX = 15;
const GCS_MIN = 3;

// K = 0.08 → τ = 12.5 s sim ≈ 3 s real a 1x.
// El float interno evita rounding-lock: Math.round(15 - 0.3) = 15
// hacía que el GCS nunca cayera. Con gcsFloat acumula correctamente.
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
    const ad    = store.activeDrugs;
    const upd   = store.updateVitals;

    // Propofol coma profundo: efecto inmediato
    if (ad.propofol >= PROP_COMA) {
      this.gcsFloat = GCS_MIN;
      upd({ gcs: GCS_MIN, pupilState: 'miotic' as PupilState });
      return;
    }

    // ─── 1. MAP → GCS directo (fórmula Miguel — Guyton §62) ──────────────
    // Respuesta rápida: la presión de perfusión cerebral (PPC = MAP - PIC)
    // cae en segundos cuando MAP < 50. No hay inercia fisiológica relevante.
    const map = isFinite(v.meanArterialPressure) ? v.meanArterialPressure : 93;
    let gcsFromMAP = GCS_MAX;
    if (map < MAP_SEVERE) {
      // Caída severa: GCS proporcional al déficit
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((MAP_SEVERE - map) / 2) - 8);
    } else if (map < MAP_MOD) {
      // MAP 40-50: fórmula de Miguel
      gcsFromMAP = Math.max(GCS_MIN, GCS_MAX - Math.floor((50 - map) / 2));
    } else if (map < MAP_MILD) {
      // MAP 50-65: penalización leve
      gcsFromMAP = GCS_MAX - 2;
    }

    // ─── 2. SpO2 → penalización sumable ──────────────────────────────────
    const spo2 = isFinite(v.spo2) ? v.spo2 : 98;
    let spo2Pen = 0;
    if      (spo2 < SPO2_SEVERE) spo2Pen = SPO2_D_SEVERE;
    else if (spo2 < SPO2_MOD)    spo2Pen = SPO2_D_MOD;
    else if (spo2 < SPO2_MILD)   spo2Pen = SPO2_D_MILD;

    // ─── 3. Propofol → penalización sumable ──────────────────────────────
    let propPen = 0;
    if      (ad.propofol >= PROP_MOD)  propPen = PROP_D_MOD;
    else if (ad.propofol >= PROP_MILD) propPen = PROP_D_MILD;

    // ─── 4. Target final ─────────────────────────────────────────────────
    const gcsTgt = Math.max(GCS_MIN, gcsFromMAP - spo2Pen - propPen);

    // ─── 5. Sincronizar gcsFloat si hay drift con el store ────────────────
    if (Math.abs(this.gcsFloat - v.gcs) > 3) this.gcsFloat = v.gcs;

    // ─── 6. Convergencia con float (evita rounding-lock) ─────────────────
    this.gcsFloat = Math.max(GCS_MIN, Math.min(GCS_MAX,
      this.gcsFloat + (gcsTgt - this.gcsFloat) * K_GCS * dt
    ));
    const newGCS = Math.round(this.gcsFloat);

    // ─── 7. Pupilas ───────────────────────────────────────────────────────
    let pupilState: PupilState;
    if      (ad.propofol >= PROP_MILD) pupilState = 'miotic';
    else if (newGCS <= 8)              pupilState = 'unreactive';
    else if (newGCS <= 12)             pupilState = 'sluggish';
    else                               pupilState = 'reactive';

    upd({ gcs: newGCS, pupilState });
  }
}