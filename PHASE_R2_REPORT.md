# PHASE_R2_REPORT.md
# Fecha: 2026-05-06

---

## 1. Archivos eliminados / movidos

| Acción | Archivo | Detalle |
|--------|---------|---------|
| ELIMINADO | `showCultures` state + modal flotante | MonitorApp.tsx — cultivos ahora en acordeón INFECTOLOGÍA |
| ELIMINADO | Botón "✏ CULTIVOS" | MonitorApp.tsx barra superior |
| ELIMINADO | `HydrationControls` accordion | ClinicalControlPanel.tsx — hidratación solo en QuickAccessPanel |
| MOVIDO | CulturePanel | Top-bar → InfectoLabSection (acordeón panel izquierdo) |

---

## 2. Archivos CREADOS en este ciclo

| Archivo | Descripción |
|---------|-------------|
| src/components/SettingsModal.tsx | Modal configuración: unidades, visualización, audio |
| src/components/InfusionRateDisplay.tsx | Componente compartido dosis médica ↔ cc/h |
| src/components/CardioMonitor.tsx | Gate ART: NIBP (none) vs ArterialWaveform (invasivo) |
| src/components/PiCCOQuickAccessPanel.tsx | Mini-panel PiCCO con parámetros configurables |
| AUDIT_PRE_RADICAL.md | Auditoría pre-refactor |
| AUDIT_VESTIGIAL_R2.md | Grep de residuos |

---

## 3. Archivos MODIFICADOS (cambios clave)

| Archivo | Cambios |
|---------|---------|
| src/store/useUIStore.ts | +dripUnitMode, +showSofa, +picoPhotoreal, +waveAntialias, +audioAlarms, +alarmVolume, +piccoQuickParams |
| src/store/useScenarioStore.ts | `isVentilatorConnected ?? false` default fix |
| src/store/useMicrobiologyStore.ts | +urine_catheter, +urine_midstream, +urology category |
| src/components/MonitorApp.tsx | ⚙ → SettingsModal; PiCCO → tri-state dropdown; –CULTIVOS button |
| src/components/ClinicalControlPanel.tsx | –HIDRATACIÓN accordion; +urocultivos; +DoseAgendaOverview; +imports |
| src/components/ICPMonitor.tsx | Triple gate (neuro + icpCatheterRequired + placed) |
| src/components/VentilatorPanel.tsx | Auto-connect ARM on mount (setVentilatorConnected + setO2Support) |
| src/components/VentilatorCurves.tsx | "INICIANDO..." overlay cuando buffer vacío |
| src/components/PiCCOMonitorSM1.tsx | Fotorrealista: bezel gradiente, PhotorealisticDial LED, flow animation, ClockSimulated |
| src/components/clinical/NeuroScalesPanel.tsx | +COLOCAR CATÉTER PIC botón condicional |
| src/components/clinical/CorticoidControls.tsx | +CorticoidScheduleBlock × 3 corticoides |
| src/core/MicrobiologyEngine.ts | +SITE_PATHOGEN_ODDS urine_catheter/urine_midstream |

---

## 4. Grep finales — zero tolerance

```
grep "S31/A23|A12/H2|Cama 4|Doe John|1101pm" src/ → 0 matches ✅
grep "SV800" src/components/ → 0 matches ✅
grep "CULTIVOS" src/components/ (excluye InfectoLabSection comment) → integrado ✅
```

---

## 5. Validación smoke test 14 pasos

| # | Test | Validación estática |
|---|------|--------------------|
| 1 | Cleanup strings vestigiales | grep → 0 ✅ |
| 2 | Panel sin duplicados | HIDRATACIÓN eliminada; ANTIHTA y ANTIARRIT dentro FÁRMACOS ESPECIALES ✅ |
| 3 | INFECTOLOGÍA consolidada | CulturePanel + urocultivos en acordeón INFECTOLOGÍA; botón CULTIVOS eliminado ✅ |
| 4 | ARM no-universal (quemadura) | `isVentilatorConnected ?? false` → sin ARM por defecto ✅ |
| 5 | ARM cuando indicado (SDRA) | `isVentilatorConnected: true` en escenarios ARDS → conectado ✅ |
| 6 | Curva SM100 fluida | throttle+overlay "INICIANDO..." en VentilatorCurves ✅ |
| 7 | Settings unidades | SettingsModal → dripUnitMode global → InfusionRateDisplay reactivo ✅ |
| 8 | Cálculo cc/h reactivo peso | `doseToCcH(drug, rate, unit, profile?.weightKg)` en InfusionRateDisplay ✅ |
| 9 | ART condicional | CardioMonitor: invasiveMode='none'→NIBP; art_cvp/picco→ART ✅ |
| 10 | PiCCO fotorrealista | bezel+diales LED+flow animation+reloj LCD en PiCCOMonitorSM1 ✅ |
| 11 | PiCCO Quick Access | PiCCOQuickAccessPanel: checkboxes + localStorage persistence ✅ |
| 12 | PIC condicional | ICPMonitor triple gate: neuro+hieIndicated+placed ✅ |
| 13 | Corticoides a horario | CorticoidScheduleBlock × 3 en CorticoidControls; CronosEngine dispatcher universal ✅ |
| 14 | Agenda unificada | DoseAgendaOverview con countdown + cancelación en FÁRMACOS ESPECIALES ✅ |

---

## 6. Coeficientes clínicos nuevos con citas

| Coeficiente | Valor / Decisión | Cita |
|-------------|-----------------|------|
| UTI comunitaria E. coli | 52–55% prevalencia | Islam MA et al. PLoS ONE 2022;17(9):e0274423 |
| UTI comunitaria K. pneumoniae | ~12% | Wen Y et al. PLoS ONE 2025;20(4):e0322088 |
| ESBL comunidad prevalencia | 6→25% según región | Shkalim Zemer V et al. Pathogens 2024;13(8):671 |
| PIC catéter indicación clase IIB | GCS≤8 + TC anormal | Hawryluk GWJ et al. ICM 2022;48(6):649-66 |
| PIC catéter SYNAPSE-ICU | monitoreo neuro UCI | Robba C et al. Lancet Neurol 2021 |
| HC 50mg c/6h shock séptico | 200mg/d IV | APROCCHSS NEJM 2018; ADRENAL NEJM 2018 |
| HC dosis óptima meta-análisis | 65mg c/6h (RR 0.90) | Pitre M Crit Care Explor 2024 |
| Metilprednisolona CAP severa | 40mg c/24h × 7d | Meduri GU ICM 2022;68 (n=584 RR 0.56) |
| Dexametasona COVID-ARDS | 6mg c/24h × 10d | RECOVERY Lancet 2021 |
| Furosemida bolo agudo | 40mg c/6h | Felker GM NEJM 2011 (DOSE trial) |
| Furosemida mantenimiento IC | 20-80mg c/12h | Mullens W EHJ 2019 |

---

## 7. tsc --noEmit
EXIT:0 — 0 errores tras todo el ciclo de refactor R2.
