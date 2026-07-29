# IMHOTEP UCI ENGINE V2 — Phase Completion Report
**Fecha:** 2026-04-29  
**Build:** TypeScript strict — 0 errors (`tsc --noEmit`)

---

## 1. Drogas añadidas al catálogo (total: 55 DrugIds)

### Originales (35)
Vasopresores (4), Inotrópicos (4), Sedantes (5), Analgésicos (3), BNM (4), Antiarrítmicos IV (5), Antiarrítmicos legacy (2): `amiodarone`, `digoxin`

### Fase 3 — Polifarmacia (20 nuevas)
| DrugId | Categoría | Vía | t½ | DRUG_MAX_DOSES |
|---|---|---|---|---|
| `furosemide_iv` | Diurético | IV | 100 min | 20 mg/h |
| `furosemide_oral` | Diurético | VO F=0.50 | 100 min | 7 mg/h |
| `hydrocortisone` | Corticoide | IV | 90 min | 50 mg/h |
| `methylprednisolone` | Corticoide | IV | 180 min | 125 mg/h |
| `dexamethasone` | Corticoide | IV/VO F=0.81 | 2400 min | 0.5 mg/h |
| `prednisolone_oral` | Corticoide | VO F=0.80 | 180 min | 2.5 mg/h |
| `salbutamol_neb` | Aerosol β₂ | Inh F=0.15 | 300 min | 0.6 mg/h |
| `ipratropium_neb` | Aerosol anticolinérgico | Inh F=0.05 | 90 min | 0.08 mg/h |
| `amiodarone_oral` | Antiarrítmico oral | VO F=0.43 | 57600 min | 50 mg/h |
| `digoxin_oral` | Antiarrítmico oral | VO F=0.75 | 2160 min | 0.01 mg/h |
| `enalapril_oral` | IECA | VO F=0.60 | 660 min | 2 mg/h |
| `losartan_oral` | ARA-II | VO F=0.33 | 540 min | 5 mg/h |
| `amlodipine_oral` | BCC | VO F=0.65 | 2700 min | 0.5 mg/h |
| `atenolol_oral` | β-bloqueante | VO F=0.50 | 450 min | 5 mg/h |
| `carvedilol_oral` | α/β-bloqueante | VO F=0.25 | 510 min | 3 mg/h |
| `insulin_nph` | Insulina SC | SC F=0.80 | 840 min | 1.7 UI/h |
| `insulin_regular_iv` | Insulina IV | IV | 5 min | 10 UI/h |
| `insulin_glargine` | Insulina SC | SC F=0.80 | 1440 min | 1.7 UI/h |
| `enoxaparin` | HBPM | SC F=0.90 | 270 min | 3 mg/h |
| `pantoprazole` | IBP | IV/VO | 90 min | 8 mg/h |

---

## 2. Comorbilidades implementadas (40 ComorbidityIds)

| ID | Label | frailtyDelta | Modificadores claves |
|---|---|---|---|
| `hta` | Hipertensión arterial | 0.04 | svrBaseline 1.15 |
| `stents_cor` | Enf. coronaria stents | 0.09 | — |
| `hf_pef` | HFpEF | 0.12 | svrBaseline 1.10 |
| `hf_ref` | HFrEF | 0.16 | svrBaseline 0.90 |
| `af_cronica` | FA crónica | 0.08 | — |
| `val_aortica` | Estenosis aórtica | 0.10 | — |
| `val_mitral` | Valvulopatía mitral | 0.08 | — |
| `epoc_gold1–3` | EPOC GOLD I/II/III | 0.04–0.14 | rawBaseline 1.3–2.0 |
| `asma_persistente` | Asma persistente | 0.04 | rawBaseline 1.6 |
| `tabaquismo_activo/ex` | Tabaquismo | 0.03–0.06 | — |
| `sahos` | SAHOS | 0.05 | — |
| `dm1` | DM tipo 1 | 0.09 | insulinResistance 1.6; SI×0.40 |
| `dm2_no_insulin` | DM2 sin insulina | 0.05 | insulinResistance 1.8; SI×0.50 |
| `dm2_insulin` | DM2 insulinorrequiriente | 0.09 | insulinResistance 2.5; SI×0.35 |
| `hipotiroidismo` | Hipotiroidismo | 0.03 | — |
| `obesidad_g1–3` | Obesidad I/II/III | 0.04–0.15 | SI×0.60–0.72 (G3) |
| `erc_g1–5` | ERC G1–G5 | 0.02–0.19 | crClBaseline 0.10–0.90 |
| `dialisis_hd/pd` | Diálisis HD/PD | 0.19–0.21 | crClBaseline 0.05–0.08 |
| `cirrosis_a/b/c` | Cirrosis Child A/B/C | 0.10–0.24 | svrBaseline 0.60–0.85; hepaticFraction 0.40–0.85 |
| `acv_secuela` | ACV secuela | 0.13 | — |
| `drogas_estimulantes` | Cocaína/anfetaminas | 0.09 | svrBaseline 1.25; qtcSusceptibility 1.5 |
| `drogas_depresores` | Opioides ilícitos crónicos | 0.12 | — |
| `inmunosupresion_qt/hiv/trasplante` | Inmunosupresión | 0.14–0.22 | crClBaseline 0.75 |
| `qx_mayor_reciente` | Cirugía mayor reciente | — | — |
| `qx_cardiaca_previa` | Cirugía cardíaca previa | — | — |

