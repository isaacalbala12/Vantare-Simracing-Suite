import darkJson from './dark.json';
import bloodJson from './blood.json';
import midnightJson from './midnight.json';
import f1Json from './f1.json';
import { validateTheme, type Theme } from './types';

export const dark = validateTheme(darkJson);
export const blood = validateTheme(bloodJson);
export const midnight = validateTheme(midnightJson);
export const f1 = validateTheme(f1Json);

export const builtInThemes: readonly Theme[] = [dark, blood, midnight, f1] as const;

export const builtInThemeMap: Record<string, Theme> = {
  dark,
  blood,
  midnight,
  'f1': f1,
};

export function getBuiltInTheme(id: string): Theme | undefined {
  return builtInThemeMap[id];
}

export const DEFAULT_THEME_ID = 'dark';
