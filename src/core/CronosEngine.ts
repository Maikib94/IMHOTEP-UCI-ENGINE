// src/core/CronosEngine.ts
// CAMBIO: PharmacologyEngine agregado como el motor PK/PD clínico.
// Orden actualizado:
// PathologyEngine → MicrobiologyEngine → PharmacologyEngine → CardiovascularEngine
// → RespiratoryEngine → AcidBaseEngine → RenalEngine → NeuroEngine → LabEngine
// → AcuteMortalityEngine (último — lee vitals FINALES del tick)

import { useTimeStore } from '../store/useTimeStore';
import { usePatientStore } from '../store/usePatientStore';
import { useGlycemicStore } from '../store/useGlycemicStore';
import { MicrobiologyEngine } from './MicrobiologyEngine';
import { InfectoEngine } from './InfectoEngine';
import { PathologyEngine } from './PathologyEngine';
import { PharmacologyEngine } from './PharmacologyEngine';
import { CardiovascularEngine } from './CardiovascularEngine';
import { RespiratoryEngine } from './RespiratoryEngine';
import { AcidBaseEngine } from './AcidBaseEngine';
import { RenalEngine } from './RenalEngine';
import { NeuroEngine } from './NeuroEngine';
import { LabEngine } from './LabEngine';
import { PrognosisEngine } from './PrognosisEngine';
import { GlycemicEngine } from './GlycemicEngine';
import { useMonitoringStore } from '../store/useMonitoringStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { CrosstalkEngine }     from './CrosstalkEngine';
import { AcuteMortalityEngine } from './AcuteMortalityEngine';

const TICKS_PER_REAL_SECOND = 240;
// DT_BASE: sim-seconds per tick. With 240 ticks/real-sec, DT_BASE=1/240
// gives exactly 1 sim-sec per real-sec at speedMultiplier=1 (real-time).
// x10 → 10 sim-sec/real-sec, x60 → 60 sim-sec/real-sec.
const DT_BASE = 1.0 / TICKS_PER_REAL_SECOND;
const MAX_ELAPSED_S = 0.1;

// Minimum real-time interval between React store "vitals flush" notifications.
// Engines write to internal state every tick; the UI only needs 10 Hz.
const VITALS_PUBLISH_INTERVAL_MS = 100;

export class CronosEngine {
  private static instance: CronosEngine | null = null;
  private rafId: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private lastVitalsPublishMs: number = 0;

  private constructor() { }

  public static getInstance(): CronosEngine {
    if (CronosEngine.instance === null)
      CronosEngine.instance = new CronosEngine();
    return CronosEngine.instance;
  }

