import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlayRelativeRowV2,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import type { RelativeContent } from "./relative-content";
import { getEnabledRelativeColumns } from "./relative-content";
import { resolveRelativeTone } from "./relative-row-selection";
import type { RelativeRowViewModel, RelativeViewModel } from "./relative-view-model";

const PLACEHOLDER = "—";
export const RELATIVE_MEMBERSHIP_HOLD_MS = 900;
export const RELATIVE_IMMEDIATE_SPATIAL_DISPLACEMENT_METERS = 75;

export type RelativeViewModelState = {
  scopeKey?: string;
  instanceToken?: object;
  acceptedIds?: readonly string[];
  pendingKey?: string;
  pendingSinceMs?: number;
  lastSequence?: number;
  lastNowMs?: number;
  lastGeneratedAtMs?: number;
};

export type RelativeViewModelStabilityOptions = Readonly<{
  state?: RelativeViewModelState;
  nowMs?: () => number;
  holdMs?: number;
  immediateSpatialDisplacementMeters?: number;
  instanceToken?: object;
}>;

export function createRelativeViewModelState(): RelativeViewModelState {
  return {};
}

/**
 * Relative view model over the Overlay v2 contract.
 *
 * The row selection is NOT redone here. Overlay v1 walked outwards from the
 * player over a lap-distance ordering inside relative-row-selection.ts (:9-48)
 * and produced [ahead far→near, player, behind near→far]. That selection is
 * domain and now lives in the Go builder, which publishes exactly that order
 * over canonical lap distance and attaches the canonical temporal gap.
 *
 * This module only presents: it trims the already ordered window to the range
 * the widget configured, optionally drops the player anchor, scopes by class
 * and formats the gap. Every visible field comes from the same Relative row;
 * the view model never joins a differently scheduled standings section.
 *
 * Fields with no canonical signal behind them stay at the placeholder and are
 * declared rather than invented: driverNumber and bestLapText.
 */
export function buildRelativeViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: RelativeContent,
  stability: RelativeViewModelStabilityOptions = {},
): RelativeViewModel {
  const columns = getEnabledRelativeColumns(content);
  if (source.state !== "live") {
    resetStability(stability.state);
    return {
      type: "relative",
      status: unavailableStatus(source.state),
      statusMessage: source.reason || undefined,
      columns,
      rowHeightMode: content.rowHeightMode,
      rows: [],
    };
  }

  const playerIndex = frame.relative.findIndex((row) => row.side === "player");
  const scoped = content.classScope === "sameClass"
    ? frame.relative.filter((row) => sameClass(row, frame.relative[playerIndex]))
    : frame.relative;
  const anchor = scoped.findIndex((row) => row.side === "player");
  const candidateWithPlayer = anchor < 0
    ? []
    : [
        ...scoped.slice(Math.max(0, anchor - content.rangeAhead), anchor),
        scoped[anchor],
        ...scoped.slice(anchor + 1, anchor + 1 + content.rangeBehind),
      ];
  const stableWithPlayer = stabilizeWindow(frame, source, scoped, candidateWithPlayer, content, stability);
  const window = content.includePlayer
    ? stableWithPlayer
    : stableWithPlayer.filter((row) => row.side !== "player");

  return {
    type: "relative",
    status: "ready",
    statusMessage: source.reason || undefined,
    columns,
    rowHeightMode: content.rowHeightMode,
    rows: window.map(buildRow),
  };
}

export function relativeDisplayedValues(
  model: RelativeViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    rowCount: String(model.rows.length),
    rows: model.rows
      .map((row) => [
        row.id, row.position, row.vehicleClass, row.driverName,
        row.gapText, row.side, row.tone, row.isPlayer ? "player" : "",
      ].join("~"))
      .join("|"),
  });
}

/** Fields with no canonical signal behind them; declared, never compared. */
export const OVERLAY_V2_RELATIVE_DECLARED_GAPS: readonly string[] = Object.freeze([
  "rows[].driverNumber",
  "rows[].bestLapText",
]);

function unavailableStatus(state: string): RelativeViewModel["status"] {
  switch (state) {
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    case "stale":
      return "stale";
    default:
      return "missing";
  }
}

function sameClass(row: OverlayRelativeRowV2, player: OverlayRelativeRowV2 | undefined): boolean {
  if (player === undefined) return false;
  return (row.classId ?? "").toUpperCase() === (player.classId ?? "").toUpperCase();
}

