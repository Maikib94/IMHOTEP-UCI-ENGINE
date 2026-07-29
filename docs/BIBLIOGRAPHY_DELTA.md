# BIBLIOGRAPHY_DELTA.md
# IMHOTEP UCI — Delta bibliográfico tras investigación profunda
# Generado: 2026-04-28 | Fuentes: Consensus Pro Q1 priority + literatura pivotal
# ═══════════════════════════════════════════════════════════════════════════════
# Este archivo COMPLEMENTA docs/BIBLIOGRAPHY.md con coeficientes afinados,
# nuevos estudios y umbrales validados durante la fase de investigación profunda.
# Cada entrada lleva: [Tópico] · [Coeficiente/Umbral] · [Cita] · [Archivo donde se aplica]
# ═══════════════════════════════════════════════════════════════════════════════

## SECCIÓN 1 — FRAGILIDAD Y RESERVA FISIOLÓGICA (HÍBRIDO CFS)

### 1.1  CFS — coeficientes troncales del simulador

| Hallazgo | Coeficiente | Cita | Aplica en |
|---|---|---|---|
| HR mortalidad por punto CFS (>65a) | **1.34 (1.25-1.44)** | Bruno RR et al., *Ann Intensive Care* 2023;13:37. DOI: 10.1186/s13613-023-01132-x | PrognosisEngine, PatientFactory.frailtyContinuous → CFS map |
| HR mortalidad 6m frágiles (CFS≥5) vs no frágiles | **2.9 (1.7-4.9)** | Wozniak H et al., *Ann Intensive Care* 2024;14:1. DOI: 10.1186/s13613-023-01199-6 | PrognosisEngine.longTermMortalityRisk |
| HR mortalidad por punto CFS unadj | 1.23 (1.13-1.34) | Hewitt D et al., *J Intensive Care Soc* 2021. DOI: 10.1177/17511437211037536 | Calibración secundaria |
| AUC 30d mortality CFS solo | 0.81 (0.77-0.85) | Kaeppeli T et al., *Ann Emerg Med* 2020;76(3):291-300. DOI: 10.1016/j.annemergmed.2020.03.028 | Validación de PrognosisEngine output |
| Modelo no-lineal supera lineal | k=0.6, x0=5.5 (logístico) | Fronczek J et al., *Crit Care* 2021;25:231. DOI: 10.1186/s13054-021-03622-5 | useScenarioStore.difficulty mapping |
| Frailty + VM: aHR cesación VM | 0.57 (0.51-0.64) | Okahara S et al., *Ann Am Thorac Soc* 2022;19(2):264-271. DOI: 10.1513/AnnalsATS.202102-178OC | RespiratoryEngine.weaningProbability |

**Calibración del mapa frailtyContinuous (0..1) → CFS (1..9)**:
```
const CFS_BREAKPOINTS = [0.00, 0.05, 0.10, 0.18, 0.30, 0.42, 0.55, 0.70, 0.85];
//                        1     2     3     4     5     6     7     8     9
```
Validado contra Bruno 2023 (n=23 989): un paciente típico 75a con HTA + DM + EPOC GOLD II → frailtyContinuous ≈ 0.45 → CFS = 6 (esperado clínicamente).

### 1.2  Modificación dosis-respuesta vasopresor por edad

| Hallazgo | Coeficiente | Cita | Aplica en |
|---|---|---|---|
| ↓ vasoconstricción α1 en >60a | **30-50%** | Dinenno FA et al., *Circulation* 2002;106:1349-54. DOI: 10.1161/01.CIR.0000028819.64790.BE | CardiovascularEngine.alphaResponseGain |
| Down-regulation β-receptor con edad | ~30-40% | Scarpace PJ, *Drugs Aging* 1991;1(2):116-29 | CardiovascularEngine.beta1Sensitivity |
| Disfunción endotelial envejecimiento | ↓ NO, ↑ ROS | Ungvari Z et al., *Circ Res* 2018;123(7):849-67. DOI: 10.1161/CIRCRESAHA.118.311378 | Modificador NO-mediado en MAP |
| MAP target 60-65 vs estándar (≥65a) | mortalidad 90d 41.0% vs 43.8% NS | Lamontagne F et al., *JAMA* 2020;323:938-49. DOI: 10.1001/jama.2020.0930 | Justificación de targets ajustados por edad |

