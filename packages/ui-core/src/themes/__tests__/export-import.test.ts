import { describe, expect, it } from 'vitest';
import { dark } from '../defaults';
import { exportTheme, importTheme, THEME_EXPORT_VERSION } from '../export-import';

describe('export-import', () => {
  it('exports and imports wrapped theme payload', () => {
    const json = exportTheme(dark);
    const imported = importTheme(json);
    expect(imported.id).toBe(dark.id);
    expect(imported.tokens.color.surface).toBe(dark.tokens.color.surface);
  });

  it('imports raw theme JSON', () => {
    const imported = importTheme(JSON.stringify(dark));
    expect(imported.id).toBe(dark.id);
  });

  it('includes export version metadata', () => {
    const payload = JSON.parse(exportTheme(dark));
    expect(payload.version).toBe(THEME_EXPORT_VERSION);
    expect(payload.theme.id).toBe('dark');
  });
});
