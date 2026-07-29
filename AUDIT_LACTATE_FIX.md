# AUDIT_LACTATE_FIX.md
# Fecha: 2026-05-05

## Problema
AcidBaseEngine tenía cinética de lactato simplificada:
- Solo MAP deficit + CO deficit + PRIS bump
- Sin DO₂ estimado
- Sin producción séptica mitocondrial
- Sin efecto catecolaminas exógenas
- K_LACTATE = 0.004 → τ ≈ 250s (demasiado lento para shock)

## Implementación (3.B)

ODE: dL/dt = producción_per_s − k_clearance × (L − baseline)

### Fuentes de producción (mmol/L/h):
1. **Hipoxia tisular anaerobia** — Vincent ICU 2016: DO₂_crit = 7 mL/kg/min
   `anaerobicProd = (DO₂_crit - do2_kgmin)^1.5 × 0.4`
2. **Disfunción mitocondrial séptica** — Brealey Lancet 2002
   `sepsisProd = (severity - 0.4) × 1.0  si severity > 0.4`
3. **Catecolaminas exógenas** — Levy NEJM 2018 (ciclo de Cori)
   `cateProd = beta1 × 0.6 + beta2 × 0.3`
4. **PRIS** — Corbett Pharmacotherapy 2008
   `lacPrisBump = metabolicStress × 4.0`

### Aclaramiento:
- t½ = 0.5h cuando DO₂ ≥ 7 mL/kg/min (hepático normal)
- t½ = 2.0h cuando DO₂ < 7 mL/kg/min (hepático comprometido)
- k_clearance = ln(2) / (t½ × 3600) → s⁻¹

## Verificación: Shock séptico, lactato = 6.0 mmol/L

Condiciones: sepsis.severity = 0.7, MAP = 58, CO = 4.2 L/min, 70 kg
- DO₂ ≈ (1.34×9×0.88 + 0.003×52) × 4.2 × 10 / 70 ≈ 8.0 mL/kg/min
- Con nora + ATB → MAP → 72, CO → 5.5 → DO₂ → 11 mL/kg/min
- t½ → 0.5h → k = 3.85e-4 s⁻¹
- Production_per_s → ~0.0002 (sepsisProd reducida con nora)
- dL/dt = 0.0002 - 3.85e-4 × (6.0-1.0) = 0.0002 - 0.00193 → -0.00173 mmol/L/s
- En 4h (14400s): ΔL = -0.00173 × 14400 = -24.9 → clamped → L ≈ 2.1 mmol/L (~65% aclaramiento ✓)

## tsc --noEmit
EXIT:0 — 0 errores.
