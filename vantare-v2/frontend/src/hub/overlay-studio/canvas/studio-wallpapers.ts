/**
 * Fondos propios del lienzo del Studio.
 *
 * Son material del usuario (capturas del simulador, normalmente) y no del
 * perfil: el documento describe el overlay, no el escenario contra el que se
 * mira. Por eso viven en `localStorage` junto al resto de preferencias de
 * lienzo y no viajan en el JSON del perfil ni al overlay real.
 */

export type StudioWallpaper = {
  id: string;
  /** Nombre del fichero original, ya recortado para caber en la UI. */
  name: string;
  /** JPEG ya reescalado en `data:` — ver `wallpaper-import.ts`. */
  dataUrl: string;
  width: number;
  height: number;
  addedAt: number;
};

/** Prefijo del `backgroundId` cuando el fondo es una imagen del usuario. */
export const WALLPAPER_BACKGROUND_PREFIX = "wallpaper:";

/**
 * Tope de la biblioteca. `localStorage` da ~5 MB por origen y el documento del
 * Studio ya vive ahi: seis capturas reescaladas (~300 KB cada una) dejan sitio
 * de sobra. Al anadir la septima cae la mas antigua.
 */
export const MAX_WALLPAPERS = 6;

const STORAGE_KEY = "vantare.studio.wallpapers";

/** El navegador se quedo sin cuota al guardar la biblioteca. */
export class WallpaperQuotaError extends Error {
  constructor() {
    super("wallpaper storage quota exceeded");
    this.name = "WallpaperQuotaError";
  }
}

export function wallpaperBackgroundId(id: string): string {
  return `${WALLPAPER_BACKGROUND_PREFIX}${id}`;
}

/** `wallpaper:abc` → `abc`; cualquier otro fondo → `null`. */
export function wallpaperIdOf(backgroundId: string): string | null {
  if (!backgroundId.startsWith(WALLPAPER_BACKGROUND_PREFIX)) return null;
  const id = backgroundId.slice(WALLPAPER_BACKGROUND_PREFIX.length);
  return id.length > 0 ? id : null;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isWallpaper(value: unknown): value is StudioWallpaper {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.name === "string" &&
    typeof entry.dataUrl === "string" &&
    entry.dataUrl.startsWith("data:image/") &&
    typeof entry.width === "number" &&
    typeof entry.height === "number" &&
    typeof entry.addedAt === "number"
  );
}

function readRaw(store: Storage): string | null {
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function load(): StudioWallpaper[] {
  const store = storage();
  if (!store) return [];
  const raw = readRaw(store);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Una entrada corrupta no puede tirar la biblioteca entera: se descarta
    // sola y las demas siguen pintando.
    return parsed.filter(isWallpaper).slice(0, MAX_WALLPAPERS);
  } catch {
    return [];
  }
}

/** Cache del modulo: `useSyncExternalStore` exige una referencia estable. */
let cache: StudioWallpaper[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(next: StudioWallpaper[]): void {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new WallpaperQuotaError();
    }
  }
  cache = next;
  emit();
}

export function listWallpapers(): StudioWallpaper[] {
  if (cache === null) cache = load();
  return cache;
}

export function findWallpaper(id: string | null): StudioWallpaper | null {
  if (!id) return null;
  return listWallpapers().find((entry) => entry.id === id) ?? null;
}

/**
 * Anade el fondo al principio de la biblioteca y devuelve la lista resultante.
 * Si se pasa del tope cae el mas antiguo, igual que la cache de documentos.
 */
export function addWallpaper(wallpaper: StudioWallpaper): StudioWallpaper[] {
  const rest = listWallpapers().filter((entry) => entry.id !== wallpaper.id);
  persist([wallpaper, ...rest].slice(0, MAX_WALLPAPERS));
  return listWallpapers();
}

export function removeWallpaper(id: string): StudioWallpaper[] {
  const next = listWallpapers().filter((entry) => entry.id !== id);
  if (next.length !== listWallpapers().length) persist(next);
  return listWallpapers();
}

export function subscribeWallpapers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Solo para tests: olvida la cache para releer `localStorage`. */
export function resetWallpaperCacheForTests(): void {
  cache = null;
  emit();
}
