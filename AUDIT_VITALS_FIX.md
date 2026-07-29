# AUDIT_VITALS_FIX.md
# Fecha: 2026-04-29

## Objetivo
FASE 1.G — Evitar desbordamiento visual de valores imposibles en VitalSignsPanel
y aumentar legibilidad de la tabla de vitales en ScenarioSelectorModal.

## Cambios en VitalSignsPanel.tsx

Añadida función `fmtV(v, lo, hi, digits=0)`:
- Retorna `'--'` si el valor no es finito
- Clampea al rango [lo, hi] antes de llamar `.toFixed(digits)`

Aplicada a todos los valores numéricos mostrados:

| Vital    | Rango clamp | Antes          | Después               |
|----------|-------------|----------------|-----------------------|
| HR       | [20, 250]   | `{hr}`         | `{fmtV(hr, 20, 250)}` |
| SYS      | [40, 280]   | `{sys}`        | `{fmtV(sys, 40, 280)}`|
| DIA      | [20, 180]   | `{dia}`        | `{fmtV(dia, 20, 180)}`|
| MAP      | [20, 180]   | `({map})`      | `({fmtV(map, 20, 180)})`|
| EtCO₂   | [10, 80]    | `{etco2}`      | `{fmtV(etco2, 10, 80)}`|
| Ppico    | [0, 80]     | `{ppico}`      | `{fmtV(ppico, 0, 80)}`|
| Pplat    | [0, 60]     | `{pplat}`      | `{fmtV(pplat, 0, 60)}`|
| FR       | [0, 60]     | `{rr}`         | `{fmtV(rr, 0, 60)}`  |
| PIC      | [0, 60]     | `{icp}`        | `{fmtV(icp, 0, 60)}` |
| PPC      | [0, 100]    | `{cpp}`        | `{fmtV(cpp, 0, 100)}`|
| Temp     | [32, 42, 1] | `{temp.toFixed(1)}` | `{fmtV(temp, 32, 42, 1)}`|
| Diuresis | [0, 500]    | `{uoMl}`       | `{fmtV(uoMl, 0, 500)}`|
| MAP SOFA | [20, 180]   | `MAP:{map}`    | `MAP:{fmtV(map, 20, 180)}`|

SpO₂ no requiere fmtV — es gestionada por el sistema de artefacto (spo2Art).

## Cambios en ScenarioSelectorModal.tsx — VitalsTable

| Elemento        | Antes          | Después        |
|-----------------|----------------|----------------|
| Etiqueta vital  | text-[0.5rem]  | text-[0.75rem] |
| Valor numérico  | text-[0.5rem]  | text-[1.1rem]  |

## tsc --noEmit
0 errores tras todos los cambios.
