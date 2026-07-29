// src/core/ProceduralPatientFactory.ts
//
// Parser de narrativa clínica → estado de simulación.
// Estrategia: keyword matching ponderado + heurísticas regex.
// NO LLM — todo determinístico para reproducibilidad pedagógica.
//
// Refs: MARSCH 2024; Sanford Guide 2025; Tamma CID 2024 (IDSA AMR).

import { usePatientStore }      from '../store/usePatientStore';
import { usePathologyStore }    from '../store/usePathologyStore';
import { usePharmacologyStore } from '../store/usePharmacologyStore';
import { useMonitoringStore }   from '../store/useMonitoringStore';
import { useTimeStore }         from '../store/useTimeStore';
import type { ComorbidityId, GeneratedPatient, PreAdmissionContext } from '../store/usePatientStore';
import type { PathologyDomain } from '../store/usePathologyStore';
import type { DrugId }          from '../store/usePharmacologyStore';
import type { InvasiveMode }    from '../store/useMonitoringStore';
import type { RespiratorySupport } from '../store/usePatientStore';
import { generatePatient, COMORBIDITY_CATALOG } from '../scenarios/PatientFactory';
import type { ScenarioDefinition } from '../store/useScenarioStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { type ClinicalCategory, normalizeCategory } from '../types/ClinicalCategory';
type ScenarioCategory = ClinicalCategory;
import { normalizeScenario } from './defaults';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface CaseDescription {
  antecedentes:  string;
  motivoIngreso: string;
  neuro:         string;
  hemo:          string;
  resp:          string;
  renal:         string;
  gastro:        string;
  infecto:       string;
  quirurgico:    string;
  estudios:      string;
}

export interface ParsedPathology {
  domain:   PathologyDomain;
  subtype:  string;
  severity: number;
}

export interface ParsedCase {
  patientProfile:        GeneratedPatient;
  difficulty:            number;   // 1-10
  severityScore:         number;   // 0-1 — base severity for ScenarioDefinition
  inferredCategory:      ScenarioCategory;
  inferredTitle:         string;
  initialStability:      'stable' | 'borderline' | 'unstable' | 'critical';
  inferredComorbidities: ComorbidityId[];
  inferredPathologies:   ParsedPathology[];
  preAdmissionManagement: {
    respiratorySupport:  RespiratorySupport;
    activeInfusions:     { drug: DrugId; rate: number }[];
    activeBoluses:       { drug: DrugId; doseMg: number }[];
    icpCatheterPlaced:   boolean;
    invasiveMonitoring:  InvasiveMode;
  };
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function extractAge(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*a(?:ños?|ño)/i);
  return m ? parseInt(m[1]) : null;
}

// ─── HEURÍSTICAS ──────────────────────────────────────────────────────────────

