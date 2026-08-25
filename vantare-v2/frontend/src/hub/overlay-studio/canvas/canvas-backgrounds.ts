import type { CSSProperties } from "react";
import { wallpaperIdOf, type StudioWallpaper } from "./studio-wallpapers";

export type CanvasBackgroundDefinition = {
  id: string;
  labelKey: string;
  kind: "css";
  className: string;
};

export const CANVAS_BACKGROUNDS = [
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
] as const satisfies readonly CanvasBackgroundDefinition[];

export type CanvasBackgroundId = (typeof CANVAS_BACKGROUNDS)[number]["id"];

const BACKGROUND_BY_ID = new Map(CANVAS_BACKGROUNDS.map((entry) => [entry.id, entry]));

export function resolveCanvasBackground(backgroundId: string): CanvasBackgroundDefinition {
  return BACKGROUND_BY_ID.get(backgroundId as CanvasBackgroundId) ?? CANVAS_BACKGROUNDS[0];
}

/** Clase del lienzo cuando el fondo es una imagen del usuario. */
export const WALLPAPER_CLASS_NAME = "osv3-bg-wallpaper";

export type ResolvedStageBackground = {
  className: string;
  style?: CSSProperties;
};

/**
 * Fondo pintable del lienzo: los tres de fabrica salen por clase y los propios
 * por `background-image` en linea, porque su `data:` no cabe en una hoja CSS.
 *
 * Si el id apunta a un fondo que ya no esta en la biblioteca (se borro desde
 * otra ventana) se cae a la rejilla en vez de dejar el lienzo en negro mudo.
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