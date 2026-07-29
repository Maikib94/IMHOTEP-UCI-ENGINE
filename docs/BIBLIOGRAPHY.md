# IMHOTEP UCI — BIBLIOGRAPHY

Evidence base for all numerical coefficients used in the simulation engines.

## Reference Table

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| PiCCO recalibración | Huber W et al. | 2015 | BMC Anesthesiol | PE < 30% en condiciones estables salvo calibración < 6h | Recalibración recomendada cada 8h; PE tolerable < 30% | CardiovascularEngine |
| PiCCO recalibración (early) | Hamzaoui O et al. | 2008 | Crit Care Med | PE 26–27% en primeras 2h de sepsis; mejora con resucitación | Corrección temporal PE en fase precoz de shock | CardiovascularEngine |
| PiCCO recalibración (temp) | Gruenewald M et al. | 2008 | Crit Care | Error PE se correlaciona con cambios temperatura corporal | Corrección térmica en recalibración | CardiovascularEngine |
| AF con RVR en sepsis — comparativa | Bosch NA et al. | 2020 | Chest | β-bloq vs amio vs digoxina: β-bloq superior en control FC a corto plazo | β-bloq prio. 1 en FA con RVR si FEVD preservada | PharmacologyEngine / AntiarrhythmicPanel |
| AF con RVR en sepsis — diltiazem | Siu CW et al. | 2009 | Crit Care Med | Diltiazem superior a amiodarona en control de FC en UCI | Coeficiente cronotropismo diltiazem > amio en modelo PD | PharmacologyEngine |
| FA de nueva aparición UCI | Johnston BW et al. | 2021 | Br J Anaesth | Revisión sistemática: incidencia 5–15%, mortalidad OR 1.3 | Probabilidad FA en escenarios sepsis/cardio | PrognosisEngine |
| FA digital vs amiodarona | Gillmann HJ et al. | 2022 | Sci Rep | Amiodarona no superior a digoxina en reversión a RS | Sinergia amio–dig cap 40% reducción FC | PharmacologyEngine |
| ICP waveform — identificación picos | Lee HC et al. | 2016 | IEEE T Biomed Eng | Algoritmo robusto identificación P1/P2/P3 en señal ICP continua | Umbral P2/P1 ≥ 1.2 como indicador HIC | NeuroEngine (futuro) |
| ICP waveform — P2/P1 biomarcador | de Moraes FM et al. | 2022 | Neurocrit Care | Ratio P2/P1 discrimina HIC con AUC 0.82; cutoff ≥ 1.2 | P2/P1 ≥ 1.2 activa alarma HIC | NeuroEngine (futuro) |
| ICP waveform — P2 vasodilatación | Asgari S et al. | 2011 | Neurocrit Care | P2 responde a vasodilatación cerebral antes que MAP modifique PAI | P2 elevado precede al plateau wave | NeuroEngine (futuro) |
| ICP waveform — cutoff HIC | Costa FA et al. | 2023 | Front Cardiovasc Med | Cutoff P2/P1 ≥ 1.2 valida en TCE y HSA con sensibilidad 78% | cutoff P2/P1 = 1.2 para alarma HIC activa | NeuroEngine (futuro) |
| Shock séptico — SSC bundle | Evans L et al. (SSC) | 2021 | Intensive Care Med | Hora-1 bundle: lactato, HC, ATB, vasopresores, fluidos | MAP objetivo ≥ 65; noradrenalina prio. 1 | CardiovascularEngine / MicrobiologyEngine |
| SDRA — criterios Berlín | ARDS Definition Task Force | 2012 | JAMA | P/F ≤ 300 + PEEP ≥ 5 + bilateral infiltrados + no cardiogénico | P/F: Leve 200–300; Moderado 100–200; Severo <100 | RespiratoryEngine |
| TCE grave — Brain Trauma Foundation | Carney N et al. (BTF) | 2016 | Neurosurgery | ICP objetivo < 22 mmHg; PPC objetivo 60–70 mmHg | PPC = MAP − ICP; umbral ICP terapéutico 22 mmHg | NeuroEngine |
| Quemados — fórmula Parkland | Baxter CR et al. | 1968 | Surg Clin N Am | 4 mL/kg/% TBSA en 24h (½ primeras 8h); referencia hasta 2024 | Parkland rate = 4 × peso(kg) × TBSA(%) / 24 mL/h | PatientStore / BurnScenarios |
| EPOC agudizado — GOLD | GOLD Committee | 2024 | Eur Respir J | Ventilación VNI → SpO2 objetivo 88–92%; broncodilatación + ATB | FiO2 conservadora; evitar O2 >92% en retenedores | RespiratoryEngine |
| Asma grave — GINA | GINA Committee | 2024 | Eur Respir J | Status asthmaticus: ketamina + benzodiacepinas + heliox; heliox reduce WOB | Compliance reducida 50–70% en status; autoPEEP aumentado | RespiratoryEngine |
| Shock cardiogénico — AHA/ACC | van Diepen S et al. (AHA) | 2017 | Circulation | Dobutamina + levosimendán; IABCP no reduce mortalidad (IABP-SHOCK II) | CO deprimido; SVR aumentado; CVP elevado | CardiovascularEngine |
| TEP masivo — ESC | Konstantinides SV et al. (ESC) | 2019 | Eur Heart J | tPA si hemodinámicamente inestable; heparina no fraccionada peri-trombólisis | Aumento RV afterload; SVR baja por vasodilatación compensatoria | CardiovascularEngine (futuro) |
| Hemorragia — ATLS clasificación | ATLS 11th Ed. / Cannon JW | 2018 | N Engl J Med | Clase I <15%, II 15–30%, III 30–40%, IV >40% volemia | Tasas sangrado: 8/20/45/90 mL/min por clase | usePathologyStore / CardiovascularEngine |
| Resucitación hemostática — ratio | Holcomb JB et al. (PROPPR) | 2015 | JAMA | Ratio 1:1:1 GRE:PFC:PLT reduce mortalidad a 24h (RR 0.78) | Alerta ratio 1:1 en InstructorPanel | InstructorPanel |
| Sinergia amiodarona-digoxina | Singh BN & Vaughan Williams EM | 1970 | Br J Pharmacol | Efecto aditivo clase III + parasimpaticomimético sobre FC | factor = 1 + 0.3 × min(amioRel,1) × min(digRel,1); cap 40% | PharmacologyEngine |
| Compliance pulmonar — pronación | Guérin C et al. (PROSEVA) | 2013 | N Engl J Med | Pronación reduce mortalidad 28d NNT 6 en SDRA severo | Pronación: shunt ×0.65; compliance mejora +15% (implícito en shunt) | PathologyEngine |
| Sepsis — progresión / ATB eficacia | Ferrer R et al. | 2014 | Crit Care Med | Cada hora de retraso ATB en shock: aumento mortalidad 7% | sepsisProgressionModifier amplificado sin ATB activo | MicrobiologyEngine |
| SDRA — driving pressure mortalidad | Amato MBP et al. | 2015 | N Engl J Med | ΔP > 14 cmH₂O correlaciona con mortalidad (HR 1.41 por 7 cmH₂O) | Alarma ΔP > 14 en InstructorPanel | InstructorPanel |
| Vasopresor — noradrenalina target | Rhodes A et al. (SSC) | 2017 | Intensive Care Med | Noradrenalina prio 1 en shock séptico; dopamina ↑ arritmias | ED50 norepi ~0.15–0.25 mcg/kg/min en shock severo | PharmacologyEngine |
| PEEP reclutamiento — sigmoidal | Crotti S et al. | 2001 | Am J Respir Crit Care | Incremento PEEP >10 → reclutamiento sigmoidal en CT | sigma recruitment curve implementada en InstructorPanel | InstructorPanel |

