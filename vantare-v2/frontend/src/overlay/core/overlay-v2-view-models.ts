import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { WidgetType } from "./profile-document";
import type { WidgetRuntimeInput, WidgetViewModelBase } from "./widget-definition";
import {
  OVERLAY_V2_CONTROLS,
  OVERLAY_V2_DELTA,
  OVERLAY_V2_FUEL,
  OVERLAY_V2_PLAYER_INSTRUMENTS,
  OVERLAY_V2_RELATIVE,
  OVERLAY_V2_SESSION,
  OVERLAY_V2_STANDINGS,
  OVERLAY_V2_DAMAGE,
  OVERLAY_V2_WEATHER,
  type OverlayV2Feature,
} from "../telemetry-shadow/overlay-v2-features";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import { buildRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import { buildDeltaViewModelV2 } from "../widget-types/delta/delta-view-model-v2";
import { buildFuelStrategyViewModelV2 } from "../widget-types/fuel-strategy/fuel-strategy-view-model-v2";
import { buildPedalsTelemetryViewModelV2 } from "../widget-types/pedals-telemetry/pedals-telemetry-view-model-v2";
import { buildInputTelemetryViewModelV2 } from "../widget-types/input-telemetry/input-telemetry-view-model-v2";
import { buildRacingFlagsViewModelV2 } from "../widget-types/racing-flags/racing-flags-view-model-v2";
import { buildDeltaAdvancedViewModelV2 } from "../widget-types/delta-advanced/delta-advanced-view-model-v2";
import { buildDeltaTraceViewModelV2 } from "../widget-types/delta-trace/delta-trace-view-model-v2";
import { buildPedalsViewModelV2 } from "../widget-types/pedals/pedals-view-model-v2";
import { buildPedalsTelemetryCompactViewModelV2 } from "../widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model-v2";
import { buildMulticlassRelativeViewModelV2 } from "../widget-types/multiclass-relative/multiclass-relative-view-model-v2";
import { buildHeadToHeadViewModelV2 } from "../widget-types/head-to-head/head-to-head-view-model-v2";
import { buildTrackMapViewModelV2 } from "../widget-types/track-map/track-map-view-model-v2";
import { buildTrackWeatherViewModelV2 } from "../widget-types/track-weather/track-weather-view-model-v2";
import { buildBroadcastTowerViewModelV2 } from "../widget-types/broadcast-tower/broadcast-tower-view-model-v2";
import { buildCarDamageNumbersViewModelV2 } from "../widget-types/car-damage-numbers/car-damage-numbers-view-model-v2";
import { buildCarDamageVisualViewModelV2 } from "../widget-types/car-damage-visual/car-damage-visual-view-model-v2";

export type OverlayV2ViewModelBuilder = (
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  content: Record<string, unknown>,
  ctx?: WidgetRuntimeInput,
) => WidgetViewModelBase;

export type OverlayV2ViewModelEntry = Readonly<{
  feature: OverlayV2Feature;
  buildViewModelV2: OverlayV2ViewModelBuilder;
}>;

function deltaBuilder(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  _content: Record<string, unknown>,
): WidgetViewModelBase {
  void _content;
  return buildDeltaViewModelV2(frame, source);
}

export const overlayV2ViewModelRegistry: ReadonlyMap<WidgetType, OverlayV2ViewModelEntry> = new Map<
  WidgetType,
  OverlayV2ViewModelEntry
>([
  [
    "standings",
    {
      feature: OVERLAY_V2_STANDINGS,
      buildViewModelV2: (frame, source, content) =>
        buildStandingsViewModelV2(frame, source, content as never),
    },
  ],
  [
    "relative",
    {
      feature: OVERLAY_V2_RELATIVE,
      buildViewModelV2: (frame, source, content, ctx) => {
        const redline = ctx?.relativeViewModelStability === "endurance-redline";
        return buildRelativeViewModelV2(frame, source, content as never, {
          state: redline ? ctx?.relativeViewModelState : undefined,
          nowMs: ctx?.relativeViewModelNowMs,
          instanceKey: ctx?.relativeViewModelInstanceKey,
          bridgeSourceReconnect: redline,
        });
      },
    },
  ],
  [
    "delta",
    {
      feature: OVERLAY_V2_DELTA,
      buildViewModelV2: deltaBuilder,
    },
  ],
  [
    "fuel-strategy",
    {
      feature: OVERLAY_V2_FUEL,
      buildViewModelV2: (frame, source, content) =>
        buildFuelStrategyViewModelV2(frame, source, content as never),
    },
  ],
  [
    "pedals-telemetry",
    {
      feature: OVERLAY_V2_PLAYER_INSTRUMENTS,
      buildViewModelV2: (frame, source, content) =>
        buildPedalsTelemetryViewModelV2(frame, source, content as never),
    },
  ],
  [
    "input-telemetry",
    {
      feature: OVERLAY_V2_CONTROLS,
      buildViewModelV2: (frame, source, content) =>
        buildInputTelemetryViewModelV2(frame, source, content as never),
    },
  ],
  [
    "racing-flags",
    {
      feature: OVERLAY_V2_SESSION,
      buildViewModelV2: (frame, source, content) =>
        buildRacingFlagsViewModelV2(frame, source, content as never),
    },
  ],
  // Cutover v2 (ISA-805): variantes de presentacion y widgets restantes.
  // race-schedule queda fuera a propósito: recibe el canal auxiliar Calendar
  // por WidgetRuntimeInput, no telemetría canónica ni TelemetrySnapshot.
  ["delta-advanced", { feature: OVERLAY_V2_DELTA, buildViewModelV2: (frame, source, content) => buildDeltaAdvancedViewModelV2(frame, source, content as never) }],
  ["delta-trace", { feature: OVERLAY_V2_DELTA, buildViewModelV2: (frame, source, content) => buildDeltaTraceViewModelV2(frame, source, content as never) }],
  ["pedals", { feature: OVERLAY_V2_PLAYER_INSTRUMENTS, buildViewModelV2: (frame, source, content) => buildPedalsViewModelV2(frame, source, content as never) }],
  ["pedals-telemetry-compact", { feature: OVERLAY_V2_PLAYER_INSTRUMENTS, buildViewModelV2: (frame, source, content) => buildPedalsTelemetryCompactViewModelV2(frame, source, content as never) }],
  ["multiclass-relative", { feature: OVERLAY_V2_RELATIVE, buildViewModelV2: (frame, source, content) => buildMulticlassRelativeViewModelV2(frame, source, content as never) }],
  ["head-to-head", { feature: OVERLAY_V2_RELATIVE, buildViewModelV2: (frame, source, content) => buildHeadToHeadViewModelV2(frame, source, content as never) }],
  ["track-map", { feature: OVERLAY_V2_STANDINGS, buildViewModelV2: (frame, source, content) => buildTrackMapViewModelV2(frame, source, content as never) }],
  ["broadcast-tower", { feature: OVERLAY_V2_STANDINGS, buildViewModelV2: (frame, source, content) => buildBroadcastTowerViewModelV2(frame, source, content as never) }],
  ["track-weather", { feature: OVERLAY_V2_WEATHER, buildViewModelV2: (frame, source, content) => buildTrackWeatherViewModelV2(frame, source, content as never) }],
  ["car-damage-numbers", { feature: OVERLAY_V2_DAMAGE, buildViewModelV2: (frame, source, content) => buildCarDamageNumbersViewModelV2(frame, source, content as never) }],
  ["car-damage-visual", { feature: OVERLAY_V2_DAMAGE, buildViewModelV2: (frame, source, content) => buildCarDamageVisualViewModelV2(frame, source, content as never) }],
]);

export function getOverlayV2ViewModelEntry(type: WidgetType): OverlayV2ViewModelEntry | undefined {
  return overlayV2ViewModelRegistry.get(type);
}
