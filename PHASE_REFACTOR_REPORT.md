# PHASE_REFACTOR_REPORT.md
# Fecha: 2026-05-06

---

## 1. Archivos CREADOS en este ciclo de refactor

| Archivo | Descripción |
|---------|-------------|
| src/utils/formatVital.ts | Clampeo seguro de vitales → elimina "1101pm" |
| src/utils/dilutionTable.ts | Diluciones UCI estándar + doseToCcH() |
| src/core/ProceduralPatientFactory.ts | Parser NLP determinístico de narrativa clínica |
| src/components/CustomCaseModal.tsx | Modal descripción libre → caso personalizado |
| src/components/AntihypertensiveControls.tsx | 5 antihipertensivos VO con dosis a horario |
| src/components/clinical/HydrationControls.tsx | Plan hidratación IV + bolos expansión |
| src/scenarios/surgicalAbdominalScenarios.ts | 8 escenarios quirúrgicos críticos |

---

## 2. Archivos MODIFICADOS (cambios clave)

| Archivo | Cambios clave |
|---------|---------------|
| src/store/useUIStore.ts | +unitDisplay + toggleUnitDisplay |
| src/store/usePharmacologyStore.ts | +ScheduledDose interface + scheduleDose/cancel + nac_neb/adrenaline_neb |
| src/store/useMonitoringStore.ts | +revealedGerm + appropriateCoverage + revealGerm() |
| src/store/useMicrobiologyStore.ts | +revealedGerm + appropriateCoverage fields + reset |
| src/store/usePatientStore.ts | +evlwi: number a Vitals (initial 5.0) |
| src/store/useScenarioStore.ts | +surgical ScenarioCategory + SurgicalDrainStatus + icpCatheter fields |
| src/core/RenalEngine.ts | bloodVolume drain + τ=30s + baselineCrCl desde CKD + sepsis modulation |
| src/core/AcidBaseEngine.ts | Lactato: ODE multi-mecanismo (DO₂, sepsis, catecolas, PRIS) |
| src/core/CardiovascularEngine.ts | acidosisPenalty() continua + EVLWI coupling |
| src/core/CronosEngine.ts | Reorder (Renal antes de Cardio) + ScheduledDose dispatcher |
| src/core/PharmacologyEngine.ts | +nac_neb + adrenaline_neb en DRUG_MAX_DOSES |
| src/core/MicrobiologyEngine.ts | revealGerm() en cultivo positivo + selectGermByProfile() + appropriateCoverage |
| src/core/LabEngine.ts | +orderRoutineAdmission() (10 estudios) |
| src/core/RespiratoryEngine.ts | +getVentEngine/getVentSettings/patchVent aliases |
| src/components/PiCCOMonitorSM1.tsx | REESCRITO: layout anatómico VolumeView SVG + diales laterales |
| src/components/PiCCOQuickPanel.tsx | EVLWI usa snap.evlwi (renombrado desde evlw) |
| src/components/ScenarioSelectorModal.tsx | +formatVital + +surgical category + +CustomCaseModal |
| src/components/ClinicalControlPanel.tsx | +unitDisplay toggle + +AntihypertensiveControls + +HydrationControls |
| src/components/CulturePanel.tsx | revealedGerm (no hiddenPathogenId) para UI + button type |
| src/components/LabPanel.tsx | +RUTINA DE INGRESO button |
| src/components/VitalSignsPanel.tsx | fmtV() en todos los vitales |
| src/components/VentilatorSM100.tsx | WaveformPanel: throttle FPS + paused overlay + frozen indicator |
| src/components/clinical/AerosolControls.tsx | +nac_neb + adrenaline_neb cards |
| src/components/clinical/DiureticControls.tsx | +scheduled dose UI |
| src/scenarios/neuroCriticalScenarios.ts | +5 escenarios con icpCatheterRequired/evdActive |
| src/scenarios/index.ts | +surgicalAbdominalScenarios |
| src/scenarios/PatientFactory.ts | +surgical en scenarioCategory |

---

## 3. Grep finales — zero tolerance

