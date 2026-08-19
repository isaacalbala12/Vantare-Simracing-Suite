export type ThemeId = "vantare-v5" | "vantare-lite" | "vantare-orbit";

export type ThemeColors = {
  bg: string;
  surface: string;
  panel: string;
  border: string;
  borderHover: string;
  text: string;
  textMuted: string;
  textDim: string;
  red400: string;
  red500: string;
  red600: string;
  red700: string;
  red900: string;
  red950: string;
  wine: string;
  burgundy: string;
  blood: string;
  success: string;
  warning: string;
  coral?: string;
  ember?: string;
  cyan?: string;
  line?: string;
  lineStrong?: string;
  primaryBg?: string;
  primaryInk?: string;
};

export type ThemeEffects = {
  glassAlpha: string;
  glassBlur: string;
  cardShadow: string;
  hoverTranslateY: string;
  motionScale: string;
  radius?: string;
  row?: string;
  space?: string;
  railWidth?: string;
  columnWidth?: string;
  topbarHeight?: string;
  ease?: string;
};

export type ThemeFonts = {
  sans: string;
  display: string;
  mono: string;
};

export type VantareTheme = {
  id: string;
  name: string;
  mode: "full" | "lite";
  colors: ThemeColors;
  effects: ThemeEffects;
  fonts: ThemeFonts;
};

export const DEFAULT_THEME_ID: ThemeId = "vantare-orbit";
const THEME_STORAGE_KEY = "vantare.theme";

const ORBIT_COLOR_DEFAULTS = {
  coral: "#ff6a5f",
  ember: "#ff9b57",
  cyan: "#5ccbd5",
  line: "rgba(255,255,255,0.075)",
  lineStrong: "rgba(255,255,255,0.13)",
  primaryBg: "#f3eeee",
  primaryInk: "#1c1719",
} as const;

const ORBIT_EFFECT_DEFAULTS = {
  radius: "18px",
  row: "49px",
  space: "21px",
  railWidth: "81px",
  columnWidth: "296px",
  topbarHeight: "70px",
  ease: "cubic-bezier(.2,.8,.2,1)",
} as const;

export function normalizeThemeId(value: string | null): ThemeId {
  return value === "vantare-lite" || value === "vantare-orbit"
    ? value
    : DEFAULT_THEME_ID;
}

export function cssVarsFromTheme(theme: VantareTheme): Record<string, string> {
  return {
    "--v-bg": theme.colors.bg,
    "--v-surface": theme.colors.surface,
    "--v-panel": theme.colors.panel,
    "--v-border": theme.colors.border,
    "--v-border-hover": theme.colors.borderHover,
    "--v-text": theme.colors.text,
    "--v-text-muted": theme.colors.textMuted,
    "--v-text-dim": theme.colors.textDim,
    "--v-red-400": theme.colors.red400,
    "--v-red-500": theme.colors.red500,
    "--v-red-600": theme.colors.red600,
    "--v-red-700": theme.colors.red700,
    "--v-red-900": theme.colors.red900,
    "--v-red-950": theme.colors.red950,
    "--v-wine": theme.colors.wine,
    "--v-burgundy": theme.colors.burgundy,
    "--v-blood": theme.colors.blood,
    "--v-success": theme.colors.success,
    "--v-warning": theme.colors.warning,
    "--v-coral": theme.colors.coral ?? ORBIT_COLOR_DEFAULTS.coral,
    "--v-ember": theme.colors.ember ?? ORBIT_COLOR_DEFAULTS.ember,
    "--v-cyan": theme.colors.cyan ?? ORBIT_COLOR_DEFAULTS.cyan,
    "--v-line": theme.colors.line ?? ORBIT_COLOR_DEFAULTS.line,
    "--v-line-strong": theme.colors.lineStrong ?? ORBIT_COLOR_DEFAULTS.lineStrong,
    "--v-primary-bg": theme.colors.primaryBg ?? ORBIT_COLOR_DEFAULTS.primaryBg,
    "--v-primary-ink": theme.colors.primaryInk ?? ORBIT_COLOR_DEFAULTS.primaryInk,
    "--v-glass-alpha": theme.effects.glassAlpha,
    "--v-glass-blur": theme.effects.glassBlur,
    "--v-card-shadow": theme.effects.cardShadow,
    "--v-hover-translate-y": theme.effects.hoverTranslateY,
    "--v-motion-scale": theme.effects.motionScale,
    "--v-radius": theme.effects.radius ?? ORBIT_EFFECT_DEFAULTS.radius,
    "--v-row": theme.effects.row ?? ORBIT_EFFECT_DEFAULTS.row,
    "--v-space": theme.effects.space ?? ORBIT_EFFECT_DEFAULTS.space,
    "--v-rail-width": theme.effects.railWidth ?? ORBIT_EFFECT_DEFAULTS.railWidth,
    "--v-column-width": theme.effects.columnWidth ?? ORBIT_EFFECT_DEFAULTS.columnWidth,
    "--v-topbar-height": theme.effects.topbarHeight ?? ORBIT_EFFECT_DEFAULTS.topbarHeight,
    "--v-ease": theme.effects.ease ?? ORBIT_EFFECT_DEFAULTS.ease,
    "--v-font-sans": theme.fonts.sans,
    "--v-font-display": theme.fonts.display,
    "--v-font-mono": theme.fonts.mono,
  };
}

export function applyThemeToElement(el: HTMLElement, theme: VantareTheme) {
  el.dataset.theme = theme.id;
  el.dataset.visualMode = theme.mode;
  for (const [key, value] of Object.entries(cssVarsFromTheme(theme))) {
    el.style.setProperty(key, value);
  }
}

export function applyTheme(theme: VantareTheme) {
  applyThemeToElement(document.documentElement, theme);
}

export function getStoredThemeId(storage: Storage = window.localStorage): ThemeId {
  try {
    return normalizeThemeId(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function persistThemeId(
  themeId: ThemeId,
  storage: Storage = window.localStorage,
) {
  try {
    storage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Storage can be unavailable in restricted embedded browser contexts.
  }
}
