# AUDIT_PRE_RADICAL.md
# Fecha: 2026-05-06

## tsc --noEmit
EXIT:0 — 0 errores TypeScript antes del refactor radical.

## Archivos clave
| Archivo | Estado |
|---------|--------|
| src/store/usePatientStore.ts | ✅ |
| src/store/useScenarioStore.ts | ✅ |
| src/store/useMonitoringStore.ts | ✅ |
| src/store/usePharmacologyStore.ts | ✅ |
| src/store/useUIStore.ts | ✅ |
| src/store/useMicrobiologyStore.ts | ✅ |
| src/core/ProceduralPatientFactory.ts | ✅ |
| src/core/CardiovascularEngine.ts | ✅ |
| src/components/ClinicalControlPanel.tsx | ✅ |
| src/components/VentilatorPanel.tsx | ✅ |
| src/components/VentilatorSM100.tsx | ✅ |
| src/utils/dilutionTable.ts | ✅ |
| src/utils/formatVital.ts | ✅ |
| src/core/ScenarioEngine.ts | ❌ FALTANTE (funcionalidad en useScenarioStore.ts) |
| src/components/CardioMonitor.tsx | ❌ FALTANTE (fuera de scope) |
| src/components/PiCCOPanel.tsx | ❌ FALTANTE (PiCCOMonitorSM1.tsx existe) |
| src/components/SettingsModal.tsx | ❌ FALTANTE (fuera de scope) |

## Issues detectados
1. CULTIVOS botón en MonitorApp.tsx top bar → duplicado de CulturePanel en acordeón INFECTOLOGÍA
2. HIDRATACIÓN acordeón en FÁRMACOS ESPECIALES → duplicado de QuickAccessPanel
3. `applyScenario()` no resetea `isVentilatorConnected` a false cuando no especificado →
   escenarios no-intubados pueden heredar ARM conectado del caso anterior
4. VentilatorCurves no muestra overlay "INICIANDO" cuando buffer vacío
5. Sin urocultivo en INFECTOLOGÍA accordion
