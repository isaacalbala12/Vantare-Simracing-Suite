import { ORBIT_KEYS, orbitStore } from "./orbit-store";

/**
 * Feature flag `hub.orbit`.
 *
 * Por defecto está apagado: con el flag OFF la shell actual (`V52Shell`) no
 * cambia en absoluto. `?orbit=1` la enciende y la persiste; `?orbit=0` la
 * apaga. Sin parámetro manda lo que haya en `localStorage`.
 */
export function readOrbitFlagFromSearch(search: string): boolean | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("orbit");
  if (raw === null) return null;
  return raw === "1" || raw === "true";
}

export function isOrbitEnabled(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  const fromSearch = readOrbitFlagFromSearch(search);
  if (fromSearch !== null) {
    orbitStore.set(ORBIT_KEYS.enabled, fromSearch ? "1" : "0");
    return fromSearch;
  }
  return orbitStore.get(ORBIT_KEYS.enabled) === "1";
}

export function setOrbitEnabled(enabled: boolean): void {
  orbitStore.set(ORBIT_KEYS.enabled, enabled ? "1" : "0");
}