function inferComorbidities(text: string, warnings: string[]): ComorbidityId[] {
  const map: { keywords: RegExp[]; id: ComorbidityId }[] = [
    { keywords: [/\bhta\b|hipertens/], id: 'hta' },
    { keywords: [/diabet.*tipo 2|dm2|\bdm-2\b/], id: 'dm2_no_insulin' },
    { keywords: [/diabet.*tipo 1|dm1/], id: 'dm1' },
    { keywords: [/insulinodependiente|con insulina/], id: 'dm2_insulin' },
    { keywords: [/epoc.*gold.*iii|epoc.*gold.*3|epoc.*giii/i], id: 'epoc_gold3' },
    { keywords: [/epoc.*gold.*ii|epoc.*gold.*2/i], id: 'epoc_gold2' },
    { keywords: [/\bepoc\b/], id: 'epoc_gold2' },
    { keywords: [/\basma\b/], id: 'asma_persistente' },
    { keywords: [/cirros.*child[\s-]*c|child-c|child c\b/i], id: 'cirrosis_c' },
    { keywords: [/cirros.*child[\s-]*b|child-b|child b\b/i], id: 'cirrosis_b' },
    { keywords: [/\bcirros/], id: 'cirrosis_a' },
    { keywords: [/erc.*g4|estadio 4|tfg\s*<?30/i], id: 'erc_g4' },
    { keywords: [/erc.*g3|tfg\s*<?60/i], id: 'erc_g3a' },
    { keywords: [/dialisis|hemodiali/], id: 'dialisis_hd' },
    { keywords: [/fibrilac.*auric|\bfa\b.*cron|\baf\b.*cron/], id: 'af_cronica' },
    { keywords: [/insufic.*card|\bicc\b|fevi.*reduc|hfref/i], id: 'hf_ref' },
    { keywords: [/\biam\b|infart.*miocard|stent.*coron/], id: 'stents_cor' },
    { keywords: [/inmunosuprim|qt activa|leucemi|tumor.*qt/], id: 'inmunosupresion_qt' },
    { keywords: [/transplant|trasplant/], id: 'inmunosupresion_trasplante' },
    { keywords: [/sahos|apnea.*sueñ/], id: 'sahos' },
    { keywords: [/obesidad mórb|imc.*40|obesidad.*iii/], id: 'obesidad_g3' },
    { keywords: [/obesidad/], id: 'obesidad_g2' },
    { keywords: [/tabaquism.*activ|fuma.*pack/], id: 'tabaquismo_activo' },
    { keywords: [/cocaín|anfetamin|metanfetamin/], id: 'drogas_estimulantes' },
    { keywords: [/heroína|opioid.*cron/], id: 'drogas_depresores' },
  ];

  const found = new Set<ComorbidityId>();
  for (const { keywords, id } of map) {
    if (keywords.some(rx => rx.test(text))) found.add(id);
  }

  const arr = Array.from(found);
  if (arr.length > 6) {
    warnings.push(`${arr.length} comorbilidades detectadas — limitadas a las 6 con mayor frailtyDelta.`);
    return arr
      .sort((a, b) => COMORBIDITY_CATALOG[b].frailtyDelta - COMORBIDITY_CATALOG[a].frailtyDelta)
      .slice(0, 6);
  }
  return arr;
}

function inferSeverity(text: string): number {
  let score = 0.3;
  const markers: { rx: RegExp; w: number }[] = [
    { rx: /shock séptic|shock cardiogén/,           w: +0.30 },
    { rx: /paro card|rcp.*efect|recuper.*paro/,     w: +0.40 },
    { rx: /sdra grave|p\/?f\s*<?\s*100/,            w: +0.25 },
    { rx: /hemorrag.*masiva|sangrad.*masiv/,         w: +0.30 },
    { rx: /coma|gcs\s*[<≤]\s*8/,                    w: +0.25 },
    { rx: /noradren.*0\.[5-9]|ne.*alta.*dosis/,     w: +0.20 },
    { rx: /lactato\s*[6-9]|lactato\s*1\d/,          w: +0.20 },
    { rx: /multiorgán|fallo mult|fmo/,              w: +0.30 },
    { rx: /ph\s*<\s*7\.[01]/,                       w: +0.20 },
    { rx: /hemodinám.*estable|estable y orientad/,  w: -0.20 },
    { rx: /vigil|orientad|colabora/,                w: -0.10 },
  ];
  for (const { rx, w } of markers) {
    if (rx.test(text)) score += w;
  }
  return clamp(0, 1, score);
}

function inferStability(severity: number): ParsedCase['initialStability'] {
  if (severity > 0.75) return 'critical';
  if (severity > 0.55) return 'unstable';
  if (severity > 0.35) return 'borderline';
  return 'stable';
}

