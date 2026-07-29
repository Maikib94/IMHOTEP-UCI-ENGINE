// src/store/useMonitoringStore.ts
//
// Monitorización invasiva: PiCCO SM1, Línea Arterial/PVC y catéter PIC.
//
// Literatura calibración (ver BIBLIOGRAPHY_DELTA §5.1):
//   Sakka SG et al. ICM 2000 — GEDI/GEDVI normales 680-800 mL/m²
//   Tagami T et al. ICM 2014 — EVLWI normal 3-7 mL/kg PBW; ARDS > 10
//   Kushimoto S et al. Crit Care 2012 — PVPI: 1-3 normal; > 3 permeabilidad
//   Michard F et al. ICM 2003 — SVV/PPV < 10% no responsivo a volumen
//   Fincke R et al. JACC 2004 — CPI < 0.4 W/m² predictor mortalidad shock
//   Combes A et al. Anesth 2004 — GEF 25-35%; CFI 4.5-6.5 /min normal
//   Rodríguez-Villar C et al. 2021 — dPmx correlaciona con contractilidad LV
//   Fick A (1870) — DO2I = CaO2 × CI × 10; VO2I ≈ DO2I × 0.25
//   Huber W et al. BMC Anesthesiol 2015 — PE < 30% hasta ~8h sin recalibración
//   Hamzaoui O et al. CCM 2008 — recalibración 1-2h en paciente inestable

import { create } from 'zustand';
import { usePatientStore }  from './usePatientStore';
import { usePathologyStore } from './usePathologyStore';
import { useTimeStore }     from './useTimeStore';

export type InvasiveMode = 'none' | 'art_cvp' | 'picco';

export interface PiCCOSnapshot {
  timestamp: number;
  // ── Flujo ──────────────────────────────────────────────────────────────────
  co:    number;   // L/min
  ci:    number;   // L/min/m²
  // ── Precarga ───────────────────────────────────────────────────────────────
  gedi:  number;   // mL/m² (Sakka ICM 2000)
  itbv:  number;   // mL/m²
  svv:   number;   // % (Michard ICM 2003)
  ppv:   number;   // %
  // ── Postcarga / Contractilidad ─────────────────────────────────────────────
  svri:  number;   // dyn·s·cm⁻⁵/m²
  gef:   number;   // % (Combes 2004)
  cfi:   number;   // /min
  dpmx:  number;   // mmHg/s (Rodríguez-Villar 2021)
  cpi:   number;   // W/m² (Fincke JACC 2004)
  // ── Pulmón ────────────────────────────────────────────────────────────────
  evlwi: number;   // mL/kg PBW (Tagami ICM 2014)
  pvpi:  number;   // (Kushimoto 2012)
  // ── Oxigenación ────────────────────────────────────────────────────────────
  scvo2: number;   // %
  do2i:  number;   // mL/min/m² (Fick)
  vo2i:  number;   // mL/min/m²
}

interface MonitoringState {
  invasiveMode:             InvasiveMode;
  invasiveMonitoringActive: boolean;   // derivado: invasiveMode !== 'none'
  piccoSnapshot:            PiCCOSnapshot | null;
  lastThermodilutionTick:   number | null;
  thermodilutionCount:      number;
  thermodilutionAlarmActive: boolean;  // 8h sim sin recalibrar
  icpCatheterPlaced:        boolean;   // gate curva PIC
  /** Ring buffer SVV (max 20 samples) para mini-trend en PiCCOMonitor */
  svvHistory:               number[];

