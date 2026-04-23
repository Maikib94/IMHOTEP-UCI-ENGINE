// src/components/clinical/NeuroScalesPanel.tsx — RASS / GCS / CPOT (solo display)
import React from 'react';
import { usePharmacologyStore } from '../../store/usePharmacologyStore';
import { usePatientStore } from '../../store/usePatientStore';
import { ProgressBar } from './drugControls';

function computeRASS(sedation: number, analgesia: number): number {
  const combined = sedation + analgesia * 0.3;
  if (combined >= 1.1) return -5;
  if (combined >= 0.9) return -4;
  if (combined >= 0.7) return -3;
  if (combined >= 0.5) return -2;
  if (combined >= 0.3) return -1;
  return 0;
}

function rassLabel(r: number): string {
  const map: Record<string, string> = {
    '5': 'Combativo', '0': 'Alerta/Calmado',
    '-1': 'Somnoliento', '-2': 'Sed. Leve', '-3': 'Sed. Mod.',
    '-4': 'Sed. Prof.', '-5': 'Sin Resp.',
  };
  return map[String(r)] ?? '—';
}

function rassColorClass(r: number): string {
  if (r <= -3) return 'bg-blue-600';
  if (r <= -1) return 'bg-cyan-500';
  if (r === 0) return 'bg-emerald-400';
  if (r <= 2)  return 'bg-yellow-400';
  return 'bg-red-500';
}

function rassTextClass(r: number): string {
  if (r <= -3) return 'text-blue-400';
  if (r <= -1) return 'text-cyan-400';
  if (r === 0) return 'text-emerald-400';
  if (r <= 2)  return 'text-yellow-400';
  return 'text-red-400';
}

function decomposeGCS(gcs: number): { E: number; V: number; M: number } {
  if (gcs >= 15) return { E: 4, V: 5, M: 6 };
  if (gcs === 14) return { E: 4, V: 4, M: 6 };
  if (gcs === 13) return { E: 3, V: 4, M: 6 };
  if (gcs === 12) return { E: 3, V: 4, M: 5 };
  if (gcs === 11) return { E: 3, V: 3, M: 5 };
  if (gcs === 10) return { E: 3, V: 3, M: 4 };
  if (gcs === 9)  return { E: 2, V: 3, M: 4 };
  if (gcs === 8)  return { E: 2, V: 2, M: 4 };
  if (gcs === 7)  return { E: 2, V: 2, M: 3 };
  if (gcs === 6)  return { E: 1, V: 2, M: 3 };
  if (gcs === 5)  return { E: 1, V: 1, M: 3 };
  if (gcs === 4)  return { E: 1, V: 1, M: 2 };
  return { E: 1, V: 1, M: 1 };
}

function computeCPOT(analgesia: number, sedation: number, nmba: number): number {
  const supp = Math.min(1, analgesia * 0.65 + sedation * 0.25 + nmba * 0.1);
  return Math.max(0, Math.round(8 * (1 - supp)));
}

export default function NeuroScalesPanel() {
  const { sedation, analgesia, nmba } = usePharmacologyStore(s => s.systemicEffects);
  const gcs = usePatientStore(s => s.vitals.gcs);

  const rass      = computeRASS(sedation, analgesia);
  const rassPct   = ((rass + 5) / 9) * 100;
  const gcsDecomp = decomposeGCS(gcs);
  const cpot      = computeCPOT(analgesia, sedation, nmba);
  const cpotActive = sedation > 0.05 || nmba > 0.05;

  return (
    <div className="p-3 space-y-3">
      {/* RASS */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">RASS</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black font-mono ${rassTextClass(rass)}`}>
              {rass > 0 ? `+${rass}` : rass}
            </span>
            <span className="text-[0.5rem] text-slate-500">{rassLabel(rass)}</span>
          </div>
        </div>
        <ProgressBar value={rassPct} max={100} colorClass={rassColorClass(rass)} />
      </div>

      {/* GCS */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[0.55rem] font-bold text-slate-400 uppercase tracking-wider">GCS</span>
          <span className={`text-xs font-black font-mono ${gcs <= 8 ? 'text-red-400' : gcs <= 12 ? 'text-yellow-400' : 'text-cyan-400'}`}>
            {gcs}/15
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { label: 'OCULAR (E)', val: gcsDecomp.E, max: 4, border: 'border-blue-900/60', text: 'text-blue-400' },
            { label: 'VERBAL (V)', val: gcsDecomp.V, max: 5, border: 'border-cyan-900/60', text: 'text-cyan-400' },
            { label: 'MOTOR (M)',  val: gcsDecomp.M, max: 6, border: 'border-teal-900/60', text: 'text-teal-400' },
          ]).map(({ label, val, max, border, text }) => (
            <div key={label} className={`bg-[#0f172a] border ${border} rounded-lg p-1.5 text-center`}>
              <div className="text-[0.4rem] font-bold text-slate-500 mb-0.5">{label}</div>
              <div className={`text-sm font-black font-mono ${text}`}>
                {val}<span className="text-[0.5rem] text-slate-600">/{max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CPOT */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${cpotActive ? 'text-slate-400' : 'text-slate-600'}`}>
            CPOT (Dolor)
          </span>
          {cpotActive ? (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black font-mono ${cpot <= 2 ? 'text-emerald-400' : cpot <= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                {cpot}/8
              </span>
              <span className="text-[0.5rem] text-slate-500">
                {cpot <= 2 ? 'Sin Dolor' : cpot <= 5 ? 'Moderado' : 'Severo'}
              </span>
            </div>
          ) : (
            <span className="text-[0.5rem] text-slate-600 italic">— / 8</span>
          )}
        </div>
        {cpotActive && (
          <ProgressBar
            value={cpot} max={8}
            colorClass={cpot <= 2 ? 'bg-emerald-400' : cpot <= 5 ? 'bg-yellow-400' : 'bg-red-500'}
          />
        )}
      </div>
    </div>
  );
}
