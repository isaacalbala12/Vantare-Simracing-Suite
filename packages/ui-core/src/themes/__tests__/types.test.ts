import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  ThemeSchema,
  countThemeTokens,
  validateTheme,
  type Theme,
} from '../types';

function createValidTheme(overrides: Partial<Theme> = {}): Theme {
  const base: Theme = {
    id: 'dark',
    name: 'Dark',
    description: 'Test theme',
    author: 'Vantare',
    version: '1.0.0',
    tokens: {
      color: {
        surface: '#0f0f14',
        surfaceAlt: '#1a1a24',
        surfaceElevated: '#24243a',
        border: '#2a2a3e',
        borderSubtle: '#1e1e2e',
        primary: '#6c5ce7',
        primaryHover: '#7c6cf7',
        primaryMuted: '#6c5ce720',
        secondary: '#00cec9',
        secondaryHover: '#1eded9',
        text: '#e8e8f0',
        textMuted: '#8888a0',
        textInverse: '#0f0f14',
        positive: '#00b894',
        negative: '#e17055',
        warning: '#fdcb6e',
        danger: '#d63031',
        glass: '#ffffff08',
        glassBorder: '#ffffff12',
        overlay: '#00000080',
      },
      font: {
        heading: "'Inter', sans-serif",
        body: "'Inter', sans-serif",
        mono: "'JetBrains Mono', monospace",
        size: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.25rem',
          xl: '1.5rem',
          '2xl': '2rem',
        },
        weight: {
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700,
        },
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
      },
      radius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        full: '9999px',
      },
      shadow: {
        sm: '0 1px 2px #00000040',
        md: '0 4px 12px #00000060',
        lg: '0 8px 32px #00000080',
        glow: '0 0 20px #6c5ce740',
      },
      animation: {
        duration: {
          fast: '150ms',
          normal: '300ms',
          slow: '500ms',
          slowest: '800ms',
        },
        easing: {
          default: 'cubic-bezier(0.4, 0, 0.2, 1)',
          bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
        },
      },
      glass: {
        blur: '12px',
        opacity: 0.6,
        saturation: '180%',
      },
      z: {
        base: 1,
        overlay: 10,
        dropdown: 20,
        modal: 50,
        toast: 100,
        tooltip: 200,
      },
    },
  };

  return { ...base, ...overrides, tokens: overrides.tokens ?? base.tokens };
}

describe('Theme schema', () => {
  it('accepts a valid theme', () => {
    const theme = createValidTheme();
    expect(() => validateTheme(theme)).not.toThrow();
    expect(validateTheme(theme).id).toBe('dark');
  });

  it('has 64 leaf tokens in the reference theme', () => {
    const theme = createValidTheme();
    expect(countThemeTokens(theme.tokens)).toBe(64);
  });

  it('accepts rgba and hsla color formats', () => {
    const theme = createValidTheme({
      tokens: {
        ...createValidTheme().tokens,
        color: {
          ...createValidTheme().tokens.color,
          glass: 'rgba(255,255,255,0.08)',
          overlay: 'hsla(0, 0%, 0%, 0.5)',
        },
      },
    });

    expect(validateTheme(theme).tokens.color.glass).toBe('rgba(255,255,255,0.08)');
  });

  it('rejects invalid color values with a detailed path', () => {
    const theme = createValidTheme({
      tokens: {
        ...createValidTheme().tokens,
        color: {
          ...createValidTheme().tokens.color,
          primary: 'not-a-color',
        },
      },
    });

    try {
      validateTheme(theme);
      expect.fail('Expected ZodError');
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      const zodError = error as ZodError;
      expect(zodError.issues[0]?.path).toEqual(['tokens', 'color', 'primary']);
    }
  });

  it('rejects themes with missing token categories', () => {
    const incomplete = {
      id: 'broken',
      name: 'Broken',
      description: 'Missing tokens',
      author: 'Test',
      version: '1.0.0',
      tokens: {
        color: createValidTheme().tokens.color,
      },
    };

    expect(() => ThemeSchema.parse(incomplete)).toThrow(ZodError);
  });

  it('rejects invalid semver version', () => {
    const theme = createValidTheme({ version: '1.0' as '1.0.0' });
    expect(() => validateTheme(theme)).toThrow(ZodError);
  });

  it('accepts optional overlay overrides', () => {
    const theme = createValidTheme({
      overlayOverrides: {
        standings: {
          color: {
            surface: 'rgba(10,10,10,0.8)',
          },
        },
      },
    });

    expect(validateTheme(theme).overlayOverrides?.standings?.color?.surface).toBe(
      'rgba(10,10,10,0.8)',
    );
  });
});
