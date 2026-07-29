# AUDIT_PRE_CLEANUP.md
# IMHOTEP UCI — Pre-Cleanup Audit
# Fecha: 2026-05-04

## TypeScript
tsc --noEmit = 0 errores ✓

## Residuos visuales
- S7/A0, S37/A0: 0 matches ✓
- "CAMA 4": 1 comentario en MonitorApp.tsx:328 (no es UI visible) ✓
- SV800 en components: INTERNO únicamente (VentilatorSV800Engine, SV800Settings, SV800Slider) ✓

## Bugs identificados
- exportHandover: usa `p.comorbidities` (campo incorrecto → debe ser comorbidityIds con labels)
- exportHandover: sin fallback ni toast feedback
- PatientFactory nombre pool: solo 7 M + 7 F + 7 apellidos españoles (poca diversidad)
- VitalSignsPanel: no hay clamp explícito en HR/BP → posible 4 dígitos si valor del engine es NaN/Inf
- ScenarioSelectorModal VitalsTable: fontSize text-[0.5rem] para valores (demasiado pequeño)
