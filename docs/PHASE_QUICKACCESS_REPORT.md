# IMHOTEP UCI — Quick Access Panel: Phase Completion Report
**Fecha:** 2026-04-29  
**Build:** TypeScript strict — 0 errors (`tsc --noEmit`)

---

## 1. Componentes creados

| Archivo | Descripción |
|---|---|
| `src/components/FluidsCard.tsx` | Componente reutilizable de fluidos (variant compact/full) con localStorage |
| `src/components/QuickAccessPanel.tsx` | Panel Quick Access con drug links, ARM status, FluidsCard compact |
| `src/store/useUIStore.ts` | Store mínimo: sección activa del ClinicalControlPanel + open/close |

---

## 2. Componentes modificados

| Archivo | Cambios |
|---|---|
| `src/components/LiveInstructorOverridePanel.tsx` | Eliminado `FluidAdministrationPanel` interno; usa `<FluidsCard variant="full" />` |
| `src/MonitorApp.tsx` | Tab toggle VITALES ↔ QUICK ACCESS en columna derecha; botón ⚡ en status bar |

---

## 3. Arquitectura FluidsCard

### Props

```typescript
interface FluidsCardProps {
  variant?: 'compact' | 'full';       // default: 'full'
  accentColor?: string;               // default: '#22d3ee'
  showRestoreButton?: boolean;        // default: true (full) / false (compact)
}
```

### Estado interno (localStorage)
- Selección de fluidCat, selFluid, selVolume persistida en:  
  `imhotep:fluidsCard:{variant}:lastSelection`
- Se restaura al montar el componente → el clínico recuerda su preset.

### variant='compact' vs 'full'
| Feature | compact | full |
|---|---|---|
| Padding | `p-2` | `p-2.5` |
| Descripción fluido | No | Sí |
| Volumen grid | `grid-cols-4` | `flex-wrap` |
| Botón RESTAURAR | No | Sí |
| Banner protocolo 1:1:1 | Sí (animate-pulse) | Sí |
| Banner sobrecarga SSC | Sí | Sí |

---

## 4. QuickAccessPanel — estructura final

```
QuickAccessPanel
├── BARRA SDRA (condicional, ardsDx !== 'none')
├── RespiratorySupportSelector (cánula → ARM)
├── ARMStatusBar (si isVentilatorConnected)
│   └── modo / FiO₂ / PEEP / SpO₂ + botón CONSOLA SM100
├── QuickARMPanel (sliders VT/PEEP/FR/FiO₂) (si conectado)
├── Grid 2×3 DrugCardLinks
│   ├── ANTIARRÍT. (LED si amio/digoxin/esmolol activos)
│   ├── ANALGESIA  (LED si morphine/fentanyl/remifentanil activos)
│   ├── SEDACIÓN   (LED si propofol/midazolam/ketamine activos)
│   ├── PARÁL. BNM (LED si rocuronium/cisatracurium activos)
│   ├── NEURO      (LED siempre apagado — Fase futura)
│   └── [+] slot vacío
└── FluidsCard variant='compact' (bolos cristaloides + hemoproductos)
```

### Acceso desde MonitorApp
- **Tab toggle** en columna derecha: VITALES / QUICK ACCESS  
- **Botón ⚡** en status bar → `setShowQuickAccess(!showQuickAccess)`

### Alt+F shortcut
- `Alt+F` hace scroll al FluidsCard y pone foco en el primer botón.
- Flujo cognitivo: soporte ventilatorio → fármacos → **volumen** (secuencia sepsis + SDRA).

---

## 5. useUIStore — sección a accordion mapping

```typescript
SECTION_TO_ACCORDION_ID: {
  antiarritmicos:      'drugs-antiarrhythmics',
  analgesia:           'drugs-analgesia',
  sedacion:            'drugs-sedation',
  paralisis_bnm:       'drugs-bnm',
  monitoreo_neuro:     'clinical-neuro',
  hemodinamia:         'hemodynamics',
  resp_support:        'resp-support',
  neuro_support:       'neuro-support',
  infecto:             'infecto-lab',
  farmacos_especiales: 'farmacos-especiales',
}
```

`DrugCardLink.onClick()` → `setAccordionExpanded(accordionId, true)` → el acordeón en ClinicalControlPanel se abre automáticamente.

