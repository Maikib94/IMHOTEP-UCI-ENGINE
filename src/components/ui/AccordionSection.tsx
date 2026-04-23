// src/components/ui/AccordionSection.tsx
// Sección colapsable con animación grid (sin librerías externas).
// El estado expanded/collapsed persiste en usePatientStore.UIState.

import React, { type ReactNode, useCallback } from 'react';
import { usePatientStore } from '../../store/usePatientStore';
import styles from './AccordionSection.module.css';

export interface AccordionSectionProps {
  readonly id: string;
  readonly title: string;
  readonly badge?: string;
  readonly defaultExpanded?: boolean;
  readonly children: ReactNode;
  readonly accentColor?: string;
  readonly dotColor?: string;
}

export default function AccordionSection({
  id,
  title,
  badge,
  defaultExpanded = false,
  children,
  accentColor = '#64748b',
  dotColor,
}: AccordionSectionProps) {
  const expanded = usePatientStore(s => s.accordionExpanded[id] ?? defaultExpanded);
  const setAccordionExpanded = usePatientStore(s => s.setAccordionExpanded);

  const toggle = useCallback(() => {
    setAccordionExpanded(id, !expanded);
  }, [id, expanded, setAccordionExpanded]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }, [toggle]);

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div
        role="button"
        aria-expanded={expanded}
        aria-controls={`accordion-body-${id}`}
        tabIndex={0}
        className={styles.header}
        onClick={toggle}
        onKeyDown={onKeyDown}
        style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {dotColor && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              backgroundColor: dotColor,
              boxShadow: `0 0 5px ${dotColor}`,
            }} />
          )}
          <span style={{
            fontSize: '0.5rem',
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: expanded ? accentColor : '#475569',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontSize: '0.38rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 99,
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#94a3b8',
              letterSpacing: '0.05em',
              fontFamily: 'monospace',
            }}>
              {badge}
            </span>
          )}
        </div>
        <span
          className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}
          style={{ fontSize: '0.6rem' }}
          aria-hidden="true"
        >
          ›
        </span>
      </div>

      {/* Body */}
      <div
        id={`accordion-body-${id}`}
        className={`${styles.grid} ${expanded ? styles.expanded : ''}`}
      >
        <div className={styles.inner}>
          {children}
        </div>
      </div>
    </div>
  );
}
