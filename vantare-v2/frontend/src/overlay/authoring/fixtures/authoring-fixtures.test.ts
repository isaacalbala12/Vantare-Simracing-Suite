import { describe, expect, it } from "vitest";
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
    expect(AUTHORING_WIDGET_TYPES).toHaveLength(19);
    expect(new Set(AUTHORING_WIDGET_TYPES).size).toBe(19);
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

    resetAndSeedAuthoringInputTelemetry(widget, snapshot);
    const first = JSON.stringify(buildAuthoringFixtureViewModel(widget, snapshot));
    resetAndSeedAuthoringInputTelemetry(widget, snapshot);
    const second = JSON.stringify(buildAuthoringFixtureViewModel(widget, snapshot));

    expect(first).toBe(second);
  });
});
