# AUDIT_FACTORY_FIX.md
# IMHOTEP UCI — Corrección integración PatientFactory
# Fecha: 2026-05-03

---

## Síntoma reportado
"Generando perfil..." permanente en PatientInfoModal; el perfil nunca aparecía.

## Diagnóstico real
`PatientFactory.ts` es **síncrona** y sin bucles infinitos. El problema estaba
en `useScenarioStore.applyScenario()`:

```typescript
// ANTES — solo aplicaba perfil si ya había un paciente PRE-seleccionado:
if (activePatient) {
  patient.setProfile(activePatient);
}
// → Si el usuario hacía click en "INICIAR CASO" sin generar paciente antes,
//   profile quedaba null y PatientInfoModal mostraba "Generando perfil..." forever.
```

## Corrección aplicada (`useScenarioStore.ts`)

1. **Añadido `generatePatient` a las importaciones dinámicas** de `applyScenario()`.
2. **Auto-generación garantizada**: si `activePatient === null` cuando se lanza
   el escenario, se genera automáticamente uno coherente con la categoría del caso.
3. **Store sincronizado**: el nuevo paciente se guarda en `set({ activePatient })`.

```typescript
// DESPUÉS — auto-generate si no hay paciente:
const patientToApply = activePatient ?? generatePatient({
  scenarioCategory: activeScenario.category,
});
if (patientToApply !== activePatient) {
  set({ activePatient: patientToApply });
}
patient.setProfile(patientToApply);
```

## Smoke test manual (50 pacientes)

```
generatePatient({ minComorbidities: 0, maxComorbidities: 5 })  × 50
```

- Tiempo por paciente: < 1 ms (síncrono, sin IO)
- Sin cuelgues: 50/50 completados
- CFS scores distribuidos: 1–9 correctamente
- Comorbilidades acotadas: nunca supera maxComorbidities

**Veredicto**: PatientFactory sin problemas. Bug estaba aguas arriba en el store.
