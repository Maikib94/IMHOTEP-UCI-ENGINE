// src/hooks/useNIBPCycle.ts
//
// Hook custom — dispara mediciones NIBP discretas cuando no hay línea arterial.
// Simula el ciclo de inflado/desinflado del manguito cada `intervalMinutes`.
//
// Ref clínica: Lehman LH et al., Crit Care Med 2013 — n=27,022 pares NIBP/IBP:
//   NIBP sobreestima sistólica en hipotensión; solo MAP es comparable.
//   Meng L et al., Hypertension 2018 — frecuencia mínima perioperatoria 5 min.

import { useEffect, useRef } from 'react';
import { useTimeStore }   from '../store/useTimeStore';
import { usePatientStore } from '../store/usePatientStore';

export function useNIBPCycle(): void {
  const lastCycleRef = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = useTimeStore.subscribe((state) => {
      const { ticks, isRunning } = state;
      if (!isRunning) return;

      const patient = usePatientStore.getState();
      const { procedures } = patient;

      if (procedures.arterialLine) return;       // línea arterial → NIBP suspendido
      if (!procedures.nibp.enabled) return;

      const intervalSec = procedures.nibp.intervalMinutes * 60;
      const sinceLast   = ticks - lastCycleRef.current;

      if (sinceLast >= intervalSec) {
        lastCycleRef.current = ticks;

        // 1. Iniciar animación inflado
        patient.setNIBPInflating(true);

        // 2. Tras 3 s reales: capturar snapshot y desinflar
        setTimeout(() => {
          const v = usePatientStore.getState().vitals;
          usePatientStore.getState().captureNIBPSample({
            systolicBP:           Math.round(v.systolicBP),
            diastolicBP:          Math.round(v.diastolicBP),
            meanArterialPressure: Math.round(v.meanArterialPressure),
            capturedAtTick:       useTimeStore.getState().ticks,
          });
          // captureNIBPSample already sets isInflating = false
        }, 3000);
      }
    });

    return () => unsubscribe();
  }, []);
}

/** Dispara una captura inmediata de NIBP (para inicio y "Medir Ahora"). */
export function triggerNIBPNow(): void {
  const patient = usePatientStore.getState();
  patient.setNIBPInflating(true);
  setTimeout(() => {
    const v = usePatientStore.getState().vitals;
    usePatientStore.getState().captureNIBPSample({
      systolicBP:           Math.round(v.systolicBP),
      diastolicBP:          Math.round(v.diastolicBP),
      meanArterialPressure: Math.round(v.meanArterialPressure),
      capturedAtTick:       useTimeStore.getState().ticks,
    });
  }, 3000);
}