function buildRow(
  row: OverlayRelativeRowV2,
): RelativeRowViewModel {
  const isPlayer = row.side === "player";
  const gapSeconds = displayedNumber(row.gap) ?? null;
  return {
    id: row.id,
    position: row.position,
    vehicleClass: row.classId ?? "",
    driverNumber: "",
    driverName: row.name || "?",
    gapText: isPlayer || gapSeconds === null ? PLACEHOLDER : formatGap(gapSeconds),
    bestLapText: PLACEHOLDER,
    lastLapText: formatLapTime(displayedNumber(row.lastLap)),
    isPlayer,
    side: row.side as RelativeRowViewModel["side"],
    tone: resolveRelativeTone(gapSeconds ?? undefined, isPlayer),
    gapSeconds,
  };
}

function stabilizeWindow(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  scoped: readonly OverlayRelativeRowV2[],
  candidate: readonly OverlayRelativeRowV2[],
  content: RelativeContent,
  options: RelativeViewModelStabilityOptions,
): readonly OverlayRelativeRowV2[] {
  const state = options.state;
  if (state === undefined) return candidate;

  const scopeKey = [
    frame.epoch,
    frame.sessionId,
    source.retry ?? 0,
    content.classScope,
    content.rangeAhead,
    content.rangeBehind,
    content.includePlayer ? 1 : 0,
  ].join(":");
  if (
    state.scopeKey !== scopeKey ||
    state.instanceToken !== options.instanceToken ||
    state.acceptedIds === undefined
  ) {
    acceptWindow(state, scopeKey, options.instanceToken, frame, monotonicNow(options, state), candidate);
    return candidate;
  }

  const acceptedCurrent = rowsForIds(scoped, state.acceptedIds);
  const generatedAtMs = parsedGeneratedAt(frame.generatedAt);
  if (
    state.lastSequence !== undefined && frame.sequence < state.lastSequence &&
    generatedAtMs > (state.lastGeneratedAtMs ?? generatedAtMs)
  ) {
    acceptWindow(state, scopeKey, options.instanceToken, frame, monotonicNow(options, state), candidate);
    return candidate;
  }
  if (state.lastSequence !== undefined && frame.sequence <= state.lastSequence) {
    return acceptedCurrent;
  }

  const nowMs = monotonicNow(options, state);
  const candidateKey = identityKey(candidate);
  const acceptedKey = state.acceptedIds.join("|");
  if (hasCanonicalSideChange(state.acceptedIds, acceptedCurrent)) {
    acceptWindow(state, scopeKey, options.instanceToken, frame, nowMs, candidate);
    return candidate;
  }
  if (candidateKey === acceptedKey) {
    state.pendingKey = undefined;
    state.pendingSinceMs = undefined;
    state.lastSequence = frame.sequence;
    state.lastNowMs = nowMs;
    state.lastGeneratedAtMs = generatedAtMs;
    return candidate;
  }

  // Membership state contains VehicleIDs only. Values and ordering are always
  // rehydrated from the current canonical row, and vanished IDs are pruned.
  state.acceptedIds = acceptedCurrent.map((row) => row.id);
  const thresholdMeters = normalizedSpatialThreshold(options.immediateSpatialDisplacementMeters);
  if (exceedsSpatialDisplacement(candidate, acceptedCurrent, thresholdMeters)) {
    acceptWindow(state, scopeKey, options.instanceToken, frame, nowMs, candidate);
    return candidate;
  }

  if (state.pendingKey !== candidateKey) {
    state.pendingKey = candidateKey;
    state.pendingSinceMs = nowMs;
  }
  state.lastSequence = frame.sequence;
  state.lastNowMs = nowMs;
  state.lastGeneratedAtMs = generatedAtMs;
  const holdMs = normalizedHold(options.holdMs);
  if (nowMs - (state.pendingSinceMs ?? nowMs) >= holdMs) {
    acceptWindow(state, scopeKey, options.instanceToken, frame, nowMs, candidate);
    return candidate;
  }
  return acceptedCurrent;
}

function identityKey(rows: readonly OverlayRelativeRowV2[]): string {
  return rows.map((row) => row.id).join("|");
}

function rowsForIds(
  current: readonly OverlayRelativeRowV2[],
  ids: readonly string[],
): readonly OverlayRelativeRowV2[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
}

