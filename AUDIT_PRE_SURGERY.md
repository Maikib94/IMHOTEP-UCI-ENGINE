# AUDIT_PRE_SURGERY.md
# IMHOTEP UCI — Auditoría previa a Cirugía de Estabilización
# Fecha: 2026-05-03

---

## 1. TypeScript — `npx tsc --noEmit`

**Resultado: 0 errores** ✓

No se encontraron errores de compilación. El proyecto compila limpio.

---

## 2. Archivos clave — existencia

| Archivo | Estado |
|---|---|
| `src/store/usePatientStore.ts` | ✓ OK |
| `src/store/usePathologyStore.ts` | ✓ OK |
| `src/store/useTimeStore.ts` | ✓ OK |
| `src/store/useScenarioStore.ts` | ✓ OK |
| `src/core/CardiovascularEngine.ts` | ✓ OK |
| `src/core/RespiratoryEngine.ts` | ✓ OK |
| `src/core/PathologyEngine.ts` | ✓ OK |
| `src/core/CronosEngine.ts` | ✓ OK |
| `src/components/ClinicalControlPanel.tsx` | ✓ OK |
| `src/scenarios/PatientFactory.ts` | ✓ OK (en `src/scenarios/`, no en `src/core/`) |
| `src/components/VentilatorSM100.tsx` | ✓ OK (rebranding completado) |

---

## 3. Diagnóstico de bugs bloqueantes

### Bug 1.A — "Generando perfil..." permanente

**Raíz real** (≠ bucle infinito en factory):

`PatientFactory.ts` (`src/scenarios/PatientFactory.ts`) es **síncrona** y usa `for` loops
acotados — no hay while sin cota, no hay async espurio.

El problema está en `useScenarioStore.applyScenario()`:
```typescript
// línea 248-266 de useScenarioStore.ts
if (activePatient) {
  patient.updateVitals(activePatient.baseVitals);
  patient.setProfile(activePatient);
  // ... 3.E SS pre-loading
}
```

Si el usuario hace click en "INICIAR CASO" sin haber generado un paciente
(porque `ScenarioSelectorModal` no llama a `regenerateRandomPatient`),
`activePatient === null` y el bloque se salta → `usePatientStore.profile` queda `null`
→ `PatientInfoModal` muestra "Generando perfil..." eternamente.

**Solución**: auto-generar paciente en `applyScenario()` si `activePatient === null`.

### Bug 1.B — Termodilución PiCCO sin snapshot

**Raíz real**:

En `useMonitoringStore.ts`, `performThermodilution()` tiene guard temprana:
```typescript
if (!profile) return { ...PICCO_NULL, timestamp: ticks };
```

Este return **no llama a `set(...)`** → `piccoSnapshot` queda `null` en el store
→ `PiCCOMonitorSM1` muestra "SIN DATOS" aunque el usuario haga click.

Ocurre siempre que no hay paciente generado por `PatientFactory` (profile === null).

**Solución**: eliminar el guard temprana y usar valores de fallback para
`bsa`, `pbwKg`, `heightCm` cuando el perfil no está disponible.

---

## 4. SV800 — ver AUDIT_SV800_RESIDUAL.md

50+ referencias, todas INTERNAL (nombres de clase/interface/método). No hay texto
visible en UI con el string "SV800".
