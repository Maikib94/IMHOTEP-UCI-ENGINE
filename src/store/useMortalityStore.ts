// src/store/useMortalityStore.ts
//
// Estado del motor de mortalidad aguda (AcuteMortalityEngine).
// Gestiona counters de exposición acumulada, alertas activas y disparo de muerte.
//
// COEXISTENCIA CON PrognosisEngine:
//   PrognosisEngine → mortalidad sub-aguda por MOF (días), estocástica, SOFA-based.
//   AcuteMortalityEngine → mortalidad aguda por umbrales fisiológicos (segundos-minutos).
//   El primer engine que dispare muerte gana. AcuteMortalityEngine tiene prioridad si ambos
//   coinciden en el mismo tick (más específico, mayor valor didáctico).

import { create } from 'zustand';
import type { LethalCauseId } from '../data/LethalThresholds';

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Estado de un contador de exposición para una causa letal individual */
export interface DangerCounter {
  /** ID de la causa letal */
  causeId: LethalCauseId;
  /** Segundos de exposición acumulados (con decay gradual al recuperarse) */
  accumulatedSeconds: number;
  /** ¿El vital está fuera del umbral AHORA mismo? */
  isCurrentlyDangerous: boolean;
  /** simTime del primer cruce del umbral (para historial en DeathOverlay) */
  firstCrossedAt: number | null;
}

interface MortalityState {
  /** Bandera global: paciente fallecido */
  isDeceased: boolean;
  /** Causa que disparó la muerte */
  deathCause: LethalCauseId | null;
  /** simTime (segundos simulados) del momento del óbito */
  deathTime: number | null;
  /** Counters de exposición acumulada por causa */
  dangerCounters: Partial<Record<LethalCauseId, DangerCounter>>;
  /** IDs de causas con counter > 25% del threshold (visibles en HUD) */
  activeAlerts: LethalCauseId[];

  // ── Acciones ──────────────────────────────────────────────────────────────

  /**
   * Llamado cada tick por AcuteMortalityEngine.
   * Acumula o decae el counter según si el vital está en zona peligrosa.
   * @param id       CauseId del threshold evaluado
   * @param isDangerous  ¿El vital supera el cutoff ahora?
   * @param dt       Delta de tiempo del tick (sim-seconds)
   * @param threshold  Duración de exposición letal (para calcular alertas)
   * @param simTime   Tiempo simulado actual (para firstCrossedAt)
   */
  updateDangerCounter: (
    id: LethalCauseId,
    isDangerous: boolean,
    dt: number,
    threshold: number,
    simTime: number,
  ) => void;

  /**
   * Dispara la muerte del paciente.
   * Pausa la simulación, aplana los vitales a 0 y notifica al PrognosisStore.
   */
  triggerDeath: (cause: LethalCauseId, simTime: number) => void;

  /** Solo para debug/reset — revive al paciente (limpia flags) */
  revivePatient: () => void;

  /** Reset completo — llamado al cargar nuevo caso */
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMortalityStore = create<MortalityState>((set, get) => ({
  isDeceased: false,
  deathCause: null,
  deathTime: null,
  dangerCounters: {},
  activeAlerts: [],

  // ── updateDangerCounter ────────────────────────────────────────────────────
  //
  // LÓGICA DE RESET GRADUAL (deuda fisiológica):
  //   Si el vital regresa al rango normal, el counter NO se resetea a 0 instantáneamente.
  //   Decae a 50% del rate de acumulación. Esto refleja que el daño orgánico residual
  //   no desaparece al instante de corregir la hipoperfusión.
  //
  //   Ejemplo: MAP <30 durante 3:00 min → counter = 180s.
  //   MAP sube a 80 con noradrenalina. Esperar 60 s.
  //   Counter = 180 - 60×0.5 = 150 s → NO vuelve a 0.
  //   Si MAP cae de nuevo <30, parte de 150 s, no de 0.
  //
  updateDangerCounter: (id, isDangerous, dt, threshold, simTime) => {
    set(state => {
      const existing = state.dangerCounters[id] ?? {
        causeId: id,
        accumulatedSeconds: 0,
        isCurrentlyDangerous: false,
        firstCrossedAt: null,
      };

      let newAccum = existing.accumulatedSeconds;
      let newFirstCrossed = existing.firstCrossedAt;

      if (isDangerous) {
        // Acumular tiempo de exposición
        newAccum += dt;
        if (newFirstCrossed === null) {
          newFirstCrossed = simTime;
        }
      } else {
        // Decay gradual — 50% del rate de acumulación
        newAccum = Math.max(0, newAccum - dt * 0.5);
        if (newAccum === 0) {
          newFirstCrossed = null;
        }
      }

      const updatedCounter: DangerCounter = {
        causeId: id,
        accumulatedSeconds: newAccum,
        isCurrentlyDangerous: isDangerous,
        firstCrossedAt: newFirstCrossed,
      };

      // Calcular alertas activas (> 25% del threshold)
      const newCounters = {
        ...state.dangerCounters,
        [id]: updatedCounter,
      };

      let newAlerts = state.activeAlerts.filter(a => a !== id);
      if (newAccum > 0.25 * threshold) {
        newAlerts = [...newAlerts, id];
      }

      return {
        dangerCounters: newCounters,
        activeAlerts: newAlerts,
      };
    });
  },

  // ── triggerDeath ──────────────────────────────────────────────────────────
  //
  // Secuencia de muerte:
  //   1. Marcar isDeceased = true (gate para DeathOverlay)
  //   2. Pausar simulación (useTimeStore)
  //   3. Flatline vitales a 0 (usePatientStore)
  //   4. Notificar PrognosisStore con outcome='death'
  //
  triggerDeath: (cause, simTime) => {
    const current = get();
    if (current.isDeceased) return; // Evitar doble disparo

    set({ isDeceased: true, deathCause: cause, deathTime: simTime });

    // Importaciones lazy para evitar ciclos — los stores son singletons
    import('./useTimeStore').then(({ useTimeStore }) => {
      useTimeStore.getState().pause();
    });

    import('./usePatientStore').then(({ usePatientStore }) => {
      usePatientStore.getState().updateVitals({
        heartRate: 0,
        systolicBP: 0,
        diastolicBP: 0,
        meanArterialPressure: 0,
        cardiacOutput: 0,
        spo2: 0,
        respiratoryRate: 0,
        etco2: 0,
        strokeVolume: 0,
        svr: 0,
        cvp: 0,
      });
    });

    import('./usePrognosisStore').then(({ usePrognosisStore }) => {
      const prognosis = usePrognosisStore.getState();
      prognosis.setOutcome('death', prognosis.icuDaysSim);
    });
  },

  revivePatient: () => {
    set({
      isDeceased: false,
      deathCause: null,
      deathTime: null,
      activeAlerts: [],
    });
  },

  reset: () => {
    set({
      isDeceased: false,
      deathCause: null,
      deathTime: null,
      dangerCounters: {},
      activeAlerts: [],
    });
  },
}));
