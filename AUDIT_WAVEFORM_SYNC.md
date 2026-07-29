# AUDIT_WAVEFORM_SYNC.md
# IMHOTEP UCI — ARM SM100 Waveform Cursor-Based Renderer
# Fecha: 2026-05-03

---

## Problema original

El renderer anterior pintaba el BUFFER COMPLETO (últimos W samples) mapeado
al ancho del canvas. Dado que la tasa de muestreo es constante (100
muestras/tick de CronosEngine independiente del speedMultiplier), cada
muestra representa `speed × DT_BASE / 100` sim-segundos. A speed=10×,
cada muestra representa 10× más tiempo que a speed=1×, comprimiendo múltiples
ciclos respiratorios en el ancho del canvas.

## Solución: cursor-based renderer

El nuevo renderer (VentilatorCurves.tsx):
1. Mantiene `cursorTimeRef` (waveTime actual, pared)
2. Cada frame: `dtWall = tNow - cursor`, avanza `dx = dtWall × (W / wallWindowS)`
3. `wallWindowS = WINDOW_SIM_S / speedMultiplier`
4. Lee muestras con `getSamplesInRange(cursor, tNow)` del buffer
5. Throttle FPS: speed≥60→15fps, speed≥10→30fps, else→60fps

## Verificaciones numéricas (VentilatorSV800Engine, RR=12, ciclo=5s sim)

| Speed | wallWindowS | pxPerSecWall (W=600) | dx/RAF (1/60s) | Frames para cruzar | Tiempo real |
|---|---|---|---|---|---|
| 1× | 5s wall | 120 px/s | 2 px | 300 frames | **5.0 s real** ✓ |
| 10× | 0.5s wall | 1200 px/s | 20 px | 30 frames | **0.5 s real** ✓ |
| 60× | 0.083s wall | 7200 px/s | 120 px | 5 frames | **0.083 s real** (throttle 15fps: efectivamente 0.083s) ✓ |

*(W=600px asumido; valores escalan linealmente con el ancho del canvas)*

Verificación RR=24 (ciclo=2.5s sim):
- speed=1×: ciclo dura 2.5s wall = 50% del canvas de 5s ✓ (2 ciclos visibles)

## Cambios en VentilatorSM100Engine.ts

Añadido `getSamplesInRange(t0, t1)`:
- Recorre el buffer circular hacia atrás desde `writeIdx`
- Detiene cuando `wf.t[idx] < t0` (más antiguo que la ventana)
- Devuelve array cronológico de `{t, paw, flow, vol}`
- Complejidad O(WAVE_BUF) = O(600) por frame → ~12µs ≈ negligible

## Archivos modificados

- `src/core/VentilatorSM100Engine.ts` — añadido `getSamplesInRange()`
- `src/components/VentilatorCurves.tsx` — reescrito completamente
- `src/components/VentilatorPanel.tsx` — corregido prop `height` → `heights`
