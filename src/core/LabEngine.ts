// LabEngine.ts v4
// Desafio 2: instantResults — readyAt = orderedAt cuando flag activo
// isLive extendido a todos los analitos criticos en trauma (Hb, Lactato, ABG)

import { usePatientStore }                       from '../store/usePatientStore';
import { useTimeStore }                          from '../store/useTimeStore';
import { usePathologyStore }                     from '../store/usePathologyStore';
import type { LabOrder, LabResult, LabCategory } from '../store/usePatientStore';
import { RBC_MASS_NORMAL }                       from '../store/usePatientStore';

interface LabDef {
  label:          string;
  category:       LabCategory;
  processingTime: number;
}

const LAB_REGISTRY: Record<string, LabDef> = {
  abg:        { label: 'Gases Arteriales (ABG)',           category: 'gases',    processingTime: 1800  },
  lactate:    { label: 'Lactato serico',                   category: 'gases',    processingTime: 900   },
  glucose_r:  { label: 'Glucemia rapida (POC)',             category: 'gases',    processingTime: 300   },
  cbc:        { label: 'Hemograma + Formula Leucocitaria', category: 'hema',     processingTime: 5400  },
  coag:       { label: 'Coagulacion (TP/KPTT/Fib)',        category: 'hema',     processingTime: 3600  },
  bmp:        { label: 'Perfil Metabolico Basico (BMP)',   category: 'quimica',  processingTime: 5400  },
  cmp:        { label: 'Perfil Metabolico Completo (CMP)', category: 'quimica',  processingTime: 5400  },
  renal:      { label: 'Perfil Renal',                     category: 'quimica',  processingTime: 5400  },
  ionogram:   { label: 'Ionograma (Na/K/Cl/Mg/Ca)',        category: 'quimica',  processingTime: 5400  },
  lft:        { label: 'Hepatograma completo',             category: 'quimica',  processingTime: 5400  },
  pancreatic: { label: 'Perfil Pancreatico (Amil/Lip)',    category: 'quimica',  processingTime: 5400  },
  magphos:    { label: 'Mg + Fosforo + Ca ionico',         category: 'quimica',  processingTime: 5400  },
  albumin:    { label: 'Albumina',                         category: 'quimica',  processingTime: 5400  },
  tni:        { label: 'Troponina I us (hsTnI)',            category: 'especial', processingTime: 3600  },
  bnp:        { label: 'NT-proBNP',                        category: 'especial', processingTime: 3600  },
  ddimer:     { label: 'Dimero-D',                         category: 'especial', processingTime: 3600  },
  pct:        { label: 'Procalcitonina',                   category: 'especial', processingTime: 14400 },
  crp:        { label: 'PCR cuantitativa',                 category: 'especial', processingTime: 5400  },
  cortisol:   { label: 'Cortisol basal',                   category: 'especial', processingTime: 14400 },
};

const HB_NORMAL = 14.0;
const BV_NORMAL = 5000;
const MCHC      = HB_NORMAL / 0.45;

function gauss(mean: number, sd: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(Math.max(1e-10, u1))) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function c2(v: number, lo: number, hi: number): number {
  return parseFloat(Math.max(lo, Math.min(hi, v)).toFixed(2));
}

function mergeLab(a: LabResult, b: LabResult): LabResult {
  return {
    values: { ...a.values, ...b.values },
    units:  { ...a.units,  ...b.units  },
    refs:   { ...a.refs,   ...b.refs   },
    flags:  { ...a.flags,  ...b.flags  },
  };
}

function calcHb(rbcMass: number, bv: number): number {
  if (bv <= 0) return 0;
  return MCHC * (rbcMass / bv);
}

function getSepsisS(): number {
  try {
    const state = usePathologyStore.getState();
    return state.sepsis.isActive ? state.sepsis.severity : 0;
  } catch { return 0; }
}

function getDilutionalAcidosisEffect(): number {
  try {
    const crystAccum = usePatientStore.getState().crystalloidAccumulated ?? 0;
    return Math.max(0, (crystAccum - 3000) / 1000) * 2.0;
  } catch { return 0; }
}

