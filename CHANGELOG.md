# CHANGELOG — IMHOTEP UCI ENGINE V2

---

## [v0.18] — 2026-04-22/23 — Fases 1-4: Maniobras ARM + Antiarrítmicos

### Resumen ejecutivo
Implementación completa de las 4 fases del plan de misión v0.18:
estabilización de tipos, maniobras ventilatorias de pausa, panel ARM lateral
rápido y motor farmacológico antiarrítmico (amiodarona + digoxina).

**Estado:** `npx tsc --noEmit` → 0 errores | `npm run build` → limpio (475 ms)

---

### FASE 1 — Store: VentilatorPauseState

**Archivo:** `src/store/usePatientStore.ts`

| Elemento | Descripción |
|---|---|
| `VentilatorPauseState` | `'NONE' \| 'INSPIRATORY' \| 'EXPIRATORY'` — tipo discriminado para maniobras |
| `Ventilator.pauseManeuver` | Campo nuevo en la interfaz del ventilador |
| `triggerPauseManeuver(type)` | Acción de store que activa/desactiva la maniobra |
| `sanitizeVentilator` | Actualizado para serializar `pauseManeuver` |

**Fundamento:** Separa conceptualmente la pausa global de simulación
(`isPaused`) de las maniobras clínicas del operador (pausa insp/esp),
necesarias para medir Pplat y autoPEEP respectivamente.

---

### FASE 2 — RespiratoryEngine: maniobras reales de pausa

**Archivo:** `src/core/RespiratoryEngine.ts`

#### Física de maniobras implementada

**Pausa Inspiratoria** (2 s, `INSPIRATORY`):
- Congela la generación de muestras del ring buffer durante 2 s de simulación.
- Al completar, mide Pplat desde la ecuación de movimiento con flujo = 0:
  ```
  Pplat = Vt / C_rs + PEEP
  ```
  donde `C_rs = Vt / (Pplat_anterior − PEEP)` (retroalimentación de vitales).
- Publica `vitals.pplat` actualizado.
- **Referencia:** Gattinoni NEJM 2010; ARDSnet NEJM 2000.

**Pausa Espiratoria** (3 s, `EXPIRATORY`):
- Detiene el ring buffer 3 s.
- Al completar, calcula autoPEEP usando la constante de tiempo espiratoria:
  ```
  τ_esp = R × C / 1000
  autoPEEP = (Vt / C_rs) × exp(−tE / τ)
  ```
  donde `tE = T − Ti` (fracción espiratoria del ciclo).
- Publica `ventilator.autoPEEP` vía `applyVentOutputs`.
- **Referencia:** Pepe & Marini JAMA 1982; Rossi EurRespJ 1995.

**Auto-reset:** Al completar cualquier maniobra, el engine llama
`triggerPauseManeuver('NONE')` — sin acción del operador.

---

### FASE 3 — QuickARMPanel: panel lateral de acceso rápido

**Archivo:** `src/components/QuickARMPanel.tsx` (nuevo)
**Integrado en:** `src/components/ClinicalControlPanel.tsx`

#### Especificación de UI
Panel compacto ubicado **entre el soporte respiratorio escalonado y los tabs
HEMO/NEURO/INFECTO** de la barra lateral izquierda.

| Parámetro | Paso | Rango | Campo store |
|---|---|---|---|
| VT | ±10 mL | 200–800 mL | `vt` |
| PEEP | ±1 cmH₂O | 0–25 | `peep` |
| FR | ±1 /min | 4–40 | `setRR` |
| FiO₂ | ±5% | 21–100% | `fio2` |
| Flujo | ±5 L/min | 20–80 | `flowRate` |
| Ti | ±0.1 s | 0.3–3.0 | `iTime` |

**Bidireccionalidad:** Lee del store con selectores granulares. Escribe con
`setVentilatorParam`. Sincronizado automáticamente con el modal grande
(ambos leen del mismo slice de Zustand).

**Botones de maniobra:**
- `PAUSA INSP.` → `triggerPauseManeuver('INSPIRATORY')` (2 s)
- `PAUSA ESP.` → `triggerPauseManeuver('EXPIRATORY')` (3 s)
- Feedback visual: botón activo mientras dura la maniobra.
- Deshabilitados si el ARM no está conectado (`isVentilatorConnected = false`).

---

### FASE 4 — Antiarrítmicos: amiodarona + digoxina

**Archivos modificados:**
- `src/store/usePharmacologyStore.ts`
- `src/core/PharmacologyEngine.ts`
- `src/core/CardiovascularEngine.ts`
- `src/components/ClinicalControlPanel.tsx`

#### PK Monocompartimental (modelo simplificado UCI corta duración)

| Fármaco | t½ efectiva sim | DRUG_MAX_DOSES | inputUnit | Ref |
|---|---|---|---|---|
| Amiodarona | 90 min | 60 mg/h (≡ 1 mg/min) | mg/h | Goodman&Gilman 13ª cap.30 |
| Digoxina | 120 min | 0.05 mg/h (ultra-sensible) | mg/h | Goodman&Gilman 13ª cap.28 |