function inferPathologies(desc: CaseDescription): ParsedPathology[] {
  const results: ParsedPathology[] = [];
  const resp   = desc.resp.toLowerCase();
  const infecto = desc.infecto.toLowerCase();
  const neuro  = desc.neuro.toLowerCase();
  const qx     = desc.quirurgico.toLowerCase();
  const hemo   = desc.hemo.toLowerCase();

  // Sepsis foco pulmonar
  if (/neumon.*grav|sepsi.*pulmon|foco.*pulmon|neumonia.*séptic/i.test(infecto + resp)) {
    results.push({ domain: 'sepsis', subtype: 'pulmonary', severity: 0.7 });
  }
  // Sepsis foco abdominal
  if (/peritonit|sepsi.*abdom|foco.*abdom|infec.*intraabdom/i.test(infecto + qx)) {
    results.push({ domain: 'sepsis', subtype: 'abdominal', severity: 0.7 });
  }
  // Sepsis foco urinario
  if (/itu.*complic|pielonefrit|sepsi.*urin/i.test(infecto)) {
    results.push({ domain: 'sepsis', subtype: 'urinary', severity: 0.6 });
  }
  // SDRA
  if (/sdra|p\/?f\s*<?\s*(\d{2,3})/i.test(resp)) {
    const m   = resp.match(/p\/?f\s*<?\s*(\d{2,3})/i);
    const pf  = m ? parseInt(m[1]) : 200;
    const sev = pf < 100 ? 0.85 : pf < 200 ? 0.55 : 0.30;
    results.push({ domain: 'ards', subtype: 'moderate', severity: sev });
  }
  // TCE / neuro crítico
  if (/\btce\b|trauma.*encefal|gcs\s*[<≤]\s*8/i.test(neuro)) {
    results.push({ domain: 'neuroCritical', subtype: 'tce_grave', severity: 0.7 });
  }
  // HSA
  if (/hsa|hemorrag.*subarac/i.test(neuro)) {
    results.push({ domain: 'neuroCritical', subtype: 'hsa_aneurysmal', severity: 0.75 });
  }
  // Politrauma
  if (/politrauma|trauma múlt|aplastam/i.test(qx + desc.motivoIngreso.toLowerCase())) {
    results.push({ domain: 'polytrauma', subtype: 'tce_torax', severity: 0.6 });
  }
  // Bajo gasto cardíaco
  if (/bajo gasto|gasto card.*reduc|cardiogén/i.test(hemo)) {
    results.push({ domain: 'cardio', subtype: 'low_output', severity: 0.65 });
  }
  // Neumonía sin sepsis
  if (/neumon/i.test(resp) && !results.some(r => r.domain === 'sepsis')) {
    results.push({ domain: 'pneumonia', subtype: 'community', severity: 0.5 });
  }

  return results;
}

function inferPreAdmission(desc: CaseDescription): ParsedCase['preAdmissionManagement'] {
  const text = [desc.resp, desc.hemo, desc.neuro].join(' ').toLowerCase();

  const respiratorySupport: RespiratorySupport =
    /vmi|intubad|arm\b|ventilac.*mecán/.test(text) ? 'arm' :
    /hfnc|cánula.*alto/.test(text)                  ? 'hfnc' :
    /vmni|bipap|cpap/.test(text)                    ? 'hfnc' :  // closest available
    /venturi/.test(text)                            ? 'venturi' :
    /mascar/.test(text)                             ? 'simple_mask' :
    /cánula.*\d|nasal\s*\d/.test(text)              ? 'nasal_cannula' :
    'room_air';

  const activeInfusions: { drug: DrugId; rate: number }[] = [];
  if (/noradren|norepinefr/.test(text))   activeInfusions.push({ drug: 'noradrenaline', rate: 0.2 });
  if (/midazolam/.test(text))             activeInfusions.push({ drug: 'midazolam', rate: 5 });
  if (/fentanil|fentanyl/.test(text))     activeInfusions.push({ drug: 'fentanyl', rate: 50 });
  if (/propofol/.test(text))              activeInfusions.push({ drug: 'propofol', rate: 1.5 });
  if (/dexmedetomidina/.test(text))       activeInfusions.push({ drug: 'dexmedetomidine', rate: 0.5 });
  if (/dobutamina/.test(text))            activeInfusions.push({ drug: 'dobutamine', rate: 5 });
  if (/vasopres/.test(text))              activeInfusions.push({ drug: 'vasopressin', rate: 1.2 });
  if (/hidrocortis/.test(text))           activeInfusions.push({ drug: 'hydrocortisone', rate: 8 });

  const invasiveMonitoring: InvasiveMode =
    /picco|termodiluc/i.test(text) ? 'picco' :
    /línea arteri|art invasiv|cvc|catéter cent/i.test(text) ? 'art_cvp' :
    'none';

  return {
    respiratorySupport,
    activeInfusions,
    activeBoluses: [],
    icpCatheterPlaced: /catéter pic|picometría|dve|monitoriz.*pic/i.test(desc.neuro),
    invasiveMonitoring,
  };
}

// ─── Pre-admission context inference ─────────────────────────────────────────