function genABG(s: Partial<Record<string, number>>, bv: number, rbc: number): LabResult {
  const dilAcid  = getDilutionalAcidosisEffect();
  const hco3Adj  = (s.hco3        ?? 24)   - dilAcid;
  const beAdj    = (s.baseExcess  ?? 0)    - dilAcid * 0.8;
  const pHAdj    = (s.pH          ?? 7.40) - dilAcid * 0.012;
  const pH       = gauss(pHAdj,             0.003);
  const pco2     = gauss(s.paCO2  ?? 40,   0.8  );
  const po2      = gauss(s.paO2   ?? 97,   1.5  );
  const hco3     = gauss(hco3Adj,           0.4  );
  const be       = gauss(beAdj,             0.3  );
  const lac      = gauss(s.lactate ?? 1.0, 0.08 );
  const sao2     = gauss(s.spo2   ?? 98,   0.4  );
  const hb       = gauss(calcHb(rbc, bv),  0.15 );
  return {
    values: {
      pH:      c2(pH,   6.80, 7.80),
      pCO2:    c2(pco2, 10,   120 ),
      pO2:     c2(po2,  20,   600 ),
      HCO3:    c2(hco3, 5,    45  ),
      BE:      c2(be,   -30,  30  ),
      Lactato: c2(lac,  0.3,  20  ),
      SaO2:    c2(sao2, 50,   100 ),
      Hb:      c2(hb,   1,    20  ),
    },
    units: { pH: '', pCO2: 'mmHg', pO2: 'mmHg', HCO3: 'mEq/L', BE: 'mEq/L', Lactato: 'mmol/L', SaO2: '%', Hb: 'g/dL' },
    refs:  { pH: '7.35-7.45', pCO2: '35-45', pO2: '80-100', HCO3: '22-26', BE: '-2 a +2', Lactato: '0.5-1.5', SaO2: '95-100', Hb: '12-17' },
    flags: {
      pH:      pH < 7.20 ? 'C' : pH < 7.35   ? 'L' : pH > 7.45   ? 'H' : '',
      pCO2:    pco2 > 45 ? 'H' : pco2 < 35   ? 'L' : '',
      pO2:     po2 < 40  ? 'C' : po2 < 60    ? 'L' : '',
      HCO3:    hco3 < 18 ? 'C' : hco3 < 22   ? 'L' : hco3 > 26   ? 'H' : '',
      BE:      be < -6   ? 'C' : be < -3      ? 'L' : be > 3       ? 'H' : '',
      Lactato: lac > 4   ? 'C' : lac > 2      ? 'H' : '',
      SaO2:    sao2 < 80 ? 'C' : sao2 < 90   ? 'L' : '',
      Hb:      hb < 6    ? 'C' : hb < 8      ? 'L' : hb > 17      ? 'H' : '',
    },
  };
}

