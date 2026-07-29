// src/core/ImagingEngine.ts
//
// Esqueleto multimodal de diagnóstico por imagen simulado.
// Genera findings narrativos basados en patologías activas.
// Slot reservado para futura expansión con SVG procedural y PNG sintética.
//
// Filosofía:
//   - requestStudy() retorna Promise → simula tiempo de adquisición real
//   - Cada modalidad tiene latencia sim (Rx 5min, TC 30min, Eco 5-15min)
//   - Findings auto-derivados de PathologyStore activo
//   - imageUrl y imageSvgComponent reservados para versión con renders

import { usePathologyStore }    from '../store/usePathologyStore';
import { usePatientStore }      from '../store/usePatientStore';
import { useTimeStore }         from '../store/useTimeStore';
import { create }               from 'zustand';

// ─── Zustand store (reactive UI bridge) ──────────────────────────────────────

export interface ImagingStoreState {
  completed: ImagingFinding[];
  pending:   ImagingFinding[];
  addPending:    (f: ImagingFinding) => void;
  addCompleted:  (f: ImagingFinding) => void;
  removePending: (id: string) => void;
  clearAll:      () => void;
}

export const useImagingStore = create<ImagingStoreState>((set) => ({
  completed: [],
  pending:   [],
  addPending:    (f) => set(s => ({ pending:   [...s.pending, f] })),
  addCompleted:  (f) => set(s => ({ completed: [...s.completed.slice(-49), f] })),
  removePending: (id) => set(s => ({ pending: s.pending.filter(p => p.id !== id) })),
  clearAll:      () => set({ completed: [], pending: [] }),
}));

// ─── Public types ─────────────────────────────────────────────────────────────

export type ImagingModality =
  | 'cxr'                  // Radiografía tórax
  | 'ct_thorax'            // TC tórax
  | 'ct_abdomen'           // TC abdomen
  | 'ct_brain'             // TC cerebro
  | 'us_lung'              // Ecografía pulmonar (BLUE protocol)
  | 'us_focused_cardiac'   // FOCUS — Foco Cardiaco (FEER, FEEL)
  | 'us_abdominal'         // Ecografía abdominal (FAST)
  | 'tee'                  // Ecocardiograma transesofágico
  | 'tte'                  // Ecocardiograma transtorácico
  | 'doppler_tcd';         // Doppler transcraneal

export const MODALITY_LABELS: Record<ImagingModality, string> = {
  cxr:                 'Radiografía de Tórax',
  ct_thorax:           'TC Tórax',
  ct_abdomen:          'TC Abdomen',
  ct_brain:            'TC Cerebro',
  us_lung:             'Eco Pulmonar (BLUE)',
  us_focused_cardiac:  'FOCUS Cardíaco',
  us_abdominal:        'Eco Abdominal (FAST)',
  tee:                 'ETE',
  tte:                 'ETT',
  doppler_tcd:         'Doppler TCD',
};

/** Latencia en segundos simulados antes de que el reporte esté disponible */
export const MODALITY_DELAY_S: Record<ImagingModality, number> = {
  cxr:                  5 * 60,
  ct_thorax:           30 * 60,
  ct_abdomen:          30 * 60,
  ct_brain:            20 * 60,
  us_lung:              5 * 60,
  us_focused_cardiac:  10 * 60,
  us_abdominal:         8 * 60,
  tee:                 30 * 60,
  tte:                 15 * 60,
  doppler_tcd:         10 * 60,
};

export interface ImagingFinding {
  id:          string;
  modality:    ImagingModality;
  description: string;
  pathologyTags: string[];
  pertinentToActivePathology: boolean;
  /** Tick simulado en que se completó el estudio */
  timestamp:   number;
  /** Slot para imagen sintética futura (PNG/SVG URL) */
  imageUrl?:   string;
  /** Nombre de componente React para SVG procedural futuro */
  imageSvgComponent?: string;
}

// ─── Narrative generators ─────────────────────────────────────────────────────

