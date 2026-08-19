import type { Section } from "../navigation";
import { ORBIT_KEYS, orbitStore } from "./orbit-store";
import { isViewId, viewToSection } from "./views";

/**
 * Vista inicial de la shell Orbit.
 *
 * Con el flag ON la primera vista es **siempre** Inicio salvo que el usuario
 * dejase otra guardada en una sesión anterior (`vantare.v03orbit.view`). Con el
 * flag OFF nada cambia: la ruta legada siempre arranca en `dashboard`.
 */
export function initialSection(orbitEnabled: boolean): Section {
  if (!orbitEnabled) return "dashboard";
  const saved = orbitStore.get(ORBIT_KEYS.view);
  return saved && isViewId(saved) ? viewToSection(saved) : viewToSection("inicio");
}