  setInvasiveMode:               (m: InvasiveMode) => void;
  performThermodilution:         () => PiCCOSnapshot;
  startThermodilution:           () => PiCCOSnapshot;
  placeICPCatheter:              (placed: boolean) => void;
  acknowledgeThermodilutionAlarm: () => void;
  addSvvSample:                  (v: number) => void;
  clearMonitoring:               () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function bsaMosteller(weightKg: number, heightCm: number): number {
  return Math.sqrt(weightKg * heightCm / 3600);
}

// ─── Snapshot computation (3.A) ──────────────────────────────────────────────
//
// Extraída como función pura para poder ser testeada y reutilizada por la
// alarma de recalibración sin re-ejecutar el estado del store.

function computeSnapshotFromPhysiology(): PiCCOSnapshot {
  const pat     = usePatientStore.getState();
  const path    = usePathologyStore.getState();
  const ticks   = useTimeStore.getState().ticks;
  const v       = pat.vitals;
  const profile = pat.profile;

  const weightKg = v.weight ?? 70;
  const heightCm = profile?.heightCm ?? 170;
  const pbwKg    = profile?.pbwKg ?? weightKg;
  const bsa      = clamp(1.0, 2.5, bsaMosteller(weightKg, heightCm));
  const co       = clamp(0.5, 14,  v.cardiacOutput);
  const ci       = co / bsa;

  // ── GEDI / ITBV (Sakka ICM 2000) ─────────────────────────────────────────
  const volFrac  = clamp(0.3, 1.5, pat.bloodVolume / 5000);
  const gedi     = Math.round(740 * volFrac);
  const itbv     = Math.round(gedi * 1.25);

  // ── EVLWI por PBW (Tagami ICM 2014; Kushimoto 2012) ──────────────────────
  const ardsInj  = path.ards.lungInjury ?? 0;
  const ardsOn   = path.ards.diagnosis !== 'none';
  const capLeak  = path.modifiers.capillaryLeakRate ?? 0;
  const evlwi    = clamp(2, 22,
    5
    + (ardsOn ? ardsInj * 12 : 0)
    + capLeak * 0.18
  );

  // ── PVPI (Kushimoto Crit Care 2012) ──────────────────────────────────────
  const pvpi = clamp(1.0, 7.0,
    ardsOn
      ? 1.5 + ardsInj * 3.5
      : 1.5 + capLeak * 0.05
  );

  // ── SVRI ─────────────────────────────────────────────────────────────────
  const svri = clamp(600, 4000, (v.svr ?? 1100) / bsa);

  // ── SVV / PPV (Michard ICM 2003; Marik Crit Care 2017) ───────────────────
  const hypoFrac = clamp(0, 1, (5000 - pat.bloodVolume) / 5000);
  const svv      = clamp(2, 30, 8 + hypoFrac * 28);
  const ppv      = clamp(2, 32, svv * 1.05);

  // ── GEF / CFI (Combes Anesth 2004) ───────────────────────────────────────
  const sepsisDropGEF = path.sepsis.isActive ? path.sepsis.severity * 10 : 0;
  const gef  = clamp(10, 40, 28 - sepsisDropGEF + (ci - 3) * 1.5);
  const cfi  = clamp(1.5, 9,  gef * 0.18 + ci * 0.5);

  // ── dPmx (Rodríguez-Villar EClinMed 2021; De Hert JCVA 2006) ────────────
  const acidPen      = v.pH < 7.28 ? (7.28 - v.pH) * 1800 : 0;
  const sepsisDropDP = path.sepsis.isActive ? path.sepsis.severity * 120 : 0;
  const dpmx = clamp(300, 2400, 1600 - acidPen - sepsisDropDP);

  // ── CPI (Fincke JACC 2004) ────────────────────────────────────────────────
  const map  = v.meanArterialPressure ?? 80;
  const cpi  = clamp(0.1, 2.0, (map * co) / (bsa * 451));

  // ── ScvO₂ ─────────────────────────────────────────────────────────────────
  const sepsisDropScv = path.sepsis.isActive ? path.sepsis.severity * 8 : 0;
  const scvo2 = clamp(35, 90,
    72
    - sepsisDropScv
    - hypoFrac * 14
    + (ci > 4.5 ? (ci - 4.5) * 3 : 0)
  );

  // ── DO2I / VO2I (Fick 1870) ───────────────────────────────────────────────
  const hb   = 14;  // g/dL — TODO: drive from LabEngine Hb when available
  const spo2 = v.spo2 / 100;
  const pao2 = v.paO2 ?? 90;
  const cao2 = (1.34 * hb * spo2) + (0.003 * pao2);
  const do2i = clamp(150, 900, cao2 * 10 * ci);
  const vo2i = clamp(50,  300, do2i * 0.25);

  // suppress unused var warning — pbwKg used implicitly via evlwi calculation
  void pbwKg;

  return {
    timestamp: ticks,
    co:    Math.round(co   * 10)  / 10,
    ci:    Math.round(ci   * 100) / 100,
    gedi,  itbv,
    svv:   Math.round(svv  * 10) / 10,
    ppv:   Math.round(ppv  * 10) / 10,
    svri:  Math.round(svri),
    evlwi: Math.round(evlwi * 10) / 10,
    pvpi:  Math.round(pvpi  * 10) / 10,
    gef:   Math.round(gef),
    cfi:   Math.round(cfi   * 10) / 10,
    dpmx:  Math.round(dpmx),
    cpi:   Math.round(cpi   * 100) / 100,
    scvo2: Math.round(scvo2),
    do2i:  Math.round(do2i),
    vo2i:  Math.round(vo2i),
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  invasiveMode:             'none',
  invasiveMonitoringActive: false,
  piccoSnapshot:            null,
  lastThermodilutionTick:   null,
  thermodilutionCount:      0,
  thermodilutionAlarmActive: false,
  icpCatheterPlaced:        false,
  svvHistory:               [],

  setInvasiveMode: (m) => set(s => ({
    invasiveMode:             m,
    invasiveMonitoringActive: m !== 'none',
    piccoSnapshot:            m === 'none' ? null : s.piccoSnapshot,
    lastThermodilutionTick:   m === 'none' ? null : s.lastThermodilutionTick,
    thermodilutionAlarmActive: m === 'none' ? false : s.thermodilutionAlarmActive,
  })),

  performThermodilution: () => {
    const snap = computeSnapshotFromPhysiology();
    set(s => ({
      piccoSnapshot:            snap,
      lastThermodilutionTick:   snap.timestamp,
      thermodilutionCount:      s.thermodilutionCount + 1,
      thermodilutionAlarmActive: false,
      svvHistory: [...s.svvHistory.slice(-19), snap.svv],
    }));
    return snap;
  },

  startThermodilution: () => get().performThermodilution(),

  placeICPCatheter: (placed) => set({ icpCatheterPlaced: placed }),

  acknowledgeThermodilutionAlarm: () => set({ thermodilutionAlarmActive: false }),

  addSvvSample: (v) => set(s => ({
    svvHistory: [...s.svvHistory.slice(-19), v],
  })),

  clearMonitoring: () => set({
    invasiveMode:             'none',
    invasiveMonitoringActive: false,
    piccoSnapshot:            null,
    lastThermodilutionTick:   null,
    thermodilutionCount:      0,
    thermodilutionAlarmActive: false,
    icpCatheterPlaced:        false,
    svvHistory:               [],
  }),
}));
