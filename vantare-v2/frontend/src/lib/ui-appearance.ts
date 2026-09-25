export type UiPalette = "vantare" | "rose" | "grove" | "ocean" | "ember" | "iris" | "mono";
export type UiScheme = "system" | "light" | "dark";
export type UiInterfaceFont = "inter" | "segoe" | "arial";
export type UiMonoFont = "cascadia" | "consolas" | "courier";

export type UiAppearance = {
  palette: UiPalette;
  scheme: UiScheme;
  contrast: number;
  glassOpacity: number;
  interfaceFont: UiInterfaceFont;
  monoFont: UiMonoFont;
};

const PALETTE_KEY = "vantare.ui.palette";
const SCHEME_KEY = "vantare.ui.scheme";
const CONTRAST_KEY = "vantare.ui.contrast";
const GLASS_KEY = "vantare.ui.glassOpacity";
const INTERFACE_FONT_KEY = "vantare.ui.interfaceFont";
const MONO_FONT_KEY = "vantare.ui.monoFont";

const INTERFACE_FONTS: Record<UiInterfaceFont, string> = {
  inter: 'Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  segoe: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  arial: 'Arial, "Segoe UI", sans-serif',
};
const MONO_FONTS: Record<UiMonoFont, string> = {
  cascadia: '"Cascadia Code", Consolas, ui-monospace, monospace',
  consolas: 'Consolas, ui-monospace, monospace',
  courier: '"Courier New", ui-monospace, monospace',
};
const CONTRAST_TEXT = ["--orbit-ink-2", "--orbit-ink-3", "--orbit-ink-4", "--orbit-ink-muted"];
const CONTRAST_LINES = ["--orbit-line", "--orbit-line-strong", "--orbit-line-row"];
const GLASS_SURFACES = ["--orbit-panel-bg", "--orbit-topbar-bg"];

type Color = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Color | null {
  const hex = value.trim().match(/^#([\da-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  return rgb ? { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] } : null;
}

function colorString(color: Color): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.round(color.a * 1000) / 1000})`;
}

function applySurfaceEffects(element: HTMLElement, appearance: UiAppearance): void {
  const tokens = [...CONTRAST_TEXT, ...CONTRAST_LINES, ...GLASS_SURFACES];
  for (const token of tokens) element.style.removeProperty(token);
  if (appearance.contrast === 100 && appearance.glassOpacity === 80) return;

  const styles = getComputedStyle(element);
  const ink = parseColor(styles.getPropertyValue("--orbit-ink"));
  const canvas = parseColor(styles.getPropertyValue("--orbit-canvas"));
  if (ink && canvas && appearance.contrast !== 100) {
    const strength = Math.abs(appearance.contrast - 100) / 100;
    const target = appearance.contrast > 100 ? ink : canvas;
    for (const token of CONTRAST_TEXT) {
      const base = parseColor(styles.getPropertyValue(token));
      if (!base) continue;
      element.style.setProperty(token, colorString({
        r: base.r + (target.r - base.r) * strength,
        g: base.g + (target.g - base.g) * strength,
        b: base.b + (target.b - base.b) * strength,
        a: base.a,
      }));
    }
    for (const token of CONTRAST_LINES) {
      const base = parseColor(styles.getPropertyValue(token));
      if (base) element.style.setProperty(token, colorString({ ...base, a: Math.min(1, base.a * appearance.contrast / 100) }));
    }
  }
  if (appearance.glassOpacity !== 80) {
    for (const token of GLASS_SURFACES) {
      const base = parseColor(styles.getPropertyValue(token));
      if (base) element.style.setProperty(token, colorString({ ...base, a: Math.min(1, base.a * appearance.glassOpacity / 80) }));
    }
  }
}

function storedPercent(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return raw !== null && Number.isInteger(value) && value >= min && value <= max
    ? value : fallback;
}

const DEFAULT_UI_APPEARANCE: UiAppearance = {
  palette: "vantare",
  scheme: "system",
  contrast: 100,
  glassOpacity: 80,
  interfaceFont: "inter",
  monoFont: "cascadia",
};

export function getStoredUiAppearance(
  storage: Storage = window.localStorage,
): UiAppearance {
  try {
    const palette = storage.getItem(PALETTE_KEY);
    const scheme = storage.getItem(SCHEME_KEY);
    const interfaceFont = storage.getItem(INTERFACE_FONT_KEY);
    const monoFont = storage.getItem(MONO_FONT_KEY);
    return {
      palette: palette === "rose" || palette === "grove" || palette === "ocean"
        || palette === "ember" || palette === "iris" || palette === "mono"
        ? palette : "vantare",
      scheme: scheme === "light" || scheme === "dark" ? scheme : "system",
      contrast: storedPercent(storage.getItem(CONTRAST_KEY), 100, 80, 120),
      glassOpacity: storedPercent(storage.getItem(GLASS_KEY), 80, 50, 100),
      interfaceFont: interfaceFont === "segoe" || interfaceFont === "arial" ? interfaceFont : "inter",
      monoFont: monoFont === "consolas" || monoFont === "courier" ? monoFont : "cascadia",
    };
  } catch {
    return DEFAULT_UI_APPEARANCE;
  }
}

export function applyUiAppearance(
  appearance: UiAppearance,
  element: HTMLElement = document.documentElement,
  systemDark: boolean = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
): void {
  element.dataset.uiPalette = appearance.palette;
  element.dataset.uiScheme = appearance.scheme;
  element.dataset.uiResolvedScheme = appearance.scheme === "system"
    ? systemDark ? "dark" : "light"
    : appearance.scheme;
  element.style.setProperty("--orbit-font-sans", INTERFACE_FONTS[appearance.interfaceFont]);
  element.style.setProperty("--orbit-font-display", INTERFACE_FONTS[appearance.interfaceFont]);
  element.style.setProperty("--orbit-font-mono", MONO_FONTS[appearance.monoFont]);
  applySurfaceEffects(element, appearance);
}

export function initializeUiAppearance(): () => void {
  applyUiAppearance(getStoredUiAppearance());
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) return () => {};
  const onChange = () => applyUiAppearance(getStoredUiAppearance());
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function persistUiAppearance(
  appearance: UiAppearance,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(PALETTE_KEY, appearance.palette);
    storage.setItem(SCHEME_KEY, appearance.scheme);
    storage.setItem(CONTRAST_KEY, String(appearance.contrast));
    storage.setItem(GLASS_KEY, String(appearance.glassOpacity));
    storage.setItem(INTERFACE_FONT_KEY, appearance.interfaceFont);
    storage.setItem(MONO_FONT_KEY, appearance.monoFont);
  } catch {
    // Algunos WebViews restringidos no ofrecen almacenamiento local.
  }
}
