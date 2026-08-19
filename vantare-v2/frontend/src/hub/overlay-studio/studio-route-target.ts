export type StudioRouteMode = "editor" | "ownProfiles" | "recommended" | "community" | "obs";

/**
 * Traduce el destino de `navigate("studio", target)` al modo de la ruta.
 *
 * Hoy solo `"profiles"` nombra una subpantalla del Studio («Mis perfiles»);
 * cualquier otro destino deja el modo que ya tuviese la ruta.
 */
export function modeFromTarget(target: string | undefined): StudioRouteMode | null {
  return target === "profiles" ? "ownProfiles" : null;
}
