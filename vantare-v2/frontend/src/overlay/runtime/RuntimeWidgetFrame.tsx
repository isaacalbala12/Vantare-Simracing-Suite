import { memo, type CSSProperties } from "react";
import type { WidgetInstanceV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { useRateLimitedWidgetTelemetry } from "./use-rate-limited-telemetry";
import type { EngineerPresentation } from "../../engineer/engineer-presentation-store";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";
import type { RaceScheduleSnapshot } from "../core/race-schedule-store";
import { resolveStandingsRedlineFrameLayout } from "../widget-types/standings/standings-redline-layout";

export type RuntimeWidgetFrameProps = {
  widget: WidgetInstanceV3;
  profileId: string;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  engineerPresentation?: EngineerPresentation | null;
  engineerSubtitlesEnabled?: boolean;
  overlayV2Features?: readonly OverlayV2Feature[];
  raceSchedule?: RaceScheduleSnapshot;
};

function RuntimeWidgetFrameComponent(props: RuntimeWidgetFrameProps): React.ReactElement {
  const { widget, profileId, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics, engineerPresentation, engineerSubtitlesEnabled, overlayV2Features, raceSchedule } = props;
  const runtimeTelemetry = useRateLimitedWidgetTelemetry(
    telemetry,
    widget.type,
  );
  const origin = layoutOrigin ?? { x: 0, y: 0 };
  const effectiveLayout = resolveStandingsRedlineFrameLayout(widget, widget.layout);
  const { x, y, w, h, zIndex } = effectiveLayout;

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: x - origin.x,
    top: y - origin.y,
    width: w,
    height: h,
    zIndex,
    pointerEvents: "none",
    overflow: "hidden",
  };

  return (
    <div data-testid="runtime-widget-frame" data-widget-id={widget.id} style={frameStyle}>
      <WidgetVisualViewport
        widgetType={widget.type}
        visual={widget.visual}
        layout={effectiveLayout}
        testId={`runtime-widget-viewport-${widget.id}`}
      >
        <WidgetVisualHost
          widget={widget}
          renderMode={renderMode}
          onDiagnostic={onDiagnostic}
          diagnostics={diagnostics}
          runtime={{
            engineerPresentation,
            engineerSubtitlesEnabled,
            raceScheduleEvents: raceSchedule?.events,
            raceScheduleStatus: raceSchedule?.status,
            ...runtimeTelemetry,
            overlayV2Features,
            relativeViewModelInstanceKey: `${profileId}:${widget.id}`,
          }}
        />
      </WidgetVisualViewport>
    </div>
  );
}

function sameWidget(left: WidgetInstanceV3, right: WidgetInstanceV3): boolean {
  if (left === right) return true;
  const leftLayout = left.layout;
  const rightLayout = right.layout;
  return left.id === right.id &&
    left.type === right.type &&
    left.name === right.name &&
    left.content === right.content &&
    left.visual === right.visual &&
    left.behavior.enabled === right.behavior.enabled &&
    left.behavior.updateHz === right.behavior.updateHz &&
    left.behavior.visibleWhen === right.behavior.visibleWhen &&
    leftLayout.x === rightLayout.x &&
    leftLayout.y === rightLayout.y &&
    leftLayout.w === rightLayout.w &&
    leftLayout.h === rightLayout.h &&
    leftLayout.zIndex === rightLayout.zIndex &&
    leftLayout.aspectLocked === rightLayout.aspectLocked;
}

function sameOrigin(left?: { x: number; y: number }, right?: { x: number; y: number }): boolean {
  return left === right || left?.x === right?.x && left?.y === right?.y;
}

export const RuntimeWidgetFrame = memo(RuntimeWidgetFrameComponent, (left, right) =>
  sameWidget(left.widget, right.widget) &&
  left.profileId === right.profileId &&
  left.telemetry === right.telemetry &&
  left.renderMode === right.renderMode &&
  sameOrigin(left.layoutOrigin, right.layoutOrigin) &&
  left.onDiagnostic === right.onDiagnostic &&
  left.diagnostics === right.diagnostics &&
  left.engineerPresentation === right.engineerPresentation &&
  left.engineerSubtitlesEnabled === right.engineerSubtitlesEnabled &&
  left.overlayV2Features === right.overlayV2Features &&
  left.raceSchedule === right.raceSchedule,
);
