export type Density = "compact" | "balanced" | "comfortable";

export const DEFAULT_DENSITY: Density = "balanced";
export const DENSITY_STORAGE_KEY = "vantare.v03orbit.density";

export function normalizeDensity(value: string | null): Density {
  return value === "compact" || value === "comfortable" ? value : DEFAULT_DENSITY;
}

export function getStoredDensity(storage: Storage = window.localStorage): Density {
  try {
    return normalizeDensity(storage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function applyDensity(density: Density, body: HTMLElement = document.body) {
  body.dataset.density = density;
}

export function persistDensity(
  density: Density,
  storage: Storage = window.localStorage,
) {
  try {
    storage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Storage can be unavailable in restricted embedded browser contexts.
  }
}

export function initializeDensity(
  body: HTMLElement = document.body,
  storage: Storage = window.localStorage,
): Density {
  const density = getStoredDensity(storage);
  applyDensity(density, body);
  return density;
}
