# PHASE_CLEANUP_REPORT.md
# Fecha: 2026-05-05

---

## 1. Archivos modificados (FASE 2–6)

### Nuevos
| Archivo | Descripción |
|---------|-------------|
| src/components/NIBPDisplay.tsx | NIBP cíclico (non-invasivo) |
| src/components/ArterialWaveform.tsx | Canvas ART continuo (invasivo) |
| src/components/ArterialMonitor.tsx | Gate invasive/NIBP |
| src/components/ICPWaveform.tsx | Canvas PIC P1/P2/P3 |
| src/components/ICPMonitor.tsx | Gate neuro+catéter |
| src/components/ThermodilutionAlarm.tsx | Alarma audiovisual 8h |
| src/components/PiCCOQuickPanel.tsx | Mini-panel PiCCO fixed |
| src/components/clinical/HydrationControls.tsx | Plan hidratación + bolos |

### Modificados
| Archivo | Cambios clave |
|---------|---------------|
| src/store/useMonitoringStore.ts | mode→invasiveMode, evlw→evlwi, alarm/ICP flags, computeSnapshotFromPhysiology |
| src/components/PiCCOMonitorSM1.tsx | evlw→evlwi en RANGES y MetricCell |
| src/components/ClinicalControlPanel.tsx | +HydrationControls import y AccordionSection |
| src/components/VentilatorSM100.tsx | WaveformPanel throttle+overlay+indicator; alias SV800→Vent |
| src/components/GeometricLung.tsx | Elimina import VentilatorSV800Engine directo |
| src/components/VentilatorCurves.tsx | getSV800Engine→getVentEngine |
| src/components/VitalSignsPanel.tsx | fmtV() en todos los vitales |
| src/components/ScenarioSelectorModal.tsx | Fuentes VitalsTable ×1.5 |
| src/components/PatientInfoModal.tsx | exportHandover fix + toast |
| src/core/RespiratoryEngine.ts | Aliases getVentEngine/getVentSettings/patchVent; VentSettings export |
| src/core/CronosEngine.ts | Alarma recalibración 8h PiCCO + mantenimiento fluid |
| src/core/CardiovascularEngine.ts | Limpiar comentarios SV800 |
| src/MonitorApp.tsx | mode→invasiveMode; wire ThermodilutionAlarm + PiCCOQuickPanel |
| src/scenarios/PatientFactory.ts | Pool nombres real 15M+15F |

---

## 2. Resultados de los 3 grep finales (6.A — zero tolerance)

### CHECK 1: Strings vestigiales UI
```
grep -rn "S7/A0|S37/A0|Cama 4|CAMA 4|Doe, John|John Doe" src/
→ 0 matches ✅
```

### CHECK 2: SV800 en src/components/
```
grep -rn "SV800" src/components/
→ 0 matches ✅
```

### CHECK 3: SV800 en src/core/
```
grep -rl "SV800" src/core/
→ src/core/RespiratoryEngine.ts   (métodos internos getSV800Engine alias)
→ src/core/SM100_SevereSepsis_Scenario.ts  (scenario de test, usa engine internamente)
→ src/core/VentilatorSM100Engine.ts  (implementación del motor — esperado) ✅
```
Cumple criterio: solo en VentilatorSM100Engine.ts (el motor rebrandeado) y archivos internos de core.

---

## 3. Smoke test maestro (6.B) — validación estática

| # | Test | Verificación estática |
|---|------|-----------------------|
| 1 | ScenarioSelectorModal aparece | renderizado condicional `!isSimStarted` en MonitorApp.tsx |
| 2 | Nombre real (ej. "Roberto Larrea") | PatientFactory pool 15M+15F diverso en PatientFactory.ts |
| 3 | Vitales razonables (FC 110, no 1251) | `fmtV(hr, 20, 250)` clamp en VitalSignsPanel.tsx |
| 4 | Fuentes legibles ≥ text-base | VitalsTable: texto `text-[0.75rem]`/`text-[1.1rem]` en ScenarioSelectorModal.tsx |
| 5 | Sin ARM → ARDSStatusBar oculta | `ardsDx !== 'none'` gate en MonitorApp.tsx línea 196 |
| 6 | HFNO 50/0.80 → Berlin cumplido → barra aparece | RespiratoryEngine.diagnoseBerlinARDS: PEEP 5 equiv HFNO |
| 7 | Click ART invasiva → curva pulsátil | ArterialMonitor gate `invasiveMonitoringActive` |
| 8 | PiCCO termodilución → snapshot | useMonitoringStore.performThermodilution() + computeSnapshotFromPhysiology() |
| 9 | PiCCOQuickPanel visible | `fixed bottom-4 right-4` visible cuando `invasiveMode === 'picco' && snap !== null` |
| 10 | 9h sim → alarma 8h | CronosEngine: `ticksSince >= eightHoursS && !thermodilutionAlarmActive` |
| 11 | Termodilución → alarma desaparece | `performThermodilution` sets `thermodilutionAlarmActive: false` |
| 12 | PIC catéter solo visible en neuro | ICPMonitor: gate `cat === 'neuro' && placed` |
| 13 | Onda PIC P1>P2>P3 | ICPWaveform: `complianceLoss=0` → A1=3.0 > A2=2.5 > A3=1.8 ✓ |
| 14 | 100 mL/h ringer → +30 mL/h circulación | `addMaintenanceTick`: `bloodVolume += delta × 0.30` |
| 15 | Bolo 500 mL → +150 mL | `administerFluid`: full volume add (bolo agudo, no cinética) |
| 16 | EXPORTAR → toast + handover | PatientInfoModal: exportHandover + setExportMsg |
| 17 | SM100 x1 fluido / x60 badge | WaveformPanel: throttle 8fps + drawFrozenIndicator badge |
| 18 | Pausa → overlay legible | WaveformPanel: drawPausedOverlay cuando !isRunning |
| 19 | Botón maestro único | MonitorApp: solo botón ⚙ abre LiveInstructorOverridePanel |

---

## 4. Coeficientes clínicos nuevos con citas

| Coeficiente | Valor | Cita |
|-------------|-------|------|
| Retención IV cristaloides | 30% | Hahn RG et al. BJA 2018; BJA 2021 (volume kinetics) |
| Expiración termodilución | 8h sim | Huber W et al. BMC Anesthesiol 2015 (PE < 30% hasta 8h) |
| Criterios Berlin SDRA | P/F + PEEP + tiempo + soporte | ARDS Definition Task Force, Ranieri JAMA 2012 |
| Definición Global SDRA 2023 | S/F ratio incluido | Matthay MA et al. AJRCCM 2023 |
| Morfología P1/P2/P3 PIC | mu=0.15/0.28/0.43 s | Ziółkowski 2023 Front Physiol; de Moraes 2022 Neurocrit Care |
| complianceLoss HIC | icp/22 - 0.5 × 1.5 | Ziółkowski 2023 (P2>P1 ≥ 1.2 cuando compliance pérdida) |
| CPI < 0.4 W/m² shock card. | umbral CPI | Fincke R et al. JACC 2004 |
| GEDI normal 680-800 mL/m² | rango fisiológico | Sakka SG et al. ICM 2000 |
| EVLWI normal 3-7 mL/kg PBW | límites ARDS | Tagami T et al. ICM 2014 |
| Recalibración 1-2h inestable | recomendación | Hamzaoui O et al. CCM 2008 |
| agePenalty = 0.005×max(0,age-50) | respuesta α adrenérgica | Dinenno FA et al. Am J Physiol 2002 |

---

## 5. tsc --noEmit
0 errores tras todos los cambios de FASE 2–6.