function genCBC(s: Partial<Record<string, number>>, bv: number, rbc: number, sepsisS: number): LabResult {
  const hbReal = gauss(calcHb(rbc, bv), 0.2);
  const hct    = gauss(hbReal / MCHC * 100, 0.8);
  const leukopenia = sepsisS > 0.75 && Math.random() < 0.12;
  const wbc    = Math.max(0.3, leukopenia ? gauss(2.5, 0.4) : gauss(7.5 + sepsisS * 17, 1.2));
  const plt    = gauss(200 - sepsisS * 100, 20);
  const neutR  = Math.max(0.01, 0.60 + sepsisS * 0.28 + gauss(0, 0.02));
  const lymphR = Math.max(0.01, 0.30 - sepsisS * 0.25 + gauss(0, 0.02));
  const monoR  = Math.max(0.01, 0.06 + gauss(0, 0.01));
  const eosiR  = Math.max(0.00, 0.03 - sepsisS * 0.028 + gauss(0, 0.003));
  const cayR   = Math.max(0.00, 0.01 + sepsisS * 0.12  + gauss(0, 0.008));
  const sum    = neutR + lymphR + monoR + eosiR + cayR;
  const neut = (neutR  / sum) * 100;
  const linf = (lymphR / sum) * 100;
  const mono = (monoR  / sum) * 100;
  const eosi = (eosiR  / sum) * 100;
  const cay  = (cayR   / sum) * 100;
  return {
    values: {
      Hb: c2(hbReal,1,22), Hct: c2(hct,3,66), 'WBC total': c2(wbc,0.3,100), Plaquetas: c2(plt,5,800),
      'Neutrof. %': parseFloat(neut.toFixed(1)), 'Linfoc. %': parseFloat(linf.toFixed(1)),
      'Monocit. %': parseFloat(mono.toFixed(1)), 'Eosinof. %': parseFloat(eosi.toFixed(1)),
      'Cayados %':  parseFloat(cay.toFixed(1)),
    },
    units: { Hb: 'g/dL', Hct: '%', 'WBC total': 'K/uL', Plaquetas: 'K/uL', 'Neutrof. %': '%', 'Linfoc. %': '%', 'Monocit. %': '%', 'Eosinof. %': '%', 'Cayados %': '%' },
    refs:  { Hb: '12-17', Hct: '37-50', 'WBC total': '4.5-11', Plaquetas: '150-400', 'Neutrof. %': '50-70', 'Linfoc. %': '20-40', 'Monocit. %': '2-8', 'Eosinof. %': '1-4', 'Cayados %': '0-5' },
    flags: {
      Hb:           hbReal < 6 ? 'C' : hbReal < 8 ? 'L' : hbReal > 17 ? 'H' : '',
      Hct:          hct < 18   ? 'C' : hct < 27   ? 'L' : '',
      'WBC total':  wbc > 30   ? 'C' : wbc > 11   ? 'H' : wbc < 4    ? 'L' : wbc < 2 ? 'C' : '',
      Plaquetas:    plt < 50   ? 'C' : plt < 100   ? 'L' : plt > 450  ? 'H' : '',
      'Neutrof. %': neut > 85  ? 'H' : neut < 40  ? 'L' : '',
      'Linfoc. %':  linf < 5   ? 'C' : linf < 10  ? 'L' : '',
      'Monocit. %': '', 'Eosinof. %': eosi < 0.5 && sepsisS > 0.2 ? 'L' : '',
      'Cayados %':  cay > 20   ? 'C' : cay > 10   ? 'H' : '',
    },
  };
}

function genCoag(s: Partial<Record<string, number>>): LabResult {
  const stress = Math.max(0, (70 - (s.meanArterialPressure ?? 90)) * 0.02);
  const inr  = gauss(1.0 + stress, 0.05);
  const tp   = gauss(12 + stress * 3, 0.3);
  const kptt = gauss(30, 1.5);
  const fib  = gauss(350, 20);
  return {
    values: { TP: c2(tp,8,60), INR: c2(inr,0.8,8), KPTT: c2(kptt,20,150), Fibrinogeno: c2(fib,50,800) },
    units:  { TP: 's', INR: '', KPTT: 's', Fibrinogeno: 'mg/dL' },
    refs:   { TP: '11-13.5', INR: '0.9-1.1', KPTT: '25-35', Fibrinogeno: '200-400' },
    flags:  { INR: inr > 2.0 ? 'C' : inr > 1.5 ? 'H' : '', KPTT: kptt > 40 ? 'H' : '', Fibrinogeno: fib < 100 ? 'C' : fib < 150 ? 'L' : fib > 500 ? 'H' : '', TP: tp > 15 ? 'H' : '' },
  };
}