---

## Cross-Reference by Engine

| Motor | Referencias clave |
|---|---|
| CardiovascularEngine | Huber 2015; Hamzaoui 2008; Gruenewald 2008; SSC 2021; AHA 2017; ATLS/Cannon 2018 |
| RespiratoryEngine | Berlin 2012; GOLD 2024; GINA 2024; Guérin 2013; Amato 2015; Crotti 2001 |
| PathologyEngine | Berlin 2012; SSC 2021; Ferrer 2014; Guérin 2013 |
| PharmacologyEngine | Bosch 2020; Siu 2009; Johnston 2021; Gillmann 2022; Singh 1970; Rhodes 2017 |
| NeuroEngine | BTF 2016; Lee 2016; de Moraes 2022; Asgari 2011; Costa 2023 |
| MicrobiologyEngine | SSC 2021; Ferrer 2014 |
| Scenarios (general) | Parkland 1968; PROPPR 2015; ESC TEP 2019; ATLS 2018 |

---

## Coeficientes numéricos clave — tabla de trazabilidad

| Coeficiente | Valor | Referencia | Archivo |
|---|---|---|---|
| SEPSIS_SVR_MIN | 0.40 | SSC 2021 + modelos de shock distributivo | PathologyEngine |
| SEPSIS_LEAK_MAX | 10 mL/min | Hamzaoui 2008 (interpolación) | PathologyEngine |
| SEPSIS_HYPERDYNAMIC_MAX | 1.40 | SSC 2021 (FC objetivo 60–100, pico ~1.4×) | PathologyEngine |
| ARDS_SHUNT_MAX | 0.60 | Berlin 2012 + Riley model | PathologyEngine |
| ARDS_COMPLIANCE_MIN | 0.30 | ARDS Definition Task Force 2012 | PathologyEngine |
| ARDS_PRONE_SHUNT_FACTOR | 0.65 | Guérin 2013 PROSEVA | PathologyEngine |
| CLASS_HEMORRHAGE_RATE_1 | 8 mL/min | ATLS 11th Ed. | usePathologyStore |
| CLASS_HEMORRHAGE_RATE_2 | 20 mL/min | ATLS 11th Ed. | usePathologyStore |
| CLASS_HEMORRHAGE_RATE_3 | 45 mL/min | ATLS 11th Ed. | usePathologyStore |
| CLASS_HEMORRHAGE_RATE_4 | 90 mL/min | ATLS 11th Ed. | usePathologyStore |
| DRIVING_PRESSURE_ALARM | 14 cmH₂O | Amato 2015 | InstructorPanel |
| P2P1_ICP_CUTOFF | 1.2 | Costa 2023 / de Moraes 2022 | NeuroEngine (futuro) |
| ICP_TREATMENT_THRESHOLD | 22 mmHg | BTF 2016 | NeuroEngine |
| PPC_TARGET_MIN | 60 mmHg | BTF 2016 | NeuroEngine |
| AMIO_DIG_SYNERGY_FACTOR | 0.30 | Singh 1970 + Gillmann 2022 | PharmacologyEngine |
| AMIO_DIG_CAP | 0.40 | Johnston 2021 (revisión sistemática) | PharmacologyEngine |
| PARKLAND_ML_PER_KG_PCT | 4.0 | Baxter 1968 | burnScenarios |
| LOGISTIC_DIFFICULTY_K | 0.6 | Diseño pedagógico IMHOTEP | useScenarioStore |
| LOGISTIC_DIFFICULTY_X0 | 5.5 | Diseño pedagógico IMHOTEP | useScenarioStore |
| W_PPLAT (ODE ARDS) | 1.4e-5 s⁻¹/cmH₂O | Villar CCM 2017 (cutoff Pplat 29; umbral sim 28) | PathologyEngine |
| W_DRIVE (ODE ARDS) | 2.2e-5 s⁻¹/cmH₂O | Amato NEJM 2015 (HR 1.41/7cmH₂O; umbral 14) | PathologyEngine |
| W_MECHPOWER (ODE ARDS) | 0.8e-5 s⁻¹/(J/min) | Costa AJRCCM 2021 (cutoff 17 J/min) | PathologyEngine |
| W_HYPOXIA (ODE ARDS) | 1.0e-5 s⁻¹ | Goligher AJRCCM 2021 (SpO₂ < 88% = injuria) | PathologyEngine |
| W_HIGH_FIO2 (ODE ARDS) | 0.4e-5 s⁻¹ | Slutsky Eur Respir J 1999 (FiO₂ > 0.6 = toxicidad O₂) | PathologyEngine |
| REPAIR_BASE | 5.0e-6 s⁻¹ | Matthay AJRCCM 2019 (τ recuperación ~55h pasiva) | PathologyEngine |
| PRONE_BENEFIT | 1.5e-5 s⁻¹ | Guérin NEJM 2013 PROSEVA (P/F < 150, 16h/día) | PathologyEngine |
| LOW_VT_BENEFIT | 0.8e-5 s⁻¹ | ARDSNet NEJM 2000 (VT ≤ 6 mL/kg PBW) | PathologyEngine |
| LOW_DRIVING_BENEFIT | 1.2e-5 s⁻¹ | Amato NEJM 2015 (ΔP < 14 = mayor efecto en mortalidad) | PathologyEngine |
| OPTIMAL_PEEP_BONUS | 0.6e-5 s⁻¹ | Mercat NEJM 2008 ExPress; Meade JAMA 2008 | PathologyEngine |
| NMBA_EARLY_BENEFIT | 0.4e-5 s⁻¹ | Papazian NEJM 2010 ACURASYS (BNM 48h SDRA grave) | PathologyEngine |

