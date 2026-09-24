export type UiPalette = "vantare" | "ocean" | "iris";
export type UiScheme = "system" | "light" | "dark";

export type UiAppearance = {
  palette: UiPalette;
  scheme: UiScheme;
};

const PALETTE_KEY = "vantare.ui.palette";
const SCHEME_KEY = "vantare.ui.scheme";

const DEFAULT_UI_APPEARANCE: UiAppearance = {
  palette: "vantare",
  scheme: "system",
};

export function getStoredUiAppearance(
  storage: Storage = window.localStorage,
): UiAppearance {
  try {
    const palette = storage.getItem(PALETTE_KEY);
    const scheme = storage.getItem(SCHEME_KEY);
    return {
      palette: palette === "ocean" || palette === "iris" ? palette : "vantare",
      scheme: scheme === "light" || scheme === "dark" ? scheme : "system",
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
  } catch {
    // Algunos WebViews restringidos no ofrecen almacenamiento local.
  }
}
