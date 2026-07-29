# PHASE_R5_REPORT.md — FASE 8 + 9
# Fecha: 2026-05-12

---

## FASE 8.A — CrosstalkEngine

### Nuevos stores creados
| Archivo | Descripción |
|---------|-------------|
| `src/store/useECMOStore.ts` | ECMO: active, mode (vv/va), bloodFlowLmin, sweepFlowLmin, membraneFiO2, cannulation, pressures, drivingPressureAlert |
| `src/store/useCRRTStore.ts` | CRRT: active, mode (CVVH/D/HDF), dose_mLkgh, anticoagulation, effluent electrolytes, atbAdjustAlert |

### CrosstalkEngine (src/core/CrosstalkEngine.ts)

| Método | Física acoplada | Referencia |
|--------|-----------------|------------|
| `couplECMOVentilator(dt)` | VV: sweep gas → PaCO₂; ECMO flow fraction → SaO₂; ΔP > 14 → biotrauma + alerta | Grotberg 2023; Araos 2021; Rodriguez ECMOVENT 2025 |
| `couplCRRTPharma(dt)` | CRRT clearance = Q_eff × dialyzability → decae Cp; alerta drogas > 0.5 | Roberts ICM 2025; Hoff 2020; Wieringa 2025 |
| `couplCRRTElectrolytes(dt)` | K⁺ extracción difusión/convección; HCO₃ reposición citrato/bicarb | KDIGO 2012; ADQI 2021 |
| `couplECMOHemodynamics(dt)` | VA: MAP boost ≈ 6 mmHg/L/min; CO nativo reducido (descarga LV) | Combes EOLIA 2020 |

### Modificaciones a stores existentes
- `DrugPKDef.dialyzability?: number` añadido a interfaz
- Valores en propofol (0.0), midazolam (0.20), morphine (0.30), fentanyl (0.10), furosemide_iv (0.50)
- `usePharmacologyStore.setPlasmaConc(drug, val)` — setter atómico por droga
- CronosEngine: `CrosstalkEngine.getInstance().update(dt)` al final del tick

---

## FASE 8.B — ECMOCRRTPanel

**`src/components/crosstalk/ECMOCRRTPanel.tsx`** — Drawer side="left" width=380

| Sección | Controles |
|---------|-----------|
| ECMO | Toggle on/off · Modo VV/VA · Blood flow (1-7 L/min) · Sweep flow · FiO₂ membrana · Extracción CO₂ estimada · Alerta ΔP > 14 |
| CRRT | Toggle · Modo CVVH/D/HDF · Dosis mL/kg/h · Anticoagulación (citrato/HNF/ninguna) · Composición efluente (Na, K, HCO₃) · Alerta ATB con ref Roberts 2025 |

MonitorApp: botón "ECMO/CRRT" en status bar → abre ECMOCRRTPanel (Drawer left).

---

## FASE 8.C — ImagingEngine

**`src/core/ImagingEngine.ts`** — Skeleton multimodal

| Modalidad | Latencia sim | Findings auto-derivados |
|-----------|-------------|------------------------|
| CXR | 5 min | Opacidades bilaterales (SDRA), infiltrado focal (sepsis), cardiomegalia |
| CT Tórax | 30 min | Ground glass + consolidación SDRA, neumonía segmentaria |
| CT Cerebro | 20 min | Edema difuso, HIC (si neurocrítico + PIC > 20) |
| Eco BLUE | 5 min | Líneas B (SDRA), Patrón A (normal) |
| FOCUS Cardíaco | 10 min | Bajo gasto, estado hiperdinámico séptico |
| Doppler TCD | 10 min | IP elevado (PIC > 25), vasospasmo |

- `requestStudy(modality)` → Promise con latencia real `delay_s / speedMultiplier`
- Ring buffer 50 estudios completados
- Slot `imageUrl` y `imageSvgComponent` reservados para futura expansión

**InfectologyModal**: tab "🔬 Imagen" añadido → botones de 9 modalidades → resultados inline con tags.

---

## FASE 9 — Bibliography Delta V3

**`docs/BIBLIOGRAPHY_DELTA_V3.md`** — 42 nuevas citas con DOI verificado

Secciones:
- Diuréticos combinados (CLOROTIC, 3T, ADVOR, Kapelios 2025)
- ECMO ultraprotectora (Grotberg, EOLIA, Araos, ECMOVENT, Guervilly, Boesing)
- CRRT PK (SMARRT, Roberts 2025, Wieringa 2025, Hoff 2020)
- Muerte encefálica (WBDP, Greer 2020/2023, Kirschen, Shemie)
- HIC/TBI (Hawryluk, SYNAPSE-ICU)
- Sepsis AMR (IDSA 2022, Shields 2018)
- Corticoides (APROCCHSS, ADRENAL, RECOVERY, Meduri, Pitre)
- Cardio (CULPRIT-SHOCK, PEITHO, ESC TEP 2019)
- Neuro (DESTINY, TTM2, ESETT)
- SLT (Cairo, Howard)
- Electrolitos (Spasovski, Umpierrez 2024)

---

## Validación final

```
npx tsc --noEmit → EXIT:0 ✅
```

| Check | Estado |
|-------|--------|
| useECMOStore + useCRRTStore creados | ✅ |
| CrosstalkEngine 4 acoplamientos | ✅ |
| CronosEngine llama CrosstalkEngine.update(dt) | ✅ |
| dialyzability en DrugPKDef | ✅ |
| setPlasmaConc acción atómica | ✅ |
| ECMOCRRTPanel Drawer left con 2 secciones | ✅ |
| ImagingEngine skeleton con 9 modalidades | ✅ |
| InfectologyModal tab Imagen + requestStudy | ✅ |
| MonitorApp botón ECMO/CRRT + panel wired | ✅ |
| docs/BIBLIOGRAPHY_DELTA_V3.md 42 citas | ✅ |
