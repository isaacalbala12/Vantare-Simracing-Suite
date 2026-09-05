import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { DeltaAdvancedContent } from "./delta-advanced-definition";
export type DeltaAdvancedAvailability = { best: boolean; sector: boolean; theoretical: boolean; last: boolean };
export type DeltaAdvancedViewModel = WidgetViewModelBase & { type: "delta-advanced"; reference?: string; best?: number; sector?: number; theoretical?: number; last?: number; availability: DeltaAdvancedAvailability; showUnavailableFields: boolean };
function unavailable(status: DeltaAdvancedViewModel["status"], content: DeltaAdvancedContent, statusMessage?: string): DeltaAdvancedViewModel { return { type: "delta-advanced", status, statusMessage, availability: { best: false, sector: false, theoretical: false, last: false }, showUnavailableFields: content.showUnavailableFields }; }
export function buildDeltaAdvancedViewModel(snapshot: TelemetrySnapshot, content: DeltaAdvancedContent): DeltaAdvancedViewModel { if (snapshot.status === "disconnected" || snapshot.status === "missing" || snapshot.status === "error") return unavailable(snapshot.status, content, snapshot.errorMessage); const best = typeof snapshot.player.deltaSeconds === "number" && Number.isFinite(snapshot.player.deltaSeconds) ? snapshot.player.deltaSeconds : undefined; return { type: "delta-advanced", status: snapshot.status === "stale" ? "stale" : "ready", best, availability: { best: best !== undefined, sector: false, theoretical: false, last: false }, showUnavailableFields: content.showUnavailableFields }; }

/** Label follows the effective source reference; absent metadata is not BEST. */
export function deltaAdvancedReferenceLabel(reference: string | undefined): string {
  switch (reference) {
    case "personal-best": return "Mejor personal";
    case "session-best": return "Mejor sesión";
    case "previous-lap": return "Última vuelta";
    default: return "Referencia no disponible";
  }
}
