// src/core/PathologyEngine.ts
//
// Este motor es el puente entre el estado abstracto de una patología (ej. severidad de 0 a 1)
// y los modificadores fisiológicos concretos que afectan a otros motores (cardiovascular, respiratorio).
// Se ejecuta en cada tick de la simulación.

import { usePathologyStore, NEUTRAL_MODIFIERS } from '../store/usePathologyStore';
import { useMicrobiologyStore } from '../store/useMicrobiologyStore';

// Constantes de la física del SDRA
const ARDS_SHUNT_MIN = 0.05; // Shunt fisiológico normal (5%)
const ARDS_SHUNT_MAX = 0.60; // Shunt en SDRA severo (60%)
const ARDS_COMPLIANCE_MIN = 0.3; // 30% de la compliance normal en SDRA severo

// Constantes de la física de la Sepsis
const SEPSIS_SVR_MIN = 0.4; // 40% de la RVS normal en shock séptico
const SEPSIS_LEAK_MAX = 10; // mL/min de fuga capilar
const SEPSIS_HYPERDYNAMIC_MAX = 1.4; // 140% de la FC base

export class PathologyEngine {
  private static instance: PathologyEngine | null = null;

  private constructor() { }

  public static getInstance(): PathologyEngine {
    if (!PathologyEngine.instance) {
      PathologyEngine.instance = new PathologyEngine();
    }
    return PathologyEngine.instance;
  }

  public update(dt: number): void {
    const store = usePathologyStore.getState();
    const { sepsis, ards } = store;
    const { sepsisProgressionModifier } = useMicrobiologyStore.getState();

    // 1. Progresión de patologías activas
    if (sepsis.isActive) {
      // La progresión de la sepsis está modulada por la eficacia del tratamiento ATB
      const newSeverity = sepsis.severity + sepsis.progressionRate * sepsisProgressionModifier * dt;
      store.setSepsisSeverity(newSeverity);
    }

    if (ards.isActive) {
      // La pronación reduce la progresión del SDRA
      const proneFactor = ards.proneActive ? 0.3 : 1.0;
      const newSeverity = ards.severity + ards.progressionRate * proneFactor * dt;
      store.setArdsSeverity(newSeverity);
    }

    // 2. Calcular modificadores fisiológicos basados en la severidad
    const newModifiers = { ...NEUTRAL_MODIFIERS };

    // Modificadores de Sepsis
    if (sepsis.isActive) {
      newModifiers.svrMultiplier = 1.0 - (1.0 - SEPSIS_SVR_MIN) * sepsis.severity;
      newModifiers.capillaryLeakRate = SEPSIS_LEAK_MAX * sepsis.severity;
      newModifiers.hyperdynamicFactor = 1.0 + (SEPSIS_HYPERDYNAMIC_MAX - 1.0) * sepsis.severity;
    }

    // Modificadores de SDRA
    if (ards.isActive) {
      // La severidad (0-1) se mapea linealmente a los modificadores físicos (shunt, compliance).
      // Estos modificadores, al interactuar con el RespiratoryEngine, producirán una PaO2/FiO2
      // que caerá en una de las categorías del Consenso de Berlín (Leve, Moderado, Severo).
      // Por ejemplo, una `severity` de 0.85 está diseñada para producir un P/F ratio < 100,
      // clasificándolo como "Severo".
      // El shunt aumenta linealmente con la severidad del SDRA
      newModifiers.lungShuntFraction = ARDS_SHUNT_MIN + (ARDS_SHUNT_MAX - ARDS_SHUNT_MIN) * ards.severity;
      // La compliance disminuye linealmente con la severidad del SDRA
      newModifiers.complianceMultiplier = 1.0 - (1.0 - ARDS_COMPLIANCE_MIN) * ards.severity;

      // La pronación mejora el shunt (V/Q matching) pero no la compliance estática
      if (ards.proneActive) {
        newModifiers.lungShuntFraction *= 0.65; // Mejora del 35% en el shunt
      }
    }

    // 3. Actualizar el store con los nuevos modificadores
    store.updateModifiers(newModifiers);
  }
}