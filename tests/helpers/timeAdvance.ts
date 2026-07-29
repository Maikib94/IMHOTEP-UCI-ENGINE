// tests/helpers/timeAdvance.ts
// Advance simulated time and step engines synchronously (no rAF needed).

import { useTimeStore }          from '../../src/store/useTimeStore';
import { RespiratoryEngine }     from '../../src/core/RespiratoryEngine';
import { CardiovascularEngine }  from '../../src/core/CardiovascularEngine';
import { PharmacologyEngine }    from '../../src/core/PharmacologyEngine';
import { RenalEngine }           from '../../src/core/RenalEngine';
import { PathologyEngine }       from '../../src/core/PathologyEngine';
import { CrosstalkEngine }       from '../../src/core/CrosstalkEngine';
import { AcidBaseEngine }        from '../../src/core/AcidBaseEngine';
import { AcuteMortalityEngine }  from '../../src/core/AcuteMortalityEngine';

/**
 * Advance simulation by `seconds` sim-seconds in steps of `dt`.
 * Calls each engine in clinical order without requestAnimationFrame.
 */
export function advanceSimSeconds(seconds: number, dt = 0.5): void {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) {
    useTimeStore.getState().advanceTick(dt);
    PathologyEngine.getInstance().update(dt);
    PharmacologyEngine.getInstance().update(dt);
    RenalEngine.getInstance().update(dt);
    RespiratoryEngine.getInstance().update(dt);
    CardiovascularEngine.getInstance().updateHemodynamics(dt);
    AcidBaseEngine.getInstance().update(dt);
    CrosstalkEngine.getInstance().update(dt);
    AcuteMortalityEngine.getInstance().update(dt);
  }
}

/**
 * Advance with a specific speed multiplier active.
 */
export function advanceWithSpeed(seconds: number, speed: number, dt = 0.5): void {
  useTimeStore.getState().setSpeed(speed);
  advanceSimSeconds(seconds * speed, dt * speed);
  useTimeStore.getState().setSpeed(1);
}
