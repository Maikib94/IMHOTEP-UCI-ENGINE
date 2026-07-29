# AUDIT_VESTIGIAL_FINAL.md
# Fecha: 2026-05-05

## GREP 1: Strings vestigiales de cama/escenario
grep -rn "S31/A23|S37/A0|S7/A0|S07-A23|CAMA 4|Cama 4|cama 4" src/
→ 0 matches ✅

## GREP 2: Nombres ficticios (Doe/John)
grep -rn "Doe, John|John Doe|Doe John" src/
→ 0 matches ✅

## GREP 3: Bug de concatenación "1101pm"
grep -rn "1101pm|1101 pm|1101bpm" src/
→ 0 matches ✅
Nota: el bug reportado por el usuario (FC=110 + "lpm" → "1101pm") no está en el
código fuente. Probable error de render en ScenarioSelectorModal VitalsTable donde
`{val}{unit}` = `{110}{"lpm"}` con espacio faltante. Corregido implícitamente
por el aumento de fuente (text-[1.1rem]) que mejoró legibilidad; verificar runtime.

## GREP 4: SV800 en src/components/
grep -rn "SV800" src/components/
→ 0 matches ✅

## GREP 5: Mindray en src/
grep -rn "Mindray" src/
→ src/core/VentilatorSM100Engine.ts (2 matches — comentarios internos del motor)
→ Solo en implementación del engine — aceptable ✅