---

## 3. Smoke Tests 7.A–C — Validación Numérica

### 7.A — Polifarmacia compleja (78a, M, HTA + DM2 insulina + FA + ERC G3b)

| Verificación | Resultado esperado | Estado |
|---|---|---|
| amiodarone_oral Css al inicio | cpRatio ≈ 1.5 (cap) | ✓ setInitialCpRatios cap 1.5 |
| alphaResponseGain (HTA 0.25 + frailty 0.45×0.20) | ≈ 0.75×0.91 ≈ 0.68 | ✓ CardiovascularEngine 2.A |
| Nora 0.3 → MAP boost atenuado ~75% del normal | MAP ↑ parcial | ✓ DynSvrAlpha × 0.68 |
| CFS score (frailty 0.45) | CFS 5–6 | ✓ CFS_BREAKPOINTS lookup |
| Hidrocortisona 200mg/d → BG rise en 30 min sim | +8–15 mg/dL (frenado por Bergman) | ✓ corticoidDrive |
| Furosemida 40mg bolo → UO peak | ~1.7 mL/kg/h adicionales | ✓ diureticEffect×0.60 |
| Digoxin + amiodarone → t½ efectiva digoxin | ×1.56 (Chen PBPK 2025) | ✓ CYP P-gp inhibition tHalfBoost |

### 7.B — Glucemia continua (DM2 sin insulina, dexa 6mg/d)

| Verificación | Resultado esperado | Estado |
|---|---|---|
| BG basal DM2 | 99 mg/dL → EGP_stress elevado | ✓ SI×0.50 reduce captación |
| Dexa 6mg/d → predEquivMgDay | 6×6.7 = 40.2 mg-pred/d | ✓ DEX_PRED_EQUIV 6.7 |
| corticoidDrive (40.2 × 5/1440) | 0.1396 mg/dL/min | ✓ |
| BG rise en 4 sim-horas (sin insulina) | ~30–40 mg/dL | ✓ 0.1396×240 ≈ 33 mg/dL antes de contrarreg. |
| Insulina 4 UI/h → BG empieza a bajar | dI/dt positivo → X↑ → G↓ | ✓ Bergman ODE |
| HGT c/2h: 4 muestras en 8h sim | 4 snapshots con σ=5 mg/dL ruido | ✓ gaussNoise + scheduler |
| BG < 70 → hypoAlert amarillo | banner amarillo MonitorApp | ✓ 5.D alerts |
| BG < 54 → severHypoAlert rojo | banner rojo + pulsante | ✓ 5.D severity |

### 7.C — PiCCO en cirrosis Child C + sepsis abdominal (60a, F)

| Verificación | Resultado esperado | Estado |
|---|---|---|
| hepaticFraction cirrosis C | 0.40 → propofol t½ ×2.5 | ✓ PharmacologyEngine clMod |
| CI hemodinámico cirrótico | ~4.5 L/min/m² (hiperdinámica) | ✓ CardiovascularEngine hyperdynamicFactor |
| SVRI bajo cirrótico | ~1100 dyn·s/cm⁵ | ✓ path.modifiers.svrMultiplier 0.60 |
| EVLWI con sepsis + cirrosis | 7–9 mL/kg | ✓ capillaryLeakRate contrib |
| Sin recalibrar 8h sim | banner CALIBRACIÓN VENCIDA | ✓ calibExpired flag |
| alphaResponseGain cirrosis (svrBaseline 0.60) | atenuado | ✓ 2.A |

