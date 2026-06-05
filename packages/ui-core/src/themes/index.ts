export {
  ColorTokensSchema,
  FontTokensSchema,
  SpacingTokensSchema,
  RadiusTokensSchema,
  ShadowTokensSchema,
  AnimationTokensSchema,
  GlassTokensSchema,
  ZIndexTokensSchema,
  ThemeTokensSchema,
  ThemeSchema,
  colorValueSchema,
  validateTheme,
  countThemeTokens,
  THEME_TOKEN_COUNT,
} from './types';

export type {
  ColorTokens,
  FontTokens,
  SpacingTokens,
  RadiusTokens,
  ShadowTokens,
  AnimationTokens,
  GlassTokens,
  ZIndexTokens,
  ThemeTokens,
  ThemeTokenMap,
  ThemeOverlayOverride,
  Theme,
} from './types';

export {
  dark,
  blood,
  midnight,
  builtInThemes,
  builtInThemeMap,
  getBuiltInTheme,
  DEFAULT_THEME_ID,
} from './defaults';

export {
  isLegacyTheme,
  migrateLegacyTheme,
  mapLegacyTokensToThemeTokens,
  type LegacyTheme,
  type LegacyFlatTokens,
} from './legacy-mapper';

export {
  themeToCssVariables,
  applyThemeToDOM,
  getLuminance,
  isDarkColor,
  mergeThemes,
  mergeThemeTokens,
  validateThemeContrast,
  type ContrastReport,
  type ContrastPairReport,
} from './theme-utils';

export { ThemeProvider, ThemeContext, type ThemeContextValue } from './ThemeProvider';
export { useTheme } from './useTheme';
export { useOverlayTheme } from './useOverlayTheme';

export {
  THEME_EXPORT_VERSION,
  exportTheme,
  importTheme,
  type ThemeExportPayload,
} from './export-import';
