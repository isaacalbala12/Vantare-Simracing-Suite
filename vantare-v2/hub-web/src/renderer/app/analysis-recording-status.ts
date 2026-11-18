import type {
  AnalysisRecordingLimits,
  AnalysisRecordingStatus,
  AnalysisRow,
} from "../../contract/generated/analysis";

export function deletedRecordings(
  status: AnalysisRecordingStatus | null | undefined,
) {
  if (!status) return undefined;
  const { atMs, items } = status.lastPrune;
  const deleted = items.filter(
    (item) => item.result === "deleted" && item.reason !== "orphan",
  );
  if (!deleted.length) return undefined;
  return {
    atMs,
    items: deleted,
    bytes: deleted.reduce((total, item) => total + item.sizeBytes, 0),
    key: JSON.stringify([atMs, deleted.map((item) => item.name)]),
  };
}

export function recordingUsage(
  rows: AnalysisRow[],
  limits: AnalysisRecordingLimits,
) {
  const count = rows.length;
  const bytes = rows.reduce((total, row) => total + row.sizeBytes, 0);
  return {
    count,
    bytes,
    atLimit: count >= limits.maxRecordings || bytes >= limits.maxBytes,
  };
}

export function recordingIndicator(
  status: AnalysisRecordingStatus | null | undefined,
  enabled: boolean,
  enabledAtStart: boolean | undefined,
  atLimit: boolean,
  catalogRecording: boolean,
) {
  const running = status?.state === "recording" || status?.state === "degraded";
  const catalogLive = status === undefined && catalogRecording;
  if (!enabled && enabledAtStart === false && !running && !catalogLive)
    return "disabled";
  // The host also writes "stopped" after a normal finish, and can report a
  // failed initialisation or a dead writer as "degraded".
  if (
    (status?.state === "stopped" && status.cause !== null) ||
    (status?.state === "degraded" &&
      (status.cause === "writerDown" ||
        status.cause === "helperMissing" ||
        status.cause === "invalidDirectory" ||
        status.cause === "volumeWithoutHardLinks" ||
        status.cause === "finishTimeout"))
  )
    return "stopped";
  if (!enabled && (enabledAtStart || running || catalogLive))
    return "pendingOff";
  if (enabled && enabledAtStart === false && !running && !catalogLive)
    return "pendingOn";
  if (!enabled) return "disabled";
  if (status?.state === "degraded" && status.cause === "quotaUnmet")
    return "quotaUnmet";
  if (status?.state === "degraded") return "degraded";
  if (status?.state === "recording" && atLimit) return "limit";
  if (status?.state === "recording" || catalogLive) return "recording";
  return status === undefined ? "unavailable" : "idle";
}
