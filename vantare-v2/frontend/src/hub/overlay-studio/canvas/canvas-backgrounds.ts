import type { CSSProperties } from "react";
import { wallpaperIdOf, type StudioWallpaper } from "./studio-wallpapers";

export type CanvasBackgroundDefinition = {
  id: string;
  labelKey: string;
  kind: "css";
  className: string;
  palette?: string;
  scheme?: "light" | "dark";
};

export const THEME_CANVAS_PALETTES = [
  "vantare", "rose", "grove", "ocean", "ember", "iris", "mono",
] as const;

export const CANVAS_BACKGROUNDS: readonly CanvasBackgroundDefinition[] = [
  { id: "theme", labelKey: "studio.v3.canvas.background.theme", kind: "css", className: "osv3-bg-theme" },
  { id: "grid", labelKey: "studio.v3.canvas.background.grid", kind: "css", className: "osv3-bg-grid" },
  {
    id: "gradient",
    labelKey: "studio.v3.canvas.background.gradient",
    kind: "css",
    className: "osv3-bg-gradient",
  },
  {
    id: "solid-black",
    labelKey: "studio.v3.canvas.background.black",
    kind: "css",
    className: "osv3-bg-black",
  },
  ...THEME_CANVAS_PALETTES.flatMap((palette) => (["light", "dark"] as const).map((scheme) => ({
    id: `theme-${palette}-${scheme}`,
    labelKey: "studio.v3.canvas.background.theme",
    kind: "css" as const,
    className: `osv3-bg-theme-${palette}-${scheme}`,
    palette,
    scheme,
  }))),
];

export function canvasBackgroundLabel(
  background: CanvasBackgroundDefinition,
  t: (key: string) => string,
): string {
  if (!background.palette || !background.scheme) return t(background.labelKey);
  return `${t(`settings.app.palette.${background.palette}`)} · ${t(`settings.app.scheme.${background.scheme}`)}`;
}

const BACKGROUND_BY_ID = new Map(CANVAS_BACKGROUNDS.map((entry) => [entry.id, entry]));

export function resolveCanvasBackground(backgroundId: string): CanvasBackgroundDefinition {
  return BACKGROUND_BY_ID.get(backgroundId) ?? CANVAS_BACKGROUNDS[0];
}

/** Clase del lienzo cuando el fondo es una imagen del usuario. */
export const WALLPAPER_CLASS_NAME = "osv3-bg-wallpaper";

export type ResolvedStageBackground = {
  className: string;
  style?: CSSProperties;
};

/**
 * Fondo pintable del lienzo: los fondos de fabrica salen por clase y los propios
 * por `background-image` en linea, porque su `data:` no cabe en una hoja CSS.
 *
 * Si el id apunta a un fondo que ya no esta en la biblioteca (se borro desde
 * otra ventana) se cae al tema actual en vez de dejar el lienzo en negro mudo.
 */
export function resolveStageBackground(
  backgroundId: string,
  wallpaper: StudioWallpaper | null,
): ResolvedStageBackground {
  if (wallpaperIdOf(backgroundId) !== null) {
    if (!wallpaper) return { className: CANVAS_BACKGROUNDS[0].className };
    return {
      className: WALLPAPER_CLASS_NAME,
      style: { backgroundImage: `url("${wallpaper.dataUrl}")` },
    };
  }
  return { className: resolveCanvasBackground(backgroundId).className };
}

export const SAFE_AREA_INSET_RATIO = 0.05;

export function safeAreaInsets(canvasWidth: number, canvasHeight: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return {
    top: Math.round(canvasHeight * SAFE_AREA_INSET_RATIO),
    right: Math.round(canvasWidth * SAFE_AREA_INSET_RATIO),
    bottom: Math.round(canvasHeight * SAFE_AREA_INSET_RATIO),
    left: Math.round(canvasWidth * SAFE_AREA_INSET_RATIO),
  };
}