**Coeficiente operativo IMHOTEP** (implementado en CardiovascularEngine.ts):
```typescript
const agePenalty = Math.min(0.25, 0.005 * Math.max(0, age - 50));
const alphaResponseGain = Math.max(0.20,
  1.0
  - (htaCronica ? 0.25 : 0)   // HTA crónica: rigidez + downreg
  - (stentsCor  ? 0.10 : 0)
  - agePenalty,               // -0.5%/año >50a, cap 25%
);
```

### 1.3  Comorbilidades y multiplicidad — coeficientes Charlson

| Hallazgo | Coeficiente | Cita | Aplica en |
|---|---|---|---|
| HR mortalidad por punto CCI | **1.15-1.30** | Olsson T et al., *Eur J Emerg Med* 2005;12:220-4 | Triangulación con Bruno 2023 |
| OR mortalidad CCI≥5 vs 0 | **4.7** | Hayden SR et al., *Acad Emerg Med* 2006;13(5):530-6. DOI: 10.1197/j.aem.2005.10.014 | Cap de mortalidad acumulada |
| DM2+EPOC HR mortalidad respiratoria | **3.03 (2.89-3.18)** | Raslan AS et al., *Int J COPD* 2023;18:1207-18. DOI: 10.2147/COPD.S407085 | PathologyEngine multiplicador resp |
| HF+CKD mortalidad 5a | 51.6% vs 17.9% otros pares | Lawson CA et al., *Lancet Reg Health Eur* 2023;33:100711 | Coeficiente cardio-renal |
| EPOC GOLD 3-4 OR ECV | 2.4 (1.9-3.0) | Mannino DM et al., *Eur Respir J* 2008;32(4):962-9 | Modifier acoplamiento cv-resp |

**Modelo multiplicativo IMHOTEP** (techo ~5-6 OR combinado):
```
log(OR_total) = Σ log(OR_i) + Σ_{cardio-renal pairs} 0.3
clamp OR_total ≤ 6.0
```

---

## SECCIÓN 2 — POLIFARMACIA: PK ORAL E INTERACCIONES CYP/P-gp

### 2.1  Antihipertensivos orales — F% y t½ (críticos vs sanos)

| Fármaco | F% sano | t½ | Eliminación | Cita primaria |
|---|---|---|---|---|
| **Enalapril → enalaprilat** | 60% | 11h activa, 30-38h terminal | Renal (40%) | MacFadyen RJ et al., *Clin Pharmacokinet* 1993;25(4):274-82 |
| **Losartán** | 33% | 1.5-2.5h (EXP3174 6-9h) | Hepático CYP2C9/3A4 | Lo MW et al., *Clin Pharmacol Ther* 1995;58(6):641-9 |
| **Amlodipino** | 64-90% | 30-50h | Hepático CYP3A4 | Meredith PA, Elliott HL, *Clin Pharmacokinet* 1992;22(1):22-31 |
| **Atenolol** | 50-60% | 6-7h sano, **36-42h TFG<10** | Renal puro | Mason WD et al., *Clin Pharmacol Ther* 1979;25(4):408-15 |
| **Carvedilol** | 25-35% | 7-10h | Hepático CYP2D6/2C9 | Morgan T, *Clin Pharmacokinet* 1994;26(5):335-46 |

