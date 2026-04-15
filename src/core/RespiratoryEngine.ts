import { usePatientStore } from '../store/usePatientStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
const PAO2_FACTOR        = 713.0;
const RESP_QUOTIENT      = 0.8;
const HILL_P50           = 26.6;
const HILL_N             = 2.7;
const PACO2_NORMAL       = 40.0;
const PVO2_MIXED         = 40.0;
const SHUNT_BASAL        = 0.05;
const VD_ML              = 150;
const VT_BASAL           = 500;
const RR_BASAL           = 14;
const VA_BASAL           = (VT_BASAL - VD_ML) * RR_BASAL;
const COMPLIANCE_DEFAULT = 50.0;
const RESISTANCE_DEFAULT = 5.0;
const FLOW_INSP          = 0.5;
const CO_NORMAL          = 5.0;
const FR_BASE            = 14;
const FR_MIN             = 6;
const FR_MAX             = 40;
const PACO2_K            = 0.002;
const SPO2_HYPOXIA_THR   = 92;
const FR_HYPOXIA_COEFF   = 0.8;
// Acidosis: modelo sigmoidal (Guyton Cap.42 — respiración de Kussmaul)
const PH_ACIDOSIS_MID    = 7.25;      // Centro sigmoide — transición 7.35→7.15
const PH_ACIDOSIS_STEEP  = 25;        // Pendiente sigmoide
const FR_ACIDOSIS_MAX    = 18;        // Techo drive acidosis (Kussmaul máximo)
// Hemodinámico: quimiorreceptores glomus carotídeo (ATLS 11ª Ed. pág.42)
const MAP_HEMO_MID       = 55;        // Centro sigmoide (mmHg)
const MAP_HEMO_STEEP     = 0.15;      // Pendiente — respuesta gradual
const FR_HEMO_MAX        = 12;        // Techo drive hemodinámico
// Lactato directo: quimiorreceptores centrales (Pinsky: Hemodynamic Applied)
const LAC_DRIVE_THR      = 2.0;       // Umbral (mmol/L) — SSC meta clearance
const LAC_DRIVE_COEFF    = 1.5;       // rpm por mmol/L sobre umbral
const LAC_DRIVE_MAX      = 8;         // Techo drive lactato
// Inercia ventilatoria: τ suavizado exponencial
const TAU_RESP           = 30;        // 30s simulados → onset ~2 min (4τ≈95%)
const PH_ALKALOSIS_THR   = 7.45;
const FR_ALKALOSIS_COEFF = 20.0;
const MAP_PENALTY_MID    = 62.0;
const MAP_PENALTY_STEEP  = 0.12;
const MAP_PENALTY_MAX    = 30.0;

// Retorna v si es finito, fallback en caso contrario.
// CRÍTICO: Math.max(x, NaN) === NaN en JS — sin esto NaN se propaga.
function safe(v: number | undefined, fallback: number): number {
  return (v !== undefined && v !== null && isFinite(v)) ? v : fallback;
}

export class RespiratoryEngine {
  private static instance: RespiratoryEngine | null = null;
  private shunt:      number = SHUNT_BASAL;
  private compliance: number = COMPLIANCE_DEFAULT;
  private resistance: number = RESISTANCE_DEFAULT;
  private frPrev:     number = FR_BASE;

  private constructor() {}

  public static getInstance(): RespiratoryEngine {
    if (!RespiratoryEngine.instance)
      RespiratoryEngine.instance = new RespiratoryEngine();
    return RespiratoryEngine.instance;
  }

  public setShunt(v: number):      void { this.shunt      = Math.max(0, Math.min(1, v)); }
  public setCompliance(v: number): void { this.compliance = Math.max(5, Math.min(200, v)); }
  public setResistance(v: number): void { this.resistance = Math.max(1, Math.min(50, v)); }
  public reset(): void {
    this.shunt = SHUNT_BASAL;
    this.compliance = COMPLIANCE_DEFAULT;
    this.resistance = RESISTANCE_DEFAULT;
    this.frPrev = FR_BASE;
  }

