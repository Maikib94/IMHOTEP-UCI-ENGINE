# AUDIT_PRE_REFACTOR.md
# Fecha: 2026-05-05

## tsc --noEmit
EXIT:0 — 0 errores de TypeScript antes del refactor.

## Archivos clave confirmados
- src/store/usePatientStore.ts ✅
- src/store/usePathologyStore.ts ✅
- src/store/useScenarioStore.ts ✅
- src/store/useTimeStore.ts ✅
- src/store/useMonitoringStore.ts ✅
- src/store/useMicrobiologyStore.ts ✅
- src/store/useLabStore.ts ❌ FALTANTE (FASE 5 — fuera de scope actual)
- src/core/CardiovascularEngine.ts ✅
- src/core/RenalEngine.ts ✅
- src/core/RespiratoryEngine.ts ✅
- src/core/PathologyEngine.ts ✅
- src/core/CronosEngine.ts ✅
- src/core/MicrobiologyEngine.ts ✅
- src/core/PharmacologyEngine.ts ✅
- src/core/ProceduralPatientFactory.ts ❌ FALTANTE (FASE 5 — fuera de scope actual)
- src/components/ClinicalControlPanel.tsx ✅
- src/components/PiCCOMonitorSM1.tsx ✅
- src/components/PiCCOQuickPanel.tsx ✅
- src/components/LabPanel.tsx ✅
- src/components/ScenarioSelectorModal.tsx ✅
- src/components/CustomCaseModal.tsx ❌ FALTANTE (FASE 5 — fuera de scope actual)

## Issues de arquitectura detectados (pre-refactor)
1. RenalEngine no drena bloodVolume por diuresis → sin pérdida de volumen circulante
2. RenalEngine corre DESPUÉS de CardiovascularEngine → volemia desacoplada del mismo tick
3. τ de suavizado UO = 50s (K_TUBULAR=0.02), spec pide 30s
4. useUIStore no tiene `unitDisplay` para toggle mcg/kg/min ↔ cc/h
5. DRUG_CATALOG no tiene nac_neb ni adrenaline_neb
6. Vitals no tiene campo `evlwi` continuo para acoplamiento furosemida→pulmón