**Factor de corrección crítico**:
```
F_ICU = 0.5 × F_sano      // Heyland 1996, Adam 2023
Tmax_ICU = 2-3 × Tmax_sano
```
Implementado vía `absorpMultiplier × √absorpMultiplier` en PharmacologyEngine (kaEff + F_eff):
- Cita: Heyland DK et al., *Intensive Care Med* 1996;22(12):1339-44 (paracetamol Cmax↓55%, Tmax×3)
- Cita: Adam M et al., *Pharmaceutics* 2023;15(11):2598. DOI: 10.3390/pharmaceutics15112598 (esomeprazol shock cardiogénico Cmax/AUC↓50%×7d)

### 2.2  Antiarrítmicos orales — Amiodarona y Digoxina

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| Amiodarona F oral | **0.36-0.50** (mediana 0.40) | Lehnert A et al., *Br J Clin Pharmacol* 2022;88(1):271-83. DOI: 10.1111/bcp.14958 |
| Amiodarona t½ terminal | **34 días (parent), 14.5 días (DEA)** | Lehnert 2022 (n=55 pediátricos, allometric scaling 70 kg) |
| Amiodarona Vd | 167 L (central), 3 930 L (periférico) | Lehnert 2022 (modelo 2-compartimentos) |
| Amiodarona carga oral | 800-1 600 mg/d × 1-3 sem | Connolly SJ, *Circulation* 1999;100(19):2025-34. DOI: 10.1161/01.CIR.100.19.2025 |
| **Amiodarona ↑ digoxina AUC** | **+79%** (PBPK validado) | **Chen Y et al., *Pharmacotherapy* 2025;45(2). DOI: 10.1002/phar.4642** |
| Reducción dosis digoxina co-amiodarona | **−40%** | Chen 2025 (recomendación PBPK) |
| Digoxina F | 70-80% (tab); ~90% (cápsula líq) | Smith TW, *J Am Coll Cardiol* 1985;5(5 Suppl A):43A-50A |
| Digoxina t½ | **36-48h** (normal); ~5 días anéfricos | Smith 1985 |
| **Digoxina ventana óptima HF** | **0.5-0.9 ng/mL** (no clásica 0.5-2.0) | Ahmed A et al., *Eur Heart J* 2006;27(2):178-86. DOI: 10.1093/eurheartj/ehi687 |
| Digoxina SDC ≥1.2 → ↑mortalidad | HR aumentado | Rathore SS et al., *JAMA* 2003;289(7):871-8. DOI: 10.1001/jama.289.7.871 |
| Amiodarona-digoxina interaction history | Conocido desde 1984 | Nademanee K et al., *J Am Coll Cardiol* 1984;4(1):111-6. DOI: 10.1016/S0735-1097(84)80367-8 |

**Calibración motor IMHOTEP** — inhibitionStrength P-gp = 0.70 produce:
```typescript
// inhibStr = cpRatio × 0.70 → at cpRatio=1.0: tHalfBoost = 1/(1-0.6×0.70) = 1.724 → AUC +72%
// (vs Chen 2025: +79%; discrepancia ±7% aceptable para simulador discreto)
// inhibitionStrength ajustado a 0.70 en amiodarone_oral y amiodarone IV
```

### 2.3  Tabla maestra de interacciones CYP/P-gp/OATP

| Perpetrador | CYP3A4 | CYP2D6 | CYP2C9 | P-gp | OATP1B1 | OATP2 | Cita primaria |
|---|---|---|---|---|---|---|---|
| **Amiodarona** | inh moderado (0.30) | inh débil | inh potente (0.65) | inh potente (0.70) | — | inh (0.55) | Lesko LJ, *Clin Pharmacokinet* 1989;17(2):130-40 |
| Diltiazem | inh moderado (0.25) | — | — | inh débil | — | — | — |
| Verapamilo | inh moderado | — | — | inh moderado | — | — | — |
| Rifampicina | inductor potente | — | inductor | inductor | — | — | — |
| Fluconazol | inh moderado | — | inh potente | — | — | — | — |
| Eritromicina/Claritromicina | inh potente | — | — | inh moderado | — | — | — |

