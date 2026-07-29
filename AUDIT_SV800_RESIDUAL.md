# AUDIT_SV800_RESIDUAL.md
# IMHOTEP UCI — Matriz completa de referencias SV800
# Fecha: 2026-05-03
#
# Clasificación:
#   INTERNAL — clase/type de engine privado → MANTENER (no renombrar)
#   VISIBLE  — texto visible en UI → renombrar a SM100
#   SEMI     — comentario/doc/filename → renombrar a SM100

---

## Clasificación

| Categoría | Recuento | Acción |
|---|---|---|
| INTERNAL | 47 | Mantener tal cual |
| VISIBLE | 0 | n/a |
| SEMI (comentarios) | 8 | Renombrar solo si genera confusión en revisión de código |

---

## INTERNAL — No renombrar

### `src/core/VentilatorSM100Engine.ts`
Todos los siguientes son **nombres de clase/interfaz/método internos** del engine — son INTERNAL según especificación:

| Identificador | Tipo | Acción |
|---|---|---|
| `VentilatorSV800Engine` (clase) | INTERNAL | Mantener |
| `SV800Settings` (interfaz) | INTERNAL | Mantener |
| `SV800Waveforms` (interfaz) | INTERNAL | Mantener |
| `SV800BreathMetrics` (interfaz) | INTERNAL | Mantener |
| `VentilatorSV800Engine.inst` | INTERNAL | Mantener |
| `VentilatorSV800Engine.getInstance()` | INTERNAL | Mantener |

### `src/core/RespiratoryEngine.ts`
| Identificador | Tipo | Acción |
|---|---|---|
| `private sv800 = VentilatorSV800Engine.getInstance()` | INTERNAL | Mantener |
| `private sv800Settings: SV800Settings` | INTERNAL | Mantener |
| `setSV800(partial)` | INTERNAL (API pública interna) | Mantener |
| `getSV800Settings()` | INTERNAL | Mantener |
| `getSV800Engine()` | INTERNAL | Mantener |

### `src/components/VentilatorSM100.tsx`
| Identificador | Tipo | Acción |
|---|---|---|
| `import type { SV800Settings }` | INTERNAL | Mantener |
| `SV800Slider` (componente interno) | INTERNAL | Mantener (nunca visible en UI) |
| `engine.getSV800Engine()` | INTERNAL | Mantener |
| `engine.getSV800Settings()` | INTERNAL | Mantener |
| `engine.setSV800(p)` | INTERNAL | Mantener |

### `src/components/GeometricLung.tsx`
| Identificador | Tipo | Acción |
|---|---|---|
| `import { VentilatorSV800Engine }` | INTERNAL | Mantener |
| `VentilatorSV800Engine.getInstance()` | INTERNAL | Mantener |

---

## SEMI — Comentarios/documentación

| Archivo | Línea | Texto | Acción |
|---|---|---|---|
| `CardiovascularEngine.ts` | 4 | `CardiovascularEngine — hemodinamia acoplada a SV800Engine` | SEMI — dejar (doc interna) |
| `CardiovascularEngine.ts` | 13 | `motor SV800 para incorporar TPP → PVR` | SEMI — dejar |
| `RespiratoryEngine.ts` | 4 | `RespiratoryEngine — wrapper sobre VentilatorSV800Engine` | SEMI — dejar |
| `RespiratoryEngine.ts` | 10 | `VentilatorSV800.tsx (display digital)` | SEMI — desactualizado (archivo ya se renombró) |
| `VentilatorCurves.tsx` | 2 | `buffer circular del SV800Engine` | SEMI — dejar |
| `SV800_SevereSepsis_Scenario.ts` | 1 | Filename y contenido | SEMI — test file, dejar |

---

## VISIBLE — Texto UI accesible por el usuario

**Ninguno.** No se encontró ningún texto UI con "SV800" visible para el clínico.
El componente ya fue renombrado a `VentilatorSM100.tsx` y sus labels/headers usan "SM100".

---

## Conclusión

El rebranding SV800 → SM100 está **completo en la UI**. Los identificadores INTERNAL
(`VentilatorSV800Engine`, `SV800Settings`, etc.) se mantienen deliberadamente para no
romper las interfaces del engine interno — son detalles de implementación no accesibles
al usuario final. Los comentarios SEMI son inofensivos (documentación interna).
