import React from 'react';

interface Props {
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  pao2Fio2Ratio?: number; // Lo hacemos opcional para que no explote si no llega
}

export const ARDSStatusBar: React.FC<Props> = ({ severity, pao2Fio2Ratio = 400 }) => {
  const severityConfig = {
    none: { color: 'bg-green-500', label: 'NORMAL' },
    mild: { color: 'bg-yellow-500', label: 'LEVE' },
    moderate: { color: 'bg-orange-500', label: 'MODERADO' },
    severe: { color: 'bg-red-600', label: 'SEVERO' },
  };

  const { color: barColor, label: severityLabel } = severityConfig[severity] || severityConfig.none;

  // Defensa extra: nos aseguramos de que sea un número válido antes de hacer matemáticas
  const safeRatio = typeof pao2Fio2Ratio === 'number' && !isNaN(pao2Fio2Ratio) ? pao2Fio2Ratio : 400;
  const percentage = Math.min(100, Math.max(0, (safeRatio / 500) * 100));

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 w-full font-sans">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-gray-300 font-bold uppercase tracking-wider text-sm">Estado SDRA (Kirby)</h3>
        <span className={`px-2 py-1 rounded text-xs font-bold text-white shadow-sm ${barColor}`}>
          {severityLabel}
        </span>
      </div>

      <div className="w-full bg-gray-900 rounded-full h-3 relative overflow-hidden border border-gray-600">
        {/* eslint-disable-next-line react/forbid-dom-props */}
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-in-out ${barColor}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={safeRatio}
          aria-valuemin={0}
          aria-valuemax={500}
          aria-label="Relación PaO2/FiO2"
        />
      </div>

      <div className="mt-2 text-right">
        <span className="text-gray-400 text-xs font-mono">PaO2/FiO2: </span>
        <span className="text-white font-bold font-mono text-sm">{safeRatio.toFixed(0)}</span>
      </div>
    </div>
  );
};