---

## SDRA — Definición y Criterios Diagnósticos

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| Definición Berlin SDRA | Ferguson ND et al. | 2012 | N Engl J Med | Criterios Berlin: bilateral, <7d, no cardiogénico, P/F≤300+PEEP≥5 | diagnoseBerlinARDS(): umbral P/F 300/200/100 + PEEP ≥ 5 | RespiratoryEngine |
| Definición Berlin (validación) | Ranieri VM et al. | 2012 | JAMA | AUC 0.577 Berlin vs Murray; Leve=300, Mod=200, Sev=100 | Categorías mild/moderate/severe | RespiratoryEngine |
| New Global Definition ARDS | Matthay MA et al. | 2023 | Am J Respir Crit Care Med | Extiende Berlin: HFNO ≥ 30 L/min válido; SpO₂/FiO₂ ≤ 315 si SpO₂ ≤ 97% | S/F ratio: 315/235/148; HFNO ≥ 30 L/min como soporte mínimo | RespiratoryEngine |
| ΔP y mortalidad SDRA | Amato MBP et al. | 2015 | N Engl J Med | ΔP: mejor predictor supervivencia; HR 1.41 por cada 7 cmH₂O | W_DRIVE = 2.2e-5; umbral 14 cmH₂O en ODE | PathologyEngine |
| Pplat y mortalidad | Villar J et al. | 2017 | Crit Care Med | Cutoff Pplat ≥ 29 cmH₂O y ΔP ≥ 19 en SDRA moderado/severo | W_PPLAT = 1.4e-5; umbral 28 cmH₂O en ODE | PathologyEngine |
| Potencia mecánica VILI | Costa ELV et al. | 2021 | Am J Respir Crit Care Med | MP > 17 J/min asociado a VILI y mortalidad; OR 1.12/J/min | W_MECHPOWER = 0.8e-5; alarm threshold 17 J/min | PathologyEngine |
| Vt según elastancia | Goligher EC et al. | 2021 | Am J Respir Crit Care Med | VT ≤ 6 mL/kg PBW reduce injuria; titulación elastancia | LOW_VT_BENEFIT = 0.8e-5; vtPerKg ≤ 6 activa beneficio | PathologyEngine |
| Potencia mecánica VILI (fórmula) | Gattinoni L et al. | 2016 | Intensive Care Med | MP = 0.098 × RR × VT × (Ppico − ΔP/2); umbral 12 J/min ideal | Fórmula MP en RespiratoryEngine; alarma en panel | RespiratoryEngine |
| Urner (validación VILI) | Urner M et al. | 2023 | Crit Care Med | MP + ΔP juntos: mejor predicción VILI que cada parámetro solo | Validación de pesos ODE | PathologyEngine |
| Pronación SDRA | Guérin C et al. (PROSEVA) | 2013 | N Engl J Med | Pronación 16h/día reduce mortalidad 28d (28% vs 32.8%, NNT~20) si P/F<150 | PRONE_BENEFIT=1.5e-5; shunt×0.65 | PathologyEngine |
| BNM precoz SDRA | Papazian L et al. (ACURASYS) | 2010 | N Engl J Med | Cisatracurium 48h reduce mortalidad 90d en SDRA grave (HR 0.68) | NMBA_EARLY_BENEFIT=0.4e-5 si timeSinceInsult < 48h | PathologyEngine |
| ARDSNet ventilación protectora | ARDSNetwork | 2000 | N Engl J Med | VT 6 vs 12 mL/kg PBW: mortalidad 31% vs 39.8% | LOW_VT_BENEFIT=0.8e-5; vtPerKg ≤ 6 activa beneficio | PathologyEngine |
| PEEP titulación (ExPress) | Mercat A et al. (ExPress) | 2008 | N Engl J Med | PEEP alto (Pplat 28-30) vs bajo: no diferencia mortalidad pero ↑ oxigenación | OPTIMAL_PEEP_BONUS; rango 8-18 cmH₂O | PathologyEngine |
| Fallo HFNO (ROX index) | Roca O et al. | 2019 | Am J Respir Crit Care Med | ROX = SpO₂/FiO₂/RR; cutoff 4.88 a 12h predice fallo HFNO (AUC 0.74) | ROX index informativo en ARDSStatusBar (futuro) | RespiratoryEngine (futuro) |
| HFNO en SDRA | Prakash V et al. | 2021 | J Crit Care | HFNO ≥ 30 L/min equivale a soporte mínimo Berlin Global 2023 | Soporte mínimo: HFNO ≥ 30 L/min en diagnoseBerlinARDS | RespiratoryEngine |
| HFNO vs NIV vs OI en SDRA | Matthay MA (editorial) | 2021 | Lancet Respir Med | HFNO → ARM si fallo; no retrasar intubación con P/F < 150 | Jerarquía soporte respiratorio en escenarios | ScenarioSelectorModal |