function inferPreAdmissionContext(desc: CaseDescription): PreAdmissionContext {
  const text = Object.values(desc).join(' ').toLowerCase();
  if (/quirófano|post.*quirúrg|post.*operatorio|postoperat|intraoperat/.test(text)) return 'or';
  if (/traslado.*uci|uci.*remitid|otra uci|derivado.*ucip|inter.*hospit/.test(text)) return 'icu_other';
  if (/geriátrico|hogar.*ancian|residencia.*mayor|nursing/.test(text)) return 'nursing_home';
  if (/sala gral|planta|pisos|sala.*general|ward/.test(text)) return 'ward';
  if (/urgenc|guardia|shu|servic.*emerg/.test(text)) return 'er';
  return 'home';
}

const PRE_ADMISSION_NARRATIVES: Record<PreAdmissionContext, (age: number, reason: string) => string> = {
  er:          (age, r) => `Paciente de ${age} años ingresa desde urgencias por ${r}. Evaluado inicialmente por médico de guardia con triage nivel 1. Traído por familiares en ambulancia básica.`,
  or:          (age, r) => `Paciente de ${age} años proviene de quirófano tras ${r}. Anestesia general sin complicaciones intraoperatorias reportadas. Ingresa con monitorización invasiva ya establecida.`,
  ward:        (age, r) => `Paciente de ${age} años trasladado desde sala general por deterioro relacionado con ${r}. Internado 48h previas, con progresión de cuadro clínico pese a tratamiento inicial.`,
  home:        (age, r) => `Paciente de ${age} años sin internación previa reciente, consulta directamente por ${r}. Procedente de domicilio. Sin exposición hospitalaria significativa en los últimos 3 meses.`,
  icu_other:   (age, r) => `Paciente de ${age} años trasladado desde otra UCI por ${r}. Recibe soporte iniciado en centro de origen. Se adjunta epicrisis con evolución previa y antibioticoterapia vigente.`,
  nursing_home:(age, r) => `Paciente de ${age} años institucionalizado en geriátrico, ingresa por ${r}. Exposición prolongada a ambiente hospitalario-geriátrico; considerar gérmenes resistentes en cobertura empírica.`,
};

// ─── Category inference — SIEMPRE retorna valor no-null ──────────────────────

function inferCategory(allText: string): ClinicalCategory {
  if (/tce|gcs\s*[<≤]?\s*\d|hsa|stroke|ich|coma\b|meningit|encefalit|convulsi|epilepsi/i.test(allText)) return 'neuro';
  if (/quemadura|burn\b|inhalac.*humo|tbsa/i.test(allText)) return 'quemados';
  if (/politrauma|trauma.*múlt|aplastam|fractura.*múlt/i.test(allText)) return 'trauma';
  if (/sdra|ards|asma.*grave|status.*asma|epoc.*agud|insuf.*respir/i.test(allText)) return 'pneumo';
  if (/iam|stemi|nstemi|shock.*cardiogén|icc.*aguda|eap\b|edema.*agud.*pulm|tamponad|tep\b|embolia.*pulm/i.test(allText)) return 'cardio';
  if (/periton|laparotom|post.*quirúrg|abdomen.*abierto|dehiscencia|anastom/i.test(allText)) return 'cirugia';
  if (/dka|cetoacid|hhs|hipergluc.*coma|hiponatr|hipernatr|tormenta.*tiro|tiroides|adrenal|rabdomiolis|lisis.*tumor|hipopotas|hiperkale/i.test(allText)) return 'infecto';
  if (/sepsis|shock.*séptic|neumon|infec.*grave|bacteriem|funguemia/i.test(allText)) return 'infecto';
  return 'infecto';  // fallback más probable en UCI — nunca undefined
}

function inferTitle(allText: string, category: ClinicalCategory): string {
  const labels: Partial<Record<ClinicalCategory, string>> = {
    neuro: 'Caso Neurocrítico', infecto: 'Caso Infeccioso/Séptico',
    trauma: 'Caso Traumatológico', quemados: 'Caso Quemados',
    pneumo: 'Caso Respiratorio', cardio: 'Caso Cardiológico',
    cirugia: 'Caso Quirúrgico', general: 'Caso Clínico',
  };
  const firstLine = allText.split(/[.\n]/)[0]?.trim().slice(0, 60);
  return firstLine || labels[category] || 'Caso Clínico';
}

// ─── Derive initial vitals from inferred pathologies ─────────────────────────