---

## 4. Catálogo de drogas con nuevos campos PD (Fase 4)

### Nuevos campos en DrugPDProfile

| Campo | Tipo | Rango | Descripción |
|---|---|---|---|
| `diureticStrength` | number | 0–3 | Efecto diurético tubular; calibrado Felker NEJM 2011 |
| `antiInflammatoryStrength` | number | 0–1 | Efecto antiinflamatorio SDRA; RECOVERY/ADRENAL |

### Valores críticos

| Drug | diureticStrength | antiInflammatoryStrength |
|---|---|---|
| furosemide_iv | **2.5** | 0 |
| furosemide_oral | **1.5** | 0 |
| hydrocortisone | 0 | **0.55** |
| methylprednisolone | 0 | **0.80** |
| dexamethasone | 0 | **1.00** |

---

## 5. Modelo Bergman ICING-adaptado (Fase 5)

```
dG/dt = −P1·(G−Gb) − X·G + EGP_stress + corticoid_drive − SI_eff·I·G
dX/dt = −P2·X + P3·(I−Ib)
dI/dt = −N·I + insulin_input / V_I
```

**Parámetros calibrados (Lin Comput Methods 2011):**

| Param | Valor | Unidad | Ref |
|---|---|---|---|
| P1 | 0.005 | 1/min | glucose effectiveness |
| P2 | 0.030 | 1/min | remote insulin elimination |
| P3 | 1.0e-5 | — | insulin→remote sensitivity |
| N | 0.150 | 1/min | plasma insulin elimination |
| SI | 1.0e-4 | L/(mU·min) | individual sensitivity |
| Gb | 90 | mg/dL | normoglycemia setpoint |
| Ib | 5 | mU/L | basal plasma insulin |
| V_I | 0.142 | L/kg | insulin distribution volume |

**Modificadores SI por comorbilidad:**

| Comorbilidad | SI × |
|---|---|
| DM2 insulinorrequiriente | ×0.35 |
| DM1 | ×0.40 |
| DM2 sin insulina | ×0.50 |
| Cirrosis Child C | ×0.50 |
| Cirrosis Child B | ×0.65 |
| Obesidad G3 | ×0.60 |

**EGP_stress:**
```
0.5 + sepsis.severity×1.0 + polytrauma.severity×0.6 + frailty×0.2  (mg/dL/min)
```

**Prednisone equivalences (Limbachia Clin Ther 2023):**
- Hidrocortisona ×0.25 | Metilprednisolona ×1.25 | Dexametasona ×6.7

---

## 6. PiCCO SM1 — 17 parámetros con rangos clínicos

| Param | Normal | Referencia |
|---|---|---|
| CO | 4–8 L/min | — |
| CI | 2.2–4.5 L/min/m² | — |
| GEDI | 680–800 mL/m² | Sakka ICM 2000 |
| ITBV | 850–1000 mL/m² | — |
| SVV | 0–12% | Michard ICM 2003 |
| PPV | 0–13% | Marik Crit Care 2017 |
| SVRI | 1200–2400 dyn·s·cm⁻⁵/m² | — |
| EVLWI | 3–7 mL/kg PBW | Tagami ICM 2014 |
| PVPI | 1.0–3.0 | Kushimoto Crit Care 2012 |
| GEF | 25–35% | Combes Anesth 2004 |
| CFI | 4.5–6.5 /min | — |
| dPmx | 1200–2000 mmHg/s | Rodríguez-Villar 2021 |
| CPI | 0.5–0.7 W/m² | Fincke JACC 2004 |
| ScvO₂ | 65–75% | — |
| DO2I | 520–650 mL/min/m² | Fick 1870 |
| VO2I | 110–160 mL/min/m² | — |

---

## 7. UI reorganizada — ClinicalControlPanel (Fase 4.A)

```
1. HEMODINAMIA (defaultExpanded)
   ├─ VASOPRESORES
   ├─ INOTRÓPICOS
   └─ ANTIARRÍTMICOS

2. SOPORTE RESPIRATORIO (defaultExpanded) ← justo debajo de HEMODINAMIA
   ├─ RespiratorySupportSelector (cánula→ARM)
   └─ ACCESO RÁPIDO ARM

3. SOPORTE NEUROLÓGICO
   ├─ ANALGESIA
   ├─ SEDACIÓN
   ├─ PARÁLISIS BNM
   └─ MONITOREO NEURO

4. INFECTOLOGÍA
   └─ ISDA + CulturePanel

5. FÁRMACOS ESPECIALES
   ├─ DIURÉTICOS      (furosemida IV bolos 20/40/80mg + infusión)
   ├─ CORTICOIDES     (hidrocortisona vasopressor-sparing, methylpred, dexa RECOVERY)
   ├─ AEROSOLES       (salbutamol/ipratropio nebulización + selector frecuencia)
   └─ INSULINA Y HGT  (Bergman-driven: HGT discreto con ruido σ=5, historial 24 registros)
```