**Validación cuantitativa adicional** (Chen 2025 PBPK):
- Amiodarona + rivaroxabán: AUC × 1.38 (recomendar ↓25% dosis rivaroxabán)
- Amiodarona + fenitoína: AUC × 1.59 (recomendar ↓45% dosis fenitoína)

**Nota implementación**: el motor actual usa `inhibitionStrength` como escalar único por droga.
El valor 0.70 es la calibración óptima para el pathway más relevante (P-gp para digoxina).
Para medicamentos sustrato de CYP3A4 o CYP2C9, el efecto será ligeramente distinto.
Arquitectura multi-pathway per-pathway queda para versión 3.0.

### 2.4  Absorción GI alterada en shock — coeficientes

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| Vaciamiento gástrico ralentizado en críticos | **Cmax↓55%, Tmax×3** | Heyland DK 1996 |
| Esomeprazol shock cardiogénico | **Cmax/AUC ↓50% × 7d** | Adam M 2023 |
| CYP3A4 reducción correlaciona PCR | r=−0.53, p=0.002 | Adam 2023 |
| IFABP↑ con NE >0.3 µg/kg/min | mortalidad 28d aumentada | Piton G et al., *Shock* 2015;43(5):437-42. DOI: 10.1097/SHK.0000000000000327 |
| HBPM SC con vasopresores | bioavailabilidad errática | Dörffler-Melly J et al., *Lancet* 2002;359(9309):849-50 |
| Ralentización oral GLP1RA | Cmax↓ y Tmax↑ pero AUC sin cambio clínico | Calvarysky B et al., *Drug Saf* 2024;47(5):439-51. DOI: 10.1007/s40264-024-01402-y |

**Implementación IMHOTEP** (PharmacologyEngine.ts):
```typescript
// ka_eff = ka × √absorpMultiplier   → Tmax elongation (Heyland 1996)
// bioFlux = absFlux × F × √absorpMultiplier → F_eff reduction (Adam 2023)
// Combined: net plasma_input ∝ absorpMultiplier (same total at SS, slower peak)
const sqrtAbsorp = Math.sqrt(absorpMultiplier);
const kaEff = ka * sqrtAbsorp;
const absFlux = this.depotConc[dId] * kaEff * dtMin;
const bioFlux = absFlux * F * sqrtAbsorp;
```

---
---

## SECCIÓN 3 — DIURÉTICOS, CORTICOIDES Y AEROSOLES — COEFICIENTES AFINADOS

### 3.1  Furosemida — curva dosis-respuesta sigmoidal

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| EC50 naïve | ~30 mg | Felker GM et al., *J Am Coll Cardiol* 2020;75(10):1178-95. DOI: 10.1016/j.jacc.2019.12.059 |
| EC50 diuretic-tolerant | 80-120 mg | Felker 2020 |
| Emax (techo) | ~200-250 mEq Na/dosis | Felker 2020 |
| **DOSE alta vs baja: pérdida líquido 72h** | **+1 324 mL** (4 899 vs 3 575) | Felker GM et al., *N Engl J Med* 2011;364(9):797-805. DOI: 10.1056/NEJMoa1005419 |
| DOSE alta vs baja: peso | −3.95 vs −2.77 kg (p=0.011) | Felker 2011 |
| Bolo c/12h ≈ infusión continua | igual eficacia | Felker 2011 |
| Resistencia diurética definición | UO<100 mL/h en 6h o Na urinario<50 mmol/L | Mullens W et al., *Eur J Heart Fail* 2019;21(2):137-55. DOI: 10.1002/ejhf.1369 |
| Furosemida ↓ volumen plasmático 30 min | ~13% (vía venodilatación PG) | Ter Maaten JM et al., *Nat Rev Cardiol* 2015;12(3):184-92 |

