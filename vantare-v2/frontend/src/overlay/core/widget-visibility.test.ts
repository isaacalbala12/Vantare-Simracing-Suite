import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { isWidgetVisibleV3 } from "./widget-visibility";

const readySnapshot: TelemetrySnapshot = {
  status: "ready",
  capturedAt: 0,
  session: { type: "practice" },
  player: { inPit: false },
  scoring: [],
};

describe("isWidgetVisibleV3", () => {
  it("returns true when no visibility rules are defined", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    expect(isWidgetVisibleV3(widget, readySnapshot)).toBe(true);
  });

  it("matches inPit rules against the telemetry snapshot", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.behavior.visibleWhen = { inPit: true };

    expect(isWidgetVisibleV3(widget, readySnapshot)).toBe(false);
    expect(
      isWidgetVisibleV3(widget, {
        ...readySnapshot,
        player: { inPit: true },
      }),
    ).toBe(true);
  });

  it("matches session type rules against the telemetry snapshot", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.behavior.visibleWhen = { sessionTypes: ["race"] };

    expect(isWidgetVisibleV3(widget, readySnapshot)).toBe(false);
    expect(
      isWidgetVisibleV3(widget, {
        ...readySnapshot,
        session: { type: "race" },
      }),
    ).toBe(true);
  });
});