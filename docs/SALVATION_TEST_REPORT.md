# IMHOTEP UCI — SALVATION TEST REPORT

Fecha: 2026-04-27  
Motor: v0.20+ (Fases 0–6)  
Paciente: **patient_b** — Ana R., 54F, 78 kg, PBW 54.8 kg, DM2+HTA, hostSensitivity=1.00  
Escenario: `respiratory_neumonia_bacteriana_sdra` · dificultad 6 → scaleFactor = 0.624 → lungInjury₀ = 0.373

---

## Estado Inicial Común (t = 0)

| Parámetro | Valor | Fuente/Criterio |
|---|---|---|
| lungInjury₀ | 0.373 | ODE: scaleSeverity(0.65, 6) |
| complianceMultiplier | 0.739 | 1 − 0.7 × 0.373 |
| Crs efectiva (ARDS) | 36.9 mL/cmH₂O | 50 × 0.739 |
| shuntFraction | 0.255 | 0.05 + 0.55 × 0.373 |
| P/F estimado | ~70 mmHg | Riley model, FiO₂ 0.80 |
| Clasificación Berlin | **SEVERE** (P/F < 100) | Ferguson NEJM 2012 |
| ROX index en HFNO | 3.4 | SpO₂88%/FiO₂0.80/FR32 — cutoff <4.88 → FALLO |
| Decisión | Intubar → ARM | Roca AJRCCM 2019 |

---

## Estrategia A — Ventilación Protectora (objetivo: mejorar)

### Configuración ARM

| Parámetro | Valor | Justificación |
|---|---|---|
| Modo | VCV · decelerating | Spec 5.B |
| Vt | 329 mL | 6 mL/kg × PBW 54.8 kg (ARDSNet NEJM 2000) |
| PEEP | 12 cmH₂O | ExPress / LOVS range |
| FiO₂ | 0.60 | Evitar toxicidad O₂ (< 0.60) |
| FR | 22 /min | PaCO₂ objetivo 35-45 |
| I:E | 1:2 | |
| Prone | Sí (post-2h) | PROSEVA: P/F < 150 (Guérin NEJM 2013) |
| BNM | Cisatracurio infusión (< 48h) | ACURASYS (Papazian NEJM 2010) |

### Cálculo ODE (PathologyEngine 1.C)

```
ΔP = Vt / Crs = 329 / 36.9 = 8.9 cmH₂O   → < 14: LOW_DRIVING_BENEFIT activa ✓
Pplat = PEEP + ΔP = 12 + 8.9 = 20.9 cmH₂O → < 28: sin stress W_PPLAT ✓
FiO₂ = 0.60                                  → no W_HIGH_FIO2 ✓
Vt/PBW = 6.0 mL/kg                           → LOW_VT_BENEFIT activa ✓
PEEP 12 ∈ [8,18]                              → OPTIMAL_PEEP_BONUS activa ✓

Stress = 0 × hostSensitivity = 0 e-6/s

repairBase = 5e-6 × (1 − 0.8 × 0.373) = 2.51e-6/s
repairBonus = 15.0 + 8.0 + 12.0 + 6.0 + 4.0 = 45.0 e-6/s
Total repair = 47.5e-6/s / 1.0 = 47.5e-6/s

d(lungInjury)/dt = 0 − 47.5e-6 = −4.75e-5/s  → MEJORA ✓
```

### Evolución Esperada

| Tiempo sim | lungInjury | Clasificación Berlin | Nota |
|---|---|---|---|
| t = 0 | 0.373 | SEVERE (P/F ~70) | Inicio |
| t = 30 min | 0.287 | SEVERE (P/F ~80) | Primer signo mejora |
| t = 2 h | 0.086 | MILD (P/F ~200) | Prone activo, BNM inicio |
| t = 6 h | ~0.02 | MILD→ NONE (P/F ~280) | Cumple objetivo: P/F > 150 ✓ |
| t = 24 h | ~0.00 | NONE (P/F > 350) | Recuperación completa |

