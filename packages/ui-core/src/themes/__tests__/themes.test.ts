import { describe, expect, it } from 'vitest';
import { builtInThemes, dark, blood, midnight } from '../defaults';
import { validateTheme, countThemeTokens } from '../types';
import { isLegacyTheme, migrateLegacyTheme } from '../legacy-mapper';
import legacyDark from '../../../../../apps/desktop/src/renderer/themes/dark.json';

describe('Built-in themes', () => {
  it('exports three built-in themes', () => {
    expect(builtInThemes).toHaveLength(3);
    expect(builtInThemes.map((t) => t.id)).toEqual(['dark', 'blood', 'midnight']);
  });

  describe.each([
    ['dark', dark],
    ['blood', blood],
    ['midnight', midnight],
  ] as const)('%s', (name, theme) => {
    it('validates against ThemeSchema', () => {
      expect(() => validateTheme(theme)).not.toThrow();
      expect(theme.id).toBe(name);
    });

    it('has all categorized token groups', () => {
      expect(theme.tokens.color).toBeDefined();
      expect(theme.tokens.font).toBeDefined();
      expect(theme.tokens.spacing).toBeDefined();
      expect(theme.tokens.radius).toBeDefined();
      expect(theme.tokens.shadow).toBeDefined();
      expect(theme.tokens.animation).toBeDefined();
      expect(theme.tokens.glass).toBeDefined();
      expect(theme.tokens.z).toBeDefined();
    });

    it('has 64 leaf tokens', () => {
      expect(countThemeTokens(theme.tokens)).toBe(64);
    });

    it('has semver version', () => {
      expect(theme.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

describe('legacy theme migration', () => {
  it('detects legacy flat token themes', () => {
    expect(isLegacyTheme(legacyDark as never)).toBe(true);
    expect(isLegacyTheme(dark as never)).toBe(false);
  });

  it('migrates legacy dark theme to the new schema', () => {
    const migrated = migrateLegacyTheme(legacyDark as never);
    expect(() => validateTheme(migrated)).not.toThrow();
    expect(migrated.tokens.color.surface).toBe('#0a0a0a');
    expect(migrated.tokens.color.primary).toBe('#3b82f6');
  });
});
