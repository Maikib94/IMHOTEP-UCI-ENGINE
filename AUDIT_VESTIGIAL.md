# AUDIT_VESTIGIAL.md
# Fecha: 2026-05-04

## S7/A0 — 0 matches
No encontrado en src/.

## CAMA 4 — 1 match (COMENTARIO, no UI)
src/MonitorApp.tsx:328: {/* LiveInstructorOverridePanel — panel maestro, controlado desde botón CAMA 4 */}
→ ACCIÓN: actualizar comentario (no requiere cambio de UI)

## SV800 en src/components/ — TODO INTERNO
Todos los matches son nombres de clase TypeScript internos del engine
(VentilatorSV800Engine, SV800Settings, SV800Slider, getSV800Engine).
→ MANTENER per AUDIT_SV800_RESIDUAL.md categoría INTERNAL.
