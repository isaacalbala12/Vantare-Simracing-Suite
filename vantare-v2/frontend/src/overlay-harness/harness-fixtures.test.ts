import { describe, expect, it } from "vitest";
import {
  buildHarnessTelemetry,
  buildHarnessViewModel,
  buildHarnessWidget,
  CRYSTAL_HARNESS_DESIGNS,
} from "./harness-fixtures";

describe("CRYSTAL_HARNESS_DESIGNS", () => {
  it("freezes 21 designs across exactly 18 functional widget types", () => {
    expect(CRYSTAL_HARNESS_DESIGNS).toHaveLength(21);
    expect(new Set(CRYSTAL_HARNESS_DESIGNS.map((design) => design.id)).size).toBe(21);
    expect(new Set(CRYSTAL_HARNESS_DESIGNS.map((design) => design.widgetType)).size).toBe(18);
  });

  it("keeps only Delta and Input Telemetry as multi-design widget types", () => {
    const counts = new Map<string, number>();
    for (const design of CRYSTAL_HARNESS_DESIGNS) {
      counts.set(design.widgetType, (counts.get(design.widgetType) ?? 0) + 1);
    }

    expect(counts.get("delta")).toBe(2);
    expect(counts.get("input-telemetry")).toBe(3);
    for (const [widgetType, count] of counts) {
      if (widgetType !== "delta" && widgetType !== "input-telemetry") {
        expect(count, widgetType).toBe(1);
      }
    }
  });
});

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

  it("applies the requested canonical Crystal design settings", () => {
    const widget = buildHarnessWidget(
      "delta",
      "vantare-crystal",
      "default",
      "delta-crystal-simple",
    );
    expect(widget.visual.provenance?.designId).toBe("delta-crystal-simple");
    expect(widget.visual.baseSettings).toMatchObject({ templateId: "delta-simple" });
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
