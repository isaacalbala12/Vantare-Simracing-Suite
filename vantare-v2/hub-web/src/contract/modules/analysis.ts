import { comparison, decimal, lap, row, token } from "../analysis-validation";
import {
  analysisErrors,
  analysisMax,
  analysisStates,
} from "../generated/analysis";
import { exact, integer, oneOf } from "../validation-common";

export { analysisMethods as methods } from "../generated/analysis";
export function isRequest(v: Record<string, unknown>): boolean {
  switch (v.method) {
    case "analysis.catalog":
    case "analysis.cancel":
      return exact(v, ["method"]);
    case "analysis.inspect":
    case "analysis.open":
      return exact(v, ["method", "id"]) && token(v.id);
    // Cancel/timeout invalidates this session: reopen the recording before retrying.
    case "analysis.compare":
      return (
        exact(v, ["method", "session", "a", "b"]) &&
        token(v.session) &&
        integer(v.a) &&
        integer(v.b)
      );
    case "analysis.close":
      return exact(v, ["method", "session"]) && token(v.session);
    default:
      return false;
  }
}
export function isReply(v: Record<string, unknown>): boolean {
  switch (v.method) {
    case "analysis.catalog":
      return (
        exact(v, ["method", "recordings", "max"]) &&
        v.max === analysisMax &&
        Array.isArray(v.recordings) &&
        v.recordings.length <= analysisMax &&
        v.recordings.every(row)
      );
    case "analysis.inspect":
      return (
        exact(
          v,
          Object.hasOwn(v, "bestLapApproxMs")
            ? ["method", "state", "laps", "bestLapApproxMs"]
            : ["method", "state", "laps"],
        ) &&
        oneOf(v.state, analysisStates) &&
        integer(v.laps) &&
        (v.bestLapApproxMs === undefined ||
          v.bestLapApproxMs === null ||
          integer(v.bestLapApproxMs))
      );
    case "analysis.open":
      return (
        exact(v, [
          "method",
          "session",
          "watermark",
          "finished",
          "attempted",
          "total",
          "laps",
        ]) &&
        token(v.session) &&
        [v.watermark, v.attempted, v.total].every(decimal) &&
        typeof v.finished === "boolean" &&
        Array.isArray(v.laps) &&
        v.laps.length <= analysisMax &&
        v.laps.every(lap)
      );
    case "analysis.compare":
      return comparison(v);
    case "analysis.close":
      return exact(v, ["method"]);
    case "analysis.cancel":
      return (
        exact(v, ["method", "cancelled"]) && typeof v.cancelled === "boolean"
      );
    default:
      return false;
  }
}
export function isError(v: Record<string, unknown>): boolean {
  return (
    exact(v, ["kind"]) &&
    oneOf(
      v.kind,
      analysisErrors.map((error) => error.kind),
    )
  );
}
export function isEvent(_v: Record<string, unknown>): boolean {
  return false;
}
