import { describe, expect, it } from "vitest";
import { buildHarnessTelemetry, buildHarnessViewModel, buildHarnessWidget } from "./harness-fixtures";

describe("buildHarnessWidget", () => {
  it("creates all four widget types with the requested visual system", () => {
    for (const widgetType of ["delta", "standings", "relative", "pedals"] as const) {
      const widget = buildHarnessWidget(widgetType, "vantare-crystal");
      expect(widget.type).toBe(widgetType);
      expect(widget.visual.systemId).toBe("vantare-crystal");
    }
  });

  it("switches relative to fill mode for the relative-fill variant", () => {
    const widget = buildHarnessWidget("relative", "vantare-original", "relative-fill");
    expect(widget.content).toMatchObject({ rowHeightMode: "fill" });
  });
});

describe("buildHarnessTelemetry", () => {
  it("builds 60 scoring rows for standings stress variant", () => {
    const snapshot = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "standings",
      variant: "standings-stress60",
    });
    expect(snapshot.scoring).toHaveLength(60);
  });

  it("clamps pedals to zero and full extremes", () => {
    const zero = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "pedals",
      variant: "pedals-zero",
    });
    const full = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "pedals",
      variant: "pedals-full",
    });
    expect(zero.player?.throttle).toBe(0);
    expect(full.player?.throttle).toBe(1);
  });
});

describe("buildHarnessViewModel", () => {
  it("returns identical serialized models for the same widget and snapshot", () => {
    const widget = buildHarnessWidget("standings", "vantare-original");
    const snapshot = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "standings",
    });
    const left = JSON.stringify(buildHarnessViewModel(widget, snapshot));
    const right = JSON.stringify(buildHarnessViewModel(widget, snapshot));
    expect(left).toBe(right);
  });
});