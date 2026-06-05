import darkJson from './dark.json';
import bloodJson from './blood.json';
import midnightJson from './midnight.json';
import { validateTheme, type Theme } from './types';

export const dark = validateTheme(darkJson);
export const blood = validateTheme(bloodJson);
export const midnight = validateTheme(midnightJson);

export const builtInThemes: readonly Theme[] = [dark, blood, midnight] as const;

export const builtInThemeMap: Record<string, Theme> = {
  dark,
  blood,
  midnight,
};

export function getBuiltInTheme(id: string): Theme | undefined {
  return builtInThemeMap[id];
}

export const DEFAULT_THEME_ID = 'dark';
