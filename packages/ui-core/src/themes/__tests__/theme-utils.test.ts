import { describe, expect, it } from 'vitest';
import { dark } from '../defaults';
import {
  applyThemeToDOM,
  getLuminance,
  isDarkColor,
  mergeThemes,
  themeToCssVariables,
  validateThemeContrast,
} from '../theme-utils';

describe('theme-utils', () => {
  it('themeToCssVariables flattens nested tokens', () => {
    const variables = themeToCssVariables(dark.tokens);
    expect(variables['--color-surface']).toBe('#0a0a0a');
    expect(variables['--font-size-xs']).toBe('0.75rem');
    expect(variables['--animation-duration-fast']).toBe('150ms');
    expect(variables['--z-modal']).toBe('50');
  });

  it('applyThemeToDOM writes variables to the document root', () => {
    document.documentElement.removeAttribute('style');
    applyThemeToDOM(dark.tokens);
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#3b82f6');
  });

  it('mergeThemes overrides only provided fields', () => {
    const merged = mergeThemes(dark, {
      tokens: {
        color: {
          primary: '#ff00ff',
        },
      },
    } as never);

    expect(merged.tokens.color.primary).toBe('#ff00ff');
    expect(merged.tokens.color.surface).toBe('#0a0a0a');
  });

  it('detects dark and light colors', () => {
    expect(isDarkColor('#0a0a0a')).toBe(true);
    expect(getLuminance('#ffffff')).toBeGreaterThan(0.5);
    expect(isDarkColor('#ffffff')).toBe(false);
  });

  it('validates contrast for the dark theme critical pairs', () => {
    const report = validateThemeContrast(dark);
    expect(report.pairs.length).toBeGreaterThan(0);
    expect(report.pairs[0]?.ratio).toBeGreaterThan(1);
  });
});
