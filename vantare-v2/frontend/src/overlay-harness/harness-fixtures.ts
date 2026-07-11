import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";
import type { CoreWidgetType, DesignSystemId, WidgetInstanceV3 } from "../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../overlay/core/telemetry-snapshot";
import { widgetTypeRegistry } from "../overlay/core/widget-registry";
import { parseRelativeContent, updateRelativeFilters } from "../overlay/widget-types/relative/relative-content";

export type HarnessWidget = CoreWidgetType;
export type HarnessVariant =
  | "default"
  | "relative-fill"
  | "standings-stress60"
  | "pedals-zero"
  | "pedals-full";

export const HARNESS_WIDGETS: readonly HarnessWidget[] = ["delta", "standings", "relative", "pedals"];

export function isHarnessWidget(value: string): value is HarnessWidget {
  return (HARNESS_WIDGETS as readonly string[]).includes(value);
}

export function isHarnessVariant(value: string): value is HarnessVariant {
  return (
    value === "default"
    || value === "relative-fill"
    || value === "standings-stress60"
    || value === "pedals-zero"
    || value === "pedals-full"
  );
}

function buildStandingsStressScoring(): Record<string, unknown>[] {
  return Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    place: index + 1,
    driverName: `Driver ${index + 1}`,
    vehicleClass: "HYPERCAR",
    isPlayer: index === 4,
    inPits: index === 4,
    bestLapTime: 90 + index * 0.01,
    lastLapTime: 91 + index * 0.01,
  }));
}

export function buildHarnessWidget(
  widgetType: HarnessWidget,
  systemId: DesignSystemId,
  variant: HarnessVariant = "default",
): WidgetInstanceV3 {
  const definition = widgetTypeRegistry.get(widgetType);
  const widget = definition.createDefault(`${widgetType}-harness`);
  widget.visual = {
    ...widget.visual,
    systemId,
  };
  widget.layout = {
    ...widget.layout,
    x: 120,
    y: 96,
    zIndex: 1,
  };

  if (widgetType === "relative" && variant === "relative-fill") {
    const content = parseRelativeContent(widget.content);
    widget.content = updateRelativeFilters(content, { rowHeightMode: "fill" });
    widget.layout = {
      ...widget.layout,
      h: Math.max(widget.layout.h, 320),
    };
  }

  return widget;
}

export function buildHarnessTelemetry(input: {
  session: MockSessionScenario;
  location: MockLocationScenario;
  state: MockDataState;
  widget: HarnessWidget;
  variant?: HarnessVariant;
}): TelemetrySnapshot {
  const variant = input.variant ?? "default";
  const base = buildMockTelemetry({
    session: input.session,
    location: input.location,
    state: input.state,
  });

  if (input.state !== "ready") {
    return base;
  }

  if (input.widget === "standings" && variant === "standings-stress60") {
    return {
      ...base,
      scoring: buildStandingsStressScoring(),
    };
  }

  if (input.widget === "pedals" && variant === "pedals-zero") {
    return {
      ...base,
      player: {
        ...base.player,
        throttle: 0,
        brake: 0,
        clutch: 0,
      },
    };
  }

  if (input.widget === "pedals" && variant === "pedals-full") {
    return {
      ...base,
      player: {
        ...base.player,
        throttle: 1,
        brake: 1,
        clutch: 1,
      },
    };
  }

  return base;
}

export function buildHarnessViewModel(widget: WidgetInstanceV3, snapshot: TelemetrySnapshot): unknown {
  const definition = widgetTypeRegistry.get(widget.type);
  const content = definition.parseContent(widget.content);
  return definition.buildViewModel(snapshot, content as never);
}