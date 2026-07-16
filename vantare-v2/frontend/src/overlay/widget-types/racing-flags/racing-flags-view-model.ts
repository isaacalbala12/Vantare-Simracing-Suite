import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { RacingFlagsContent } from "./racing-flags-definition";

export type RacingFlagsViewModel = WidgetViewModelBase & {
  type: "racing-flags";
  globalFlag?: string;
  sectorFlags: readonly string[];
  message?: string;
  showSectorFlags: boolean;
  hideWhenGreen: boolean;
  hidden: boolean;
};

function unavailable(status: RacingFlagsViewModel["status"], content: RacingFlagsContent, statusMessage?: string): RacingFlagsViewModel {
  return { type: "racing-flags", status, statusMessage, sectorFlags: [], showSectorFlags: content.showSectorFlags, hideWhenGreen: content.hideWhenGreen, hidden: false };
}

export function buildRacingFlagsViewModel(snapshot: TelemetrySnapshot, content: RacingFlagsContent): RacingFlagsViewModel {
  if (snapshot.status === "disconnected" || snapshot.status === "missing" || snapshot.status === "error") return unavailable(snapshot.status, content, snapshot.errorMessage);
  const globalFlag = snapshot.session.globalFlag?.trim().toLowerCase() || undefined;
  const sectorFlags = (snapshot.session.sectorFlags ?? []).filter((flag) => flag.trim() !== "");
  return {
    type: "racing-flags",
    status: snapshot.status === "stale" ? "stale" : "ready",
    globalFlag,
    sectorFlags,
    message: globalFlag && globalFlag !== "green" ? globalFlag.toUpperCase() : undefined,
    showSectorFlags: content.showSectorFlags,
    hideWhenGreen: content.hideWhenGreen,
    hidden: content.hideWhenGreen && globalFlag === "green",
  };
}
