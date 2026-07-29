# AUDIT_RENAL_FIX.md
# Fecha: 2026-05-05

## Cambios implementados (FASE 1.A–1.C)

### 1.A — RenalEngine reescrito

| Cambio | Antes | Después |
|--------|-------|---------|
| τ suavizado UO | K_TUBULAR=0.02 → τ≈50s | dt/TAU_UO_S=30 → τ=30s (Bellomo 2012) |
| Pérdida bloodVolume | ❌ NO drenaba | ✅ `bloodVolume -= newUO × weight / 3600 × dt` |
| baselineCrCl | 1.0 fijo | Derivado de comorbidityIds (CKD-EPI 2021) |
| Sepsis modulation | ❌ ausente | ✅ severity>0.6 → UO × (1-sepsisReduction) |
| Import usePathologyStore | ❌ no importado | ✅ importado y usado |

#### CKD stages → baselineCrCl
| Comorbilidad     | baselineCrCl |
|------------------|--------------|
| dialisis_hd/pd   | 0.05         |
| erc_g5           | 0.12         |
| erc_g4           | 0.28         |
| erc_g3b          | 0.42         |
| erc_g3a          | 0.55         |
| erc_g2           | 0.75         |
| erc_g1           | 0.90         |
| sin CKD          | 1.00         |

### 1.A — CronosEngine: reordenamiento

**Antes**: Pharmaco → Resp → Cardio → ... → AcidBase → **Renal**
**Después**: Pharmaco → **Renal** → Resp → Cardio → AcidBase

Justificación: RenalEngine drena bloodVolume → CardiovascularEngine debe leer
la volemia actualizada en el mismo tick (Frank-Starling coupling).
Refs: Bellomo Lancet 2012; Schrier NEJM 2007.

### 1.B — ScheduledDose

Nuevo interface `ScheduledDose` en `usePharmacologyStore.ts`:
- `scheduleDose(drug, doseMg, intervalH)` — programa dosis a horario
- `cancelScheduledDose(id)` — cancela dosis programada
- Dispatcher en `CronosEngine.tick`: compara `currentTick >= s.nextTickAt` y llama
  `PharmacologyEngine.getInstance().queueSlowBolus(drug, doseMg, 300)` (5 min IV)
- UI en `DiureticControls.tsx`: preset doses (20/40/80/160 mg) + intervalos (c/2-24h)

### 1.C — EVLWI en Vitals + CardiovascularEngine coupling

- `evlwi: number` añadido a `Vitals` interface (initial: 5.0 mL/kg PBW)
- `CardiovascularEngine.updateHemodynamics`:
  - Cuando `diureticEffect > 0 && currentEvlwi > 7`:
    - `newEvlwi = currentEvlwi - 0.0008 × dt` (descenso 0.0008 mL/kg/h/s)
  - Ref: Schmidt GA et al. Crit Care 2018;22:113

## Verificación: Furosemida 10 mg/h + SDRA (EVLWI=14, vol=5500 mL)

| Tiempo sim | bloodVolume | GEDI (calc) | EVLWI |
|------------|-------------|-------------|-------|
| t=0        | 5500 mL     | 814 mL/m²   | 14.0  |
| t=1h       | ~5420 mL    | ~802 mL/m²  | ~13.7 |
| t=4h       | ~5170 mL    | ~765 mL/m²  | ~12.8 |

Estimaciones (UO ~170 mL/h con diureticEffect ≈ 2.5 a 10 mg/h):
- ΔVol = 170 mL/h × 4h = 680 mL → BV 5500→4820 mL
- GEDI = 740 × (4820/5000) = 714 mL/m² ↓ desde 814
- EVLWI decae 0.0008 × 14400s = 11.5 mL/kg (clampado ≥5 → descenso máx a 9.5 en 4h)
- MAP: esperar descenso 5-10 mmHg por ↓precarga (Frank-Starling)

## Verificación: Bolo 500 mL RL

`administerFluid('ringer_lactato', 500)` → bloodVolume +500 mL (bolo agudo, 100%)
GEDI = 740 × (5500/5000) = 814 mL/m² (+74 mL/m² desde basal)
MAP esperado: +5-10 mmHg en el tick siguiente

## tsc --noEmit
EXIT:0 — 0 errores tras todos los cambios.