function describeFindings(modality: ImagingModality): {
  description: string;
  tags: string[];
} {
  const path = usePathologyStore.getState();
  const pat  = usePatientStore.getState();
  const v    = pat.vitals;

  const ardsActive    = path.ards.diagnosis !== 'none';
  const ardsSeverity  = path.ards.diagnosis;
  const sepsisActive  = path.sepsis.isActive;
  const pfRatio       = v.pfRatio ?? 300;
  const proneActive   = path.ards.proneActive;

  switch (modality) {
    case 'cxr': {
      const tags: string[] = [];
      let desc = 'Radiografía de tórax portátil AP: ';
      if (ardsActive) {
        tags.push('bilateral_infiltrates');
        desc += `Opacidades alveolares difusas bilaterales. Patrón compatible con SDRA ${ardsSeverity} (Berlin 2012). `;
        if (pfRatio < 100) { tags.push('severe_consolidation'); desc += 'Consolidación extensa bilateral. '; }
      } else if (sepsisActive) {
        tags.push('focal_infiltrate');
        desc += 'Infiltrado focal basal derecho, probable neumonía. ';
      } else {
        desc += 'Sin condensaciones patológicas significativas. Silueta cardíaca dentro de límites normales. ';
      }
      if (proneActive) desc += 'Paciente en decúbito prono. ';
      if (v.evlwi && v.evlwi > 10) { tags.push('pulmonary_edema'); desc += 'Signos de edema pulmonar (EVLWI > 10). '; }
      desc += 'Catéter central en posición adecuada.';
      return { description: desc, tags };
    }

    case 'ct_thorax': {
      const tags: string[] = [];
      let desc = 'TC tórax c/c: ';
      if (ardsActive) {
        tags.push('ground_glass_opacities', 'bilateral_consolidation');
        desc += `Vidrio esmerilado bilateral de distribución difusa. Consolidaciones dependientes. SDRA ${ardsSeverity}. `;
        if (path.ards.proneActive) desc += 'Redistribución dorsoventral por decúbito prono. ';
      }
      if (sepsisActive) {
        tags.push('focal_consolidation');
        desc += 'Área de consolidación segmentaria con broncograma aéreo. Diagnóstico diferencial: neumonía. ';
      }
      desc += 'Sin derrame pleural significativo. Sin neumotórax.';
      return { description: desc, tags };
    }

    case 'ct_brain': {
      const gcs = v.gcs ?? 15;
      const icp = v.icp ?? 10;
      const tags: string[] = [];
      let desc = 'TC cerebro s/c: ';
      if (path.neuroCritical.isActive) {
        tags.push('intracranial_abnormality');
        if (icp > 20) { tags.push('elevated_icp', 'mass_effect'); desc += 'Edema cerebral difuso con borramiento de surcos y cisuras. '; }
        if (gcs <= 8)  { desc += 'Correlaciona con compromiso clínico severo (GCS ≤8). '; }
      } else {
        desc += 'Sin lesiones intracraneanas agudas. Ventrículos de tamaño normal. Sin efecto de masa. ';
      }
      desc += 'Sin hemorragia subaracnoidea visible.';
      return { description: desc, tags };
    }

    case 'us_lung': {
      const tags: string[] = [];
      let desc = 'Eco pulmonar (protocolo BLUE): ';
      if (ardsActive) {
        tags.push('b_lines', 'bilateral_consolidation_us');
        desc += 'Líneas B confluentes bilaterales en todos los campos. Consolidación posterior bilateral. Sin lung sliding en base derecha (considerar atelectasia). ';
      } else {
        tags.push('a_lines');
        desc += 'Patrón A bilateral. Lung sliding presente. Sin derrame pleural. ';
      }
      return { description: desc, tags };
    }

    case 'us_focused_cardiac':
    case 'tte': {
      const co = v.cardiacOutput ?? 5;
      const tags: string[] = [];
      let desc = `${modality === 'tte' ? 'ETT' : 'FOCUS cardíaco'}: `;
      desc += `GC estimado ${co.toFixed(1)} L/min. `;
      if (co < 2.5) { tags.push('low_output_state'); desc += 'Función sistólica deprimida. VD dilatado con VCI plena. '; }
      if (path.sepsis.isActive && path.sepsis.severity > 0.6) {
        tags.push('hyperdynamic_state');
        desc += 'Estado hiperdinámico compatible con sepsis. ';
      }
      desc += 'Sin derrame pericárdico significativo.';
      return { description: desc, tags };
    }

    case 'us_abdominal': {
      const tags: string[] = [];
      let desc = 'Eco FAST extendido: ';
      if (path.sepsis.isActive) {
        tags.push('abdominal_free_fluid');
        desc += 'Líquido libre escaso en goteras paracólicas bilaterales. ';
      } else {
        desc += 'Sin líquido libre intraabdominal. ';
      }
      desc += 'Hígado y bazo sin lesiones focales evidentes. No ascitis.';
      return { description: desc, tags };
    }

    case 'doppler_tcd': {
      const icp = v.icp ?? 10;
      const tags: string[] = [];
      let desc = 'Doppler transcraneal ACM bilateral: ';
      if (icp > 25) {
        tags.push('elevated_icp_doppler', 'vasospasm_risk');
        desc += `IP elevado (>1.4) bilateral — sospecha HIC (PIC estimada ${icp} mmHg). Ondas de baja velocidad diastólica. `;
      } else {
        desc += 'Velocidades de flujo normales. IP bilateral < 1.2. Sin vasospasmo. ';
      }
      return { description: desc, tags };
    }

    default: {
      return { description: 'Estudio pendiente de interpretación especializada.', tags: [] };
    }
  }
}