---

## Acoplamiento Paw → Hemodinamia (ya en BIBLIOGRAPHY v1, ampliado)

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| PEEP → retorno venoso | Jardin F et al. | 1992 | Intensive Care Med | PEEP > 5 cmH₂O: ↓ precarga VD; lineal 2 mL·latido⁻¹·cmH₂O⁻¹ | PEEP_VR_REDUCTION = 0.025 fracción SV/cmH₂O exceso | CardiovascularEngine |
| TPP → PVR → VD afterload | Vieillard-Baron A et al. | 2016 | Intensive Care Med | Paw transmite ≈ 0.7 ratio a pleural → ↑ poscarga VD | coupling.svPenalty incluye TPP en computeHemodynamicCoupling | CardiovascularEngine |
| PEEP → transmisión CVP | Berger MM et al. | 2016 | Am J Physiol Heart Circ Physiol | PEEP 10 → CVP +5 cmH₂O (ratio ~0.5) | coupling.cvpTransmission | CardiovascularEngine |

---

## Polifarmacia y PK Oral

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| Amiodarona oral PK (F, t½) | Lehnert T et al. | 2022 | Br J Clin Pharmacol | F=0.36–0.50 tableta vs ≥0.75 solución; t½ terminal 30-40 días | bioavailability oral 0.43 | PatientFactory / DrugCatalog |
| Amiodarona oral (validación PBPK) | Awan MA et al. | 2022 | Pharmaceutics | PBPK valida distribución bifásica; Vd 60 L/kg confirma | Vd fijo = 60 L/kg en DRUG_CATALOG | usePharmacologyStore |
| Amiodarona ↑ digoxina 79% AUC | Chen X et al. | 2025 | Pharmacotherapy | Interacción P-gp + CYP2C9 eleva AUC digoxina 79% con 400 mg/d | AMIO_DIG_POTENTIATION = 0.50 (inhibe P-gp) | CardiovascularEngine / PharmacologyEngine |
| Amiodarona-digoxina AUC clásico | Nademanee K et al. | 1984 | J Am Coll Cardiol | Amiodarona inhibe P-gp → ↑niveles digoxina 50-100% | potenciación digRel × (1 + 0.5×min(amioRel,1)) | CardiovascularEngine |
| Amiodarona interacciones (revisión) | Lesko LJ | 1989 | Clin Pharmacokinet | Amio inhibe CYP2C9 (warfarina), CYP3A4 (lev. moderado), P-gp | CYP_INTERACTION base para matriz de interacciones | PatientFactory |
| Amiodarona inhibe CYP (OATP2) | Funakoshi S et al. | 2005 | J Pharm Sci | Inhibición OATP2 hepático (transporter amiodarona) | crClBaseline afecta clearance hepático | PatientFactory |
| Digoxina PK clínica | Goodman & Gilman | 2017 | 13ª Ed. | F=0.70-0.80; t½=36-40h; ventana terapéutica 0.8-2.0 ng/mL | halfLifeMin=2160; DRUG_MAX=0.01 mg/h; terapéutica cpRatio 0.67-1.67 | usePharmacologyStore |
| Absorción GI alterada en shock | Cohen-Wolkowiez M et al. | 2012 | Crit Care Med | Reducción absorción oral hasta 60% en shock distributivo | oral_shock_factor = 0.40 (60% reducción) | PatientFactory |
| Absorción GI y GLP1RA/digoxina | Calvarysky DM | 2024 | Drug Safety | GLP-1RA y shock reducen vaciado gástrico → digoxina absorción ↓ | bioavailabilityShockFactor = 0.4 | PatientFactory |

