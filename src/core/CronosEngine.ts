// src/core/CronosEngine.ts
// CAMBIO: PharmacologyEngine agregado como el motor PK/PD clínico.
// Orden actualizado:
// PathologyEngine → MicrobiologyEngine → PharmacologyEngine → CardiovascularEngine
// → RespiratoryEngine → AcidBaseEngine → RenalEngine → NeuroEngine → LabEngine

import { useTimeStore } from '../store/useTimeStore';
import { usePatientStore } from '../store/usePatientStore';
import { MicrobiologyEngine } from './MicrobiologyEngine';
import { PathologyEngine } from './PathologyEngine';
import { PharmacologyEngine } from './PharmacologyEngine';
import { CardiovascularEngine } from './CardiovascularEngine';
import { RespiratoryEngine } from './RespiratoryEngine';
import { AcidBaseEngine } from './AcidBaseEngine';
import { RenalEngine } from './RenalEngine';
import { NeuroEngine } from './NeuroEngine';
import { LabEngine } from './LabEngine';
import { PrognosisEngine } from './PrognosisEngine';

const TICKS_PER_REAL_SECOND = 240;
const DT_BASE = 1.0;
const MAX_ELAPSED_S = 0.1;

export class CronosEngine {
  private static instance: CronosEngine | null = null;
  private rafId: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;

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

    this.rafId = requestAnimationFrame(this.loop);
  };

  private tick(dt: number): void {
    if (usePatientStore.getState().ventilator.isPaused) return;

    useTimeStore.getState().advanceTick(dt);

    // Orden clínico: Resp antes que Cardio para que pMean esté disponible
    // en el mismo tick (Fase 5 — Guyton / ARDSnet coupling)
    MicrobiologyEngine.getInstance().update(dt);
    PathologyEngine.getInstance().update(dt);
    PharmacologyEngine.getInstance().update(dt);
    RespiratoryEngine.getInstance().update(dt);          // ← escribe pMean
    CardiovascularEngine.getInstance().updateHemodynamics(dt); // ← lee pMean
    AcidBaseEngine.getInstance().update(dt);
    RenalEngine.getInstance().update(dt);
    NeuroEngine.getInstance().update(dt);
    LabEngine.getInstance().update();
    PrognosisEngine.getInstance().update(dt);
  }
}