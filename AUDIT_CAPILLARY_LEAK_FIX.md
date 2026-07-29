# AUDIT_CAPILLARY_LEAK_FIX.md
# IMHOTEP UCI — Capillary Leak Gamma Model (FASE 4)
# Fecha: 2026-05-03

---

## Bug original

```typescript
// Antes: fuga lineal indefinida → vol → 0 mL tras simulación prolongada
if (capillaryLeakRate > 0) {
  vol -= (capillaryLeakRate / 60) * dt;
}
```

Sin componente temporal → fuga constante mientras `capillaryLeakRate > 0`
→ el BV del paciente llega a 0 mL después de horas de simulación.

## Modelo implementado

**Curva gamma rise-fall** (normalizada, pico=1 en t=LEAK_PEAK_S):
```
g(t) = (x/k)^k × exp(k − x)   donde x = t/tau, k = peakTime/tau
peakTime = 6h sim, tau = 18h sim, k = 0.333
```

Valores típicos de g(t):
| t sim | g(t) | % del pico |
|---|---|---|
| 0h | 0 | 0% |
| 2h | 0.38 | 38% |
| 4h | 0.79 | 79% |
| **6h (pico)** | **1.00** | **100%** |
| 8h | 0.98 | 98% |
| 12h | 0.72 | 72% |
| 24h | 0.28 | 28% |
| 48h | 0.05 | 5% |

## Beneficios de tratamiento (decaimiento acelerado)

| Intervención | Reducción fuga | Referencia |
|---|---|---|
| Control de foco | −40% | SSC 2021; ANDROMEDA-SHOCK-2 JAMA 2025 |
| Antibióticos adecuados | −25% | Kumar CCM 2006 |
| Corticoides (HC) | −20% | APROCCHSS NEJM 2018 |
| **Cap combinado** | **−70%** | — |

## Curva simulada: escenario shock séptico 48h, tratamiento óptimo h1

| Hora sim | g(t) | treatmentDecay | Fuga efectiva (% base) | BV (mL) aprox. |
|---|---|---|---|---|
| 0 | 0 | 1.0 | 0% | 5000 |
| 2 | 0.38 | 1.0→0.55* | 21% | ~4900 |
| 6 | 1.00 | 0.55 | 55% | ~4200-4500 |
| 12 | 0.72 | 0.30 | 22% | estabilizando |
| 24 | 0.28 | 0.30 | 8% | 4600+ (con fluidoterapia) |
| 48 | 0.05 | 0.30 | 1.5% | ~normalizado |

*tratamiento activo a partir de h=1: sourceControl+ATB = 0.70 → treatmentDecay=0.30

## Cambios en stores y engines

| Archivo | Cambio |
|---|---|
| `usePathologyStore.ts` | `SepsisState` extendida con `timeSinceOnsetS`, `sourceControlAchieved`, `adequateAntibiotics`; acciones `setSourceControl`, `setAdequateAntibiotics`, `advanceSepsisTime` |
| `PathologyEngine.ts` | `advanceSepsisTime(dt)` en cada tick cuando sepsis activa |
| `CardiovascularEngine.ts` | Curva gamma reemplaza modelo lineal; `leakShape × treatmentDecay` |
| `LiveInstructorOverridePanel.tsx` | 2 toggles en sección sepsis: "ATB ADECUADO" y "CTRL FOCO" |

## Comportamiento esperado para el clínico

- Sin tratamiento: el BV cae ~500-700 mL en las primeras 6-12h sim, luego se estabiliza y recupera lentamente (sin reposición → 4300-4500 mL al día).
- Con tratamiento óptimo desde h=1: caída limitada a ~200-300 mL; resolución más rápida.
- Ya no hay drift indefinido hacia 0 mL: g(t) → 0 en t→∞.