function genBMP(s: Partial<Record<string, number>>, bv: number): LabResult {
  const uo     = s.urineOutput ?? 1.0;
  const crBase = uo < 0.3 ? 3.5 : uo < 0.5 ? 2.0 : uo < 1.0 ? 1.2 : 0.9;
  const cr     = gauss(crBase, 0.12);
  const bun    = gauss(cr * 15, 1.2);
  const urea   = gauss(bun * 2.14, 2.0);
  const kAdj   = Math.max(0, (7.40 - (s.pH ?? 7.40)) * 6);
  const k      = gauss(4.0 + kAdj, 0.12);
  const naAdj  = -((bv - BV_NORMAL) / 2000);
  const na     = gauss(140 + naAdj, 0.5);
  const cl     = gauss(104, 0.6);
  const co2    = gauss(s.hco3 ?? 24, 0.4);
  const glc    = gauss(90, 6);
  return {
    values: { Na: c2(na,110,165), K: c2(k,2,7.5), Cl: c2(cl,85,120), CO2: c2(co2,10,40), BUN: c2(bun,3,120), Urea: c2(urea,6,260), Creatinina: c2(cr,0.3,15), Glucosa: c2(glc,30,600) },
    units:  { Na: 'mEq/L', K: 'mEq/L', Cl: 'mEq/L', CO2: 'mEq/L', BUN: 'mg/dL', Urea: 'mg/dL', Creatinina: 'mg/dL', Glucosa: 'mg/dL' },
    refs:   { Na: '136-145', K: '3.5-5.0', Cl: '98-106', CO2: '22-29', BUN: '7-20', Urea: '15-43', Creatinina: '0.6-1.1', Glucosa: '70-100' },
    flags: {
      Na:         na < 125   ? 'C' : na < 135   ? 'L' : na > 155   ? 'C' : na > 145  ? 'H' : '',
      K:          k  < 3.0   ? 'C' : k  < 3.5   ? 'L' : k  > 6.0   ? 'C' : k  > 5.0  ? 'H' : '',
      Cl:         cl > 115   ? 'H' : cl < 95    ? 'L' : '',
      CO2:        co2 < 22   ? 'L' : co2 > 29   ? 'H' : '',
      BUN:        bun > 60   ? 'C' : bun > 25   ? 'H' : '',
      Urea:       urea > 130 ? 'C' : urea > 55  ? 'H' : '',
      Creatinina: cr > 3.0   ? 'C' : cr > 1.5   ? 'H' : '',
      Glucosa:    glc < 55   ? 'C' : glc < 70   ? 'L' : glc > 180  ? 'H' : '',
    },
  };
}

function genRenal(s: Partial<Record<string, number>>): LabResult {
  const uo     = s.urineOutput ?? 1.0;
  const crBase = uo < 0.3 ? 3.5 : uo < 0.5 ? 2.2 : uo < 1.0 ? 1.4 : 0.9;
  const cr     = gauss(crBase, 0.12);
  const bun    = gauss(cr * 15, 1.2);
  const urea   = gauss(bun * 2.14, 2.0);
  const egfr   = Math.round(Math.min(130, Math.max(2, 100 / Math.max(0.3, cr))));
  return {
    values: { Creatinina: c2(cr,0.3,15), BUN: c2(bun,3,120), Urea: c2(urea,6,260), eGFR: egfr },
    units:  { Creatinina: 'mg/dL', BUN: 'mg/dL', Urea: 'mg/dL', eGFR: 'mL/min/1.73m2' },
    refs:   { Creatinina: '0.6-1.1', BUN: '7-20', Urea: '15-43', eGFR: 'mayor de 60' },
    flags:  { Creatinina: cr > 3.5 ? 'C' : cr > 1.5 ? 'H' : '', BUN: bun > 60 ? 'C' : bun > 25 ? 'H' : '', Urea: urea > 130 ? 'C' : urea > 55 ? 'H' : '', eGFR: egfr < 15 ? 'C' : egfr < 30 ? 'H' : egfr < 60 ? 'L' : '' },
  };
}