### 3.2  Hidrocortisona en shock séptico

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| **Dosis óptima meta-analítica** | **~260 mg/d** (RR mort 0.90, 0.83-0.98) | Pitre T et al., *Crit Care Explor* 2024;6(1):e1018. DOI: 10.1097/CCE.0000000000001018 |
| ADRENAL: mortalidad 90d | 27.9% vs 28.8% (NS) | Venkatesh B et al., *N Engl J Med* 2018;378(9):797-808. DOI: 10.1056/NEJMoa1705835 |
| ADRENAL: tiempo a resolución shock | mediana 3 vs 4d (HR 1.32) | Venkatesh 2018 |
| **APROCCHSS: mortalidad 90d** | **43.0% vs 49.1% (RR 0.88, NNT 16)** | Annane D et al., *N Engl J Med* 2018;378(9):809-18. DOI: 10.1056/NEJMoa1705716 |
| Reducción mortalidad corta plazo | RR 0.93 (0.88-0.99) | Pitre 2024 (meta-análisis 45 RCTs, n=9 563) |
| Aumento shock reversal 7d | RR 1.24 (1.11-1.38) | Pitre 2024 |
| **Riesgo hiperglicemia esteroidea** | **RR 1.21 (1.11-1.31)** | Chaudhuri D et al., *Crit Care Explor* 2024;6(2):e1071. DOI: 10.1097/CCE.0000000000001071 |
| Riesgo hipernatremia | RR 1.59 (1.29-1.96) | Chaudhuri 2024 |
| Riesgo neuromuscular weakness | RR 1.21 (1.01-1.45) low certainty | Chaudhuri 2024 |

### 3.3  Metilprednisolona en SDRA

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| Dosis Meduri | 1 mg/kg/d × 14d, tapering | Meduri GU et al., *Chest* 2007;131(4):954-63. DOI: 10.1378/chest.06-2100 |
| Mortalidad UCI Meduri | 20.6% vs 42.9% (p=0.03) | Meduri 2007 |
| Meta-análisis MP en SDRA | **NNT 7**, RR 0.76 (0.59-0.98) | Meduri GU/Siemieniuk RAC, *J Intensive Care* 2018;6:53. DOI: 10.1186/s40560-018-0321-9 |
| MP ventilator-free days | +5.7 días | Meduri 2018 |

### 3.4  Dexametasona — RECOVERY vs DEXA-ARDS

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| **RECOVERY: dexa 6 mg × 10d global** | RR mortalidad 0.83 (0.75-0.93) | Horby P et al., *N Engl J Med* 2021;384(8):693-704. DOI: 10.1056/NEJMoa2021436 |
| **RECOVERY: subgrupo VM** | **RR 0.64 (0.51-0.81), NNT 8** | Horby 2021 |
| RECOVERY: O₂ no-invasivo | RR 0.82 (0.72-0.94) | Horby 2021 |
| **RECOVERY: sin O₂ (TENDENCIA DAÑO)** | RR 1.19 (0.92-1.55) | Horby 2021 |
| **DEXA-ARDS: 20→10 mg en SDRA mod-severo** | **VFD +4.8d**, mortalidad 60d 21% vs 36% (NNT 7) | Villar J et al., *Lancet Respir Med* 2020;8(3):267-76. DOI: 10.1016/S2213-2600(19)30417-5 |

**Marcador de incertidumbre IMHOTEP**: distinguir COVID-ARDS (6mg RECOVERY) vs SDRA no-COVID (20→10mg DEXA-ARDS).

### 3.5  Hiperglicemia inducida por corticoides — potencia glucémica específica

Datos Limbachia Clin Ther 2023 (n=964):

| Comparación | Δ glicemia | Multiplicador glucémico implementado |
|---|---|---|
| **Dexa vs HC** | **+16.6 mg/dL (8.1-24.8)** | DEX_GLUCOSE_MULT = 1.25 |
| **MP vs HC** | **+23.9 mg/dL (11.3-36.4)** | MP_GLUCOSE_MULT = 1.50 |
| Dexa vs Pred | +20.0 mg/dL (14.2-25.7) | — |
| MP vs Pred | +27.4 mg/dL (16.4-38.3) | — |

