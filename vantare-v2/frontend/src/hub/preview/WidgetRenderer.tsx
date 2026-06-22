import type { ComponentType, CSSProperties } from "react";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { DeltaWidget } from "../../overlay/widgets/DeltaWidget";
import { RelativeWidget } from "../../overlay/widgets/RelativeWidget";
import { StandingsWidget } from "../../overlay/widgets/StandingsWidget";
import { TelemetryWidget } from "../../overlay/widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "../../overlay/widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "../../overlay/widgets/PedalsWidget";
import type { WidgetTelemetryMode } from "../../overlay/widgets/use-widget-telemetry";

type InnerWidgetProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const WIDGETS: Record<string, ComponentType<InnerWidgetProps>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
};

export type WidgetTelemetryModeProp = WidgetTelemetryMode;

export type WidgetRendererProps = {
  profile?: ProfileConfig | null;
  widget: WidgetConfig;
  editMode?: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  disabled?: boolean;
  fillHost?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
};

export function WidgetRenderer({
  profile,
  widget,
  editMode = false,
  telemetryMode = "mock",
  updateHz,
  disabled = false,
  fillHost = true,
  className = "",
  style,
  testId = "widget-renderer",
}: WidgetRendererProps) {
  const Component = WIDGETS[widget.type];
  const props = enrichWidgetPropsWithVariant(profile ?? undefined, widget);

  return (
    <div
      data-testid={testId}
      className={`${fillHost ? "h-full w-full" : ""} ${disabled ? "pointer-events-none" : ""} ${className}`.trim()}
      style={{ width: fillHost ? undefined : "fit-content", ...(style ?? {}) }}
    >
      {Component ? (
        <Component
          editMode={editMode}
          telemetryMode={telemetryMode}
          updateHz={updateHz ?? widget.updateHz}
          props={props}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          {widget.type}
        </div>
      )}
    </div>
  );
}