function genIonogram(s: Partial<Record<string, number>>, sepsisS: number, bv: number): LabResult {
  const na  = gauss(140 - sepsisS * 8  - (BV_NORMAL - bv) / 1500, 0.6);
  const k   = gauss(4.0 - sepsisS * 0.6 + Math.max(0, (7.40-(s.pH??7.40))*5), 0.12);
  const cl  = gauss(104 + sepsisS * 3, 0.7);
  const mg  = gauss(1.9 - sepsisS * 0.55, 0.08);
  const caT = gauss(2.35 - sepsisS * 0.45, 0.06);
  const caI = gauss(1.20 - sepsisS * 0.30, 0.04);
  return {
    values: { Sodio: c2(na,110,165), Potasio: c2(k,1.5,7.5), Cloro: c2(cl,85,125), Magnesio: c2(mg,0.3,4.0), 'Ca total': c2(caT,1.5,3.5), 'Ca ionico': c2(caI,0.5,1.8) },
    units:  { Sodio: 'mEq/L', Potasio: 'mEq/L', Cloro: 'mEq/L', Magnesio: 'mEq/L', 'Ca total': 'mmol/L', 'Ca ionico': 'mmol/L' },
    refs:   { Sodio: '136-145', Potasio: '3.5-5.0', Cloro: '98-106', Magnesio: '1.5-2.5', 'Ca total': '2.12-2.62', 'Ca ionico': '1.10-1.35' },
    flags: {
      Sodio:      na < 125   ? 'C' : na < 135   ? 'L' : na > 155  ? 'C' : na > 145  ? 'H' : '',
      Potasio:    k  < 3.0   ? 'C' : k  < 3.5   ? 'L' : k  > 6.0  ? 'C' : k  > 5.0  ? 'H' : '',
      Cloro:      cl > 115   ? 'H' : cl < 95    ? 'L' : '',
      Magnesio:   mg < 0.8   ? 'C' : mg < 1.5   ? 'L' : mg > 3.0  ? 'C' : mg > 2.5  ? 'H' : '',
      'Ca total': caT < 1.8  ? 'C' : caT < 2.12 ? 'L' : caT > 2.8 ? 'H' : '',
      'Ca ionico':caI < 0.8  ? 'C' : caI < 1.1  ? 'L' : caI > 1.4 ? 'H' : '',
    },
  };
}

function genLFT(s: Partial<Record<string, number>>, sepsisS: number): LabResult {
  const map    = s.meanArterialPressure ?? 90;
  const stress = Math.max(0, (70 - map) * 0.5) ** 1.4;
  const ast    = gauss(25 + stress * 18, 4);
  const alt    = gauss(20 + stress * 14, 3);
  const bilT   = gauss(0.8 + sepsisS * 1.8, 0.08);
  const bilD   = gauss(bilT * (0.15 + sepsisS * 0.35), 0.04);
  const alb    = gauss(4.0 - sepsisS * 0.5, 0.1);
  const ggt    = gauss(30 + sepsisS * 70, 5);
  return {
    values: { AST: c2(ast,5,5000), ALT: c2(alt,5,5000), 'Bilirrubina T': c2(bilT,0.1,30), 'Bilirrubina D': c2(bilD,0.0,20), GGT: c2(ggt,5,500), Albumina: c2(alb,1.5,5.5) },
    units:  { AST: 'U/L', ALT: 'U/L', 'Bilirrubina T': 'mg/dL', 'Bilirrubina D': 'mg/dL', GGT: 'U/L', Albumina: 'g/dL' },
    refs:   { AST: '10-40', ALT: '7-40', 'Bilirrubina T': '0.2-1.2', 'Bilirrubina D': '0.0-0.3', GGT: '9-48', Albumina: '3.5-5.0' },
    flags: {
      AST:             ast > 500  ? 'C' : ast > 40   ? 'H' : '',
      ALT:             alt > 500  ? 'C' : alt > 40   ? 'H' : '',
      'Bilirrubina T': bilT > 5.0 ? 'C' : bilT > 1.5 ? 'H' : '',
      'Bilirrubina D': bilD > 2.0 ? 'C' : bilD > 0.4 ? 'H' : '',
      GGT:             ggt > 120  ? 'H' : '',
      Albumina:        alb < 2.5  ? 'C' : alb < 3.0  ? 'L' : '',
    },
  };
}

function genPancreatic(sepsisS: number): LabResult {
  const amil = gauss(70 + sepsisS * 130, 12);
  const lip  = gauss(35 + sepsisS * 75, 8);
  return {
    values: { Amilasa: c2(amil,5,3000), Lipasa: c2(lip,3,2000) },
    units:  { Amilasa: 'U/L', Lipasa: 'U/L' },
    refs:   { Amilasa: '30-110', Lipasa: '13-60' },
    flags:  { Amilasa: amil > 330 ? 'C' : amil > 110 ? 'H' : '', Lipasa: lip > 180 ? 'C' : lip > 60 ? 'H' : '' },
  };
}