// ─── Engine singleton ─────────────────────────────────────────────────────────

let studyCounter = 0;

export class ImagingEngine {
  private static instance: ImagingEngine | null = null;
  private pendingStudies: ImagingFinding[] = [];
  private completedStudies: ImagingFinding[] = [];

  static getInstance(): ImagingEngine {
    if (!ImagingEngine.instance) ImagingEngine.instance = new ImagingEngine();
    return ImagingEngine.instance;
  }

  private constructor() {}

  public getCompletedStudies(): ImagingFinding[] {
    return this.completedStudies;
  }

  public getPendingStudies(): ImagingFinding[] {
    return this.pendingStudies;
  }

  /**
   * Solicita un estudio de imagen.
   * Retorna Promise que resuelve tras latencia sim proporcional a la modalidad.
   * En caso de uso educativo, la latencia real es acortada por speedMultiplier.
   */
  public requestStudy(modality: ImagingModality): Promise<ImagingFinding> {
    const tickNow    = useTimeStore.getState().ticks;
    const speed      = useTimeStore.getState().speedMultiplier;
    const delayMs    = (MODALITY_DELAY_S[modality] * 1000) / Math.max(1, speed);
    const id         = `img_${++studyCounter}_${modality}_${tickNow}`;

    // Create placeholder for pending list
    const placeholder: ImagingFinding = {
      id, modality,
      description: 'Estudio en proceso…',
      pathologyTags: [],
      pertinentToActivePathology: false,
      timestamp: tickNow,
    };
    this.pendingStudies = [...this.pendingStudies, placeholder];
    useImagingStore.getState().addPending(placeholder);

    return new Promise((resolve) => {
      setTimeout(() => {
        const { description, tags } = describeFindings(modality);
        const finding: ImagingFinding = {
          id,
          modality,
          description,
          pathologyTags: tags,
          pertinentToActivePathology: tags.length > 0,
          timestamp: useTimeStore.getState().ticks,
          imageUrl: undefined,
          imageSvgComponent: undefined,
        };
        this.completedStudies = [...this.completedStudies.slice(-49), finding];
        this.pendingStudies   = this.pendingStudies.filter(p => p.id !== id);
        useImagingStore.getState().addCompleted(finding);
        useImagingStore.getState().removePending(id);
        resolve(finding);
      }, Math.min(delayMs, 30_000)); // cap at 30s real for usability
    });
  }

  public reset(): void {
    this.pendingStudies   = [];
    this.completedStudies = [];
    useImagingStore.getState().clearAll();
  }
}
