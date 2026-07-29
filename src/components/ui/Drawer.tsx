// src/components/ui/Drawer.tsx
//
// Portal-based slide-in drawer for PiCCO, InstructorPanel, InfectologyModal, etc.
// Renders into document.body via createPortal to escape stacking context.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type DrawerSide = 'right' | 'left' | 'bottom';

interface DrawerProps {
  open:      boolean;
  onClose:   () => void;
  title?:    string;
  side?:     DrawerSide;
  width?:    number | string;
  /** Additional class applied to the drawer panel */
  className?: string;
  children:  React.ReactNode;
}

const SLIDE_IN: Record<DrawerSide, string> = {
  right:  'translate-x-0',
  left:   'translate-x-0',
  bottom: 'translate-y-0',
};
const SLIDE_OUT: Record<DrawerSide, string> = {
  right:  'translate-x-full',
  left:   '-translate-x-full',
  bottom: 'translate-y-full',
};
const POSITION: Record<DrawerSide, string> = {
  right:  'top-0 right-0 h-full',
  left:   'top-0 left-0 h-full',
  bottom: 'bottom-0 left-0 w-full',
};

export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 420,
  className = '',
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Trap focus inside drawer when open
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { prev?.focus(); };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const widthStyle = side === 'bottom'
    ? {}
    : { width: typeof width === 'number' ? `${width}px` : width };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[500] transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`fixed z-[510] flex flex-col overflow-hidden outline-none transition-transform duration-300 ease-out ${POSITION[side]} ${open ? SLIDE_IN[side] : SLIDE_OUT[side]} ${className}`}
        style={{
          ...widthStyle,
          background: '#080d1a',
          borderLeft: side === 'right' ? '1px solid rgba(255,255,255,0.08)' : undefined,
          borderRight: side === 'left' ? '1px solid rgba(255,255,255,0.08)' : undefined,
          borderTop: side === 'bottom' ? '1px solid rgba(255,255,255,0.08)' : undefined,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0">
            <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-300">
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-200 transition-colors text-base leading-none cursor-pointer"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}

export default Drawer;