El t½ efectiva representa el **onset/offset clínico del efecto cardíaco agudo**
(no el t½ plasmático terminal de 25-50 días para amiodarona ni 36-48 h para
digoxina, irrelevantes en UCI de corta duración).

**Calibración bolo → cpRatio:**
```
cpRatio_jump = dose_mg / (DRUG_MAX_DOSES × halfLifeH)

Amio 150 mg → 150 / (60 × 1.5) = 1.67 cpRatio
Dig  0.25 mg → 0.25 / (0.05 × 2.0) = 2.5 cpRatio
```

#### Modelo PD cronotropo — Hill con sinergia (CardiovascularEngine)

```
hillResponse(cRel, eMax, n) = eMax × cRelⁿ / (1 + cRelⁿ)
  cRel = cpRatio (normalizado: 1.0 ≡ nivel terapéutico)
  cRel = 1 → efecto ≈ 0.5 × eMax  (EC₅₀)
  cRel >> 1 → efecto → eMax        (saturación)

amioEffect = hillResponse(amioRel, 0.20, 2.0)
digEffect  = hillResponse(digRel,  0.15, 1.5)

sinergia = 1 + 0.30 × min(amioRel,1) × min(digRel,1)
  ↑ P-glicoproteína inhibida → ↑ nivel digoxina 50-100%
  Ref: Nademanee AmHeartJ 1984; Hohnloser ClinPharmacol 1987

totalReduction = min(amioEffect + digEffect × sinergia, 0.40)
chronoFactor   = 1 − totalReduction   (cap 40% para seguridad clínica)
```

#### Display de ventana terapéutica

| Fármaco | cpRatio | Concentración display | Estado |
|---|---|---|---|
| Amio | < 0.33 | < 0.5 mg/L | Amarillo (sub-terapéutico) |
| Amio | 0.33–1.67 | 0.5–2.5 mg/L | Verde (terapéutico) |
| Amio | > 1.67 | > 2.5 mg/L | Rojo (tóxico) |
| Dig | < 0.67 | < 0.8 ng/mL | Amarillo |
| Dig | 0.67–1.67 | 0.8–2.0 ng/mL | Verde |
| Dig | > 1.67 | > 2.0 ng/mL | Rojo (ventana estrecha) |

**Ref. ventana terapéutica:** Rathore NEJM 2003 (digoxina); Kowey JACC 2009 (amiodarona).

#### Escenarios de validación clínica

| Escenario | Acción | Resultado esperado |
|---|---|---|
| FA rápida (HR=140) | Bolo amio 150 mg | HR desciende en 30-60 s sim |
| FA + amio activa | Bolo dig 0.25 mg | HR cae adicional (sinergia) |
| Sobredosis dig | Infusión 0.05 mg/min continua | `plasmaConc` > 2.0 ng/mL → rojo |
| Sin antiarrítmicos | Baseline | HR sin cambio (no regresión) |

---

## [v0.17] — 2026-04-22 — Fases 0-5: Estabilización + Motor Respiratorio SV800

### Cambios principales
- RespiratoryEngine: ring buffer 500 muestras × 50 Hz, VentilatorCurves.tsx sin Zustand
- VentilatorPanel: ecuación de movimiento real (P/Flow/V), física VCV/PCV/PSV
- O2Support 8 niveles (NONE → INVASIVE_ARM), computeEffectiveFiO2AndMechanics()
- CardiovascularEngine: acoplamiento PEEP-retorno venoso, sinergia hemorragia×PEEP
- PrognosisEngine: SOFA 2.0 + APACHE II simplificado (Fase 5)
- CronosEngine tick order: Resp → Cardio (pMean disponible en mismo tick)

---

## Referencias clínicas utilizadas

| Referencia | Aplicación |
|---|---|
| Gattinoni NEJM 2010 | Pplat como proxy de presión alveolar (Pplat = Vt/C + PEEP) |
| ARDSnet NEJM 2000 | Ventilación protectora — Pplat < 30, Vt 6 mL/kg IBW |
| Pepe & Marini JAMA 1982 | Definición y medición de autoPEEP (PEEP intrínseco) |
| Rossi EurRespJ 1995 | Constante de tiempo espiratoria τ = R×C |
| Jardin ICM 1992 | Efecto PEEP sobre retorno venoso |
| Goodman & Gilman 13ª cap.28,30 | PK/PD amiodarona y digoxina |
| Nademanee AmHeartJ 1984 | Interacción amiodarona-digoxina (P-glicoproteína) |
| Hohnloser ClinPharmacol 1987 | Sinergia farmacocinética amio-dig (+50-100% nivel dig) |
| Rathore NEJM 2003 | Ventana terapéutica digoxina (0.5-0.9 ng/mL óptimo) |
| Kowey JACC 2009 | Niveles plasmáticos amiodarona (1.0-2.5 mg/L) |
| AHA ACLS 2023 | Protocolos de uso IV de amiodarona y digoxina |
