import type { ComponentType } from "react";
import type { WidgetTelemetryMode } from "./widgets/use-widget-telemetry";
import { DeltaWidget } from "./widgets/DeltaWidget";
import { RelativeWidget } from "./widgets/RelativeWidget";
import { StandingsWidget } from "./widgets/StandingsWidget";
import { TelemetryWidget } from "./widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "./widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "./widgets/PedalsWidget";

type WidgetComponentProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

export const WIDGET_COMPONENTS: Record<string, ComponentType<WidgetComponentProps>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
};
