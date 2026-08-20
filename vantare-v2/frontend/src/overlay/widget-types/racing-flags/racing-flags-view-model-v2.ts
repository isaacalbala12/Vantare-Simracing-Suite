import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { RacingFlagsContent } from "./racing-flags-definition";
import type { RacingFlagsViewModel } from "./racing-flags-view-model";

/**
 * Session slice consumer chosen for F8: racing-flags reads nothing but
 * `frame.session`, with no vehicle, scoring or history coupling at all, which
 * makes it the honest parity probe for SessionV2. race-schedule was the other
 * candidate and was discarded: it is an external calendar consumer that never
 * touches telemetry, so it cannot demonstrate anything about the contract.
 *
 * Sector flags stay empty and the global flag stays undefined while the
 * canonical state has no flag signal. Overlay v1 has the same hole, so the two
 * contracts agree on the absence instead of one of them inventing a green.
 */
export function buildRacingFlagsViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: RacingFlagsContent,
): RacingFlagsViewModel {
  const base = {
    type: "racing-flags",
    sectorFlags: [],
    showSectorFlags: content.showSectorFlags,
    hideWhenGreen: content.hideWhenGreen,
  } as const;
  if (source.state === "error" || source.state === "stopped") {
    return {
      ...base,
      status: source.state === "error" ? "error" : "disconnected",
      statusMessage: source.reason || undefined,
      hidden: false,
    };
  }
  const globalFlag = displayedFlag(frame.session.flag);
  return {
    ...base,
    status: source.state === "stale" ? "stale" : "ready",
    statusMessage: source.reason || undefined,
    globalFlag,
    message: globalFlag && globalFlag !== "green" ? globalFlag.toUpperCase() : undefined,
    hidden: content.hideWhenGreen && globalFlag === "green",
  };
}

export function racingFlagsDisplayedValues(
  model: RacingFlagsViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    globalFlag: model.globalFlag ?? "—",
    sectorFlags: model.showSectorFlags ? model.sectorFlags.join("|") : "hidden",
    message: model.message ?? "—",
    hidden: String(model.hidden),
  });
}

function displayedFlag(value: OverlayQValue<string>): string | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  return value.v?.trim().toLowerCase() || undefined;
}
