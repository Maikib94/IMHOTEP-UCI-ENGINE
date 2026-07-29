# AUDIT_SM100_RENDER.md
# Fecha: 2026-05-05

## 5.A — Diagnóstico causas de curva vacía

| # | Check | Estado | Acción |
|---|-------|--------|--------|
| 1 | Engine corriendo | ✓ CronosEngine llama `RespiratoryEngine.update(dt)` cada tick, que llama `sv800.update(dt, ...)` | OK |
| 2 | Buffer escribiéndose | ✓ `sv800.update` avanza `writeIdx`; `wf.length` crece hasta `WAVE_BUF` | OK |
| 3 | Canvas dimensiones | ✓ `WaveformPanel` recibe props `width=640, height=340` y los asigna explícitamente | OK |
| 4 | isVentilatorConnected | ✓ `RespiratoryEngine.update` corre siempre; `sv800.update` no está gateado por este flag | OK |
| 5 | Speed=0 / pausado | ✗ **BUG**: cuando `isRunning=false`, `nowSim <= prevSim` → loop vacío → pantalla negra sin feedback | **FIJADO** |

**Causa raíz real**: cuando la simulación está pausada, la condición `nowSim <= prevSim` causa retorno
temprano en cada frame sin dibujar nada — el canvas queda negro. El usuario no sabe si el motor
está corriendo o pausado.

## 5.B — Throttle FPS por velocidad

Implementado en `WaveformPanel.props` nuevos: `speed: number`, `isRunning: boolean`.
Leídos vía refs para evitar re-montar el canvas.

| Rango speed | FPS objetivo | Intervalo mínimo |
|-------------|--------------|------------------|
| x1          | 60 fps       | 16.7 ms          |
| x2–9        | 30 fps       | 33.3 ms          |
| x10–29      | 15 fps       | 66.7 ms          |
| x30+        | 8 fps        | 125 ms           |

## 5.C — drawPausedOverlay

Cuando `isRunning === false`:
- Overlay semitransparente negro
- Texto "SIMULACIÓN PAUSADA" centrado en gris pizarra
- RAF sigue corriendo para detectar el resume automáticamente

## 5.D — drawFrozenIndicator (speed ≥ 30)

Badge naranja en esquina superior derecha: `"{speed}× · MOTOR ACTIVO"`
Indica que el cálculo físico continúa pero el render está reducido a 8 fps.

## 5.E — Verificación numérica

| Speed | RR (rpm) | T ciclo sim | Ciclos visibles | FPS real |
|-------|----------|-------------|-----------------|----------|
| x1    | 12       | 5.0 s       | 1               | 60       |
| x1    | 24       | 2.5 s       | 2               | 60       |
| x10   | 12       | 0.5 s       | 1               | 15       |
| x60   | 12       | 0.083 s     | 1 (ráfaga)      | 8        |

La ventana visual WINDOW_VISUAL_S = 5 s de tiempo simulado.
A x60, un ciclo respiratorio de 5 s sim pasa en 83 ms de tiempo real → el cursor
da una vuelta completa cada 83 ms reales; con 8 fps (125 ms/frame) se ven entre
1-2 ciclos por frame — animación congelada pero el cálculo es correcto.

## Archivos modificados

- `src/components/VentilatorSM100.tsx` — WaveformPanel reescrito (5.B-D)
- Padre `VentilatorSM100` ahora lee `speed` e `isRunning` de `useTimeStore` y los pasa como props

## tsc --noEmit
0 errores tras todos los cambios.
