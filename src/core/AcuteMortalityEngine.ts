// src/core/AcuteMortalityEngine.ts
//
// Motor de mortalidad aguda por umbrales fisiológicos.
// Evalúa 13 causas de muerte aguda cada tick, con exposición sostenida requerida
// y lógica de exención para intervenciones extracorpóreas.
//
// COEXISTENCIA:
//   AcuteMortalityEngine evalúa vitals FINALES del tick (post todos los otros engines).
//   PrognosisEngine sigue manejando MOF estocástico crónico — NO se modifica.
//   AcuteMortalityEngine tiene prioridad si ambos coinciden en el mismo tick.
//
// Refs: AHA 2025, Walsh 2013, Kraut-Madias 2010, ATLS 10th ed., BTF 2016.

import { usePatientStore } from '../store/usePatientStore';
import { useTimeStore }    from '../store/useTimeStore';
import { useECMOStore }    from '../store/useECMOStore';
import { useCRRTStore }    from '../store/useCRRTStore';
import { useMortalityStore } from '../store/useMortalityStore';
import { LETHAL_THRESHOLDS } from '../data/LethalThresholds';
import type { LethalCauseId, SimulationState } from '../data/LethalThresholds';

// ─── Helper ───────────────────────────────────────────────────────────────────

function evaluateOperator(
  value: number,
  op: '<' | '>' | '<=' | '>=',
  cutoff: number,
): boolean {
  switch (op) {
    case '<':  return value < cutoff;
    case '>':  return value > cutoff;
    case '<=': return value <= cutoff;
    case '>=': return value >= cutoff;
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class AcuteMortalityEngine {
  private static instance: AcuteMortalityEngine | null = null;

  private constructor() {}

  public static getInstance(): AcuteMortalityEngine {
    if (AcuteMortalityEngine.instance === null) {
      AcuteMortalityEngine.instance = new AcuteMortalityEngine();
    }
    return AcuteMortalityEngine.instance;
  }

  public reset(): void {
    useMortalityStore.getState().reset();
  }

  /**
   * Actualiza todos los counters de mortalidad aguda.
   * Llamado por CronosEngine DESPUÉS de todos los engines fisiológicos del tick.
   * @param dt  Delta de tiempo del tick en segundos simulados
   */
  public update(dt: number): void {
    const mortality = useMortalityStore.getState();

    // Si ya murió, no recalcular — evita doble disparo
    if (mortality.isDeceased) return;

    // Leer estado actual
    const patientState = usePatientStore.getState();
    const vitals       = patientState.vitals;
    const bloodVolume  = patientState.bloodVolume;
    const simTime      = useTimeStore.getState().simulatedElapsed;
    const ecmoState    = useECMOStore.getState();
    const crrtState    = useCRRTStore.getState();

    // Construir SimulationState para exemptIf
    const simState: SimulationState = {
      vitals,
      bloodVolume,
      ecmo: {
        active: ecmoState.active,
        mode:   ecmoState.mode,
      },
      crrt: {
        active:     crrtState.active,
        dose_mLkgh: crrtState.dose_mLkgh,
      },
    };

    // Evaluar cada threshold en orden
    for (const threshold of LETHAL_THRESHOLDS) {

      // 1. Verificar exención — si aplica, saltar este threshold
      if (threshold.exemptIf && threshold.exemptIf(simState)) {
        // Si estaba acumulando, resetear gradualmente (ya no es peligroso)
        mortality.updateDangerCounter(
          threshold.id,
          false,
          dt,
          threshold.sustainedSeconds,
          simTime,
        );
        continue;
      }

      // 2. Extraer valor del vital
      let value: number;

      if (threshold.vital === 'cpp') {
        const icp = vitals.icp ?? 0;
        value = vitals.meanArterialPressure - icp;
      } else if (threshold.vital === 'bloodVolume') {
        value = bloodVolume;
      } else if (threshold.vital === 'glucose') {
        value = vitals.glucoseMgdL ?? 99;
      } else if (threshold.vital === 'magnesium') {
        value = vitals.magnesiumMgdL ?? 2.0;
      } else {
        value = (vitals as unknown as Record<string, number>)[threshold.vital as string] ?? 0;
      }

      // 3. Evaluar condición peligrosa
      const isDangerous = evaluateOperator(value, threshold.operator, threshold.cutoff);

      // 4. Actualizar counter
      mortality.updateDangerCounter(
        threshold.id,
        isDangerous,
        dt,
        threshold.sustainedSeconds,
        simTime,
      );

      // 5. Verificar si el counter superó el threshold letal
      //    Re-leer el store actualizado (puede haber cambiado en updateDangerCounter)
      const updatedCounter = useMortalityStore.getState().dangerCounters[threshold.id as LethalCauseId];
      if (updatedCounter && updatedCounter.accumulatedSeconds >= threshold.sustainedSeconds) {
        // ¡Muerte! — primer threshold que supere su límite gana
        console.warn(
          `[IMHOTEP·MORTALITY] Óbito disparado: ${threshold.id}` +
          ` | Exposición: ${updatedCounter.accumulatedSeconds.toFixed(1)}s` +
          ` | Umbral: ${threshold.sustainedSeconds}s` +
          ` | Vital: ${threshold.vital}=${value.toFixed(2)}` +
          ` | simTime: ${simTime.toFixed(0)}s`,
        );
        mortality.triggerDeath(threshold.id as LethalCauseId, simTime);
        return; // Primer trigger gana — salir del loop
      }
    }
  }
}
