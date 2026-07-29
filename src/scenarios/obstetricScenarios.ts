// src/scenarios/obstetricScenarios.ts
// Escenarios obstétricos críticos para IMHOTEP.
// Refs: ACOG 222 (2020); MAGPIE Lancet 2002; WHO 2017 PPH; WOMAN Lancet 2017.
import type { ScenarioDefinition } from '../store/useScenarioStore';

export const obstetricScenarios: ScenarioDefinition[] = [
  {
    id: 'obs_hellp_severo',
    category: 'obstetricia',
    name: 'Síndrome HELLP severo (28 semanas)',
    description: 'Primigesta 28 sem, PAS 168/108, plaquetas 62k, AST 240, LDH 850. Dolor epigástrico, hiperreflexia 3+. Sin convulsiones aún.',
    baseSeverity: 0.80,
    tags: ['HELLP', 'obstetricia', 'preeclampsia', 'coagulopatía'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.60 },
    ],
    initialVitals: {
      heartRate: 92, systolicBP: 168, diastolicBP: 108,
      meanArterialPressure: 128, respiratoryRate: 18,
      spo2: 96, temperature: 37.1,
      creatinine: 1.4, urineOutput: 0.6,
    },
    clinicalNotes: 'SULFATO Mg: bolo 4-6 g IV en 20 min → infusión 2 g/h (previene eclampsia, MAGPIE NNT=91 en severa). Monitorizar: reflejos tendinosos, FR ≥12/min, diuresis ≥25 mL/h. Si toxicidad: gluconato Ca 1 g IV. ANTIHIPERTENSIVOS: labetalol 20 mg IV (titular) o nifedipina 10 mg SL. Meta PAS 140-155. CORTICOIDES: betametasona 12 mg IM × 2 si <34 sem (madurez pulmonar fetal). Decisión parto: >34 sem → parto; <34 sem → temporizar máx 48h mientras maduración. Plaquetas <50k → cesárea riesgo; <20k → transfundir antes.',
    references: ['ACOG 222 Preeclampsia 2020', 'Sibai AJOG 2004', 'MAGPIE Lancet 2002'],
  },
  {
    id: 'obs_eclampsia',
    category: 'obstetricia',
    name: 'Eclampsia — segunda convulsión en 30 min',
    description: 'Gestante 34 sem, segunda convulsión tónico-clónica. Post-ictal GCS 9, PAS 184/118, oliguria 15 mL/h.',
    baseSeverity: 0.88,
    tags: ['eclampsia', 'obstetricia', 'convulsiones', 'emergencia'],
    pathologyConfigs: [
      { domain: 'neuroCritical', subtype: null, baseSeverity: 0.60 },
    ],
    initialVitals: {
      heartRate: 108, systolicBP: 184, diastolicBP: 118,
      meanArterialPressure: 140, respiratoryRate: 22,
      spo2: 94, temperature: 37.4,
      gcs: 9, urineOutput: 0.15,
    },
    clinicalNotes: 'AIRWAY FIRST: posición lateral; O2 suplementario; preparar intubación si GCS persiste <9. SULFATO Mg recurrencia: si ya estaba con Mg, bolo adicional 2g IV. Si no: 6g IV en 15 min → 2g/h infusión. ANTIHIPERTENSIVOS: labetalol IV o hidralazina 5 mg IV c/20 min. CESÁREA URGENTE: tras estabilización hemodinámica (NO durante convulsión activa). NO fenitoína (Lucas NEJM 1995 — inferior a Mg). Vigilar edema agudo pulmonar por restricción hídrica vs PVC.',
    references: ['Lucas NEJM 1995', 'MAGPIE Lancet 2002', 'ACOG 222'],
  },
  {
    id: 'obs_hpp_atonia',
    category: 'obstetricia',
    name: 'Hemorragia Postparto — Atonía Uterina',
    description: 'Multípara 4ª, post-parto vaginal 35 min, pérdida estimada >1500 mL, útero blando supra-umbilical. PAS 78/42, FC 138, llenado capilar >4s.',
    baseSeverity: 0.85,
    tags: ['HPP', 'obstetricia', 'shock_hemorrágico', 'atonía'],
    pathologyConfigs: [
      { domain: 'sepsis', subtype: null, baseSeverity: 0.20 },
    ],
    initialVitals: {
      heartRate: 138, systolicBP: 78, diastolicBP: 42,
      meanArterialPressure: 54, respiratoryRate: 28,
      spo2: 94, temperature: 36.4,
      lactate: 3.2, creatinine: 1.1,
    },
    initialBloodVolumeMl: 2800,
    clinicalNotes: 'BUNDLE HPP SIMULTÁNEO: (1) Masaje uterino bimanual. (2) Oxitocina 10 U bolo IV lento + 40 U en 1L SF (40 U/h). (3) Ácido tranexámico 1g IV en 10 min — iniciar si pérdida >500 mL parto vaginal / >1000 mL cesárea (WOMAN Lancet 2017: NNT=143, máximo beneficio si <3h). (4) Si insuficiente: ergonovina 0.2 mg IM (CONTRAINDICADO si HTA). (5) Misoprostol 800 mcg rectal. (6) Carbetocina 100 mcg IV (si cesárea, CHAMPION NEJM 2018). (7) Balón de Bakri intracavitario / suturas compresivas (B-Lynch). (8) Histerectomía hemostática si refractaria. REANIMACIÓN: protocolo transfusión masiva 1:1:1 GRE:PFC:PLT (PROPPR 2015).',
    references: ['WHO 2017 PPH', 'ACOG 183 PPH', 'WOMAN Lancet 2017', 'CHAMPION NEJM 2018'],
  },
];