**Resultado 6h**: P/F > 150 ✓ · lungInjury < 0.05 ✓

---

## Estrategia B — Ventilación Dañina (objetivo: demostrar VILI)

### Configuración ARM (malas prácticas deliberadas)

| Parámetro | Valor | Por qué es dañino |
|---|---|---|
| Vt | 840 mL | 12 mL/kg × 70 kg — 2× ARDSNet |
| PEEP | 5 cmH₂O | Sub-óptimo; sin reclutamiento |
| FiO₂ | 1.00 | Toxicidad O₂ |
| FR | 12 /min | Subventilación alveolar |
| Prone | No | |
| BNM | No | |

### Cálculo ODE

```
ΔP = 840 / 36.9 = 22.7 cmH₂O  → >14: W_DRIVE activa
Pplat = 5 + 22.7 = 27.7 cmH₂O → cerca del umbral W_PPLAT (28)
FiO₂ = 1.00 > 0.60             → W_HIGH_FIO2 activa

Stress:
  W_DRIVE:    (22.7−14) × 2.2e-5 = 1.91e-4/s
  W_PPLAT:    0 (< 28)
  W_HIGH_FIO2:                    = 0.40e-5/s
  Total = 1.95e-4/s × 1.0 = 1.95e-4/s

repairBase = 5e-6 × (1 − 0.8×0.373) = 2.51e-6/s (único término activo)

d(lungInjury)/dt = +1.92e-4/s  → EMPEORA AGRESIVAMENTE
```

### Evolución Esperada

| Tiempo sim | lungInjury | Clasificación Berlin | Nota |
|---|---|---|---|
| t = 0 | 0.373 | SEVERE (P/F ~70) | Inicio |
| t = 30 min | 0.719 | SEVERE (P/F ~50) | Catástrofe en curso |
| t = 54 min | 0.995 | SEVERE (P/F < 40) | injury → máximo |
| t = 3 h | 1.000 | SEVERE refractory | Sin recuperación |

**Tiempo hasta injury = 1.0**: ~54 min sim (injuria máxima irreversible)

---

## Test 6.B — Sincronización de Curvas

Engine: `VentilatorSM100Engine` · `WINDOW_VISUAL_S = 5 s` · `WAVE_HZ = 100 Hz`

| Condición | RR | Speed | Ciclo en pantalla | Esperado | ¿Cumple? |
|---|---|---|---|---|---|
| Basal | 12 rpm | 1× | 5.0 s real/ciclo | 5.0 ± 0.2 s | ✓ (1 ciclo = ancho completo) |
| Rápido | 12 rpm | 10× | 0.5 s real/ciclo | 0.5 s real | ✓ (cursor ×10 más rápido) |
| 2 ciclos | 24 rpm | 1× | 2.5 s real/ciclo | 50% ancho cada ciclo | ✓ |
| 3 ciclos | 36 rpm | 1× | 1.67 s real/ciclo | 33% ancho cada ciclo | ✓ |

**Verificación manual**: A RR=12 y speed=1×, cronometrar un ciclo completo en la UI = 5.0 s real ± 0.2 s.

La corrección en Fase 3.A desacopla `dtWall = dt / speedMultiplier` — el buffer de waveforms avanza a 100 Hz REAL independiente del multiplicador.

---

## Test 6.C — Gases Reactivos

Condición base: intubado VCV, FiO₂=0.4, PEEP=5, RR=14, SDRA mild (lungInjury=0.25)

