# PHASE_R3_REPORT.md
# Fecha: 2026-05-12

---

## FASE 4 — PiCCO Fotorrealista + Quick Drawer

### 4.A + 4.B  PiCCOMonitor.tsx (src/components/picco/)

| Mejora | Detalle |
|--------|---------|
| Sidebar iconos | Freeze / Trend / Zero / Config / Alarm (SidebarButton) |
| SVVTrendIndicator | Sparkline bottom-left — ring buffer 20 pts |
| API `anatomy` prop | ANATOMY_POS map de 16 slots → x/y SVG sin coord hardcoded |
| React.memo | WaveChannel, ClockSimulated, AnatomicalHeartLungs, PiCCOLabel, PhotorealisticDial |
| Renderizado en Drawer | No overlay propio — contenido de Drawer portal |

### 4.C  PiCCOQuickDrawer.tsx (src/components/picco/)

- Panel fijo `fixed right-0 top-0 h-full w-60` — reemplaza PiCCOQuickAccessPanel
- Checklist inline de 12 parámetros disponibles
- Persiste en localStorage via `useUIStore.piccoQuickParams`
- TD footer siempre visible + alarma recalibración

### MonitoringStore
- `svvHistory: number[]` añadido (max 20 puntos)
- `addSvvSample(v)` acción
- CronosEngine: sample cada 30 sim-segundos cuando `invasiveMode === 'picco'`
- `performThermodilution`: pushea svv al history en cada TD

### MonitorApp
- `PiCCOMonitorSM1` → `Drawer` portal con `PiCCOMonitor` como contenido
- `PiCCOQuickAccessPanel` → `PiCCOQuickDrawer`

---

## FASE 5 — DilutionManager + Pharmacokinetics Refactor

### 5.A  useDilutionStore.ts (src/store/)

- `DilutionPreset` interface: drugAmountMg, diluentVolumeMl, diluentType, concentration_mg_mL, unit, source
- Zustand persist en `imhotep:dilutions`
- `setActive`, `resetToStandard`, `getPreset`, `computeCcH`
- `computeCcHWithPreset()` helper exportado (preview dilución)

### 5.B  DilutionConfigModal.tsx (src/components/clinical/)

- Drug amount (mg) + diluent volume (mL) + diluent type (SF09/D5W/Plasmalyte/LR)
- Concentración resultante calculada en tiempo real
- Preview cc/h con peso del paciente
- Botones: "↺ Restaurar estándar" + "Aplicar"

### 5.C  InfusionCardWithDilution.tsx (src/components/clinical/)

- Card universal: rate médica + cc/h calculados
- Stepper ▲▼ + range slider + DETENER
- ⚙ → abre DilutionConfigModal inline
- Badge "CUSTOM" cuando dilución no-estándar
- Respeta `dripUnitMode` de useUIStore

### 5.D  Furosemida VO — refactor dose-based

- Eliminado slider mg/h continuo
- Botones de dosis discreta: 20/40/80/160 mg (bolus inmediato)
- Sección "Programar c/…": dosis + intervalo → `scheduleDose('furosemide_oral', …)`

### 5.E  Catálogo diuréticos expandido

| Droga | Mecanismo | Referencia |
|-------|-----------|------------|
| `hydrochlorothiazide_oral` | Tiazida NCC | CLOROTIC Eur Heart J 2022 |
| `metolazone_oral` | Tiazida-like | 3T JACC Heart Fail 2019 |
| `spironolactone_oral` | AldAnt K⁺-sparing | RALES/EMPHASIS-HF |
| `acetazolamide_iv` | ACI — alcalosis | ADVOR NEJM 2022 |
| `acetazolamide_oral` | ACI — TID | ORION-A 2025 |

### RenalEngine — acoplamiento nuevos diuréticos

```typescript
// Sinergia: tiazidas potencian loop (secuencial tubular) × 0.5
const synergy = furoActive ? (thiazideTotal + aceta) * 0.5 : 0;
const extraDiuresis = thiazideTotal + spiro + aceta + synergy;
```

- K⁺ loss: tiazidas (k_drop 5e-7 × dt)
- K⁺ rise: espironolactona (k_rise 3e-6 × dt)
- Resistencia diurética: sin loop, solo tiazida/aceta cubre sin sinergia

### usePharmacologyStore
- `DrugPDProfile` + campos: `kLoss?`, `kSparing?`, `aldosteroneAntagonism?`, `bicarbosisEffect?`
- `DrugCatalogEntry` + `shortName?: string`
- 5 nuevos DrugId en union type

### PharmacologyEngine.DRUG_MAX_DOSES
- HCT 4.2 mg/h · Metolazone 0.42 mg/h · Espiro 4.2 mg/h
- Acetazolamida IV 20.8 mg/h · Acetazolamida VO 10.4 mg/h

---

## Validación final

```
npx tsc --noEmit → EXIT:0 ✅
```

| Check | Estado |
|-------|--------|
| PiCCOMonitor anatomy API | ✅ |
| SVV history ring buffer + CronosEngine | ✅ |
| PiCCOQuickDrawer fijo + localStorage | ✅ |
| Drawer portal PiCCO en MonitorApp | ✅ |
| useDilutionStore persist localStorage | ✅ |
| DilutionConfigModal preview cc/h | ✅ |
| InfusionCardWithDilution dripUnitMode | ✅ |
| Furosemida VO dose-based + programar VO | ✅ |
| 5 nuevos diuréticos en DrugId + catalog | ✅ |
| RenalEngine sinergia tiazida+loop | ✅ |
