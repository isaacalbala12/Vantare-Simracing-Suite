import { createContext, useContext } from "react";
import type { SimStatus } from "./views";

/**
 * Estado del sim tal y como lo publica la shell Orbit.
 *
 * Existe una sola verdad: la que `OrbitShell` calcula desde el estado de fuente
 * de telemetria y pinta en el Pill LMU del pie de la columna (`ContextColumn`).
 * Las pantallas que necesiten decidir algo sobre el sim —el selector Mock/Live
 * del Studio, por ejemplo— leen de aqui en vez de derivarlo por su cuenta: dos
 * derivaciones distintas fue exactamente el fallo de la revision 04, con la
 * columna dando el sim por conectado y el boton Live deshabilitado al lado.
 *
 * Fuera de la shell el contexto vale `null` y cada consumidor decide su
 * respaldo (el Studio V3 clasico sigue con su propio `liveAvailable`).
 */
export const OrbitSimStatusContext = createContext<SimStatus | null>(null);

/** Estado del sim de la shell, o `null` si no hay shell Orbit encima. */
export function useOrbitSimStatus(): SimStatus | null {
  return useContext(OrbitSimStatusContext);
}