function deriveVitalsFromPathologies(pathologies: ParsedPathology[]) {
  const base = {
    heartRate: 80, systolicBP: 120, diastolicBP: 70, meanArterialPressure: 87,
    respiratoryRate: 16, spo2: 96, temperature: 36.5, gcs: 15,
    paO2: 90, paCO2: 40, pH: 7.40, lactate: 1.0, urineOutput: 1.0, icp: 10,
  };

  pathologies.forEach(p => {
    const sev = clamp(0, 1, p.severity);
    switch (p.domain) {
      case 'sepsis':
        base.heartRate         += Math.round(25 * sev);
        base.systolicBP        -= Math.round(25 * sev);
        base.diastolicBP       -= Math.round(15 * sev);
        base.meanArterialPressure -= Math.round(18 * sev);
        base.lactate           += 3 * sev;
        base.temperature       += 1.5 * sev;
        base.respiratoryRate   += Math.round(8 * sev);
        break;
      case 'ards':
        base.spo2              -= Math.round(12 * sev);
        base.paO2              -= Math.round(35 * sev);
        base.respiratoryRate   += Math.round(10 * sev);
        break;
      case 'neuroCritical':
        base.gcs               -= Math.round(9 * sev);
        base.icp               += Math.round(18 * sev);
        break;
      case 'hemorrhagicShock':
        base.heartRate         += Math.round(40 * sev);
        base.systolicBP        -= Math.round(45 * sev);
        base.meanArterialPressure -= Math.round(30 * sev);
        base.lactate           += 4 * sev;
        break;
      case 'cardio':
        base.heartRate         += Math.round(20 * sev);
        base.systolicBP        -= Math.round(30 * sev);
        base.meanArterialPressure -= Math.round(20 * sev);
        base.lactate           += 3 * sev;
        break;
      case 'burn':
        base.heartRate         += Math.round(20 * sev);
        base.temperature       += 1.0 * sev;
        base.respiratoryRate   += Math.round(6 * sev);
        break;
      case 'pneumonia':
        base.spo2              -= Math.round(8 * sev);
        base.temperature       += 1.2 * sev;
        base.respiratoryRate   += Math.round(8 * sev);
        break;
      default: break;
    }
  });

  // Clamp all values to physiological bounds
  return {
    heartRate:            clamp(30, 200, base.heartRate),
    systolicBP:           clamp(50, 220, base.systolicBP),
    diastolicBP:          clamp(30, 130, base.diastolicBP),
    meanArterialPressure: clamp(40, 150, base.meanArterialPressure),
    respiratoryRate:      clamp(6, 50, base.respiratoryRate),
    spo2:                 clamp(60, 100, base.spo2),
    temperature:          clamp(33, 42, parseFloat(base.temperature.toFixed(1))),
    gcs:                  clamp(3, 15, Math.round(base.gcs)),
    paO2:                 clamp(35, 200, base.paO2),
    paCO2:                clamp(15, 90, base.paCO2),
    pH:                   clamp(6.90, 7.65, base.pH),
    lactate:              clamp(0.5, 20, parseFloat(base.lactate.toFixed(1))),
    urineOutput:          clamp(0, 5, base.urineOutput),
    icp:                  clamp(2, 60, base.icp),
  };
}

// ─── ProceduralPatientFactory ─────────────────────────────────────────────────

export class ProceduralPatientFactory {

  /**
   * Parsea narrativa clínica → ParsedCase determinístico.
   * No usa LLM; basado en keyword matching ponderado y regex.
   */
  static parse(desc: CaseDescription): ParsedCase {
    const allText   = Object.values(desc).join('\n').toLowerCase();
    const warnings: string[] = [];

    const inferredComorbidities = inferComorbidities(allText, warnings);
    const severityScore         = inferSeverity(allText);
    const difficulty            = Math.max(1, Math.min(10, Math.round(severityScore * 9 + 1)));
    const initialStability      = inferStability(severityScore);
    const inferredPathologies   = inferPathologies(desc);
    const preAdmissionManagement = inferPreAdmission(desc);

    const ageFound = extractAge(desc.antecedentes) ?? extractAge(desc.motivoIngreso);
    const ageMin = ageFound ?? 45;
    const ageMax = ageFound ?? 85;

    const preAdmContext = inferPreAdmissionContext(desc);
    const hospitalDays  = preAdmContext === 'icu_other' ? 5
      : preAdmContext === 'nursing_home' ? 0
      : preAdmContext === 'or' || preAdmContext === 'ward' ? 2 : 0;

    const baseProfile = generatePatient({
      forcedComorbidities: inferredComorbidities,
      ageMin,
      ageMax,
    });

    const mainReason = desc.motivoIngreso.slice(0, 60).toLowerCase();
    const preAdmNarrative = PRE_ADMISSION_NARRATIVES[preAdmContext](baseProfile.age, mainReason);

    const patientProfile: GeneratedPatient = {
      ...baseProfile,
      preAdmissionContext:  preAdmContext,
      hospitalExposureDays: hospitalDays,
      preAdmissionNarrative: preAdmNarrative,
    };

    if (inferredPathologies.length === 0) {
      warnings.push('No se detectaron patologías principales — se iniciará con estado basal.');
    }

    const category = inferCategory(allText);
    const title    = inferTitle(desc.motivoIngreso + ' ' + desc.antecedentes, category);

    return {
      patientProfile,
      difficulty,
      severityScore,
      inferredCategory: category,
      inferredTitle:    title,
      initialStability,
      inferredComorbidities,
      inferredPathologies,
      preAdmissionManagement,
      warnings,
    };
  }

