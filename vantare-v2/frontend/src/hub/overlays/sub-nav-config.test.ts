import { describe, it, expect } from 'vitest';
import { getSectionsForWidget } from './sub-nav-config';

describe('sub-nav-config', () => {
  it('returns Diseño + Apariencia + Columnas + Visibilidad + General for relative', () => {
    const sections = getSectionsForWidget('relative');
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('diseno');
    expect(ids).toContain('apariencia');
    expect(ids).toContain('columnas');
    expect(ids).toContain('visibilidad');
    expect(ids).toContain('general');
    expect(ids).not.toContain('slots');
    expect(ids).not.toContain('colores');
  });

  it('returns Diseño + Apariencia + Columnas + Visibilidad + General for standings', () => {
    const sections = getSectionsForWidget('standings');
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('columnas');
    expect(ids).not.toContain('slots');
  });

  it('returns Diseño + Apariencia + Slots + Visibilidad + General for delta', () => {
    const sections = getSectionsForWidget('delta');
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('slots');
    expect(ids).not.toContain('columnas');
    expect(ids).not.toContain('colores');
  });

  it('returns Diseño + Apariencia + Colores + Visibilidad + General for pedals', () => {
    const sections = getSectionsForWidget('pedals');
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('colores');
    expect(ids).not.toContain('columnas');
    expect(ids).not.toContain('slots');
  });

  it('returns Diseño + Apariencia + Slots + Visibilidad + General for unknown type', () => {
    const sections = getSectionsForWidget('telemetry');
    const ids = sections.map((s) => s.id);
    expect(ids).toContain('slots');
    expect(ids).not.toContain('columnas');
  });

  it('all sections have accent colors', () => {
    const sections = getSectionsForWidget('relative');
    for (const s of sections) {
      expect(s.accent).toMatch(/^(|blue|purple|amber|cyan)$/);
    }
  });

  it('all sections have a title and label', () => {
    const sections = getSectionsForWidget('delta');
    for (const s of sections) {
      expect(s.title).toBeTruthy();
      expect(s.label).toBeTruthy();
    }
  });
});