```
grep -rn "S31/A23|S37/A0|S7/A0|CAMA 4|Doe, John|John Doe" src/
→ 0 matches ✅

grep -rn "1101pm|1101bpm" src/ (excluye comentario en formatVital.ts)
→ Solo en comentario docstring de formatVital.ts (documenta el bug fijo) ✅

grep -rn "SV800" src/components/
→ 0 matches ✅
```

---

## 4. Coeficientes clínicos nuevos con citas

| Coeficiente | Valor | Cita |
|-------------|-------|------|
| Lactato aclaramiento DO₂_crit | 7 mL/kg/min | Vincent JL, De Backer D. Crit Care 2016;20:255 |
| Lactato t½ normal | 30 min (0.5h) | Bakker J et al. Ann Intensive Care 2013;3:12 |
| Lactato t½ hipoperfusión | 2h | Bakker J et al. 2013 |
| Disfunción mitocondrial séptica | +1.0×(sev-0.4) mmol/L/h | Brealey D et al. Lancet 2002;360:219 |
| Catecolaminas → gluconeogénesis | β1×0.6+β2×0.3 mmol/L/h | Levy B et al. NEJM 2018;378:583 |
| PRIS lactato bump | metabolicStress × 4.0 | Corbett SM et al. Pharmacotherapy 2008;28:983 |
| Autorregulación renal MAP | lineal < 65 mmHg | Schrier RW. NEJM 2007;356:159 |
| AKI KDIGO CrCl penalización | KDIGO 3 → −70% UO | KDIGO AKI 2012. Kidney Int Suppl 2:1 |
| Furosemida UO | +1.7 mL/kg/h/40mg EV | Felker NEJM 2011 (DOSE trial) |
| EVLWI furosemida declive | −0.0008 mL/kg/h/s | Schmidt GA et al. Crit Care 2018;22:113 |
| Retención IV 30% | bloodVolume ×0.30 | Hahn RG. BJA 2021 (volume kinetics) |
| Acidosis HR penalización | pH<7.35: −10 bpm×f | Marino ICU Book 4th ed Cap 21 |
| Acidosis MAP penalización | pH<7.35: −8 mmHg×f | Marino ICU Book 4th ed |
| Acidosis contractilidad | pH<7.35: −15% SV | Marino ICU Book 4th ed |
| ATB sin cobertura → mortalidad | ×1.076/h | Kumar A et al. Crit Care Med 2006;34:1589 |
| Resistencia bacteriana IDSA | pools hospit vs comunidad | Tamma PD et al. CID 2024 (IDSA AMR) |
| GEDI normal | 680-800 mL/m² | Sakka SG et al. ICM 2000 |
| EVLWI normal | 3-7 mL/kg PBW | Kushimoto S et al. Crit Care 2012 |
| PiCCO recalibración | ≤8h para PE <30% | Huber W et al. BMC Anesthesiol 2015 |
| SVI calculado | CI×1000/HR mL/m² | Fick principle |

---

## 5. Validación smoke test 8.A (estática)

| # | Test | Validación estática |
|---|------|--------------------|
| 1 | Sin strings vestigiales | grep 0 matches todas las categorías ✅ |
| 2 | Custom Case narrativa | ProceduralPatientFactory.parse() + 25 patrones comorbilidades |
| 3 | Renal: UO + GEDI + ELWI | RenalEngine drena bloodVolume; CardiovascularEngine actualiza GEDI+EVLWI |
| 4 | Lactato ODE cinética | AcidBaseEngine: dL/dt multi-mecanismo t½ adaptativo |
| 5 | Post-acidosis recovery | acidosisPenalty() continua, reset automático a pH>7.35 |
| 6 | Switch unidades | UIStore.unitDisplay + doseToCcH() + toggle en ClinicalControlPanel |
| 7 | Hidden germ | revealedGerm=null hasta cultivo; "⏳ Pendiente" en UI |
| 8 | PiCCO anatómico | SVG corazón+pulmones + PiCCOLabel + 4 PiCCODial laterales |
| 9 | Polifarmacia oral | AntihypertensiveControls.tsx con 5 drogas + dosis a horario |
| 10 | Rutina ingreso lab | LabEngine.orderRoutineAdmission() → 10 estudios |

---

## 6. tsc --noEmit
EXIT:0 — 0 errores tras todo el ciclo de refactor.