  public update(dt: number): void {
    const store = usePatientStore.getState();
    const v     = store.vitals;
    const vent  = store.ventilator;
    const upd   = store.updateVitals;

    // Inyectar Estado Farmacodinámico (PK/PD) + Concentraciones Plasmáticas directas
    const { systemicEffects: pd, plasmaConcentrations: cp } = usePharmacologyStore.getState();
    // propofolCp: concentración plasmática normalizada (0-1) del Propofol
    // Lectura directa para depresión respiratoria central dosis-dependiente
    const propofolCp = cp.propofol || 0;

    // ─── Guards de entrada: ningún NaN puede entrar al pipeline ──────────
    // Si vent.vt = undefined → vaActual = NaN → paCO2 = NaN → Hill(NaN) = NaN
    const fio2   = safe(vent.fio2,  0.21);
    const vt     = safe(vent.vt,    500);
    const peep   = safe(vent.peep,  5);
    const setRR  = safe(vent.setRR, 14);
    const vSpo2  = safe(v.spo2,     98);
    const vPH    = safe(v.pH,       7.40);
    const vPaCO2 = safe(v.paCO2,    40);
    const vCO    = safe(v.cardiacOutput, 5.0);
    const vMAP     = safe(v.meanArterialPressure, 93);
    const vLactate = safe(v.lactate, 1.0);

    // ─── 1. FR target: 4 drives con equilibrio sigmoidal ─────────────────
    //
    // Modelo fisiológico: 4 estímulos independientes sumados + suavizado τ.
    // FR busca equilibrio natural — nunca sube al infinito.
    // Ref: ATLS 11ª Ed. pág.42, Guyton Cap.42, Pinsky Hemodynamic Applied.

    // Drive 1: Hipoxia — quimiorreceptores periféricos (cuerpo carotídeo)
    const hypoxiaDrive = Math.max(0, (SPO2_HYPOXIA_THR - vSpo2) * FR_HYPOXIA_COEFF);

    // Drive 2: Acidosis metabólica — sigmoide (Guyton Cap.42: Kussmaul)
    const acidosisDrive = FR_ACIDOSIS_MAX /
      (1 + Math.exp(PH_ACIDOSIS_STEEP * (vPH - PH_ACIDOSIS_MID)));

    // Drive 3: Hemodinámico — sigmoide (ATLS 11ª: taquipnea PRECOZ en shock)
    const hemodynamicDrive = FR_HEMO_MAX /
      (1 + Math.exp(MAP_HEMO_STEEP * (vMAP - MAP_HEMO_MID)));

    // Drive 4: Lactato directo — quimiorreceptores centrales (Pinsky)
    const lactateDrive = Math.min(LAC_DRIVE_MAX,
      Math.max(0, (vLactate - LAC_DRIVE_THR) * LAC_DRIVE_COEFF));

    // Drive 5: Alcalosis — depresión respiratoria
    const alkalosisDrive = Math.max(0, (vPH - PH_ALKALOSIS_THR) * FR_ALKALOSIS_COEFF);

    // Depresión Respiratoria Central (Opiáceos y Sedantes)
    // Fentanilo/Morfina deprimen violentamente el centro respiratorio (bulbo raquídeo).
    const centralDriveFactor = Math.max(0, 1.0 - pd.analgesia * 0.6 - pd.sedation * 0.3);

    // Target con equilibrio natural (suma de drives clampada)
    const rawFrTarget = FR_BASE + hypoxiaDrive + acidosisDrive
                   + hemodynamicDrive + lactateDrive - alkalosisDrive;
                   
    const frTarget = rawFrTarget * centralDriveFactor;

    // Suavizado exponencial — inercia ventilatoria (τ = 30s simulados)
    const frSmoothed = this.frPrev + (frTarget - this.frPrev) * (1 - Math.exp(-dt / TAU_RESP));
    this.frPrev = frSmoothed;

    // Parálisis Neuromuscular (Unión Neuromuscular bloqueada o parcialmente bloqueada)
    const muscleCapability = Math.max(0, 1.0 - pd.nmba);
    
    // El mínimo basal cae si hay parálisis, y el máximo también se recorta por debilidad.
    const spontOutput = Math.max(FR_MIN * muscleCapability, Math.min(FR_MAX, Math.round(frSmoothed)));
    const frSpontaneous = Math.round(spontOutput * muscleCapability);

    const frActual = Math.max(setRR, frSpontaneous);

    // ─── Depresión respiratoria directa por Propofol ─────────────────────
    // Propofol deprime los neuronas respiratorias del bulbo raquídeo (GABA-A)
    // de forma dosis-dependiente e independiente del drive reflejo (Kussmaul, hipoxia).
    // Esta penalización es visible incluso en pacientes ventilados (↓ FR efectiva).
    // Ref: Morgan & Mikhail — Clinical Anesthesiology, 5ª Ed., Cap. 8
    const propofolFrPenalty = Math.round(propofolCp * 6); // hasta −6 rpm a 4 mg/kg/h
    const frFinal = Math.max(FR_MIN, frActual - propofolFrPenalty);

    // ─── 2. Mecánica ventilatoria ─────────────────────────────────────────
    const pplat = peep + vt / this.compliance;
    const ppico = pplat + FLOW_INSP * this.resistance;

    // ─── 3. PaCO2 ────────────────────────────────────────────────────────
    // Usar frFinal (con efecto Propofol) para el cálculo de ventilación alveolar
    const vaActual = Math.max(1, (vt - VD_ML) * frFinal);
    const paCO2Tgt = PACO2_NORMAL * (VA_BASAL / vaActual);
    const rawPaCO2 = vPaCO2 + (paCO2Tgt - vPaCO2) * PACO2_K * dt;
    const paCO2    = Math.max(15, Math.min(120, safe(rawPaCO2, 40)));

    // ─── 4. PaO2 ─────────────────────────────────────────────────────────
    const pAO2Ideal = fio2 * PAO2_FACTOR - paCO2 / RESP_QUOTIENT;
    const rawPaO2   = pAO2Ideal * (1 - this.shunt) + PVO2_MIXED * this.shunt;
    const paO2      = Math.max(20, Math.min(600, safe(rawPaO2, 97)));

    // ─── 5. SpO2: Hill — triple guard anti-NaN ────────────────────────────
    // Fuentes de NaN: paO2 negativo, denominador cero, resultado no finito.
    // paO2 está garantizado >= 20 por el guard anterior.
    let spO2 = 97; // fallback seguro
    try {
      const pO2n  = Math.pow(paO2, HILL_N);
      const p50n  = Math.pow(HILL_P50, HILL_N);
      const denom = pO2n + p50n;
      if (denom > 0 && isFinite(pO2n) && isFinite(p50n)) {
        const raw = (pO2n / denom) * 100;
        if (isFinite(raw)) spO2 = raw;
      }
    } catch (_) {
      spO2 = 97;
    }

    // MAP penalty: solo en estados patológicos (shunt > basal)
    if (this.shunt > SHUNT_BASAL) {
      const mapPen = MAP_PENALTY_MAX /
        (1 + Math.exp(MAP_PENALTY_STEEP * (vMAP - MAP_PENALTY_MID)));
      if (isFinite(mapPen)) spO2 -= mapPen;
    }
    spO2 = Math.max(50, Math.min(100, safe(spO2, 97)));

    // ─── 6. EtCO2 ────────────────────────────────────────────────────────
    const coRatio      = vCO / CO_NORMAL;
    const peepVdEffect = Math.max(0, (peep - 5) * 0.005);
    const alvVdFrac    = 0.05 + Math.max(0, (1 - coRatio)) * 0.30 + peepVdEffect;
    const etco2        = Math.max(5, Math.min(80,
      safe(paCO2 * (1 - Math.min(0.85, alvVdFrac)), 38)
    ));

    upd({
      respiratoryRate: frFinal,
      paCO2:           parseFloat(paCO2.toFixed(1)),
      paO2:            parseFloat(paO2.toFixed(1)),
      spo2:            Math.round(spO2),
      etco2:           parseFloat(etco2.toFixed(1)),
      pplat:           parseFloat(safe(pplat, 15).toFixed(1)),
      ppico:           parseFloat(safe(ppico, 17.5).toFixed(1)),
    });
  }
}