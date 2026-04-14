// src/core/CronosEngine.ts
// CAMBIO: PathologyEngine agregado como PRIMER engine en la cadena.
// Orden actualizado:
// PathologyEngine → PharmaEngine → CardiovascularEngine → RespiratoryEngine
// → AcidBaseEngine → RenalEngine → NeuroEngine → LabEngine

import { useTimeStore } from '../store/useTimeStore';
import { MicrobiologyEngine } from './MicrobiologyEngine';
import { PathologyEngine } from './PathologyEngine';
import { PharmaEngine } from './PharmaEngine';
import { CardiovascularEngine } from './CardiovascularEngine';
import { RespiratoryEngine } from './RespiratoryEngine';
import { AcidBaseEngine } from './AcidBaseEngine';
import { RenalEngine } from './RenalEngine';
import { NeuroEngine } from './NeuroEngine';
import { LabEngine } from './LabEngine';

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
    useTimeStore.getState().advanceTick(dt);

    // MicrobiologyEngine PRIMERO: calcula sepsisProgressionModifier
    MicrobiologyEngine.getInstance().update(dt);
    // PathologyEngine lee modifier → aplica a sepsis.severity
    PathologyEngine.getInstance().update(dt);
    PharmaEngine.getInstance().update(dt);
    CardiovascularEngine.getInstance().updateHemodynamics(dt);
    RespiratoryEngine.getInstance().update(dt);
    AcidBaseEngine.getInstance().update(dt);
    RenalEngine.getInstance().update(dt);
    NeuroEngine.getInstance().update(dt);
    LabEngine.getInstance().update();
  }
}