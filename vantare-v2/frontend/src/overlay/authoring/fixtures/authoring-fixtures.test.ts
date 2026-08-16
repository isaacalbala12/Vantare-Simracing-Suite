import { describe, expect, it } from "vitest";
import {
  readInputTelemetryHistory,
  recordInputTelemetrySample,
  resetInputTelemetryHistory,
} from "../../widget-types/input-telemetry/input-telemetry-accumulator";
import {
  AUTHORING_ENGINEER_CONTRACT_DESIGNS,
  AUTHORING_HISTORICAL_CRYSTAL_DESIGNS,
  AUTHORING_WIDGET_TYPES,
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureViewModel,
  buildAuthoringFixtureWidget,
  resetAndSeedAuthoringInputTelemetry,
} from "./authoring-fixtures";

describe("authoring fixtures", () => {
  it("constructs the complete functional catalog without folding Engineer into historical Crystal parity", () => {
    expect(AUTHORING_WIDGET_TYPES).toHaveLength(20);
    expect(new Set(AUTHORING_WIDGET_TYPES).size).toBe(20);
    expect(AUTHORING_HISTORICAL_CRYSTAL_DESIGNS).toHaveLength(21);
    expect(new Set(AUTHORING_HISTORICAL_CRYSTAL_DESIGNS.map((design) => design.widgetType)).size).toBe(18);
    expect(AUTHORING_ENGINEER_CONTRACT_DESIGNS).toEqual([
      expect.objectContaining({ widgetType: "engineer-radio", designId: "engineer-radio-crystal" }),
    ]);
  });

  it.each(["ready", "stale", "disconnected", "error"] as const)(
    "reproduces the %s data state from an explicit scenario",
    (state) => {
      const snapshot = buildAuthoringFixtureTelemetry({
        session: "race",
        location: "track",
        state,
        widget: "delta",
        system: "vantare-original",
        surface: "studio",
      });
      expect(snapshot.status).toBe(state);
    },
  );

  it("serializes an explicit scenario identically across repeated construction", () => {
    const scenario = {
      session: "race" as const,
      location: "track" as const,
      state: "ready" as const,
      widget: "input-telemetry" as const,
      system: "vantare-crystal" as const,
      surface: "obs" as const,
      designId: "input-crystal-blade",
    };
    const firstWidget = buildAuthoringFixtureWidget(scenario);
    const firstSnapshot = buildAuthoringFixtureTelemetry(scenario);
    const secondWidget = buildAuthoringFixtureWidget(scenario);
    const secondSnapshot = buildAuthoringFixtureTelemetry(scenario);

    expect(JSON.stringify([firstWidget, firstSnapshot])).toBe(
      JSON.stringify([secondWidget, secondSnapshot]),
    );
    expect(JSON.stringify(buildAuthoringFixtureViewModel(firstWidget, firstSnapshot))).toBe(
      JSON.stringify(buildAuthoringFixtureViewModel(secondWidget, secondSnapshot)),
    );
  });

  it("builds a canonical Relative authoring model with physical 2+1+2 rows", () => {
    const scenario = {
      session: "race" as const,
      location: "track" as const,
      state: "ready" as const,
      widget: "relative" as const,
      system: "vantare-crystal" as const,
      surface: "studio" as const,
    };
    const widget = buildAuthoringFixtureWidget(scenario);
    const snapshot = buildAuthoringFixtureTelemetry(scenario);
    const model = buildAuthoringFixtureViewModel(widget, snapshot);

    expect(
      snapshot.scoring.every(
        (row) => typeof row.lapDistanceMeters === "number" && Number.isFinite(row.lapDistanceMeters),
      ),
    ).toBe(true);
    expect(model.type).toBe("relative");
    if (model.type !== "relative") {
      throw new Error("expected relative authoring model");
    }
    expect(model.rows).toHaveLength(5);
  });

  it("resets Input Telemetry before deterministically seeding a scenario", () => {
    const scenario = {
      session: "race" as const,
      location: "track" as const,
      state: "ready" as const,
      widget: "input-telemetry" as const,
      system: "vantare-crystal" as const,
      surface: "harness" as const,
      designId: "input-crystal-blade",
    };
    const widget = buildAuthoringFixtureWidget(scenario);
    const snapshot = buildAuthoringFixtureTelemetry(scenario);

    resetInputTelemetryHistory();
    recordInputTelemetrySample(widget.id, {
      ...snapshot,
      capturedAt: snapshot.capturedAt - 50,
      player: { ...snapshot.player, throttle: 0.13, brake: 0.37, clutch: 0.59 },
    });
    expect(readInputTelemetryHistory(widget.id, snapshot, 8)).toEqual([
      expect.objectContaining({ capturedAt: snapshot.capturedAt - 50, throttle: 0.13, brake: 0.37, clutch: 0.59 }),
    ]);

    const expected = (snapshot.derived?.inputHistory ?? []).map((item) => ({
      capturedAt: item.capturedAt,
      throttle: item.throttle ?? 0,
      brake: item.brake ?? 0,
      clutch: item.clutch ?? 0,
      speedKph: snapshot.player.speedKph,
      rpm: snapshot.player.rpm,
      gear: snapshot.player.gear,
    }));
    resetAndSeedAuthoringInputTelemetry(widget, snapshot);
    const first = readInputTelemetryHistory(widget.id, snapshot, 8);
    expect(first).toEqual(expected);
    resetAndSeedAuthoringInputTelemetry(widget, snapshot);
    const second = readInputTelemetryHistory(widget.id, snapshot, 8);

    expect(second).toEqual(expected);
    expect(second).toEqual(first);
  });
});
