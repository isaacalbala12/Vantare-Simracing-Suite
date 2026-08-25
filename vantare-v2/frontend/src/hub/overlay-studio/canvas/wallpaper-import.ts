/**
 * Importacion de fondos propios: fichero del disco → JPEG reescalado en `data:`.
 *
 * Una captura del simulador viene a 2560×1440 y pesa megas; el lienzo del
 * Studio nunca la pinta a mas de su ancho real. Guardar el original llenaria
 * `localStorage` con la primera imagen, asi que se reescala al entrar.
 */

import type { StudioWallpaper } from "./studio-wallpapers";

/** Ancho maximo guardado: por encima el lienzo no gana un pixel visible. */
export const WALLPAPER_MAX_WIDTH = 1920;
export const WALLPAPER_MAX_HEIGHT = 1080;
/** JPEG: el ruido de un render de coche no se lleva bien con PNG. */
export const WALLPAPER_QUALITY = 0.82;
/** Tope del fichero de entrada, antes de reescalar. */
export const WALLPAPER_MAX_INPUT_BYTES = 32 * 1024 * 1024;

export class WallpaperImportError extends Error {
  readonly reason: "type" | "size" | "decode";

  constructor(reason: "type" | "size" | "decode") {
    super(`wallpaper import failed: ${reason}`);
    this.name = "WallpaperImportError";
    this.reason = reason;
  }
}

/** Caja de destino conservando proporcion; nunca amplia una imagen pequena. */
export function wallpaperTargetSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(WALLPAPER_MAX_WIDTH / width, WALLPAPER_MAX_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** `GRAB_003.JPG` → `GRAB_003`: la extension no dice nada en la lista. */
export function wallpaperName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const trimmed = withoutExtension.trim();
  const name = trimmed.length > 0 ? trimmed : fileName;
  return name.length > 32 ? `${name.slice(0, 31)}…` : name;
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new WallpaperImportError("decode"));
    };
    image.src = url;
  });
}

/** Lee el fichero, lo reescala y devuelve la entrada lista para la biblioteca. */
export async function importWallpaperFile(file: File): Promise<StudioWallpaper> {
  if (!file.type.startsWith("image/")) throw new WallpaperImportError("type");
  if (file.size > WALLPAPER_MAX_INPUT_BYTES) throw new WallpaperImportError("size");

  const image = await decode(file);
  const size = wallpaperTargetSize(image.naturalWidth, image.naturalHeight);
  if (size.width === 0) throw new WallpaperImportError("decode");

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new WallpaperImportError("decode");
  context.drawImage(image, 0, 0, size.width, size.height);

  return {
    id: newId(),
    name: wallpaperName(file.name),
    dataUrl: canvas.toDataURL("image/jpeg", WALLPAPER_QUALITY),
    width: size.width,
    height: size.height,
    addedAt: Date.now(),
  };
}
