/**
 * Persistencia tolerante de la shell Orbit.
 *
 * En `data:`, sandbox o modo privado `localStorage` puede lanzar, así que todo
 * acceso pasa por este envoltorio. Las claves son las del prototipo
 * (`13-modelo-y-algoritmos.md § 13.7`) y las que ya usa `lib/density.ts`.
 */

export const ORBIT_KEYS = {
  enabled: "vantare.orbit.enabled",
  view: "vantare.v03orbit.view",
  sidebar: "vantare.v03orbit.sidebar",
  rightDock: "vantare.v03orbit.rightDock",
  density: "vantare.v03orbit.density",
} as const;

export type OrbitStorageKey = (typeof ORBIT_KEYS)[keyof typeof ORBIT_KEYS];

export const orbitStore = {
  get(key: OrbitStorageKey, storage: Storage | undefined = safeStorage()): string | null {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: OrbitStorageKey, value: string, storage: Storage | undefined = safeStorage()): void {
    try {
      storage?.setItem(key, value);
    } catch {
      // Sin almacenamiento: la preferencia solo vive en memoria.
    }
  },
};

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