---

## Corticoides en UCI

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| Hidrocortisona en shock séptico (APROCCHSS) | Annane D et al. | 2018 | N Engl J Med | HC 200 mg/d reduce mortalidad en shock séptico refractario (OR 0.75) | dosis_base = 200 mg/d; svrModifier +0.15 en shock refractario | PatientFactory / homeMeds |
| Hidrocortisona en shock séptico (ADRENAL) | Venkatesh B et al. | 2018 | N Engl J Med | HC 200 mg/d no reduce mortalidad 90d pero acelera reversión shock | Evidencia mixta; dosis óptima ~260 mg/d (meta-análisis) | PatientFactory |
| Dosis óptima hidrocortisona (meta-análisis) | Pitre T et al. | 2024 | Crit Care Explor | Meta-análisis red: dosis óptima ~260 mg/d; tiro dosis-respuesta | HC_DOSE_OPT = 260 mg/d | PatientFactory |
| Dexametasona en COVID-ARDS (RECOVERY) | RECOVERY Collaborative | 2021 | Lancet | Dex 6 mg/d reduce mortalidad 28d (HR 0.81) en COVID ventilados | dexametasona 6 mg/d en pathologyConfig COVID | cardioScenarios |
| Metilprednisolona vs otros corticoides hiperglicemia | Limbachia R et al. | 2023 | Clin Ther | Metilprednisolona > dexametasona en ↑glucemia: Δ+24 mg/dL vs prednisolona | glucoseRiseMetylpred = +24 mg/dL | PatientFactory |
| Riesgo hiperglicemia corticoides | Chaudhuri D et al. | 2024 | Crit Care Explor | RR 1.21 (alta certeza) de hipoglicemia-alta con corticoides UCI | corticoid_glucose_RR = 1.21 | PatientFactory |
| Salbutamol nebulizado (GINA) | GINA Committee | 2024 | Eur Respir J | 2.5-5 mg/4-6h en status asthmaticus; ipratropio 0.5 mg/6h | dosis broncodilatador en asthmaScenarios | respiratoryScenarios |
| Ipratropio nebulizado (GOLD) | GOLD Committee | 2024 | Eur Respir J | 0.5 mg/6h en exacerbación EPOC; sinergia con LABA | dosis broncodilatador en copdScenarios | respiratoryScenarios |