function genPCT(sepsisS: number): LabResult {
  const pctBase = 0.08 + sepsisS * sepsisS * 18;
  const pct     = gauss(pctBase, pctBase * 0.12);
  return {
    values: { Procalcitonina: c2(pct, 0.01, 500) },
    units:  { Procalcitonina: 'ng/mL' },
    refs:   { Procalcitonina: 'menor de 0.25 (sin infeccion)' },
    flags:  { Procalcitonina: pct > 10 ? 'C' : pct > 2 ? 'H' : pct > 0.5 ? 'L' : '' },
  };
}

function genCRP(sepsisS: number): LabResult {
  const crpBase = 3 + sepsisS * sepsisS * 380;
  const crp     = gauss(crpBase, crpBase * 0.10);
  return {
    values: { PCR: c2(crp, 0.1, 500) },
    units:  { PCR: 'mg/L' },
    refs:   { PCR: 'menor de 5' },
    flags:  { PCR: crp > 200 ? 'C' : crp > 50 ? 'H' : crp > 10 ? 'L' : '' },
  };
}

function genSimple(key: string, baseVal: number, unit: string, ref: string, lo: number, hi: number, critHi: number): LabResult {
  const v    = gauss(baseVal, baseVal * 0.05);
  const flag: 'H'|'L'|'C'|'' = v > critHi ? 'C' : v > hi ? 'H' : v < lo ? 'L' : '';
  return {
    values: { [key]: c2(v, lo * 0.3, critHi * 3) },
    units:  { [key]: unit },
    refs:   { [key]: ref },
    flags:  { [key]: flag },
  };
}

export class LabEngine {
  private static instance: LabEngine | null = null;
  private constructor() {}

  public static getInstance(): LabEngine {
    if (LabEngine.instance === null) LabEngine.instance = new LabEngine();
    return LabEngine.instance;
  }

  public placeOrder(type: string): void {
    const def = LAB_REGISTRY[type];
    if (!def) return;
    const pat  = usePatientStore.getState();
    const time = useTimeStore.getState();

    // Desafio 2: si instantResults activo, readyAt = orderedAt (resultado en proximo tick)
    const now     = time.simulatedElapsed;
    const readyAt = pat.instantResults ? now : now + def.processingTime;

    const order: LabOrder = {
      id:               'lab_' + type + '_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
      type,
      label:            def.label,
      category:         def.category,
      orderedAt:        now,
      readyAt,
      result:           null,
      snapshot:         { ...pat.vitals },
      bloodVolume:      pat.bloodVolume,
      redBloodCellMass: pat.redBloodCellMass ?? (pat.bloodVolume * 0.45),
    };
    pat.addLabOrder(order);
  }

  /**
   * Rutina de ingreso UCI (10 estudios).
   * Cubre gasometría, hemograma, crasis, BMP, ionograma, albúmina, PCR, PCT, lactato, glucemia.
   * Basado en SATI Algoritmo de Ingreso UCI 2023.
   */
  public orderRoutineAdmission(): void {
    const ROUTINE: string[] = [
      'abg',       // Gases arteriales
      'lactate',   // Lactato sérico
      'glucose_r', // Glucemia rápida (POC)
      'cbc',       // Hemograma + fórmula leucocitaria
      'coag',      // Coagulación (TP/KPTT/Fibrinógeno)
      'bmp',       // Perfil metabólico básico
      'ionogram',  // Ionograma (Na/K/Cl/Mg/Ca)
      'albumin',   // Albúmina
      'crp',       // PCR cuantitativa
      'pct',       // Procalcitonina
    ];
    ROUTINE.forEach(t => this.placeOrder(t));
  }

  public update(): void {
    const pat  = usePatientStore.getState();
    const time = useTimeStore.getState();
    const now  = time.simulatedElapsed;
    pat.labOrders
      .filter((o) => o.result === null && now >= o.readyAt)
      .forEach((o) => pat.fulfillLabOrder(o.id, this.generateResult(o)));
  }

