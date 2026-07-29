// src/components/CrashFallback.tsx
//
// Pantalla visible cuando el estado de la simulación es inconsistente.
// Reemplaza el redirect silencioso — muestra mensaje + botón de retorno.

import React from 'react';

interface Props {
  title:    string;
  message:  string;
  detail?:  string;
  onReturn: () => void;
  returnLabel?: string;
}

export const CrashFallback: React.FC<Props> = ({
  title, message, detail, onReturn, returnLabel = 'Volver al selector',
}) => (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center"
    style={{ background: '#040810' }}
  >
    <div
      className="max-w-lg w-full mx-6 rounded-2xl border border-red-800/50 p-8"
      style={{ background: '#0a0f1e' }}
    >
      <div className="text-red-400 text-[0.5rem] font-black uppercase tracking-[0.2em] mb-2">
        ⚠ Error de simulación
      </div>
      <div className="text-white text-lg font-bold mb-3">{title}</div>
      <div className="text-slate-300 text-[0.6rem] leading-relaxed mb-4">{message}</div>

      {detail && (
        <details className="mb-4">
          <summary className="text-slate-500 text-[0.48rem] cursor-pointer hover:text-slate-300 transition-colors">
            Stack trace (para diagnóstico)
          </summary>
          <pre className="mt-2 text-[0.38rem] text-red-400/70 font-mono overflow-x-auto bg-black/40 rounded p-3 max-h-40 overflow-y-auto">
            {detail}
          </pre>
        </details>
      )}

      <button
        type="button"
        onClick={onReturn}
        className="w-full py-3 rounded-xl font-mono font-black text-[0.65rem] tracking-[0.15em] uppercase cursor-pointer transition-all"
        style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #1e40af' }}
      >
        ← {returnLabel}
      </button>

      <div className="text-center text-slate-700 text-[0.4rem] font-mono mt-4">
        Revise la consola del navegador para logs [IMHOTEP·LAUNCH]
      </div>
    </div>
  </div>
);

export default CrashFallback;