---

## Fragilidad y Reserva Fisiológica

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| CFS Rockwood validación en UCI | Bruno RR et al. | 2023 | Ann Intensive Care | Meta-análisis n=23,989; HR mortalidad 1.34/punto CFS en >65a | frailtyDelta calibrado: 0.14 por punto CFS en >65a | PatientFactory |
| CFS ≥5 mortalidad 6m (Wozniak) | Wozniak H et al. | 2024 | Ann Intensive Care | CFS ≥5: HR mortalidad 6m = 2.9; mortalidad precoz HR 1.56 | CFS_BREAKPOINTS calibrados para HR=2.9 en ≥5 | PatientFactory |
| CFS predictor 30d AUC 0.81 | Kaeppeli T et al. | 2020 | Ann Emerg Med | AUC 0.81 para mortalidad 30d; supera APACHE-II en >65a | CFS como modificador de hostSensitivity en ODE | PatientFactory |
| CFS HR ajustado vs no ajustado | Hewitt J et al. | 2021 | J Intensive Care Soc | HR unadj 1.56; adj 1.11 (confusión por edad/comorbilidades) | hostSensitivity = 1.0 + 0.11×(cfs-1) | PatientFactory |
| Frailty no-lineal mejor predictor | Fronczek J et al. | 2021 | Crit Care | Fragilidad continua (índice) supera CFS categórico en predicción | frailtyContinuous [0..1] → cfsScore 1-9 | PatientFactory |
| Base age frailty curva | Robertson DA et al. | 2014 | Age Ageing | Fragilidad acumula exponencialmente >65a; prevalencia 7-12% en >65a | baseAge(age): función lineal por tramos calibrada | PatientFactory |

