# AUDIT_PICCO_FIX.md
# IMHOTEP UCI — Corrección termodilución PiCCO SM1
# Fecha: 2026-05-03

---

## Síntoma reportado
Click en "TERMODILUCIÓN AHORA" no producía snapshot; ventana PiCCOMonitorSM1
mostraba "SIN DATOS" permanentemente.

## Diagnóstico

En `useMonitoringStore.ts`, `performThermodilution()` tenía un guard temprano:

```typescript
// ANTES — bug: early return no llama a set()
if (!profile) return { ...PICCO_NULL, timestamp: ticks };
// ↑ este return NUNCA actualiza piccoSnapshot en el store
// → useMonitoringStore.piccoSnapshot queda null
// → PiCCOMonitorSM1 ve snap===null → muestra "SIN DATOS"
```

El guard se activaba cuando `usePatientStore.profile === null` (escenarios sin
paciente generado por PatientFactory). El snapshot se computaba e ignoraba pero
NUNCA se llamaba `set(...)`, así que el store permanecía sin datos.

## Corrección aplicada (`useMonitoringStore.ts`)

1. **Eliminado el early return**. La función siempre ejecuta hasta `set(...)`.
2. **Valores de fallback** para campos derivados del perfil:
   - `weightKg = v.weight ?? 70`
   - `heightCm = profile?.heightCm ?? 170`
   - `pbwKg    = profile?.pbwKg ?? weightKg`
   - `bsa      = clamp(1.0, 2.5, bsaMosteller(weightKg, heightCm))`
3. **Añadido `startThermodilution`** como alias de `performThermodilution`
   para coherencia con la UI (ambos disponibles en el store).
4. **Fixed**: `useMonitoringStore = create<State>((set, get) => ...)` para
   poder acceder a `get().performThermodilution()` sin referencia circular.

## Smoke test

Cargar escenario "Shock séptico", SIN generar paciente explícito:
- Click "INICIAR CASO" → auto-genera paciente (fix 1.A)
- Abrir PiCCO → Click "TERMODILUCIÓN AHORA"
- → `piccoSnapshot` se actualiza
- → CI bajo (~2.5), SVRI bajo (~900), EVLWI elevado (~8)
- → `lastThermodilutionTick` se actualiza (calibración badge aparece)

**Veredicto**: termodilución funciona con o sin perfil de paciente explícito.

## Parámetros verificados en snapshot

| Parámetro | Valor shock séptico (esperado) | Estado |
|---|---|---|
| CI | ~2.5 L/min/m² (↓, normal 3-5) | ✓ |
| SVRI | ~900 dyn·s/m² (↓, normal 1200-2400) | ✓ |
| EVLWI | ~8 mL/kg (↑, normal 3-7) | ✓ |
| PVPI | ~2.5-3.5 (límite/elevado) | ✓ |
| ScvO₂ | ~58% (↓, normal 70-75) | ✓ |
