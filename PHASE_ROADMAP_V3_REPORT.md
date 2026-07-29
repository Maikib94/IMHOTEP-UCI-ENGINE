# PHASE_ROADMAP_V3_REPORT.md
# Fecha: 2026-05-11

---

## FASE 0 — Auditoría Pre-Roadmap

- tsc --noEmit: EXIT:0 ✅
- Grepping residuos zero-tolerance: 0 matches ✅
- Mapa de archivos confirmado → 6 archivos a crear, 4 a modificar

---

## FASE 1 — SimulationLauncher + O2StrategyPicker

### Archivos creados
| Archivo | Descripción |
|---------|-------------|
| `src/core/SimulationLauncher.ts` | Motor de decisión O2 pre-caso |
| `src/components/launcher/O2StrategyPicker.tsx` | Modal de selección visual |

### Cambios en archivos existentes
| Archivo | Cambio |
|---------|--------|
| `src/components/ScenarioSelectorModal.tsx` | "INICIAR CASO" → abre O2StrategyPicker; `applyScenario` → `SimulationLauncher.apply(config)` |

### O2Strategy enum (8 valores)
`room_air` · `nasal_cannula` · `simple_mask` · `reservoir_mask` · `hfnc` · `niv_cpap` · `niv_bipap` · `arm`

### suggestStrategy() lógica (auto-sugerencia)
- `isVentilatorConnected === true` → `arm`
- `recommendedRespSupport` del escenario se respeta
- Por categoría + severidad escalada:
  - respiratory + sev>65% → hfnc
  - sepsis/surgical + sev>70% → arm
  - cardio + sev>65% → niv_bipap
  - neuro + sev>70% → arm
  - burns + sev>55% → arm

### LauncherConfig
```typescript
interface LauncherConfig {
  strategy: O2Strategy;
  fiO2?:    number;   // HFNC / ARM / NIV
  flowLpm?: number;   // Cánula / HFNC
  peep?:    number;   // ARM / NIV
}
```

---

## FASE 2 — WaveformRenderer + Throttle

### Archivos creados
| Archivo | Descripción |
|---------|-------------|
| `src/components/ventilator/WaveformRenderer.tsx` | Canvas renderer memo-wrapped; channels configurables |

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `src/components/VentilatorCurves.tsx` | Shim → re-export WaveformRenderer (backward compat) |
| `src/core/CronosEngine.ts` | `lastVitalsPublishMs` + `publishVitals()` cada 100ms real |
| `src/store/usePatientStore.ts` | `publishVitals()` acción + `vitalsRevision: number` |

### Throttle React re-renders: 240 Hz → 10 Hz
- `VITALS_PUBLISH_INTERVAL_MS = 100`
- CronosEngine llama `publishVitals()` cada 100ms real → solo entonces incrementa `vitalsRevision`
- Componentes UI pueden subscribirse a `vitalsRevision` para limitar re-renders

### WaveformRenderer mejoras vs VentilatorCurves anterior
- `React.memo` en WaveChannel + WaveformRenderer
- Channels configurables (prop `channels: WaveChannelConfig[]`)
- WAVE_COLORS / DEFAULT_CHANNELS exportados para composición externa
- `WaveChannel` (canal individual) exportado como named export

---

## FASE 3 — InfectologyModal + Drawer Portal

### Archivos creados
| Archivo | Descripción |
|---------|-------------|
| `src/components/ui/Drawer.tsx` | Portal drawer (right/left/bottom) con backdrop, focus trap, Escape |
| `src/components/header/InfectologyHeaderButton.tsx` | Botón header con badge cultivos pendientes/positivos |
| `src/components/header/InfectologyModal.tsx` | Drawer 4 tabs: Sospecha / Cultivos / Resistencia / Fuente |

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `src/MonitorApp.tsx` | +`InfectologyHeaderButton` en status bar; +import |
| `src/components/ClinicalControlPanel.tsx` | Eliminado accordion `INFECTOLOGÍA` (movido a drawer) |

### InfectologyModal tabs
| Tab | Contenido |
|-----|-----------|
| Sospecha | SOFA/APACHE II · outcome · germen revelado · resumen positivos |
| Cultivos | Urocultivos (sonda/chorro) + CulturePanel completo |
| Resistencia | Antibiograma por cultivo positivo (sensitivities map) |
| Fuente | Estado de todos los cultivos agrupados por categoría |

### Drawer features
- `createPortal(document.body)` — escapa stacking context
- Focus trap: `panelRef.focus()` on open, restore on close
- Escape key handler
- Slide transition 300ms ease-out
- Configurable: side (right/left/bottom), width, className

---

## Validación final

```
tsc --noEmit → EXIT:0 ✅
```

| Check | Estado |
|-------|--------|
| O2StrategyPicker → SimulationLauncher.apply() | ✅ |
| suggestStrategy() lógica clínica | ✅ |
| WaveformRenderer React.memo | ✅ |
| CronosEngine vitals throttle 100ms | ✅ |
| publishVitals() en usePatientStore | ✅ |
| Drawer portal focus trap + Escape | ✅ |
| InfectologyHeaderButton badge logic | ✅ |
| InfectologyModal 4 tabs | ✅ |
| INFECTOLOGÍA accordion eliminado de ClinicalControlPanel | ✅ |
| InfectologyHeaderButton en MonitorApp status bar | ✅ |