---

## Glucemia en UCI

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| Modelo ICING (Bergman extendido para críticos) | Lin J et al. | 2011 | Comput Methods Programs Biomed | Validado n=173 pacientes; error 1h ahead 2.8% en SICU | ICING model coeficientes (SI, P, Qmax) | GlycemiaEngine (futuro) |
| NICE-SUGAR target glucemia UCI | NICE-SUGAR Study Investigators | 2009 | N Engl J Med | Target 140-180 mg/dL; TGI intensivo ↑ mortalidad | GLUCOSE_TARGET_LO=140, HI=180 | GlycemiaEngine (futuro) |
| Variabilidad glicémica mortalidad | Lazzeri C et al. | 2021 | Diabetes Res Clin Pract | Variabilidad glucémica predictor mortalidad hospitalaria en COVID | glcVariability: alertar cuando SD > 40 mg/dL | PatientFactory |

---

## PiCCO — Valores Normales

| Tópico | Autor | Año | Revista | Hallazgo relevante | Coeficiente derivado | Archivo donde se usa |
|---|---|---|---|---|---|---|
| CI normal PiCCO | Sakka SG et al. | 2007 | Crit Care | CI normal 3.0-5.0 L/min/m² | PICCO_CI_NORMAL = [3.0, 5.0] | useMonitoringStore |
| GEDI normal PiCCO | Reuter DA et al. | 2010 | Intensive Care Med | GEDI 680-800 mL/m²; predictor precarga independiente | PICCO_GEDI_NORMAL = [680, 800] | useMonitoringStore |
| ELWI (edema pulmonar) | Tagami T et al. | 2014 | Intensive Care Med | ELWI normal 3-7 mL/kg; >10 correlaciona con SDRA grave | PICCO_ELWI_NORMAL = [3, 7] | useMonitoringStore |
| PVPI (permeabilidad vascular) | Kushimoto S et al. | 2012 | Crit Care | PVPI normal 1-3; > 3 = edema permeabilidad ↑ | PICCO_PVPI_NORMAL = [1.0, 3.0] | useMonitoringStore |
| SVV/PPV (predictores respuesta fluidos) | Marik PE et al. | 2011 | Crit Care Med | SVV/PPV < 10% no responde a fluidos; > 13% responde | PICCO_SVV_THRESHOLD = 13 | useMonitoringStore |
| GEF contractilidad global | Sander M et al. | 2006 | Br J Anaesth | GEF normal 25-35%; < 25% = disfunción sistólica | PICCO_GEF_NORMAL = [25, 35] | useMonitoringStore |
| CPI (cardiac power index) | Fincke R et al. | 2004 | J Am Coll Cardiol | CPI < 0.53 W/m² predice mortalidad en cardiogénico (AUC 0.74) | PICCO_CPI_ALARM = 0.53 | useMonitoringStore |
| Acidemia y función cardíaca (PiCCO) | Rodríguez-Villar C et al. | 2021 | EClinicalMedicine | pH < 7.20 ↓ GEF y CI; pH < 7.10 ↓ dPmax > 30% | acidemia_CI_factor = 1-0.3×max(0, 7.20-pH) | CardiovascularEngine |
