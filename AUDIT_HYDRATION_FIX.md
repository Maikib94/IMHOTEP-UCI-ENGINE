# AUDIT_HYDRATION_FIX.md
# Fecha: 2026-05-05

## 4.A — Estado usePatientStore (ya existía)

| Campo                      | Tipo                              | Default           |
|----------------------------|-----------------------------------|-------------------|
| `maintenanceFluidRate_mLh` | number                            | 0                 |
| `maintenanceFluidType`     | 'ringer_lactato' \| 'sf_09' \| 'dex5' | 'ringer_lactato' |
| `maintenanceCumulative_mL` | number                            | 0                 |

Acciones: `setMaintenanceFluidRate`, `setMaintenanceFluidType`, `addMaintenanceTick`.

## 4.B — Tick handler (CronosEngine, ya existía)

```typescript
if (pat.maintenanceFluidRate_mLh > 0) {
  const delta_mL = (pat.maintenanceFluidRate_mLh / 3600) * dt;
  pat.addMaintenanceTick(delta_mL);
}
```

`addMaintenanceTick` aplica 30% de retención IV (Hahn BJA 2018-2021):
```
bloodVolume += delta_mL × 0.30
crystalloidAccumulated += delta_mL
maintenanceCumulative_mL += delta_mL
```

## 4.C — UI: HydrationControls (nuevo)

Archivo: `src/components/clinical/HydrationControls.tsx`
Cableado en: `ClinicalControlPanel.tsx` → acordeón "FÁRMACOS ESPECIALES" → subsección "HIDRATACIÓN"

Secciones del componente:
1. **Volemia display** — barra proporcional con colores semáforo
2. **Plan de mantenimiento** — tipo + rate stepper + presets 0/50/80/100/125/150 mL/h
3. **Expansión — bolos** — 250/500/1000 mL RL, 500 mL SF, 1U GRE, 1U PFC

## 4.D — Acoplamiento físico (ya existía en CardiovascularEngine)

GEDI continua ya computada cada tick:
```typescript
const gediContinua = Math.round(740 * volFracCV / bsaCV * 1.7);
upd({ gedi: gediContinua });
```

## Verificación: Bolo 1 L Ringer

Escenario: paciente 70 kg, BV basal 5000 mL, bolo 1000 mL RL en 1 tick.

1. `administerFluid('ringer_lactato', 1000)` → BV: 5000 + 1000 = 6000 mL
2. GEDI continua: `740 × (6000/5000) / 1.7 × 1.7` = 740 × 1.2 = **888 mL/m²** (↑ 148 desde 740)
3. Frank-Starling → CO↑ → MAP↑ ~8-12 mmHg (CardiovascularEngine, modelo SV-Frank-Starling)
4. GEDI en snapshot PiCCO (siguiente termodilución): `Math.round(740 × (6000/5000))` = **888 mL/m²**

Nota: `administerFluid` añade el 100% del volumen a BV (bolo agudo, no cinética IV).
`addMaintenanceTick` añade sólo 30% (cinética IV lenta, Hahn 2018).

## tsc --noEmit
0 errores tras todos los cambios.
