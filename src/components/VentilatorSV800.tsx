import React, { useState } from 'react';
import { VentilatorSettings, LungMechanics } from '../core/RespiratoryEngine';

interface Props {
    settings: VentilatorSettings;
    mechanics: LungMechanics;
    onSettingsChange: (s: Partial<VentilatorSettings>) => void;
    onRecruit: () => void;
}

export const VentilatorSV800: React.FC<Props> = ({ settings, mechanics, onSettingsChange, onRecruit }) => {
    const [tab, setTab] = useState<'vent' | 'tools'>('vent');

    return (
        <div className="bg-black text-white p-4 rounded-xl border-4 border-gray-700 w-full max-w-4xl shadow-2xl font-sans">
            <div className="flex justify-between items-center border-b border-gray-600 pb-2 mb-4">
                <h2 className="text-teal-400 font-bold italic text-2xl">Mindray SV800</h2>
                <div className="bg-gray-800 px-4 py-1 rounded text-green-400 font-mono text-xl border border-green-900">
                    MODO: {settings.mode}
                </div>
            </div>

            <div className="flex gap-6">
                {/* Monitor de Valores Digitales */}
                <div className="grid grid-cols-2 gap-4 w-1/3 bg-gray-900 p-4 rounded-lg">
                    <ValBox label="Ppeak" val={mechanics.pPeak} unit="cmH2O" alert={mechanics.pPeak > 35} />
                    <ValBox label="Pplat" val={mechanics.pPlat} unit="cmH2O" alert={mechanics.pPlat > 30} />
                    <ValBox label="Vte" val={settings.vt} unit="ml" />
                    <ValBox label="Cstat" val={mechanics.compliance} unit="ml/cmH" alert={mechanics.compliance < 25} />
                    <ValBox label="AutoPEEP" val={mechanics.autoPeep} unit="cmH2O" alert={mechanics.autoPeep > 2} />
                    <ValBox label="Pmean" val={mechanics.pMean} unit="cmH2O" />
                </div>

                {/* Panel de Control y Herramientas */}
                <div className="flex-1 flex flex-col gap-4">
                    <div className="flex gap-2">
                        <button onClick={() => setTab('vent')} className={`flex-1 py-2 rounded transition-colors ${tab === 'vent' ? 'bg-teal-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Ajustes</button>
                        <button onClick={() => setTab('tools')} className={`flex-1 py-2 rounded transition-colors ${tab === 'tools' ? 'bg-orange-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Herramientas Especiales</button>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg flex-1">
                        {tab === 'vent' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <Knob id="fio2-input" label="FiO2" val={settings.fio2 * 100} unit="%" onChange={(v: number) => onSettingsChange({ fio2: v / 100 })} />
                                <Knob id="peep-input" label="PEEP" val={settings.peep} unit="cmH" onChange={(v: number) => onSettingsChange({ peep: v })} />
                                <Knob id="vt-input" label="Vt" val={settings.vt} unit="ml" onChange={(v: number) => onSettingsChange({ vt: v })} />
                                <Knob id="rr-input" label="Freq" val={settings.rr} unit="min" onChange={(v: number) => onSettingsChange({ rr: v })} />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6">
                                <div className="flex justify-around text-center">
                                    <div>
                                        <p className="text-gray-400 text-sm">P0.1 (Drive)</p>
                                        <p className={`text-3xl font-bold ${mechanics.p01 > 4 ? 'text-red-500' : 'text-white'}`}>{mechanics.p01.toFixed(1)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">Tobin (RSBI)</p>
                                        <p className={`text-3xl font-bold ${mechanics.rsbi > 105 ? 'text-red-500' : 'text-green-400'}`}>{mechanics.rsbi.toFixed(0)}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onRecruit}
                                    className="w-full bg-red-700 hover:bg-red-600 py-4 rounded-lg font-bold text-xl uppercase tracking-widest shadow-lg transition-colors"
                                >
                                    Maniobra de Reclutamiento (40x40)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ValBox = ({ label, val, unit, alert }: any) => (
    <div className={`p-2 rounded ${alert ? 'bg-red-950 border border-red-500' : 'bg-black border border-transparent'}`}>
        <p className="text-xs text-gray-500 uppercase">{label}</p>
        <p className={`text-2xl font-bold ${alert ? 'text-red-500 animate-pulse' : 'text-teal-400'}`}>
            {typeof val === 'number' ? val.toFixed(0) : val}
            <span className="text-xs ml-1 text-gray-600">{unit}</span>
        </p>
    </div>
);

// Knob actualizado para a11y (accesibilidad)
const Knob = ({ id, label, val, unit, onChange }: any) => (
    <div className="flex flex-col items-center bg-gray-900 p-2 rounded border border-gray-700 focus-within:border-teal-500 transition-colors">
        <label htmlFor={id} className="text-xs text-teal-600 font-bold mb-1 cursor-pointer">{label}</label>
        <div className="flex items-baseline">
            <input
                id={id}
                type="number"
                value={val}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-16 bg-transparent text-xl text-white font-bold text-center outline-none"
                aria-label={`Ajustar ${label}`}
            />
            <span className="text-xs text-gray-500 ml-1">{unit}</span>
        </div>
    </div>
);