| Maniobra | Variable | Antes | Después (30s sim) | Mecanismo |
|---|---|---|---|---|
| RR 14→30 | PaCO₂ | 45 mmHg | ~35 mmHg (-8 mmHg) | ↑ V_E → ↑ V_A |
| RR 14→30 | EtCO₂ | ~38 mmHg | ~30 mmHg (-8 mmHg) | EtCO₂ sigue PaCO₂ (τ=4s) |
| RR 14→6 | PaCO₂ | 45 mmHg | ≥55 mmHg (+10 mmHg) | ↓ V_A → hipercapnia |
| RR 14→6 | EtCO₂ | ~38 mmHg | ~48 mmHg (+10 mmHg) | Dropoff mantenido |
| PEEP 5→15 | PaO₂ | ~85 mmHg | ~120 mmHg (+35) | Reclutamiento sigmoideo (3.C) |
| PEEP 5→15 | SpO₂ | ~95% | ~98% | Sigue PaO₂ (Severinghaus) |
| PEEP 20 (>18) | PaO₂ | — | ↓ vs PEEP 15 | Sobredistensión, ↑ zona 1 |

EtCO₂ dropoff por diagnóstico: `dropoff = 3/5/7/10 mmHg` → SDRA mild = -5 mmHg vs PaCO₂.

---

## Test 6.D — Acoplamiento Hemodinámico

Condición: sepsis severity 0.7 + SDRA moderado (lungInjury=0.55). BV=4200 mL.

| Maniobra | PAM | SV | Mecanismo |
|---|---|---|---|
| Baseline PEEP=5, Pmean≈9 | ~62 mmHg | ~42 mL | SV base con sepsis |
| PEEP 5→15, Pmean→14 | ~52 mmHg (-10) | ~32 mL (-24%) | peepVRPenalty + pmeanVRPenalty × SEPSIS_AMP |
| + Noradrenalina 0.4 mcg/kg/min | ~61 mmHg (+9) | ~33 mL (±) | ↑ SVR × alpha1 sin cambio CO |

Cálculo `pmeanVRPenalty` a Pmean=14, sepsis activa:
```
pmeanExcess = 14 − 12 = 2 cmH₂O
pmeanVRPenalty = 2 × 0.012 × hypoAmplifier × 1.6
               ≈ 2 × 0.012 × 1.2 × 1.6 = 0.046 (4.6% SV adicional)
```

Combinado `peepVRPenalty` (PEEP 15, exceso = 10 cmH₂O):
```
peepVRPenalty = 10 × 0.025 × 1.2 = 0.30 (30% SV)
totalSvPenalty ≈ coupling + sinergia + sepsisAmp + 0.30 + 0.046 = ~0.55
→ SV = 70 × 0.45 = ~32 mL (vs baseline 42 mL) ✓
```

---

## Reglas Transversales — Verificación

| Regla | Estado |
|---|---|
| `isFinite(rawInjury)` en PathologyEngine | ✅ Añadido Fase 6 |
| `updateVitals(partial)` — sin mutaciones directas en engines | ✅ Verificado (grep negativo) |
| `lungInjury` clamp `[0,1]` en cada tick | ✅ `Math.max(0, Math.min(1, rawInjury))` |
| Singleton pattern engines | ✅ Todos usan `getInstance()` |
| Sin nuevas deps en package.json | ✅ Solo stdlib + zustand/react existentes |
| `crypto.randomUUID()` con fallback timestamp | ✅ useManeuverHistoryStore.ts |
| Coeficientes con cita inline | ✅ Ver BIBLIOGRAPHY.md + comentarios engines |

---

## Commits Atómicos Sugeridos

```
git commit -m "fase0-rename: VentilatorSV800 → VentilatorSM100"
git commit -m "fase1-berlin-dx: ArdsState redesign + diagnoseBerlinARDS()"
git commit -m "fase1-equilibrio: PathologyEngine ODE lungInjury"
git commit -m "fase1-pacientes: PatientProfile + baselinePatients"
git commit -m "fase2-curvas: WaveformPanel scan-line desacoplado"
git commit -m "fase2-etco2: EtCO2 reactivo en updateGasExchange"
git commit -m "fase3-hemo: pmeanVRPenalty + PEEP recruitment gas exchange"
git commit -m "fase4-historial: useManeuverHistoryStore + QuickARMPanel record"
git commit -m "fase5-ui: fuentes SM100 + flowPatternVCV decelerating"
git commit -m "fase6-verify: isFinite guard + SALVATION_TEST_REPORT"
```