  private generateResult(order: LabOrder): LabResult {
    const patState = usePatientStore.getState();
    // ABG, Lactato y CBC son siempre live (valores actuales) para reflejar
    // hemodilución y shock en tiempo real — especialmente crítico en trauma
    const isLive   = ['abg', 'lactate', 'cbc'].includes(order.type);
    const s        = isLive
      ? patState.vitals as unknown as Partial<Record<string, number>>
      : order.snapshot  as unknown as Partial<Record<string, number>>;
    const bv       = isLive ? patState.bloodVolume      : order.bloodVolume;
    const rbc      = isLive
      ? (patState.redBloodCellMass ?? bv * 0.45)
      : (order.redBloodCellMass    ?? bv * 0.45);
    const sepsisS  = getSepsisS();

    switch (order.type) {
      case 'abg':   return genABG(s, bv, rbc);

      case 'lactate': {
        const lac = gauss(s.lactate ?? 1.0, 0.08);
        return {
          values: { Lactato: c2(lac, 0.3, 20) },
          units:  { Lactato: 'mmol/L' },
          refs:   { Lactato: '0.5-1.5' },
          flags:  { Lactato: lac > 4 ? 'C' : lac > 2 ? 'H' : '' },
        };
      }

      case 'glucose_r': return genSimple('Glucosa', 90, 'mg/dL', '70-100', 70, 180, 400);
      case 'cbc':       return genCBC(s, bv, rbc, sepsisS);
      case 'coag':      return genCoag(s);
      case 'bmp':       return genBMP(s, bv);
      case 'cmp':       return mergeLab(genBMP(s, bv), genLFT(s, sepsisS));
      case 'renal':     return genRenal(s);
      case 'ionogram':  return genIonogram(s, sepsisS, bv);
      case 'lft':       return genLFT(s, sepsisS);
      case 'pancreatic':return genPancreatic(sepsisS);

      case 'magphos': return {
        values: { Magnesio: c2(gauss(1.9-sepsisS*0.5,0.10),0.5,4.0), Fosforo: c2(gauss(3.5,0.20),0.5,8.0), 'Ca ionico': c2(gauss(1.2-sepsisS*0.3,0.05),0.5,1.8) },
        units:  { Magnesio: 'mEq/L', Fosforo: 'mg/dL', 'Ca ionico': 'mmol/L' },
        refs:   { Magnesio: '1.5-2.5', Fosforo: '2.5-4.5', 'Ca ionico': '1.1-1.35' },
        flags:  { Magnesio: '', Fosforo: '', 'Ca ionico': '' },
      };

      case 'albumin': return genSimple('Albumina', 4.0 - sepsisS*0.5, 'g/dL', '3.5-5.0', 1.5, 5.0, 99);
      case 'tni':     return genSimple('hsTnI', 0.005, 'ng/mL', 'menor de 0.026', 0, 0.026, 0.5);

      case 'bnp': {
        const bnpBase = 80 + Math.max(0, ((s.cvp??8) - 8) * 20) + sepsisS * 200;
        const bnp     = gauss(bnpBase, bnpBase * 0.12);
        return {
          values: { 'NT-proBNP': Math.max(10, Math.round(bnp)) },
          units:  { 'NT-proBNP': 'pg/mL' },
          refs:   { 'NT-proBNP': 'menor de 300' },
          flags:  { 'NT-proBNP': bnp > 1800 ? 'C' : bnp > 300 ? 'H' : '' },
        };
      }

      case 'ddimer':   return genSimple('Dimero-D', 250 + sepsisS*800, 'ng/mL FEU', 'menor de 500', 0, 500, 2000);
      case 'pct':      return genPCT(sepsisS);
      case 'crp':      return genCRP(sepsisS);

      case 'cortisol': {
        const cortBase = sepsisS > 0.60 ? gauss(9, 2.5) : gauss(16, 3);
        return {
          values: { Cortisol: c2(cortBase, 0.5, 80) },
          units:  { Cortisol: 'ug/dL' },
          refs:   { Cortisol: '5-25 (estres mayor de 18)' },
          flags:  { Cortisol: cortBase < 10 && sepsisS > 0.5 ? 'C' : cortBase < 5 ? 'L' : cortBase > 50 ? 'H' : '' },
        };
      }

      default: return { values: {}, units: {}, refs: {}, flags: {} };
    }
  }
}