Implementado en GlycemicEngine.ts: cada droga tiene `GLUCOSE_MULT` individual:
```typescript
corticoidDrive =
  HC  × 24 × 0.25 × PRED_DRIVE_COEFF × 1.00 +  // HC baseline
  MP  × 24 × 1.25 × PRED_DRIVE_COEFF × 1.50 +  // MP: +50% vs HC per pred-equiv
  DEX × 24 × 6.70 × PRED_DRIVE_COEFF × 1.25 +  // Dexa: +25% vs HC per pred-equiv
  PRED × 24 × 1.0 × PRED_DRIVE_COEFF × 1.00;
```

**Regla operativa**: cada 10 mg pred-eq → +0.1 U/kg/d insulina basal; cap ~0.4 U/kg/d.
Cita: Aberer F et al., *J Clin Med* 2021;10(10):2154. DOI: 10.3390/jcm10102154

### 3.6  Salbutamol e Ipratropio — broncodilatadores

| Hallazgo | Coeficiente | Cita |
|---|---|---|
| Salbutamol 2.5 mg neb → ↓Raw | 30-50% | Mouloudi E et al., *Am J Respir Crit Care Med* 1999;159(4):1175-80. DOI: 10.1164/ajrccm.159.4.9710081 |
| Salbutamol → ΔFC | +8-15 bpm (2.5 mg); +15-25 (5 mg) | Mouloudi 1999 |
| **Salbutamol 10-20 mg → ΔK⁺** | **−0.6 a −1.0 mEq/L en 60 min** | Mahoney BA et al., Cochrane DSR 2005. DOI: 10.1002/14651858.CD003235.pub2 |
| **Combo salbutamol+ipratropio asma → PEF** | **+77% vs +31% (solo salbutamol)** | O'Driscoll BR et al., *Lancet* 1989;1(8652):1418-20 |

**Implementación K⁺ shift en RenalEngine.ts** (calibrado desde Mahoney 2005):
```typescript
// β2 stimulation → Na⁺/K⁺-ATPase → K⁺ intracellular shift
// 2.5mg neb (cpRatio≈0.5, beta2Effect≈0.75) → -0.20 mEq/L en 60 min
// → K_SHIFT_BETA2 = 5.6e-5 mEq/L/sim-sec per unit beta2
const kShiftRate = beta2Effect * 5.6e-5;
```

---

## SECCIÓN 4 — GLUCEMIA: BERGMAN ICING-ADAPTADO

### 4.1  Targets glucémicos — evidencia 2024

| Hallazgo | Target | Cita |
|---|---|---|
| **NICE-SUGAR: control intensivo dañino** | **mortalidad 90d 27.5% vs 24.9% (OR 1.14)** | Finfer S et al., *N Engl J Med* 2009;360(13):1283-97. DOI: 10.1056/NEJMoa0810625 |
| **TGC-Fast: tight no superior** | sin diferencia outcomes | Gunst J et al., *N Engl J Med* 2023;389(13):1180-90. DOI: 10.1056/NEJMoa2304855 |
| SSC 2021 / 2024 estándar | **Insulina si BG≥180; objetivo 144-180** | Evans L et al., *Crit Care Med* 2021;49(11):e1063-143 |
| Hipoglucemia <40 → mortalidad | OR 2.10 (1.59-2.77) | Finfer S et al., *N Engl J Med* 2012;367(12):1108-18 |

### 4.2  Modelo ICING — parámetros calibrados (Lin 2011)

**Cita primaria**: Lin J et al., *Comput Methods Programs Biomed* 2011;102(2):192-205. DOI: 10.1016/j.cmpb.2010.12.008  
**Validación**: 173 pacientes, 42 941h datos, error 1h-ahead 2.80% [IQR 1.18-6.41].

