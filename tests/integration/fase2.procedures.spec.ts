// tests/integration/fase2.procedures.spec.ts — FASE 2
import { describe, it, expect } from 'vitest';
import { usePatientStore }  from '../../src/store/usePatientStore';
import { usePathologyStore } from '../../src/store/usePathologyStore';

describe('usePatientStore.procedures', () => {
  it('INITIAL_PROCEDURES: arterialLine=false, picMonitor=false, urinaryCatheter=true', () => {
    const p = usePatientStore.getState().procedures;
    expect(p.arterialLine).toBe(false);
    expect(p.picMonitor).toBe(false);
    expect(p.urinaryCatheter).toBe(true);
  });

  it('setProcedure("arterialLine", true) actualiza solo ese flag', () => {
    const pat = usePatientStore.getState();
    pat.setProcedure('arterialLine', true);
    const p = usePatientStore.getState().procedures;
    expect(p.arterialLine).toBe(true);
    expect(p.picMonitor).toBe(false); // unchanged
    expect(p.urinaryCatheter).toBe(true); // unchanged
  });

  it('setProcedure("picMonitor", true)', () => {
    usePatientStore.getState().setProcedure('picMonitor', true);
    expect(usePatientStore.getState().procedures.picMonitor).toBe(true);
  });

  it('setProcedure("picMonitor", false) desactiva el monitor PIC', () => {
    const pat = usePatientStore.getState();
    pat.setProcedure('picMonitor', true);
    pat.setProcedure('picMonitor', false);
    expect(usePatientStore.getState().procedures.picMonitor).toBe(false);
  });

  it('resetProcedures restaura todos los flags a INITIAL_PROCEDURES', () => {
    const pat = usePatientStore.getState();
    pat.setProcedure('arterialLine', true);
    pat.setProcedure('picMonitor', true);
    pat.setProcedure('ecmo', true);
    pat.resetProcedures();
    const p = usePatientStore.getState().procedures;
    expect(p.arterialLine).toBe(false);
    expect(p.picMonitor).toBe(false);
    expect(p.ecmo).toBe(false);
    expect(p.urinaryCatheter).toBe(true);
  });

  it('NIBP: arterialLine=false → nibp.enabled default permite captura', () => {
    const p = usePatientStore.getState().procedures;
    expect(p.arterialLine).toBe(false);
    expect(p.nibp).toBeDefined();
  });

  it('setNIBPInterval actualiza intervalMinutes', () => {
    usePatientStore.getState().setNIBPInterval(15);
    expect(usePatientStore.getState().procedures.nibp.intervalMinutes).toBe(15);
  });
});

describe('CaseCategory (Fase 2 + 6)', () => {
  it('Default caseCategory=general', () => {
    expect(usePathologyStore.getState().caseCategory).toBe('general');
  });

  it('setCaseCategory("neuro") actualiza la categoría', () => {
    usePathologyStore.getState().setCaseCategory('neuro');
    expect(usePathologyStore.getState().caseCategory).toBe('neuro');
  });

  it('setCaseCategory("sepsis") normaliza a "infecto"', () => {
    usePathologyStore.getState().setCaseCategory('sepsis' as never);
    expect(usePathologyStore.getState().caseCategory).toBe('infecto');
  });

  it('setCaseCategory("respiratory") normaliza a "pneumo"', () => {
    usePathologyStore.getState().setCaseCategory('respiratory' as never);
    expect(usePathologyStore.getState().caseCategory).toBe('pneumo');
  });
});