  public initialize(): void {
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public start(): void { this.initialize(); }
  public stop(): void { cancelAnimationFrame(this.rafId); this.rafId = 0; }
  public destroy(): void { this.stop(); }
  public pause(): void { this.stop(); }

  private loop = (timestamp: number): void => {
    const timeStore = useTimeStore.getState();

    if (!timeStore.isRunning) {
      this.lastTime = timestamp;
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    const elapsed = Math.min((timestamp - this.lastTime) / 1000, MAX_ELAPSED_S);
    this.lastTime = timestamp;
    this.accumulator += elapsed * TICKS_PER_REAL_SECOND;

    const ticksToRun = Math.floor(this.accumulator);
    this.accumulator -= ticksToRun;

    const dt = DT_BASE * timeStore.speedMultiplier;
    for (let i = 0; i < ticksToRun; i++) {
      this.tick(dt);
    }

    // Throttle React vitals re-renders to 10 Hz (100ms real time).
    // Engines compute internally every tick; this flush triggers UI subscriptions.
    if (timestamp - this.lastVitalsPublishMs >= VITALS_PUBLISH_INTERVAL_MS) {
      this.lastVitalsPublishMs = timestamp;
      usePatientStore.getState().publishVitals();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private tick(dt: number): void {
    if (usePatientStore.getState().ventilator.isPaused) return;

    useTimeStore.getState().advanceTick(dt);

    // Orden clínico:
    //   Pharma → Renal (drena vol) → Resp → Cardio (lee vol+pMean) → AcidBase
    //   RenalEngine ANTES de Cardiovascular: volemia actualizada en mismo tick.
    //   Bellomo Lancet 2012; Schrier NEJM 2007.
    MicrobiologyEngine.getInstance().update(dt);
    InfectoEngine.getInstance().update(dt);               // ← cobertura empírica → debuffs
    PathologyEngine.getInstance().update(dt);
    PharmacologyEngine.getInstance().update(dt);
    RenalEngine.getInstance().update(dt);                 // ← drena bloodVolume por diuresis
    RespiratoryEngine.getInstance().update(dt);           // ← escribe pMean
    CardiovascularEngine.getInstance().updateHemodynamics(dt); // ← lee vol+pMean+debuffs

    // ─── HIDRATACIÓN DE MANTENIMIENTO ───────────────────────────────────────────
    //   30% de retención IV en críticos (Hahn RG et al., BJA 2018-2021, volume kinetics).
    {
      const pat = usePatientStore.getState();
      if (pat.maintenanceFluidRate_mLh > 0) {
        const delta_mL = (pat.maintenanceFluidRate_mLh / 3600) * dt;
        pat.addMaintenanceTick(delta_mL);
      }
    }
    AcidBaseEngine.getInstance().update(dt);
    NeuroEngine.getInstance().update(dt);
    LabEngine.getInstance().update();
    PrognosisEngine.getInstance().update(dt);
    GlycemicEngine.getInstance().update(dt);
    CrosstalkEngine.getInstance().update(dt); // ECMO ↔ Vent + CRRT ↔ Pharma/Electrolytes

    // ── MORTALIDAD AGUDA (siempre al final — lee vitals finales del tick) ──────
    // AcuteMortalityEngine evalúa 13 causas de muerte por umbral fisiológico.
    // Lee vitals FINALES (post-cardiovascular, respiratory, renal, acidbase).
    // Si dispara muerte, pausa simulación y notifica PrognosisStore.
    // Tiene prioridad sobre PrognosisEngine si ambos coinciden en el mismo tick.
    AcuteMortalityEngine.getInstance().update(dt);

    // ── 5.C: HGT programado ───────────────────────────────────────────────────
    // Dispara snapshot discreto (con ruido glucómetro σ=5 mg/dL) según frecuencia
    // configurada. CronosEngine es el "reloj" que decide cuándo medir.
    const glyc = useGlycemicStore.getState();
    const currentTick = useTimeStore.getState().ticks;
    const freq = glyc.hgtFrequency;
    if (freq !== 'off') {
      if (glyc.nextHgtTick === null) {
        // Primera vez: programar siguiente medición
        const intervalH = parseInt(freq, 10);
        useGlycemicStore.setState({ nextHgtTick: currentTick + intervalH * 3600 });
      } else if (currentTick >= glyc.nextHgtTick) {
        // Disparar HGT programado y reagendar
        const record = glyc.triggerManualHgt('scheduled');
        record.tickAt   = currentTick;
        record.simTimeS = currentTick;
        const intervalH = parseInt(freq, 10);
        useGlycemicStore.setState({
          nextHgtTick: currentTick + intervalH * 3600,
        });

        // ── 5.D: Alertas críticas → HGT adicional inmediato si severo ──────
        // Si BG < 54 o > 250, disparar alerta crítica (ya computada en store)
        const bg = glyc.bgContinuous;
        if (bg < 54 || bg > 250) {
          useGlycemicStore.getState().triggerManualHgt('critical_alert');
        }
      }
    }

    // ── DOSIS A HORARIO (Fase 1.B) ───────────────────────────────────────────
    // Dispara bolos programados cuando el tick sim alcanza nextTickAt.
    // Usa queueSlowBolus (5 min administración) para simular infusión IV corta.
    {
      const ph   = usePharmacologyStore.getState();
      const pEng = PharmacologyEngine.getInstance();
      ph.scheduledDoses.forEach(s => {
        if (!s.active) return;
        if (currentTick >= s.nextTickAt) {
          pEng.queueSlowBolus(s.drug, s.doseMg, 300);  // 300 s ≈ 5 min
          usePharmacologyStore.setState(state => ({
            scheduledDoses: state.scheduledDoses.map(x =>
              x.id === s.id
                ? { ...x, nextTickAt: currentTick + x.intervalH * 3600 }
                : x
            ),
          }));
        }
      });
    }

    // ── ALARMA RECALIBRACIÓN PiCCO (3.B) ─────────────────────────────────────
    // Huber BMC Anesthesiol 2015: PE < 30% solo hasta ~8h sin recalibración.
    // Hamzaoui CCM 2008: recalibración 1-2h en paciente inestable.
    const mon = useMonitoringStore.getState();
    if (mon.invasiveMode === 'picco' && mon.lastThermodilutionTick !== null) {
      const ticksSince   = currentTick - mon.lastThermodilutionTick;
      const eightHoursS  = 8 * 3600;
      if (ticksSince >= eightHoursS && !mon.thermodilutionAlarmActive) {
        useMonitoringStore.setState({ thermodilutionAlarmActive: true });
      }
    }

    // ── SVV sampling para mini-trend (cada 30 sim-segundos) ────────────────
    if (mon.invasiveMode === 'picco' && currentTick % 30 === 0) {
      const svv = mon.piccoSnapshot?.svv;
      if (svv !== undefined) mon.addSvvSample(svv);
    }
  }
}