function hasCanonicalSideChange(
  acceptedIds: readonly string[],
  current: readonly OverlayRelativeRowV2[],
): boolean {
  const playerIndex = current.findIndex((row) => row.side === "player");
  if (playerIndex < 0) return false;
  const playerId = current[playerIndex]!.id;
  const acceptedPlayerIndex = acceptedIds.indexOf(playerId);
  if (acceptedPlayerIndex < 0) return false;
  return current.some((row) => {
    const acceptedIndex = acceptedIds.indexOf(row.id);
    const expected = acceptedIndex < acceptedPlayerIndex ? "ahead"
      : acceptedIndex > acceptedPlayerIndex ? "behind"
        : "player";
    return row.side !== expected;
  });
}

function exceedsSpatialDisplacement(
  candidate: readonly OverlayRelativeRowV2[],
  accepted: readonly OverlayRelativeRowV2[],
  thresholdMeters: number,
): boolean {
  const acceptedIds = new Set(accepted.map((row) => row.id));
  const candidateIds = new Set(candidate.map((row) => row.id));
  const newcomers = candidate.filter((row) => row.side !== "player" && !acceptedIds.has(row.id));
  const outgoing = accepted.filter((row) => row.side !== "player" && !candidateIds.has(row.id));
  for (const newcomer of newcomers) {
    const newcomerPosition = displayedGroundPosition(newcomer);
    if (newcomerPosition === undefined) continue;
    for (const previous of outgoing) {
      if (previous.side !== newcomer.side) continue;
      const previousPosition = displayedGroundPosition(previous);
      if (previousPosition !== undefined && Math.hypot(
        newcomerPosition.x - previousPosition.x,
        newcomerPosition.z - previousPosition.z,
      ) >= thresholdMeters) {
        return true;
      }
    }
  }
  return false;
}

function displayedGroundPosition(
  row: OverlayRelativeRowV2,
): Readonly<{ x: number; z: number }> | undefined {
  const position = row.groundPosition;
  if (position.q === "missing" || position.q === "invalid" || position.v === undefined) return undefined;
  return position.v;
}

function normalizedSpatialThreshold(value: number | undefined): number {
  const threshold = value ?? RELATIVE_IMMEDIATE_SPATIAL_DISPLACEMENT_METERS;
  return Number.isFinite(threshold) && threshold >= 0
    ? threshold
    : RELATIVE_IMMEDIATE_SPATIAL_DISPLACEMENT_METERS;
}

function normalizedHold(value: number | undefined): number {
  const hold = value ?? RELATIVE_MEMBERSHIP_HOLD_MS;
  return Number.isFinite(hold) && hold >= 0 ? hold : RELATIVE_MEMBERSHIP_HOLD_MS;
}

function monotonicNow(
  options: RelativeViewModelStabilityOptions,
  state: RelativeViewModelState,
): number {
  const measured = options.nowMs?.() ?? performance.now();
  const finite = Number.isFinite(measured) ? measured : (state.lastNowMs ?? 0);
  return Math.max(state.lastNowMs ?? finite, finite);
}

function acceptWindow(
  state: RelativeViewModelState,
  scopeKey: string,
  instanceToken: object | undefined,
  frame: OverlayFrameV2,
  nowMs: number,
  rows: readonly OverlayRelativeRowV2[],
): void {
  state.scopeKey = scopeKey;
  state.instanceToken = instanceToken;
  state.acceptedIds = rows.map((row) => row.id);
  state.pendingKey = undefined;
  state.pendingSinceMs = undefined;
  state.lastSequence = frame.sequence;
  state.lastNowMs = nowMs;
  state.lastGeneratedAtMs = parsedGeneratedAt(frame.generatedAt);
}

function parsedGeneratedAt(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resetStability(state: RelativeViewModelState | undefined): void {
  if (state === undefined) return;
  state.scopeKey = undefined;
  state.instanceToken = undefined;
  state.acceptedIds = undefined;
  state.pendingKey = undefined;
  state.pendingSinceMs = undefined;
  state.lastSequence = undefined;
  state.lastNowMs = undefined;
  state.lastGeneratedAtMs = undefined;
}

function formatGap(seconds: number): string {
  return `${seconds > 0 ? "+" : ""}${seconds.toFixed(1)}`;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return PLACEHOLDER;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}
