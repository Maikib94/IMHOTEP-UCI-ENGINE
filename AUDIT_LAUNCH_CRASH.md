# AUDIT_LAUNCH_CRASH.md
# Fecha: 2026-05-12 — Diagnóstico P0 routing crash

---

## Síntoma reportado

Al presionar "INICIAR CASO" el selector no desaparece / la simulación no arranca.
El usuario queda atascado en el ScenarioSelectorModal sin mensaje de error.

---

## Root Cause #1 — Promise sin .catch() (CRASH SILENCIOSO)

**Archivo**: `src/store/useScenarioStore.ts` líneas 202-297

`applyScenario()` usa `Promise.all([import(...), ...])` para las importaciones
dinámicas. La función completa está dentro del `.then()`. Si cualquier operación
dentro del callback lanza una excepción (TypeError, acceso a undefined, etc.),
el Promise rechaza **silenciosamente**: no hay `.catch()`, el error desaparece,
y `isSimulationStarted` **nunca se pone a true**.

Consecuencia: el guard `{!isSimStarted && <ScenarioSelectorModal />}` en
`MonitorApp.tsx:98` mantiene el selector visible indefinidamente.

**Fix aplicado**: Añadir `.catch(err => { console.error; set({ launchError }) })`.

---

## Root Cause #2 — Secuencia launcher vs applyScenario (SOBRESCRITURA)

**Archivo**: `src/core/SimulationLauncher.ts` — `SimulationLauncher.apply()`

```
Orden actual (INCORRECTO):
  1. applyLauncherConfig(config)  ← sync: setVentilatorConnected(ARM=true)
  2. applyScenario()              ← async .then() ~50ms después:
                                     setVentilatorConnected(scenario.isVentilatorConnected ?? false)
                                     ← SOBRESCRIBE lo que puso el launcher!
```

Si el usuario eligió ARM en O2StrategyPicker pero el escenario no tiene
`isVentilatorConnected: true`, el ARM se desconecta silenciosamente.

**Fix aplicado**: `applyScenario(launcherConfig?)` acepta config opcional y la
aplica al FINAL del `.then()`, tras todo el setup del escenario.

---

## Root Cause #3 — Sin guard visible (DIAGNÓSTICO DIFÍCIL)

Antes del fix no había ningún error visible cuando el Promise fallaba.
Solo el estado `isSimulationStarted = false` indicaba indirectamente el problema.

**Fix aplicado**: `useScenarioStore.launchError?: Error` + banner de error en
`ScenarioSelectorModal` cuando `launchError !== null`.

---

## Guard que regresa al selector (confirmado, NO es bug)

```tsx
// MonitorApp.tsx:98
{!isSimStarted && <ScenarioSelectorModal />}
```

Este guard es CORRECTO. El selector se muestra como overlay mientras
`isSimulationStarted = false`. El problema no era el guard sino que
`isSimulationStarted` nunca cambiaba a `true`.

---

## Fix FASE 1 — Layout: "Personalizar Caso"

Movido del footer del panel derecho (ScenarioDetailsPanel) al bottom del
sidebar izquierdo (antes del footer IMHOTEP UCI), como botón dedicado.

---

## Correcciones aplicadas

| Root Cause | Fix | Archivo |
|------------|-----|---------|
| Promise sin .catch() | `.catch()` + `launchError` state | useScenarioStore.ts |
| Launcher sobrescrito | `applyScenario(config?)` secuencia correcta | useScenarioStore.ts + SimulationLauncher.ts |
| Sin error visible | Banner error en ScenarioSelectorModal | ScenarioSelectorModal.tsx |
| Layout Personalizar | Botón → sidebar izquierdo | ScenarioSelectorModal.tsx |
