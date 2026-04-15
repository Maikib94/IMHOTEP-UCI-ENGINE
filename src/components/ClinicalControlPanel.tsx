import React, { useState } from 'react';
import { usePharmacologyStore, DrugId } from '../store/usePharmacologyStore';

export default function ClinicalControlPanel() {
  const [activeTab, setActiveTab] = useState('hemo');

  const infusionRates = usePharmacologyStore(state => state.infusionRates);
  const setInfusionRate = usePharmacologyStore(state => state.setInfusionRate);

  const getDose = (d: DrugId) => infusionRates[d] || 0;
  const setDose = (d: DrugId) => (val: number) => setInfusionRate(d, val);

  // Escalas Clínicas
  const [rass, setRass] = useState(0);
  const [gcs, setGcs] = useState(15);

  const renderControl = (
    label: string, 
    value: number, 
    setter: (val: number) => void, 
    unit: string, 
    step: number = 0.05,
    colorTheme: 'cyan' | 'red' | 'orange' | 'yellow' | 'blue' | 'emerald' = 'cyan'
  ) => {
    const isActive = value > 0;
    
    // Safely mapping tailwind classes since dynamic concatenation can fail purging, though here it's fine for development. 
    // We use explict strings just in case.
    const colors = {
      cyan: { bg: 'bg-cyan-500', shadow: 'shadow-[0_0_10px_rgba(6,182,212,0.6)]', text: 'text-cyan-400', input: 'text-cyan-300 focus:border-cyan-500' },
      red: { bg: 'bg-red-600', shadow: 'shadow-[0_0_10px_rgba(220,38,38,0.6)]', text: 'text-red-600', input: 'text-red-400 focus:border-red-600' },
      orange: { bg: 'bg-orange-500', shadow: 'shadow-[0_0_10px_rgba(249,115,22,0.6)]', text: 'text-orange-500', input: 'text-orange-400 focus:border-orange-500' },
      yellow: { bg: 'bg-yellow-400', shadow: 'shadow-[0_0_10px_rgba(250,204,21,0.6)]', text: 'text-yellow-400', input: 'text-yellow-300 focus:border-yellow-400' },
      blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.6)]', text: 'text-blue-500', input: 'text-blue-400 focus:border-blue-500' },
      emerald: { bg: 'bg-emerald-400', shadow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]', text: 'text-emerald-400', input: 'text-emerald-300 focus:border-emerald-400' },
    };
    const t = colors[colorTheme];

    return (
      <div className="flex items-center justify-between bg-[#0f172a] p-2 rounded-lg border border-white/5 mb-2 hover:border-white/10 transition-colors">
        <div className="flex items-center gap-3">
          {/* Neon Switch */}
          <button 
            onClick={() => setter(isActive ? 0 : step)}
            className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isActive ? `${t.bg} ${t.shadow}` : 'bg-slate-700'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${isActive ? t.text : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="number" 
            value={value === 0 ? '' : Number(value).toFixed(2)}
            placeholder="0.00"
            step={step}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setter(isNaN(val) ? 0 : val);
            }}
            className={`w-16 bg-[#1e293b] text-right text-xs border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none font-mono shadow-inner placeholder-slate-600 ${t.input}`}
          />
          <span className="text-[0.5rem] text-slate-500 w-12 shrink-0">{unit}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden rounded-xl">
      {/* Tabs Menu */}
      <div className="flex border-b border-slate-800 shrink-0 bg-[#060a12]/50">
        <button 
          onClick={() => setActiveTab('hemo')} 
          className={`flex-1 py-3 text-[8px] font-bold tracking-widest transition-all duration-300 relative ${activeTab === 'hemo' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          HEMO
          {activeTab === 'hemo' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_-2px_8px_rgba(34,211,238,0.8)]" />}
        </button>
        <button 
          onClick={() => setActiveTab('sedacion')} 
          className={`flex-1 py-3 text-[8px] font-bold tracking-widest transition-all duration-300 relative ${activeTab === 'sedacion' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          SED/ANALG
          {activeTab === 'sedacion' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_-2px_8px_rgba(34,211,238,0.8)]" />}
        </button>
        <button 
          onClick={() => setActiveTab('neuro')} 
          className={`flex-1 py-3 text-[8px] font-bold tracking-widest transition-all duration-300 relative ${activeTab === 'neuro' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          NEURO
          {activeTab === 'neuro' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_-2px_8px_rgba(34,211,238,0.8)]" />}
        </button>
        <button 
          onClick={() => setActiveTab('infecto')} 
          className={`flex-1 py-3 text-[8px] font-bold tracking-widest transition-all duration-300 relative ${activeTab === 'infecto' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          INFECT/LAB
          {activeTab === 'infecto' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_-2px_8px_rgba(34,211,238,0.8)]" />}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {activeTab === 'hemo' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* VASOPRESORES */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-red-600 tracking-widest">VASOPRESORES</div>
              </div>
              {renderControl('Noradrenalina', getDose('noradrenaline'), setDose('noradrenaline'), 'mcg/kg/m', 0.05, 'red')}
              {renderControl('Adrenalina', getDose('adrenaline'), setDose('adrenaline'), 'mcg/kg/m', 0.05, 'red')}
              {renderControl('Vasopresina', getDose('vasopressin'), setDose('vasopressin'), 'U/h', 0.01, 'red')}
              {renderControl('Azul de M.', getDose('methylene_blue'), setDose('methylene_blue'), 'mg/kg/h', 1.0, 'red')}
            </div>

            {/* INOTRÓPICOS */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-orange-500 tracking-widest">INOTRÓPICOS</div>
              </div>
              {renderControl('Dobutamina', getDose('dobutamine'), setDose('dobutamine'), 'mcg/kg/m', 1.0, 'orange')}
              {renderControl('Dopamina', getDose('dopamine'), setDose('dopamine'), 'mcg/kg/m', 1.0, 'orange')}
              {renderControl('Milrinona', getDose('milrinone'), setDose('milrinone'), 'mcg/kg/m', 0.1, 'orange')}
              {renderControl('Levosimendan', getDose('levosimendan'), setDose('levosimendan'), 'mcg/kg/m', 0.05, 'orange')}
            </div>
          </div>
        )}

        {activeTab === 'sedacion' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* ESCALA RASS */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">ESCALA RASS</div>
                <div className="text-cyan-400 font-bold text-xs font-mono">{rass > 0 ? `+${rass}` : rass}</div>
              </div>
              <input 
                type="range" min="-5" max="4" step="1" value={rass}
                onChange={(e) => setRass(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[0.55rem] text-slate-500 mt-1 font-mono">
                <span>-5 (No Resp)</span>
                <span>0 (Alerta)</span>
                <span>+4 (Combativo)</span>
              </div>
            </div>

            {/* SEDANTES */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-yellow-400 tracking-widest">SEDANTES</div>
              </div>
              {renderControl('Propofol', getDose('propofol'), setDose('propofol'), 'mg/kg/h', 0.5, 'yellow')}
              {renderControl('Midazolam', getDose('midazolam'), setDose('midazolam'), 'mg/kg/h', 0.5, 'yellow')}
              {renderControl('Ketamina', getDose('ketamine'), setDose('ketamine'), 'mg/kg/h', 0.5, 'yellow')}
              {renderControl('Dexmedetomi.', getDose('dexmedetomidine'), setDose('dexmedetomidine'), 'mcg/kg/h', 0.1, 'yellow')}
              {renderControl('Tiopental', getDose('thiopental'), setDose('thiopental'), 'mg/kg/h', 1.0, 'yellow')}
            </div>

            {/* ANALGÉSICOS */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-blue-500 tracking-widest">ANALGÉSICOS</div>
              </div>
              {renderControl('Morfina', getDose('morphine'), setDose('morphine'), 'mg/h', 1.0, 'blue')}
              {renderControl('Fentanilo', getDose('fentanyl'), setDose('fentanyl'), 'mcg/kg/h', 0.5, 'blue')}
              {renderControl('Remifentan.', getDose('remifentanil'), setDose('remifentanil'), 'mcg/kg/m', 0.05, 'blue')}
            </div>

            {/* BLOQUEO NEUROMUSCULAR */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-emerald-400 tracking-widest">BNM (RELAAJANTES)</div>
              </div>
              {renderControl('Atracurio', getDose('atracurium'), setDose('atracurium'), 'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Cisatracurio', getDose('cisatracurium'), setDose('cisatracurium'), 'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Rocuronio', getDose('rocuronium'), setDose('rocuronium'), 'mg/kg/h', 0.1, 'emerald')}
              {renderControl('Pancuronio', getDose('pancuronium'), setDose('pancuronium'), 'mg/kg/h', 0.1, 'emerald')}
            </div>
          </div>
        )}

        {activeTab === 'neuro' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* ESCALA DE GLASGOW */}
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">ESCALA DE GLASGOW (GCS)</div>
                <div className="text-cyan-400 font-bold text-xs font-mono">{gcs}/15</div>
              </div>
              <input 
                type="range" min="3" max="15" step="1" value={gcs}
                onChange={(e) => setGcs(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[0.55rem] text-slate-500 mt-1 font-mono">
                <span>3 (Coma/Muerte)</span>
                <span>8 (Intubar)</span>
                <span>15 (Normal)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'infecto' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">BIOMARCADORES DE SEPSIS</div>
              </div>
              <div className="space-y-2">
                <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2.5 flex justify-between items-center relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                  <span className="text-[0.65rem] font-bold text-slate-400 ml-2">Lactato</span>
                  <div className="flex items-end gap-1">
                    <span className="text-xs font-black text-white font-mono leading-none">2.4</span>
                    <span className="text-[10px] text-slate-500 leading-none">mmol/L</span>
                  </div>
                </div>
                <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2.5 flex justify-between items-center relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500"></div>
                  <span className="text-[0.65rem] font-bold text-slate-400 ml-2">PCR</span>
                  <div className="flex items-end gap-1">
                    <span className="text-xs font-black text-white font-mono leading-none">145</span>
                    <span className="text-[10px] text-slate-500 leading-none">mg/L</span>
                  </div>
                </div>
                <div className="bg-[#0f172a] border border-white/5 rounded-lg p-2.5 flex justify-between items-center relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500"></div>
                  <span className="text-[0.65rem] font-bold text-slate-400 ml-2">Procalcitonina</span>
                  <div className="flex items-end gap-1">
                    <span className="text-xs font-black text-white font-mono leading-none">12.5</span>
                    <span className="text-[10px] text-slate-500 leading-none">ng/mL</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0b1120] p-3 rounded-xl border border-white/5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>
                <div className="text-[0.55rem] font-black text-slate-300 tracking-widest">CULTIVOS</div>
              </div>
              <div className="bg-[#0f172a] border border-emerald-900/30 rounded-lg p-3 relative hover:border-emerald-500/30 transition-colors">
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div className="text-[0.55rem] font-bold text-emerald-400 mb-1 tracking-wider uppercase">Hemocultivo x2 (24h)</div>
                <div className="text-[10px] text-slate-300 font-medium">Cocáceas Gram Positivas en racimos.</div>
                <div className="text-[0.65rem] text-slate-500 mt-1">Pendiente tipificación y antibiograma.</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
      `}} />
    </div>
  );
}
