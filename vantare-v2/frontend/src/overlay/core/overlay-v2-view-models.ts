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
  type OverlayV2Feature,
} from "../telemetry-shadow/overlay-v2-features";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import { buildRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import { buildDeltaViewModelV2 } from "../widget-types/delta/delta-view-model-v2";
import { buildFuelStrategyViewModelV2 } from "../widget-types/fuel-strategy/fuel-strategy-view-model-v2";
import { buildPedalsTelemetryViewModelV2 } from "../widget-types/pedals-telemetry/pedals-telemetry-view-model-v2";
import { buildInputTelemetryViewModelV2 } from "../widget-types/input-telemetry/input-telemetry-view-model-v2";
import { buildRacingFlagsViewModelV2 } from "../widget-types/racing-flags/racing-flags-view-model-v2";

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
      buildViewModelV2: (frame, source, content) =>
        buildRelativeViewModelV2(frame, source, content as never),
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
]);

export function getOverlayV2ViewModelEntry(type: WidgetType): OverlayV2ViewModelEntry | undefined {
  return overlayV2ViewModelRegistry.get(type);
}