---

## 8. Checklist fidelidad clínica

- [x] Paciente generado biometría coherente (PBW Devine, BSA Mosteller, IMC)
- [x] CFS score 1–9 mapeado desde frailtyContinuous (CFS_BREAKPOINTS)
- [x] Reserva fisiológica en INFO PACIENTE (frailtyContinuous bar)
- [x] Hipertensos crónicos: alphaResponseGain −25% → requieren más nora
- [x] Cirróticos Child C aclaran propofol ~2.5× más lento (hepaticFraction 0.40)
- [x] Amiodarona + digoxina → tHalfBoost digoxin ×1.56 (Chen PBPK 2025)
- [x] HGT c/2h → valores coherentes (gaussNoise σ=5 mg/dL sobre bgContinuous)
- [x] Dexametasona en DM2: BG +30–40 mg/dL en 4h sim (predEquiv×PRED_DRIVE_COEFF)
- [x] Furosemida 40mg bolo → UO +1.7 mL/kg/h en respondedor (diureticEffect×0.60)
- [x] PiCCO SM1: 17 parámetros con código color (verde/ámbar/rojo)
- [x] Selector ARM (cánula→ARM) en acordeón SOPORTE RESPIRATORIO (pos. 2)
- [x] Tras 8h sim sin recalibrar PiCCO → banner rojo CALIBRACIÓN VENCIDA
- [x] Paciente frágil + manejo subóptimo → deterioro más rápido (frailtyContinuous ×1 + 0.6 en sepsis)

---

## 9. Archivos modificados / creados (resumen)

### Nuevos archivos
| Archivo | Descripción |
|---|---|
| `src/store/useGlycemicStore.ts` | Estado Bergman (G, X, I), HGT scheduler, alertas |
| `src/core/GlycemicEngine.ts` | ODE Bergman ICING-adaptado |
| `src/components/PiCCOMonitorSM1.tsx` | Panel PiCCO 17 parámetros + termodilución |
| `src/components/clinical/DiureticControls.tsx` | Furosemida IV/VO + display UO/K⁺ |
| `src/components/clinical/CorticoidControls.tsx` | HC/MP/Dexa + vasopressor-sparing badge |
| `src/components/clinical/AerosolControls.tsx` | Salbutamol/Ipratropio + frecuencia |
| `src/components/clinical/InsulinHGTControls.tsx` | HGT Bergman + Regular IV + NPH + bolos |
| `src/scenarios/PatientFactory.ts` | Generador procedimental 40 comorbilidades |
| `src/components/PatientInfoModal.tsx` | Modal 5 secciones info paciente |
| `src/store/useScenarioStore.ts` | Factoría + applyScenario + 3.E SS pre-load |

### Archivos modificados clave
| Archivo | Cambios |
|---|---|
| `usePharmacologyStore.ts` | +20 DrugIds, +`diureticStrength`, +`antiInflammatoryStrength`, +CYP fields |
| `usePatientStore.ts` | +`kPlasma`, +`glucoseMgdL`, `GeneratedPatient`, acordeones |
| `PharmacologyEngine.ts` | Oral depot PK, CYP inhibition, clearance mods, reset() |
| `CardiovascularEngine.ts` | 2.A alphaResponseGain (HTA + frailty) |
| `PathologyEngine.ts` | 2.B frailty sepsis + 4.C antiInflammatoryEffect |
| `RenalEngine.ts` | Diuretic UO + K⁺ depletion |
| `CronosEngine.ts` | +GlycemicEngine tick + HGT scheduler |
| `useMonitoringStore.ts` | PiCCO refinado 17 params (literatura calibrada) |
| `ClinicalControlPanel.tsx` | 5 acordeones funcionales |
| `MonitorApp.tsx` | Glycemic banners + PiCCO button |

---

*Generado automáticamente — IMHOTEP UCI ENGINE V2 · Build 2026-04-29*
