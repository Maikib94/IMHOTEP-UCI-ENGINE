# AUDIT_LAUNCH_FIX.md
# Fecha: 2026-05-13 — Hotfix completo P0 routing crash

---

## FASE 1.C — Botón "Personalizar Caso" en sidebar izquierdo

**Hecho:**
- Eliminado del footer del panel derecho (`ScenarioSelectorModal.tsx`)
- Añadido al sidebar izquierdo como bloque dedicado con divisor visual (antes del footer IMHOTEP UCI)
- El botón muestra icono ✎ + "Personalizar" + "narrativa libre"

---

## FASE 2.A — Normalización defensiva de ScenarioDefinition

**Root cause resuelto:** Escenarios con campos opcionales ausentes podían causar TypeError en la pipeline async sin `.catch()`.

**Implementación:**
- `src/core/defaults.ts`: función `normalizeScenario(partial)` — aplica defaults seguros a TODOS los campos opcionales de `ScenarioDefinition`
- `useScenarioStore.applyScenario()`: llama `normalizeScenario(activeScenario)` al inicio del `.then()` callback, antes de cualquier acceso a campo

**Defaults aplicados:**
```
baseSeverity     → 0.5
tags             → []
pathologyConfigs → [] (caso docente sin patología)
initialVitals    → {} (PatientStore usa sus propios defaults)
isVentilatorConnected → false
surgicalDrainStatus   → 'none'
icpCatheterRequired   → false
clinicalNotes    → ''
references       → []
```

---

## FASE 2.A (extra) — .catch() en applyScenario

**Implementado en sesión anterior:**
- Promise.all().then(...).catch(err => set({ launchError: message }))
- `launchError: string | null` en ScenarioStoreState
- `clearLaunchError()` acción
- Banner de error en ScenarioSelectorModal cuando `launchError !== null`

---

## FASE 2.B — CrashFallback visible

**Implementado:**
- `src/components/CrashFallback.tsx`: pantalla con título, mensaje, stack trace collapsible, botón "Volver al selector"
- `MonitorApp.tsx`: dos guards visibles:
  1. Si `isSimStarted=true && !activeScenario` → CrashFallback "Estado inconsistente"
  2. Si `launchError && !isSimStarted` → CrashFallback con el error

**Eliminado:** redirect silencioso que solo mostraba el selector sin explicación.

---

## FASE 2.C/2.D — Secuencia atómica y lanzador en orden correcto

**Implementado en sesión anterior:**
- `SimulationLauncher.apply(config)` pasa config a `applyScenario(config)` en lugar de aplicarla directamente
- La config del launcher se aplica AL FINAL del `.then()`, después de todo el setup del escenario
- Previene la sobrescritura de `isVentilatorConnected` por la secuencia async

---

## FASE 3.A-D — ProceduralPatientFactory completamente refactorizado

### Problemas detectados:
1. `applyParsedCase()` NUNCA llamaba `isSimulationStarted = true` → selector permanecía visible
2. Sin `inferredCategory` → `ScenarioDefinition.category` era undefined → TypeError en CATEGORY_META[undefined]
3. `deriveVitalsFromPathologies()` no existía → vitales de custom case eran siempre defaults fisiológicos normales
4. Sin try/catch ni logging → crashes silenciosos sin diagnóstico

### Correcciones:
- `ParsedCase` extendido: `inferredCategory: ScenarioCategory`, `inferredTitle: string`, `severityScore: number`
- `inferCategory(text)`: regex para 7 categorías, fallback explícito `'sepsis'` (nunca undefined)
- `inferTitle(text, category)`: extrae primera oración o usa label de categoría
- `deriveVitalsFromPathologies(pathologies)`: modifica vitales base según dominio y severidad
  - sepsis → taquicardia + hipotensión + lactato + fiebre
  - ards → hipoxemia + taquipnea
  - neuroCritical → ↓GCS + ↑PIC
  - hemorrhagicShock → taquicardia extrema + hipotensión severa
  - cardio, burn, pneumonia → patrones específicos
- `clampAllVitals()`: límites fisiológicos en cada campo
- `applyParsedCase()` **completamente reescrito**:
  - Construye `ScenarioDefinition` completo con todos los campos
  - Llama `normalizeScenario()` como primer paso
  - Inyecta en `useScenarioStore.setState({ activeScenario, activePatient, difficulty })`
  - Llama `useScenarioStore.getState().applyScenario()` → mismo pipeline que casos pre-programados
  - Logs `[IMHOTEP·CUSTOM]` en cada paso
  - try/catch → `set({ launchError: message })` en error

### CustomCaseModal.handleStart:
- Cierra el modal inmediatamente tras `applyParsedCase()` (que es sync en la parte de setup)
- Si hay error, `CrashFallback` lo mostrará en MonitorApp

---

## FASE 4 — Defaults para nuevos campos

- `CATEGORY_META` accesos en ScenarioSelectorModal: `CATEGORY_META[cat] ?? CATEGORY_META['sepsis']`  
- `activeScenario.tags`: `?? []` para arrays potencialmente ausentes
- `normalizeScenario()` cubre todos los demás campos opcionales de forma centralizada

---

## SMOKE TESTS — Estado esperado tras el hotfix

| # | Test | Resultado esperado |
|---|------|--------------------|
| 1 | Caso pre-programado (Sepsis foco pulmonar) | Monitor monta, NO rebota. Logs [IMHOTEP·LAUNCH] ✓ |
| 2 | Caso pre-programado neuro (TCE GCS 6) | Monitor con ARM + curva PIC visible + midazolam/fentanilo |
| 3 | Caso pre-programado quemados | Monitor con simple_mask, sin ARM, sin PIC |
| 4 | Caso custom mínimo (1 línea) | Monitor arranca con categoría inferida |
| 5 | Caso custom complejo (200+ palabras) | Patologías coherentes con narrativa |
| 6 | Narrativa vacía | Toast/warning "no se detectaron patologías", no crash |
| 7 | Stress: 10 cambios de caso | No corrupción de estado |
| 8 | Layout Personalizar Caso | Botón en sidebar izquierdo, NO en panel derecho |

### Verificaciones de no-regresión:
- `npx tsc --noEmit` → EXIT:0 ✅
- `grep -rn "as any" src/` → 0 nuevos
- ScenarioSelectorModal: botón Personalizar en sidebar izquierdo únicamente
- Banner error visible si launch falla

---

## Archivos modificados / creados

| Archivo | Cambio |
|---------|--------|
| `src/core/defaults.ts` | NUEVO — normalizeScenario + DEFAULT_LAUNCHER_CONFIG |
| `src/components/CrashFallback.tsx` | NUEVO — pantalla error visible |
| `src/store/useScenarioStore.ts` | normalizeScenario en applyScenario; resetSimulation limpia todo |
| `src/core/ProceduralPatientFactory.ts` | inferCategory + deriveVitalsFromPathologies + applyParsedCase refactored |
| `src/components/CustomCaseModal.tsx` | handleStart cierra modal correctamente |
| `src/components/ScenarioSelectorModal.tsx` | CATEGORY_META con fallback; tags ?. guard |
| `src/MonitorApp.tsx` | CrashFallback guards; launchError state; import limpio |

---

## tsc --noEmit final

```
EXIT:0 — 0 errores ✅
```
