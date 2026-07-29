// src/utils/severityCurve.ts
//
// Logistic severity curve — maps [1..10] difficulty to effective severity.
//
// sev_eff = base × σ(0.6 × (d − 5.5))
//
// d=1:  ~3%   (docente)
// d=3:  ~14%  (rutinario)
// d=5:  ~40%  (complejo)
// d=7:  ~71%  (crítico)
// d=9:  ~93%  (catastrófico)
// d=10: ~97%

export function severityEffective(base: number, d: number): number {
  return base / (1 + Math.exp(-0.6 * (d - 5.5)));
}

/** Convenience: clamp d to [1,10] then apply curve */
export function clampedSeverity(base: number, d: number): number {
  return severityEffective(base, Math.max(1, Math.min(10, d)));
}

/** Map difficulty to a descriptive label + color */
export const DIFFICULTY_DESCRIPTORS: Record<number, { label: string; color: string }> = {
  1:  { label: 'Docente',      color: '#34d399' },
  2:  { label: 'Docente',      color: '#34d399' },
  3:  { label: 'Rutinario',    color: '#22d3ee' },
  4:  { label: 'Rutinario',    color: '#22d3ee' },
  5:  { label: 'Complejo',     color: '#fbbf24' },
  6:  { label: 'Complejo',     color: '#fbbf24' },
  7:  { label: 'Crítico',      color: '#f97316' },
  8:  { label: 'Crítico',      color: '#f97316' },
  9:  { label: 'Catastrófico', color: '#ef4444' },
  10: { label: 'Catastrófico', color: '#ef4444' },
};

export function getDifficultyDescriptor(d: number): { label: string; color: string } {
  const k = Math.max(1, Math.min(10, Math.round(d)));
  return DIFFICULTY_DESCRIPTORS[k] ?? { label: 'Complejo', color: '#fbbf24' };
}
