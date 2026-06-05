import { validateTheme } from './types';
import type { Theme } from './types';

export const THEME_EXPORT_VERSION = 'vantare-theme-v1';

export interface ThemeExportPayload {
  version: typeof THEME_EXPORT_VERSION;
  exportedAt: string;
  theme: Theme;
}

export function exportTheme(theme: Theme): string {
  const payload: ThemeExportPayload = {
    version: THEME_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    theme,
  };
  return JSON.stringify(payload, null, 2);
}

function isThemeExportPayload(value: unknown): value is ThemeExportPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    (value as ThemeExportPayload).version === THEME_EXPORT_VERSION &&
    'theme' in value &&
    typeof (value as ThemeExportPayload).theme === 'object' &&
    (value as ThemeExportPayload).theme !== null
  );
}

export function importTheme(json: string): Theme {
  const parsed: unknown = JSON.parse(json);

  if (isThemeExportPayload(parsed)) {
    return validateTheme(parsed.theme);
  }

  return validateTheme(parsed as Theme);
}
