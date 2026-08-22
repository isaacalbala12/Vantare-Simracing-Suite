import type { OverlayFrameV2, OverlayQValue, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import type { TrackWeatherContent } from "./track-weather-definition";
import type { TrackWeatherViewModel } from "./track-weather-view-model";

function displayedNumber(value: OverlayQValue<number> | undefined): number | undefined {
  if (!value || value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? 0;
}

function displayedText(value: OverlayQValue<string> | undefined): string | undefined {
  if (!value || value.q === "missing" || value.q === "invalid") return undefined;
  return value.v ?? "";
}

/**
 * Track-weather view model over the Overlay v2 contract.
 *
 * The Go builder publishes every field as missing until a driver admits a
 * weather source (LMU has none today: strategy_signal_audit declares every
 * weather.* unsupported and the adapter marks environment as
 * unsupported-by-projection). The view model therefore stays at missing in
 * production until that signal exists, without inventing a default.
 *
 * T4 cross-request: lapDistance/position for track-map are not part of weather;
 * they are exposed on StandingRowV2.lapDistance/groundPosition and consumed by
 * the track-map v2 model (ISA-780). Race-schedule events remain auxiliary/HUB
 * data and not a telemetry frame field.
 */
export function buildTrackWeatherViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: TrackWeatherContent,
): TrackWeatherViewModel {
  if (source.state === "error" || source.state === "stopped") {
    return { type: "track-weather", status: source.state === "error" ? "error" : "disconnected", statusMessage: source.reason || undefined, content };
  }
  if (source.state === "stale") {
    const hasAny = hasWeatherData(frame);
    if (!hasAny) return { type: "track-weather", status: "missing", content };
    return { type: "track-weather", status: "stale", ...weatherValues(frame), content };
  }
  if (!hasWeatherData(frame)) {
    return { type: "track-weather", status: "missing", content };
  }
  return { type: "track-weather", status: "ready", ...weatherValues(frame), content };
}

function hasWeatherData(frame: OverlayFrameV2): boolean {
  const w = frame.weather;
  if (!w) return false;
  return [w.ambientC, w.trackC, w.rainPercent, w.wetnessPct, w.windKph, w.windDir, w.pressureHpa].some((field) => {
    if (!field) return false;
    return field.q === "fresh" || field.q === "stale";
  });
}

function weatherValues(frame: OverlayFrameV2): Pick<TrackWeatherViewModel, "ambientC" | "trackC" | "rainPercent" | "wetnessPercent" | "windKph" | "windDirection" | "pressureHpa"> {
  const w = frame.weather;
  return {
    ambientC: displayedNumber(w?.ambientC),
    trackC: displayedNumber(w?.trackC),
    rainPercent: displayedNumber(w?.rainPercent),
    wetnessPercent: displayedNumber(w?.wetnessPct),
    windKph: displayedNumber(w?.windKph),
    windDirection: displayedText(w?.windDir),
    pressureHpa: displayedNumber(w?.pressureHpa),
  };
}

export function trackWeatherDisplayedValuesV2(model: TrackWeatherViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    ambientC: model.ambientC !== undefined ? String(model.ambientC) : "—",
    trackC: model.trackC !== undefined ? String(model.trackC) : "—",
    rainPercent: model.rainPercent !== undefined ? String(model.rainPercent) : "—",
    windKph: model.windKph !== undefined ? String(model.windKph) : "—",
  });
}