  /**
   * Aplica un ParsedCase al simulador mediante el pipeline estándar de escenarios.
   * Construye un ScenarioDefinition completo → normalizeScenario → applyScenario.
   * NUNCA modifica stores directamente — delega en useScenarioStore.applyScenario.
   */
  static applyParsedCase(parsed: ParsedCase): void {
    console.group('[IMHOTEP·CUSTOM] applyParsedCase');
    console.time('[IMHOTEP·CUSTOM] total');
    try {
      console.log('[IMHOTEP·CUSTOM] ParsedCase:', {
        category: parsed.inferredCategory,
        pathologies: parsed.inferredPathologies.map(p => `${p.domain}:${p.subtype}(${p.severity.toFixed(2)})`),
        stability: parsed.initialStability,
        difficulty: parsed.difficulty,
      });

      // Construir ScenarioDefinition completo y normalizado
      const customScenarioDef: Partial<typeof parsed & ScenarioDefinition> = {
        id:          `custom_${Date.now()}`,
        name:        parsed.inferredTitle,
        category:    parsed.inferredCategory,
        description: parsed.patientProfile.clinicalSummary ?? '',
        baseSeverity: parsed.severityScore,

        pathologyConfigs: parsed.inferredPathologies.map(p => ({
          domain:       p.domain,
          subtype:      p.subtype ?? null,
          baseSeverity: isFinite(p.severity) ? clamp(0, 1, p.severity) : 0.5,
        })),

        initialVitals: deriveVitalsFromPathologies(parsed.inferredPathologies),

        isVentilatorConnected: parsed.preAdmissionManagement.respiratorySupport === 'arm',
        recommendedRespSupport: parsed.preAdmissionManagement.respiratorySupport !== 'arm'
          ? parsed.preAdmissionManagement.respiratorySupport
          : undefined,

        icpCatheterRequired: parsed.preAdmissionManagement.icpCatheterPlaced,
        tags: [parsed.inferredCategory, parsed.initialStability],
        clinicalNotes: `Caso generado proceduralmente. Stabilidad: ${parsed.initialStability}.`,
        references: ['ProceduralPatientFactory v1 — IMHOTEP UCI'],
      } as Partial<ScenarioDefinition>;

      // Normalizar — aplica defaults a campos faltantes
      const normalized = normalizeScenario(customScenarioDef);
      console.log('[IMHOTEP·CUSTOM] Normalized scenario:', normalized.id, 'cat:', normalized.category);

      // Inyectar en el store como si fuera un escenario seleccionado
      useScenarioStore.setState({
        activeScenario:  normalized,
        activePatient:   parsed.patientProfile,
        difficulty:      parsed.difficulty,
        launchError:     null,
      });

      // Disparar la misma pipeline que INICIAR CASO
      // launcherConfig undefined → inferido desde el escenario normalizado
      useScenarioStore.getState().applyScenario();

      console.log('[IMHOTEP·CUSTOM] ✓ applyScenario() dispatched — awaiting async completion');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[IMHOTEP·CUSTOM] ✗ Crash:', err);
      useScenarioStore.setState({ launchError: message });
    } finally {
      console.timeEnd('[IMHOTEP·CUSTOM] total');
      console.groupEnd();
    }
  }
}
