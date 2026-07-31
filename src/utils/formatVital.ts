// src/utils/formatVital.ts
//
// NOTA (C1.5/C1.7): tambien existe src/utils/formatVitalByKey.ts — firma
// distinta (key: keyof Vitals, value) que busca decimales por campo en una
// tabla; este archivo usa (value, {min,max,digits,unit}) con clamp explicito.
// No son intercambiables, no unificar sin avisar a los consumidores.
//
// Formateador seguro de signos vitales con clamp obligatorio.
// Evita la concatenación rota que produce "1101pm" (FC=110 + unit "lpm" sin espacio).
//
// Uso correcto:
//   <span>{formatVital(vitals.heartRate, { min: 20, max: 250 })}</span>
//   <span className="...unit-class">lpm</span>
//
// NUNCA hacer: <span>{vitals.heartRate}{unit}</span>

export interface FormatVitalOpts {
  min:     number;
  max:     number;
  digits?: number;   // decimal places (default 0)
  unit?:   string;   // si se especifica, añade espacio + unidad (para casos de display rápido)
}

/**
 * Clampea `value` a [min, max], lo formatea con `digits` decimales.
 * Devuelve '--' para NaN/Infinity.
 * Si `opts.unit` se especifica, añade " {unit}" al resultado.
 */
export function formatVital(value: number, opts: FormatVitalOpts): string {
  if (!isFinite(value)) return '--';
  const clamped = Math.max(opts.min, Math.min(opts.max, value));
  const formatted = clamped.toFixed(opts.digits ?? 0);
  return opts.unit != null ? `${formatted} ${opts.unit}` : formatted;
}
