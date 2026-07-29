// src/i18n/LanguageContext.tsx
// Provider + hook de configuración de idioma y modo de visualización de dosis.

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { UI_LABELS_ES } from './clinicalLabels.es';

const STORAGE_KEY = 'imhotep.ui.dosemode';

export type DoseDisplayMode = 'native' | 'cch' | 'both';

interface LanguageState {
  uiLanguage:       'es';
  doseDisplayMode:  DoseDisplayMode;
  setDoseDisplayMode: (m: DoseDisplayMode) => void;
  /** Traduce una clave al ES; retorna la clave si no existe (fallback seguro) */
  t: (key: string) => string;
}

const LanguageCtx = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [doseDisplayMode, setDoseModeState] = useState<DoseDisplayMode>(() => {
    const saved = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    return (saved === 'native' || saved === 'cch' || saved === 'both')
      ? saved
      : 'both';
  });

  const setDoseDisplayMode = useCallback((m: DoseDisplayMode) => {
    setDoseModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* Safari private mode */ }
  }, []);

  const t = useCallback((key: string): string => {
    return UI_LABELS_ES[key] ?? key;
  }, []);

  const value = useMemo<LanguageState>(() => ({
    uiLanguage: 'es',
    doseDisplayMode,
    setDoseDisplayMode,
    t,
  }), [doseDisplayMode, setDoseDisplayMode, t]);

  return <LanguageCtx.Provider value={value}>{children}</LanguageCtx.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageCtx);
  if (!ctx) {
    // Fallback seguro si se usa fuera del Provider
    return {
      uiLanguage: 'es',
      doseDisplayMode: 'both',
      setDoseDisplayMode: () => {},
      t: (k) => UI_LABELS_ES[k] ?? k,
    };
  }
  return ctx;
}
