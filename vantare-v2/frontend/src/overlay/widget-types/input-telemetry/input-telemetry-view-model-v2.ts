import type {
  OverlayControlsHistoryV2,
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import { speedInKph } from "../pedals-telemetry/pedals-telemetry-view-model-v2";
import type { InputTelemetrySample } from "./input-telemetry-accumulator";
import type { InputTelemetryContent } from "./input-telemetry-definition";
import type { InputTelemetryViewModel } from "./input-telemetry-view-model";

/** Per-mille is the quantization the Go builder publishes: three decimals. */
const PER_MILLE = 1000;

/**
 * Input telemetry view model over the Overlay v2 contract.
 *
 * The history is NOT accumulated here. Overlay v1 kept one TypeScript
 * accumulator per widget id (input-telemetry-accumulator.ts), fed by whatever
 * snapshots reached the browser, so two widgets watching the same lap could
 * hold different series and a remount lost the lap. Go now derives the series
 * once from the canonical stream and publishes it as `controls.history`; this
 * module only decodes it. The accumulator stays in the tree for the Overlay v1
 * path and is retired with it.
 *
 * Each sample carries its absolute capture instant (`capturedAtMS`, Unix epoch
 * milliseconds from the real capture clock) plus its motion cells (speed in
 * m/s, rpm, gear), every motion cell with its own quality. The decoder reads
 * those instants verbatim: no `Date.now`, no rebase to `frame.generatedAt`,
 * no browser time authority. The only transformation is presentation:
 * per-mille back to ratio and m/s to the km/h the widget draws.
 */
export function buildInputTelemetryViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: InputTelemetryContent,
  options: Readonly<{ includeHistory?: boolean }> = {},
): InputTelemetryViewModel {
  const status = resolveStatus(source.state);
  const unavailable = status === "missing" || status === "disconnected" || status === "error";
  return {
    type: "input-telemetry",
    status,
    statusMessage: source.reason || undefined,
    throttle: unavailable ? 0 : displayedNumber(frame.player.throttle) ?? 0,
    brake: unavailable ? 0 : displayedNumber(frame.player.brake) ?? 0,
    clutch: unavailable ? 0 : displayedNumber(frame.player.clutch) ?? 0,
    speedKph: unavailable ? undefined : speedInKph(frame.player.speed, frame.units.speed),
    rpm: unavailable ? undefined : displayedNumber(frame.player.rpm),
    gear: unavailable ? undefined : displayedNumber(frame.player.gear),
    history: unavailable || options.includeHistory === false
      ? []
      : decodeControlsHistory(frame.controls.history, content.historySeconds),
    historySeconds: content.historySeconds,
    showClutch: content.showClutch,
  };
}

/**
 * Decodes the compact wire series into the samples the widget draws, newest
 * last, trimmed to the window the widget is configured to show.
 *
 * Timestamps come straight from `capturedAtMS`; the trim cutoff is measured
 * against the newest sample instant, never against the frame instant or the
 * browser clock. A motion cell whose quality is missing/invalid decodes to
 * `undefined`; stale/fresh cells keep their value. Arrays stay index-aligned
 * by taking the shortest length, so a ragged wire row can never misalign a
 * pedal with another sample's motion.
 */
export function decodeControlsHistory(
  history: OverlayControlsHistoryV2,
  historySeconds: number,
): readonly InputTelemetrySample[] {
  if (history.q === "missing" || history.q === "invalid") return [];
  const capturedAtMS = history.capturedAtMS ?? [];
  const throttle = history.throttle ?? [];
  const brake = history.brake ?? [];
  const clutch = history.clutch ?? [];
  const speedMPS = history.speedMPS ?? [];
  const rpm = history.rpm ?? [];
  const gear = history.gear ?? [];
  const count = Math.min(
    capturedAtMS.length, throttle.length, brake.length, clutch.length,
    speedMPS.length, rpm.length, gear.length,
  );
  if (count === 0) return [];

  const newest = capturedAtMS[count - 1];
  if (!Number.isFinite(newest)) return [];
  const cutoff = newest - Math.max(1, Math.min(8, historySeconds)) * 1000;
  const samples: InputTelemetrySample[] = [];
  for (let index = 0; index < count; index += 1) {
    const capturedAt = capturedAtMS[index];
    if (!Number.isFinite(capturedAt) || capturedAt < cutoff) continue;
    samples.push({
      capturedAt,
      throttle: ratio(throttle[index]),
      brake: ratio(brake[index]),
      clutch: ratio(clutch[index]),
      speedKph: motionSpeedKph(speedMPS[index]),
      rpm: motionNumber(rpm[index]),
      gear: motionNumber(gear[index]),
    });
  }
  return samples;
}

export function inputTelemetryDisplayedValues(
  model: InputTelemetryViewModel,
): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    throttle: model.throttle.toFixed(3),
    brake: model.brake.toFixed(3),
    clutch: model.clutch.toFixed(3),
    historyRows: String(model.history.length),
    historyRatios: model.history
      .map((sample) => `${sample.throttle.toFixed(3)}/${sample.brake.toFixed(3)}/${sample.clutch.toFixed(3)}`)
      .join(","),
  });
}

/**
 * Fields that cannot be paired sample-by-sample with v1; declared, not
 * compared. V2 reconstructs timestamps from `windowMs`, so an array index is
 * not a shared observation across the independently sampled histories.
 */
export const OVERLAY_V2_CONTROLS_DECLARED_GAPS: readonly string[] = Object.freeze([
  "history.length",
  "history[].capturedAt",
  "history[].throttle",
  "history[].brake",
  "history[].clutch",
  "history[].speedKph",
  "history[].rpm",
  "history[].gear",
]);

function resolveStatus(state: string): InputTelemetryViewModel["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "stopped":
      return "disconnected";
    default:
      return "missing";
  }
}

function ratio(perMille: number | undefined): number {
  if (perMille === undefined || !Number.isFinite(perMille)) return 0;
  return Math.min(1, Math.max(0, perMille / PER_MILLE));
}

/**
 * Reads one motion cell of the wire history. Missing/invalid cells decode to
 * `undefined` (never zero: absent is not zero); stale/fresh cells keep their
 * value, with Go's elided zero read back as 0 through the quality bit.
 */
function motionNumber(cell: OverlayQValue<number> | undefined): number | undefined {
  if (cell === undefined || cell.q === "missing" || cell.q === "invalid") return undefined;
  return cell.v ?? 0;
}

/**
 * Presents a wire speed sample in the km/h the widget draws. The wire unit is
 * always m/s (Go publishes the source value untouched); the x3.6 lives only
 * here, never in the canonical series.
 */
function motionSpeedKph(cell: OverlayQValue<number> | undefined): number | undefined {
  const metresPerSecond = motionNumber(cell);
  if (metresPerSecond === undefined) return undefined;
  return metresPerSecond * 3.6;
}

function displayedNumber(value: OverlayQValue<number>): number | undefined {
  if (value.q === "missing" || value.q === "invalid") return undefined;
  // Go omitempty elides legitimate zeroes. Quality is the presence bit.
  return value.v ?? 0;
}