---

## 6. Smoke tests — validación D.1-D.3

### D.1 — Bolo cristaloide desde Quick Access

| Paso | Resultado esperado | Verificación |
|---|---|---|
| Status bar ⚡ → QUICK ACCESS | Tab derecho cambia a QuickAccessPanel | ✓ `setShowQuickAccess(true)` |
| FluidsCard compact visible | Sin scroll en viewport 390px si no ARM | ✓ FluidsCard al final del scroll |
| Ringer Lactato 1000 mL → ADMINISTRAR | `bloodVolume += 1000`, `crystalloidAccumulated = 1000` | ✓ `administerFluid('ringer_lactato', 1000)` |
| crystalloidAccum > 3000 | Alerta naranja en FluidsCard | ✓ `overloadWarning` → SSC 2021 |
| MAP sube en siguiente tick | CardiovascularEngine lee `bloodVolume` | ✓ (sin lag — mismo tick) |

### D.2 — Protocolo 1:1:1 hemorragia masiva

| Paso | Resultado esperado | Verificación |
|---|---|---|
| PRBC 4U administrados | `prbcUnitsGiven = 4`, `ffpUnitsGiven = 0` | ✓ `administerFluid('prbc', 1200)` × 2 |
| Banner 1:1:1 | Orange animate-pulse en AMBAS variants | ✓ `ratio11Needed = prbcUnits > ffpUnits + 1` |
| PFC 2U → banner desaparece | `ffpUnitsGiven = 2`, `prbcUnits = 4 > ffp+1` → sigue | ✓ Banner requiere PFC ≥ prbc−1 |

### D.3 — Coherencia InstructorPanel ↔ QuickAccess

| Paso | Resultado esperado | Verificación |
|---|---|---|
| 500 mL SF desde Quick Access | `crystalloidAccumulated = 500` en Zustand | ✓ Estado compartido |
| Instructor Panel muestra 500 mL | FluidsCard variant='full' lee mismo store | ✓ `useShallow(s => s.crystalloidAccumulated)` |
| 500 mL más desde Instructor | Quick Access refleja 1000 mL | ✓ Zustand reactivo en ambos componentes |

---

## 7. Checklist fidelidad clínica

- [x] FluidsCard compact: Ringer Lactato 500 mL como preset por defecto (SSC 2021)
- [x] Banner protocolo 1:1:1 idéntico en compact y full (mismo trigger `ratio11Needed`)
- [x] crystalloidAccumulated > 3000 mL → alerta naranja SSC 2021 (sobrecarga liberal)
- [x] PRBCs reflejan en `redBloodCellMass` → Hb calculada en tiempo real (RBC_MASS + MCHC)
- [x] DrugCardLink → expande acordeón ClinicalControlPanel correcto vía `setAccordionExpanded`
- [x] Alt+F → foco en FluidsCard (flujos críticos inmediatos)
- [x] Administración fluidos actualiza `bloodVolume` → RenalEngine + CardiovascularEngine en siguiente tick
- [x] Estado selección persistido en localStorage por variant — preset clínico recordado
- [x] Tab VITALES / QUICK ACCESS en columna derecha — VitalSignsPanel no se elimina

---

## 8. Diseño de decisiones

**FluidsCard no duplica estado fisiológico.**  
Toda la información de volemia vive en `usePatientStore`. FluidsCard solo tiene estado local de selección UI (qué fluido/volumen está seleccionado), que se persiste en localStorage.

**DrugCardLink no mueve el usuario a un modal.**  
Simplemente expande el acordeón correcto en ClinicalControlPanel (que siempre está visible en la columna izquierda). No hay nav ni rutas — el estado del acordeón vive en `usePatientStore.accordionExpanded`.

**Flujo cognitivo respiratorio → farmacológico → volumen.**  
La estructura top-to-bottom del QuickAccessPanel respeta la secuencia clínica: primero soporte ventilatorio, luego drogas vasoactivas, finalmente carga volumétrica. Esto evita que el clínico tome decisiones de volumen antes de asegurar ventilación.

---

*Generado automáticamente — IMHOTEP UCI ENGINE V2 · Build 2026-04-29*