| Parámetro | Valor Lin 2011 | Implementado IMHOTEP | Unidad |
|---|---|---|---|
| **pG (glucose effectiveness)** | **0.006** | **P1 = 0.006** | min⁻¹ |
| EGPb basal | 1.16 | EGP_base 0.5 mg/dL/min | mmol/min |
| nK (renal insulin CL) | 0.0542 | N ≈ 0.15 (combinado) | min⁻¹ |
| nL (hepatic insulin CL) | 0.1578 | — | min⁻¹ |
| **S_I críticos (mediana)** | **1.5 × 10⁻⁴** | **SI = 1.5e-4** | L/mU/min |
| S_I sano | ~5 × 10⁻⁴ | (reducido por siMod) | L/mU/min |

Sano vs crítico: S_I 5-10× menor (alta variabilidad horaria). Cita: Lin J 2008 DOI: 10.1016/j.cmpb.2007.04.006.

### 4.3  Hiperglicemia de estrés — drives cuantitativos

| Mecanismo | Coeficiente | Cita |
|---|---|---|
| EGP basal críticos | **1.16-2.5 mmol/min** (vs 0.8-1.0 sano) | Lin 2011 (ICING) |
| Epinefrina 0.05 µg/kg/min → ΔBG | +30-60 mg/dL en 30 min | Marik PE, Bellomo R, *Crit Care* 2013;17(2):305 |
| Norepinefrina 0.1 µg/kg/min → ΔBG | +10-25 mg/dL | Marik 2013 |
| **Hiperglicemia neta UCI 48h** | **+30-80 mg/dL** sobre basal en 50% | Marik 2013, Dungan KM *Lancet* 2009 |

### 4.4  PK insulinas — parámetros clave

| Insulina | Onset | Pico | Duración | CV% | Implementado |
|---|---|---|---|---|---|
| **NPH** | 1-2h | **4-10h (mediana ~4.5h)** | 12-18h | 40-50% | absorptionRateHr=0.3 |
| Regular IV | 0.08h | 15 min | — | 15% | halfLifeMin=5 |
| Glargina | 1.5-2h | sin pico | 22-24h | 15% | halfLifeMin=1440 |

Cita: Lepore M et al., *Diabetes* 2000;49(12):2142-8.

---
---

## SECCIÓN 5 — PiCCO SM1 — RANGOS Y FÓRMULAS DEFINITIVAS

### 5.1  Tabla maestra de parámetros

