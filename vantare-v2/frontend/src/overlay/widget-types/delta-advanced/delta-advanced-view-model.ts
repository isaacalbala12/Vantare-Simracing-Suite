import type { WidgetViewModelBase } from "../../core/widget-definition";
export type DeltaAdvancedAvailability = { best: boolean; sector: boolean; theoretical: boolean; last: boolean };
export type DeltaAdvancedViewModel = WidgetViewModelBase & { type: "delta-advanced"; reference?: string; best?: number; sector?: number; theoretical?: number; last?: number; availability: DeltaAdvancedAvailability; showUnavailableFields: boolean };

/** Label follows the effective source reference; absent metadata is not BEST. */
export function deltaAdvancedReferenceLabel(reference: string | undefined): string {
  switch (reference) {
    case "personal-best": return "Mejor personal";
    case "session-best": return "Mejor sesión";
    case "previous-lap": return "Última vuelta";
    default: return "Referencia no disponible";
  }
}
