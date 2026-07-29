# AUDIT_POSTACIDOSIS_FIX.md
# Fecha: 2026-05-05

## Problema (3.C)

CardiovascularEngine no tenía penalizaciones de pH — ni correctas ni incorrectas.
La spec señala que si hubiesen existido como conditionals sticky (`if pH < 7.20`),
habrían quedado "atrapadas" hasta el próximo tick donde la condición se re-evalúa.

El efecto clínico observado: corrección de acidosis → paciente queda bradycardic/hypotensive
porque algún mecanismo no se resetea. En este caso el problema era que los efectos
ácido-base directos sobre contractilidad NO estaban implementados.

## Fix implementado

Función pura continua `acidosisPenalty(pH)` en CardiovascularEngine:

| pH range    | hr effect  | map effect | svFactor         |
|-------------|------------|------------|------------------|
| ≥ 7.35      | 0          | 0          | 1.0              |
| 7.20-7.35   | −10×f      | −8×f       | 1 − 0.15×f       |
| < 7.20      | −25×f      | −22×f      | 1 − 0.40×min(1,f)|

donde f = (7.35-pH)/0.15 para zona leve, f = (7.20-pH)/0.15 para severa.

La función se evalúa CADA tick usando el pH ACTUAL del store → se resetea
automáticamente cuando pH vuelve a la normalidad sin condiciones sticky.

Se aplica a:
- `targetHR` (sumado linealmente)
- `sv × acid.svFactor` (multiplicado, reduce contractilidad)
- `map + acid.map` (sumado linealmente)

## Verificación: pH 7.10 → corrección → pH 7.32

- pH 7.10: f_severa = (7.20-7.10)/0.15 = 0.67; hr −17 bpm; map −14 mmHg; sv × 0.73
- pH 7.20: transición zona severa→leve; penalización nula
- pH 7.32: f_leve = (7.35-7.32)/0.15 = 0.20; hr −2 bpm; map −1.6 mmHg; sv × 0.97
- pH 7.36: sin penalización → retorno completo ✓

Recuperación en 30-60 s sim (τ = HR_HOMEO = 0.05 por tick de HR) ✓

## Ref: Marino ICU Book 4th ed, Cap 21 — acid-base effects on cardiovascular function.

## tsc --noEmit
EXIT:0 — 0 errores.
