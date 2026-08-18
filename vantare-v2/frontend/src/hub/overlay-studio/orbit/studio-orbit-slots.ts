/** Ids de los huecos que la shell Orbit reserva para el Studio (briefing 04). */
export const STUDIO_CONTEXT_SLOT_ID = "orbit-studio-context-slot";
export const STUDIO_TOPBAR_SLOT_ID = "orbit-studio-topbar-slot";

// El hook es de la shell, no del Studio: lo comparten todas las pantallas que
// portan contenido a la columna o a la topbar (briefings 04 y 05).
export { useOrbitSlot } from "../../orbit/use-orbit-slot";
