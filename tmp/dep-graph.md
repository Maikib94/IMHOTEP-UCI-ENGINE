# IMHOTEP UCI ENGINE — Dependency Graph (Phase 0 Audit)

## TypeScript Status
- `tsc --noEmit`: **0 errors**
- `npm run build`: **OK** (1 minor dynamic-import warning, no type errors)
- `tsconfig.json`: `strict: true`, `noImplicitReturns: true`, no `noUncheckedIndexedAccess`

---

## Engine Execution Order (CronosEngine.tick)
```
MicrobiologyEngine.update(dt)
PathologyEngine.update(dt)
PharmacologyEngine.update(dt)
CardiovascularEngine.updateHemodynamics(dt)   ← reads vitals.meanAirwayPressure (from PREVIOUS tick)
RespiratoryEngine.update(dt)                   ← writes vitals.meanAirwayPressure
AcidBaseEngine.update(dt)
RenalEngine.update(dt)
NeuroEngine.update(dt)
LabEngine.update()
PrognosisEngine.update(dt)
```

**CRITICAL (Phase 5):** Cardio runs BEFORE Resp. `pMean` read by Cardio is always 1 tick delayed.
Fix required: swap Cardio ↔ Resp so Resp writes pMean, then Cardio reads it same tick.

---

## Store Slices → Engine Writers

| Store Slice | Writers | Key Readers |
|---|---|---|
| `vitals.heartRate` | CardiovascularEngine | WaveformMonitor, VitalSignsPanel |
| `vitals.meanArterialPressure` | CardiovascularEngine | WaveformMonitor, VitalSignsPanel |
| `vitals.spo2` | RespiratoryEngine | WaveformMonitor |
| `vitals.paO2 / paCO2` | RespiratoryEngine | ARDSStatusBar, VentilatorPanel |
| `vitals.pplat / ppico` | RespiratoryEngine (via VentilatorSV800Engine) | VentilatorPanel, CardiovascularEngine |
| `vitals.meanAirwayPressure` | RespiratoryEngine | CardiovascularEngine (1 tick delay) |
| `vitals.deltaP / mechanicalPower` | RespiratoryEngine | VentilatorPanel |
| `vitals.gcs / icp` | NeuroEngine | VitalSignsPanel |
| `vitals.creatinine / urineOutput` | RenalEngine | VitalSignsPanel |
| `vitals.lactate / pH / hco3` | AcidBaseEngine | VitalSignsPanel |
| `bloodVolume` | CardiovascularEngine (hemorrhage) | CardiovascularEngine |
| `ventilator.*` | UI (VentilatorPanel setters) | RespiratoryEngine, CardiovascularEngine |
| `respiratoryDevice.*` | UI (ClinicalControlPanel) | RespiratoryEngine |
| `labOrders` | LabEngine | LabPanel |

---

## Component → Store Slice Map

| Component | Store Reads |
|---|---|
| `MonitorApp.tsx` | `vitals.weight`, `timeStore`, `pathologyStore.ards`, `ventilator.fio2`, `isVentilatorConnected`, `prognosisStore` |
| `WaveformMonitor.tsx` | `vitals.*` (ECG, ART, PLETH, EtCO2, RESP, ICP waveforms) |
| `VitalSignsPanel.tsx` | `vitals.*` (all parameters) |
| `ClinicalControlPanel.tsx` | `pharmacologyStore`, `patientStore` (fluid/vent), `prognosisStore` |
| `VentilatorPanel.tsx` | `vitals`, `ventilator`, `respiratoryDevice`, `pathologyStore.ards` |
| `ARDSStatusBar.tsx` | Props only (severity, pao2Fio2Ratio) — no direct store |
| `InstructorPanel.tsx` | All stores (instructor controls) |

---

## Type Inventory

### Existing Types (usePatientStore.ts)
```typescript
type VentilatorMode = 'VC-AC' | 'PC-AC' | 'PSV' | 'SIMV' | 'CPAP'
type RespiratorySupport = 'room_air' | 'nasal_cannula' | 'simple_mask' | 'venturi' | 'hfnc' | 'arm'
interface Ventilator { mode, fio2, vt, peep, setRR, pressureSupport, flowRate, ieRatio, pControl }
interface RespiratoryDevice { support, cannulaFlow, venturiFiO2, hfncFlow, hfncFiO2 }
```

### Types Required by Spec (to be added in Phase 1)
```typescript
type VentMode = 'VCV' | 'PCV' | 'PSV' | 'CPAP' | 'OFF'     // new export
type O2Support = 'NONE' | 'NASAL_CANNULA' | 'SIMPLE_MASK' | 'RESERVOIR_MASK' 
               | 'HFNC' | 'NIV_CPAP' | 'NIV_BIPAP' | 'INVASIVE_ARM'   // new export
// Extend Ventilator with:
  isPaused: boolean
  iTime: number          // seconds
  flowPattern: 'SQUARE' | 'DECEL'
  fio2Effective: number  // computed
  pPeak: number          // computed output
  pPlateau: number       // computed output
  pMean: number          // computed output
  autoPEEP: number       // computed output
  minuteVentilation: number  // computed output
```

### VentMode in VentilatorSV800Engine.ts
```typescript
export type VentMode = 'VCV' | 'PCV' | 'PRVC' | 'PSV' | 'AMV'  // already exported
```
**NOTE:** The VentMode from SV800 ≠ VentMode from spec. These are different types for different purposes.
Existing SV800 VentMode will remain unchanged; new store VentMode is separate.

---

## Missing Pieces for Phases 1-5

| Phase | What's Missing |
|---|---|
| 1 | `isPaused`, output fields in Ventilator; `ErrorBoundary` wrapper |
| 2 | `toggleVentilatorPause()` action; CronosEngine check for `ventilator.isPaused` |
| 3 | Ring buffer in RespiratoryEngine (50 Hz); `VentilatorCurves.tsx`; pPeak/pPlat/pMean computed by engine |
| 4 | RESERVOIR_MASK, NIV_CPAP, NIV_BIPAP in O2Support; `computeEffectiveFiO2AndMechanics()` |
| 5 | Engine order fix (Resp before Cardio); Cardio reads `ventilator.pMean` same tick |

---

## Phase 0 — Cluster Summary

Since `tsc --noEmit` = 0 errors, there are no error clusters to report.
The codebase is type-safe. The work ahead is **additive** (new types, new fields, new logic),
not corrective.
