import type { Theme, ThemeTokenMap, ThemeTokens } from './types';

function camelToKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function flattenTokens(
  prefix: string,
  value: Record<string, unknown>,
  result: Record<string, string>,
): void {
  for (const [key, entry] of Object.entries(value)) {
    const segment = camelToKebab(key);
    const cssPrefix = prefix ? `${prefix}-${segment}` : segment;

    if (typeof entry === 'number') {
      result[`--${cssPrefix}`] = String(entry);
      continue;
    }

    if (typeof entry === 'string') {
      result[`--${cssPrefix}`] = entry;
      continue;
    }

    if (entry && typeof entry === 'object') {
      flattenTokens(cssPrefix, entry as Record<string, unknown>, result);
    }
  }
}

export function themeToCssVariables(tokens: ThemeTokenMap): Record<string, string> {
  const variables: Record<string, string> = {};
  flattenTokens('', tokens as unknown as Record<string, unknown>, variables);
  return variables;
}

export function applyThemeToDOM(tokens: ThemeTokenMap, root: HTMLElement = document.documentElement): void {
  const variables = themeToCssVariables(tokens);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

export function getLuminance(color: string): number {
  const rgb = parseColorToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkColor(color: string): boolean {
  return getLuminance(color) < 0.5;
}

function parseColorToRgb(color: string): [number, number, number] | null {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }

  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return [
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
      Number.parseInt(hex[3] + hex[3], 16),
    ];
  }

  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3) {
      return [parts[0], parts[1], parts[2]];
    }
  }

  return null;
}

export function mergeThemeTokens(base: ThemeTokens, override: Partial<ThemeTokens>): ThemeTokens {
  return {
    color: { ...base.color, ...override.color },
    font: {
      ...base.font,
      ...override.font,
      size: { ...base.font.size, ...override.font?.size },
      weight: { ...base.font.weight, ...override.font?.weight },
    },
    spacing: { ...base.spacing, ...override.spacing },
    radius: { ...base.radius, ...override.radius },
    shadow: { ...base.shadow, ...override.shadow },
    animation: {
      duration: { ...base.animation.duration, ...override.animation?.duration },
      easing: { ...base.animation.easing, ...override.animation?.easing },
    },
    glass: { ...base.glass, ...override.glass },
    z: { ...base.z, ...override.z },
  };
}

export interface ContrastPairReport {
  foreground: string;
  background: string;
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface ContrastReport {
  pairs: ContrastPairReport[];
  allPassAA: boolean;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = getLuminance(foreground) + 0.05;
  const bg = getLuminance(background) + 0.05;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return lighter / darker;
}

export function validateThemeContrast(theme: Theme): ContrastReport {
  const criticalPairs = [
    { foreground: theme.tokens.color.text, background: theme.tokens.color.surface },
    { foreground: theme.tokens.color.textMuted, background: theme.tokens.color.surface },
    { foreground: theme.tokens.color.textInverse, background: theme.tokens.color.primary },
  ];

  const pairs = criticalPairs.map(({ foreground, background }) => {
    const ratio = contrastRatio(foreground, background);
    return {
      foreground,
      background,
      ratio,
      passesAA: ratio >= 4.5,
      passesAAA: ratio >= 7,
    };
  });

  return {
    pairs,
    allPassAA: pairs.every((pair) => pair.passesAA),
  };
}

export function mergeThemes(parent: Theme, override: Partial<Theme>): Theme {
  return {
    ...parent,
    ...override,
    tokens: override.tokens ? mergeThemeTokens(parent.tokens, override.tokens) : parent.tokens,
    overlayOverrides: override.overlayOverrides ?? parent.overlayOverrides,
  };
}