| Parámetro | Normal | Cutoff patológico | Cita |
|---|---|---|---|
| **CI** | 3.0-5.0 L·min⁻¹·m⁻² | <2.2 shock cardiogénico | Cecconi M et al., *Intensive Care Med* 2014;40(12):1795-815 |
| **GEDI/GEDVI** | **680-800 mL·m⁻²** | <680 hipovolemia, >800 sobrecarga | Michard F et al., *Chest* 2003;124(5):1900-8. DOI: 10.1378/chest.124.5.1900 |
| **EVLWI** | **3-7 mL·kg⁻¹ PBW** | **≥10 ARDS, >21 mortalidad d28** | Kushimoto S et al., *Crit Care* 2012;16(6):R232. DOI: 10.1186/cc11898 |
| EVLWI prognóstico SDRA | ↑ d0-d2 = mortalidad | Tagami T et al., *Ann Intensive Care* 2014;4:27. DOI: 10.1186/s13613-014-0027-7 |
| **PVPI** | 1.0-3.0 | **>3 ARDS permeabilidad** | Monnet X et al., *Intensive Care Med* 2007;33(3):448-53. DOI: 10.1007/s00134-006-0498-6 |
| **SVV/PPV** | <10% | **>12-13% preload-responsive** | Marik PE et al., *Crit Care Med* 2009;37(9):2642-7. DOI: 10.1097/CCM.0b013e3181a590da |
| Zona gris PPV | 9-13% (incertidumbre 25%) | Cannesson M et al., *Anesthesiology* 2011;115(2):231-41 |
| **GEF** | 25-35% | <20% disfunción VI severa | Combes A et al., *Intensive Care Med* 2004;30(7):1377-83 |
| **CFI** | 4.5-6.5 min⁻¹ | **<3.47 LVEF≤35%** (sens 81%, esp 85%) | Jabot J et al., *Crit Care Med* 2009;37(11):2913-8 |
| **dPmx** | 1200-2000 mmHg/s | <1200 contractilidad deprimida | De Hert SG et al., *J Cardiothorac Vasc Anesth* 2006;20(3):325-30 |
| **CPI** | 0.5-0.7 W·m⁻² | **<0.4 shock cardiogénico** (predictor mortalidad #1) | Fincke R et al., *J Am Coll Cardiol* 2004;44(2):340-8. DOI: 10.1016/j.jacc.2004.03.060 |
| **ScvO₂** | 70-75% | <65 hipoperfusión, >80 anómalo (mitoc.) | Rivers E et al., *N Engl J Med* 2001;345(19):1368-77 |
| **DO₂I** | 500-650 mL·min⁻¹·m⁻² | **<300 hipoxia tisular dependiente** | Vincent JL, De Backer D, *N Engl J Med* 2013;369(18):1726-34 |
| **VO₂I** | 110-160 mL·min⁻¹·m⁻² | <80 metabolismo anaerobio | Vincent 2013 |

**Cambios aplicados a RANGES en PiCCOMonitorSM1.tsx:**

| Parámetro | Antes | Después | Motivo |
|---|---|---|---|
| CI loHi | 4.5 | **5.0** | Cecconi 2014 normal 3-5 |
| EVLW hi | 14 | **21** | Kushimoto 2012 mortalidad d28 |
| CFI hiLo | 4.5 | **3.47** | Jabot 2009 cutoff diagnóstico |
| dPmx hiLo | 900 | **1200** | De Hert 2006 límite normal inferior |
| DO2I lo/hiLo | 300/520 | **200/300** | Vincent 2013 hipoxia tisular |
| VO2I lo/hiLo | 70/110 | **60/80** | Vincent 2013 anaerobiosis |

### 5.2  Acidemia y función cardíaca — Rodríguez-Villar 2021

**Estudio multicentro** n=297, 6 UCIs Londres (*EClinicalMedicine* 2021;36:100942. DOI: 10.1016/j.eclinm.2021.100942):

| Variable | pH≤7.28 vs >7.28 | Implementación IMHOTEP |
|---|---|---|
| dPmx | Δ −331 mmHg/s | `acidPen = (7.28-pH)×1800` → a pH=7.10: −324 ≈ −331 ✓ |
| CI | sin diferencia (regresión R=1.96) | CI NO penalizado directamente |
| CPI | Δ −0.09 W/m² | CPI = MAP×CO/(BSA×451) → se reduce via MAP y CO |
| GEF | Δ +18% (aparentemente compensatorio) | No penalizado (compensación evidenciada) |
| SVI | Δ +32.7 mL/m² (vs acidosis, normal > acidosis) | SV modelado en CardiovascularEngine |

**Patrón asimétrico IMHOTEP**: acidemia penaliza dPmx y CPI (contráctiles directos), pero CI permanece preservado por taquicardia compensatoria. Código confirmado como bien calibrado: `(7.28-pH)×1800` ≈ 331 mmHg/s por 0.18 unidades de pH.

---
*Complements: docs/BIBLIOGRAPHY.md · Applied to: CardiovascularEngine.ts, GlycemicEngine.ts, RenalEngine.ts, PharmacologyEngine.ts, usePharmacologyStore.ts, PiCCOMonitorSM1.tsx, useMonitoringStore.ts*
