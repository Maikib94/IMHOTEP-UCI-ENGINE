// src/core/RespiratoryEngine.ts
//
// REGLA DE ARQUITECTURA:
//   Solo lee PDSystemicEffects — nunca plasmaConcentrations.
//   Drug-specific respiratory weights modelados en DrugPDProfile.respDepressionWeight.
//
import { usePatientStore }      from '../store/usePatientStore';
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
// Desaturación por hipoventilación/apnea (Benumof's Airway Management, 2ª Ed.)
const SPO2_HYPOVENT_THR     = 8;    // FR < 8 rpm → inicio de desaturación progresiva
const SPO2_APNEA_DESAT_RATE = 4.0;  // %/min desaturación en apnea completa a FiO2 ambiental
const SPO2_DRUG_AMPLIFIER   = 3.0;  // amplificación por fármacos sedantes/opiáceos
const SPO2_RECOVERY_RATE    = 3.0;  // %/min velocidad máxima de recuperación al restaurar ventilación
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

// Shunt adicional por hipoperfusión pulmonar (paro/bajo CO) — West, Resp. Physiology 10ª Ed.
const PERFUSION_SHUNT_MAX  = 0.85;   // shunt total cuando CO = 0 (V/Q matching imposible)
// Tasa metabólica de acumulación de CO₂ en apnea pura (Benumof's Airway Mgmt, 2ª Ed.)
const CO2_APNEA_RISE_RATE  = 3.5;    // mmHg/min — fisiológico: 3–6 mmHg/min
// Tasa máxima de caída de SpO₂ por tick: limita teleportación numérica
const SPO2_MAX_DECLINE_RATE = 8.0;   // %/min — clínicamente ~2-8 %/min en apnea/bajo CO

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

    // Solo leer PDSystemicEffects — nunca cp[] aquí.
    // pd.respDepressionIdx: pre-calculado en PharmacologyEngine como suma ponderada
    //   de DrugPDProfile.respDepressionWeight de cada fármaco activo.
    const { systemicEffects: pd } = usePharmacologyStore.getState();
    const drugRespDepressionIdx   = pd.respDepressionIdx; // 0–1

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

    // ─── Penalización directa de FR por depresión respiratoria central ───────
    // drugRespDepressionIdx ya encapsula la contribución ponderada de cada fármaco
    // (propofol, opioides, dex, barbitúricos) sobre el centro bulbar respiratorio.
    // Hasta −8 rpm a depresión máxima (idx = 1.0), adicional al centralDriveFactor.
    // Ref: Morgan & Mikhail — Clinical Anesthesiology, 5ª Ed., Cap. 8
    const drugFrPenalty = Math.round(drugRespDepressionIdx * 8);

    // FR espontánea visible en el monitor:
    // → centralDriveFactor: reduce el drive reflejo (hipoxia, acidosis, etc.)
    // → muscleCapability: BNM elimina capacidad muscular respiratoria
    // → drugFrPenalty: depresión bulbar directa (propofol, opioides, barbitúricos)
    const frSpontaneousFinal = Math.max(0, frSpontaneous - drugFrPenalty);

    // FR efectiva para el intercambio gaseoso:
    // El ventilador provee el backup mínimo (setRR), garantizando ventilación alveolar
    // incluso cuando el paciente está paralizado o profundamente sedado.
    const frEffective = Math.max(setRR, frSpontaneousFinal);

    // ─── 2. Mecánica ventilatoria ─────────────────────────────────────────
    const pplat = peep + vt / this.compliance;
    const ppico = pplat + FLOW_INSP * this.resistance;

    // ─── 3. PaCO2 ────────────────────────────────────────────────────────
    // Apnea pura (frEffective = 0):
    //   La ecuación alveolar se vuelve degenerada (VA = 0 → PaCO₂Tgt → ∞).
    //   Usar modelo de acumulación metabólica directa: ~3.5 mmHg/min (fisiológico).
    //   Ref: Benumof & Hagberg — Airway Management Principles and Practice, 2ª Ed.
    // Con ventilación activa (frEffective > 0):
    //   Ecuación alveolar estándar con tau de suavizado (Guyton Cap.41).
    const vaActual = (vt - VD_ML) * frEffective; // ventilación alveolar real (0 en apnea)
    let rawPaCO2: number;
    if (vaActual <= 0) {
      // Apnea: CO₂ sube a tasa metabólica pura — evita singularidad numérica
      rawPaCO2 = vPaCO2 + (CO2_APNEA_RISE_RATE / 60) * dt;
    } else {
      // Ventilado: ecuación alveolar con target clampado para evitar overflow
      const paCO2Tgt = Math.min(200, PACO2_NORMAL * (VA_BASAL / vaActual));
      rawPaCO2 = vPaCO2 + (paCO2Tgt - vPaCO2) * PACO2_K * dt;
    }
    const paCO2 = Math.max(15, Math.min(120, safe(rawPaCO2, 40)));

    // ─── 4. PaO2 ─────────────────────────────────────────────────────────
    // Shunt efectivo = shunt anatómico + shunt funcional por hipoperfusión pulmonar.
    // En paro cardíaco (CO = 0): sin flujo sanguíneo pulmonar, el matching V/Q
    // colapsa — la ventilación no puede oxigenar sangre que no pasa por los pulmones.
    // Ref: West JB — Respiratory Physiology, 10ª Ed., Cap.5 (V/Q relationships)
    const coFrac        = Math.min(1, Math.max(0, vCO / CO_NORMAL));
    const perfusionShunt = (1 - coFrac) * PERFUSION_SHUNT_MAX; // 0 normal → 0.85 en paro
    const effectiveShunt = Math.min(0.95, this.shunt + perfusionShunt);
    const pAO2Ideal = fio2 * PAO2_FACTOR - paCO2 / RESP_QUOTIENT;
    const rawPaO2   = pAO2Ideal * (1 - effectiveShunt) + PVO2_MIXED * effectiveShunt;
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

    // ─── SpO2: Desaturación por Hipoventilación / Apnea ──────────────────
    // Modela el agotamiento de reservas de O₂ alveolares durante ventilación
    // inadecuada, más rápido que la vía PaCO₂ → PaO₂ → Hill.
    //
    // La reserva de O₂ (paO₂ actual) amortigua la velocidad de desaturación:
    //   • FiO₂ alta → paO₂ elevado → desaturación lenta (preoxygenación)
    //   • FiO₂ ambiental + apnea → desaturación rápida (~2-3 min crítico)
    //
    // Ref: Benumof & Hagberg — Airway Management Principles and Practice, 2ª Ed.
    //      Mort TC, Curr Opin Anesthesiol 2004 — apneic desaturation rates
    if (frEffective < SPO2_HYPOVENT_THR) {
      // Severidad 0–1: apnea = 1.0, FR = 7 rpm = 0.125, FR = 4 rpm = 0.5
      const hypoSeverity = (SPO2_HYPOVENT_THR - frEffective) / SPO2_HYPOVENT_THR;
      // Reserva de O₂ basada en paO₂ actual: alta reserva → desaturación más lenta
      const o2Reserve    = Math.max(0, Math.min(1, (paO2 - 60) / 300));
      // Amplificación por fármacos: opiáceos/sedantes aumentan la tasa de desaturación
      const drugAmplify  = 1.0 + drugRespDepressionIdx * SPO2_DRUG_AMPLIFIER;
      // Tasa de desaturación por minuto, escalada por reserva O₂ disponible
      const desatPerMin  = SPO2_APNEA_DESAT_RATE * hypoSeverity * drugAmplify * (1 - o2Reserve * 0.80);
      const desatPenalty = desatPerMin * (dt / 60);
      // Solo puede BAJAR la SpO₂ respecto al ciclo previo (no sube por esta vía)
      spO2 = Math.min(spO2, vSpo2 - desatPenalty);
    } else {
      // Ventilación adecuada: SpO₂ recupera con velocidad rate-limited
      // (evita saltos instantáneos de vuelta a 98% tras reanudar ventilación)
      const recoveryPerMin = SPO2_RECOVERY_RATE * (1.0 + (fio2 - 0.21));
      spO2 = Math.min(spO2, vSpo2 + recoveryPerMin * (dt / 60));
    }

    // Rate-limit SpO₂ decline: evita caída instantánea en un solo tick.
    // SpO₂ no puede bajar más de SPO2_MAX_DECLINE_RATE por minuto.
    // Permite que la hipoxemia sea gradual y clínicamente realista.
    const maxDropThisTick = SPO2_MAX_DECLINE_RATE * (dt / 60);
    spO2 = Math.max(spO2, vSpo2 - maxDropThisTick);

    spO2 = Math.max(50, Math.min(100, safe(spO2, 97)));

    // ─── 6. EtCO2 ────────────────────────────────────────────────────────
    // ETCO₂ depende de DOS factores independientes:
    //   a) Ventilación alveolar — flujo de gas exhalado (ya modelado via frEffective)
    //   b) Aporte de CO₂ al alvéolo — requiere flujo sanguíneo pulmonar (débito cardíaco)
    //
    // Paro cardíaco (CO = 0): sin transporte de CO₂ a los pulmones → ETCO₂ → 0-5 mmHg.
    //   Este es el mecanismo fisiológico del "ETCO₂ como indicador de ROSC":
    //   cuando el corazón reinicia, el ETCO₂ sube bruscamente (CO₂ acumulado en tejidos).
    // Ref: Levine RL et al. — ETCO₂ as guide to CPR quality. Prehosp Emerg Care 1997.
    //      ACLS Guidelines 2020 — ETCO₂ < 10 mmHg = CPR inefectivo.
    let etco2: number;
    if (frEffective === 0) {
      // Apnea total: sin flujo exhalado, el capnógrafo no detecta CO₂
      etco2 = 0;
    } else {
      const peepVdEffect   = Math.max(0, (peep - 5) * 0.005);
      const alvVdFrac      = 0.05 + Math.max(0, (1 - coFrac)) * 0.30 + peepVdEffect;
      const etco2Base      = paCO2 * (1 - Math.min(0.85, alvVdFrac));
      // Factor de entrega de CO₂: proporcional a √CO (caída abrupta en bajo gasto/paro)
      // CO=5→factor=1.0 | CO=1→0.45 | CO=0→0 (paro = ETCO₂ → 0 mmHg)
      const co2DeliveryFactor = Math.sqrt(coFrac);
      etco2 = Math.max(0, Math.min(80, safe(etco2Base * co2DeliveryFactor, 38)));
    }

    upd({
      respiratoryRate: frSpontaneousFinal,
      paCO2:           parseFloat(paCO2.toFixed(1)),
      paO2:            parseFloat(paO2.toFixed(1)),
      spo2:            Math.round(spO2),
      etco2:           parseFloat(etco2.toFixed(1)),
      pplat:           parseFloat(safe(pplat, 15).toFixed(1)),
      ppico:           parseFloat(safe(ppico, 17.5).toFixed(1)),
    });
  }
}