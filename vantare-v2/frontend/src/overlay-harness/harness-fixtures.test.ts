import { describe, expect, it } from "vitest";
import {
  buildHarnessTelemetry,
  buildHarnessViewModel,
  buildHarnessWidget,
  CRYSTAL_HARNESS_DESIGNS,
  HARNESS_WIDGETS,
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
  it("creates all 18 widget types with the requested visual system", () => {
    expect(HARNESS_WIDGETS).toHaveLength(18);
    for (const widgetType of HARNESS_WIDGETS) {
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

  it("uses the canonical crop geometry for every Crystal design", () => {
    for (const design of CRYSTAL_HARNESS_DESIGNS) {
      const widget = buildHarnessWidget(design.widgetType, "vantare-crystal", "default", design.designId);
      expect(widget.layout.w, design.id).toBe(design.width);
      expect(widget.layout.h, design.id).toBe(design.height);
    }
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

  it("uses the deterministic section 04 telemetry values for isolated Pedals references", () => {
    for (const widget of ["pedals", "pedals-telemetry-compact"] as const) {
      const snapshot = buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget,
      });
      expect(snapshot.player?.throttle, widget).toBe(0.85);
      expect(snapshot.player?.brake, widget).toBe(0.15);
    }

    const capsule = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "pedals-telemetry",
    });
    expect(capsule.scoring.find((entry) => entry.isPlayer)?.place).toBe(12);
  });

  it("provides deterministic fixtures and keeps unavailable damage numbers honest", () => {
    for (const widgetType of HARNESS_WIDGETS) {
      const widget = buildHarnessWidget(widgetType, "vantare-crystal");
      const snapshot = buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: widgetType,
      });
      const model = buildHarnessViewModel(widget, snapshot) as { status: string };
      expect(model.status, widgetType).toBe(widgetType === "car-damage-numbers" ? "missing" : "ready");
    }
  });

  it("does not invent numeric damage for the section 14 placeholder reference", () => {
    const widget = buildHarnessWidget("car-damage-numbers", "vantare-crystal");
    const snapshot = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "car-damage-numbers",
    });
    const model = buildHarnessViewModel(widget, snapshot) as { status: string; body?: number };
    expect(model).toMatchObject({ status: "missing" });
    expect(model.body).toBeUndefined();
  });

  it("passes the deterministic accumulated input history to the pure Input ViewModel", () => {
    const widget = buildHarnessWidget(
      "input-telemetry",
      "vantare-crystal",
      "default",
      "input-crystal-blade",
    );
    const snapshot = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget: "input-telemetry",
      designId: "input-crystal-blade",
    });
    const model = buildHarnessViewModel(widget, snapshot) as { history: readonly unknown[] };
    expect(model.history).toHaveLength(10);
  });

  it("provides canonical row density for table and battle designs", () => {
    for (const widget of ["relative", "standings", "broadcast-tower", "head-to-head", "multiclass-relative"] as const) {
      const snapshot = buildHarnessTelemetry({ session: "race", location: "track", state: "ready", widget });
      expect(snapshot.scoring.length, widget).toBeGreaterThanOrEqual(20);
      expect(snapshot.scoring.filter((row) => row.isPlayer), widget).toHaveLength(1);
    }
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
