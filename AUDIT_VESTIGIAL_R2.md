# AUDIT_VESTIGIAL_R2.md
# Fecha: 2026-05-06

## G1: Strings S31/A23 / A12/H2 / etc.
grep -rn "S31/A23|S37/A0|S7/A0|A12/H2|A12/" src/
→ 0 matches ✅

## G2: Doe John / 1101pm
grep -rn "Doe, John|John Doe|1101pm" src/
→ src/utils/formatVital.ts:4 — COMENTARIO docstring documenta el bug fijado ✅

## G3: SV800 en src/components/
grep -rn "SV800" src/components/
→ 0 matches ✅

## G4: Cama 4 / CAMA 4
grep -rn "Cama 4|CAMA 4" src/
→ 0 matches ✅

## G5: HIDRATACIÓN PARENTERAL
grep -rn "Hidratación.*Parenteral|HIDRATACIÓN.*PARENTERAL" src/components/
→ 0 matches ✅ (se usa "HIDRATACIÓN" sin "Parenteral")

## G6: Botón CULTIVOS en MonitorApp
grep -rn "CULTIVOS" src/components/
→ src/MonitorApp.tsx:130 — botón "✏ CULTIVOS" en barra superior → ELIMINAR (FASE 1.B)

## Residuos a eliminar
- MonitorApp.tsx: botón "✏ CULTIVOS" (línea 130) + estado showCultures + modal CulturePanel flotante
- ClinicalControlPanel.tsx: acordeón "HIDRATACIÓN" (id: farmacos-hidratacion)
