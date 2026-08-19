import type { Section } from '../navigation';
import { ORBIT_KEYS, orbitStore } from './orbit-store';
import { isViewId, viewToSection } from './views';

/**
 * Vista inicial de la shell Orbit: respeta la ultima vista valida guardada y
 * cae en Inicio cuando no existe preferencia.
 */
export function initialSection(): Section {
  const saved = orbitStore.get(ORBIT_KEYS.view);
  return saved && isViewId(saved) ? viewToSection(saved) : viewToSection('inicio');
}
