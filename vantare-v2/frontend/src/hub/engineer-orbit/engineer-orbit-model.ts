import type { EngineerOutputMode } from "../../engineer/engineer-types";
import type { EngineerDiagnostics } from "./engineer-orbit-types";

export const ENGINEER_CATEGORIES = [
  ["spotter", "spotter"], ["fuel", "fuel"], ["penalties", "penalties"],
  ["laps", "laps"], ["timings", "gaps"], ["pitstops", "pits"], ["voice", "voice"],
] as const;
export const ENGINEER_OUTPUT_MODES: readonly EngineerOutputMode[] = ["both", "visual", "audio", "disabled"];
export const SENSITIVITIES = ["conservative", "normal", "aggressive"] as const;
export function deliveriesFor(snapshot: EngineerDiagnostics, cycle: "current" | "all", family: string) {
  return snapshot.deliveries.filter((item) =>
    (cycle === "all" || item.lifecycle === snapshot.status.presentationLifecycle) &&
    (family === "all" || item.family === family),
  ).slice().reverse();
}
// Export is a frozen, exact preview, independent of subsequent polls or filters.
export function prepareExport(snapshot: EngineerDiagnostics): string {
  return JSON.stringify(snapshot, null, 2);
}
export function downloadDiagnostics(payload: string): void {
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "vantare-engineer-diagnostics.json";
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
