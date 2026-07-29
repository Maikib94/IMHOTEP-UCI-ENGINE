# AUDIT_PRE_ROADMAP_V3.md
# Fecha: 2026-05-11

---

## 1. tsc --noEmit
EXIT:0 — 0 errores ✅

---

## 2. Grep residuos zero-tolerance

| Patrón | Resultado |
|--------|-----------|
| `S31/A23\|A12/H2\|S37/A0\|S7/A0` | 0 matches ✅ |
| `Doe John\|1101pm` | solo `formatVital.ts:4` (comentario explicativo) ✅ |
| `SV800` en src/components/ | 0 matches ✅ (solo en src/core/ — residuo interno aceptado) |
| `showCultures` | 0 matches ✅ |
| `CULTIVOS` | src/components/ClinicalControlPanel.tsx:179 (comentario UROCULTIVOS) ✅ |

---

## 3. Mapa de archivos ROADMAP v3.0

### Existentes (modificar)
| Archivo | Estado |
|---------|--------|
| src/components/ScenarioSelectorModal.tsx | EXISTE — wiring O2StrategyPicker |
| src/components/ClinicalControlPanel.tsx | EXISTE — eliminar accordion INFECTOLOGÍA |
| src/components/VentilatorCurves.tsx | EXISTE — migrar a WaveformRenderer |
| src/MonitorApp.tsx | EXISTE — añadir InfectologyHeaderButton |

### A crear (ROADMAP v3.0)
| Archivo | FASE | Estado |
|---------|------|--------|
| src/core/SimulationLauncher.ts | FASE 1 | PENDIENTE |
| src/components/launcher/O2StrategyPicker.tsx | FASE 1 | PENDIENTE |
| src/components/ventilator/WaveformRenderer.tsx | FASE 2 | PENDIENTE |
| src/components/header/InfectologyHeaderButton.tsx | FASE 3 | PENDIENTE |
| src/components/header/InfectologyModal.tsx | FASE 3 | PENDIENTE |
| src/components/ui/Drawer.tsx | FASE 3 | PENDIENTE |

---

## 4. Directorios nuevos requeridos
- src/components/launcher/ — FASE 1
- src/components/ventilator/ — FASE 2
- src/components/header/ — FASE 3
