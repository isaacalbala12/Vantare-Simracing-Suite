import type { Theme, ThemeTokens } from './types';

/** Flat token map used before Sprint 6 schema migration */
export interface LegacyFlatTokens {
  'bg-primary': string;
  'bg-secondary': string;
  'bg-surface': string;
  'bg-elevated': string;
  'text-primary': string;
  'text-secondary': string;
  'text-muted': string;
  'text-inverse': string;
  'accent-primary': string;
  'accent-secondary': string;
  'accent-success': string;
  'accent-warning': string;
  'accent-danger': string;
  'accent-info': string;
  'border-default': string;
  'border-hover': string;
  'border-accent': string;
  'radius-sm': string;
  'radius-md': string;
  'radius-lg': string;
  'radius-full': string;
  'shadow-sm': string;
  'shadow-md': string;
  'shadow-lg': string;
  'font-family': string;
  'font-size-sm': string;
  'font-size-md': string;
  'font-size-lg': string;
  'font-size-xl': string;
  'opacity-glass': string;
  'opacity-disabled': string;
  'spacing-xs': string;
  'spacing-sm': string;
  'spacing-md': string;
  'spacing-lg': string;
  'animation-fast': string;
  'animation-normal': string;
  'animation-slow': string;
  [key: string]: string;
}

export interface LegacyTheme {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  parent?: string | null;
  tokens: LegacyFlatTokens | ThemeTokens;
  overlayOverrides?: Record<string, Record<string, string>>;
}

export function isLegacyTheme(theme: LegacyTheme): boolean {
  const tokens = theme.tokens;
  return typeof tokens === 'object' && tokens !== null && 'bg-primary' in tokens;
}

function glowFromPrimary(primary: string): string {
  const hex = primary.startsWith('#') && primary.length === 7 ? `${primary}40` : primary;
  return `0 0 20px ${hex}`;
}

export function mapLegacyTokensToThemeTokens(legacy: LegacyFlatTokens): ThemeTokens {
  const glassOpacity = Number.parseFloat(legacy['opacity-glass'] || '0.6');

  return {
    color: {
      surface: legacy['bg-primary'],
      surfaceAlt: legacy['bg-secondary'],
      surfaceElevated: legacy['bg-elevated'],
      border: legacy['border-default'],
      borderSubtle: legacy['border-hover'],
      primary: legacy['accent-primary'],
      primaryHover: legacy['border-accent'],
      primaryMuted: `${legacy['accent-primary']}33`,
      secondary: legacy['accent-secondary'],
      secondaryHover: legacy['accent-info'],
      text: legacy['text-primary'],
      textMuted: legacy['text-muted'],
      textInverse: legacy['text-inverse'],
      positive: legacy['accent-success'],
      negative: legacy['accent-danger'],
      warning: legacy['accent-warning'],
      danger: legacy['accent-danger'],
      glass: legacy['border-default'],
      glassBorder: legacy['border-hover'],
      overlay: '#00000080',
    },
    font: {
      heading: legacy['font-family'],
      body: legacy['font-family'],
      mono: "'JetBrains Mono', monospace",
      size: {
        xs: legacy['font-size-sm'],
        sm: legacy['font-size-md'],
        base: legacy['font-size-lg'],
        lg: legacy['font-size-xl'],
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
      xs: legacy['spacing-xs'],
      sm: legacy['spacing-sm'],
      md: legacy['spacing-md'],
      lg: legacy['spacing-lg'],
      xl: '2rem',
      '2xl': '3rem',
    },
    radius: {
      sm: legacy['radius-sm'],
      md: legacy['radius-md'],
      lg: legacy['radius-lg'],
      xl: '1rem',
      full: legacy['radius-full'],
    },
    shadow: {
      sm: legacy['shadow-sm'],
      md: legacy['shadow-md'],
      lg: legacy['shadow-lg'],
      glow: glowFromPrimary(legacy['accent-primary']),
    },
    animation: {
      duration: {
        fast: legacy['animation-fast'],
        normal: legacy['animation-normal'],
        slow: legacy['animation-slow'],
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
      opacity: Number.isFinite(glassOpacity) ? glassOpacity : 0.6,
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
  };
}

export function migrateLegacyTheme(theme: LegacyTheme): Theme {
  if (!isLegacyTheme(theme)) {
    return theme as Theme;
  }

  const tokens = mapLegacyTokensToThemeTokens(theme.tokens as LegacyFlatTokens);
  const overlayOverrides = theme.overlayOverrides
    ? Object.fromEntries(
        Object.entries(theme.overlayOverrides).map(([overlayId, override]) => [
          overlayId,
          {
            color: Object.fromEntries(
              Object.entries(override).map(([key, value]) => {
                if (key === 'bg-surface') return ['surface', value];
                if (key.startsWith('text-')) return ['text', value];
                if (key.startsWith('accent-')) return ['primary', value];
                return [key, value];
              }),
            ),
          },
        ]),
      )
    : undefined;

  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    author: theme.author,
    version: theme.version,
    parent: theme.parent ?? null,
    tokens,
    overlayOverrides,
  };
}
