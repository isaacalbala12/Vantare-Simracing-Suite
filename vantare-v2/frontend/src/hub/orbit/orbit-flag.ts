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
  const stored = orbitStore.get(ORBIT_KEYS.enabled);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return readOrbitBuildDefault();
}

/**
 * Valor por defecto fijado en tiempo de build (`VITE_ORBIT_DEFAULT=1`) para
 * builds de prueba de la app de escritorio, donde no hay query params. Solo
 * aplica cuando ni la URL ni `localStorage` dicen nada.
 */
export function readOrbitBuildDefault(): boolean {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_ORBIT_DEFAULT;
  return raw === "1" || raw === "true";
}

export function setOrbitEnabled(enabled: boolean): void {
  orbitStore.set(ORBIT_KEYS.enabled, enabled ? "1" : "0");
}
