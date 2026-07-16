import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import {
  mapTelemetrySessionToLayoutType,
  resolveRuntimeLayout,
  selectRuntimeWidgets,
} from "./resolve-runtime-layout";

function buildDocument(): ProfileDocumentV3 {
  const deltaGeneral = deltaDefinition.createDefault("delta-general");
  const deltaRace = deltaDefinition.createDefault("delta-race");
  deltaRace.layout.x = 400;

  const standingsRace = standingsDefinition.createDefault("standings-race");
  standingsRace.behavior.enabled = false;

  return {
    schemaVersion: 3,
    id: "profile-runtime",
    name: "Runtime Profile",
    displayMode: "racing",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaGeneral],
      },
      race: {
        type: "race",
        widgets: [deltaRace, standingsRace],
      },
      endurance: {
        type: "endurance",
        widgets: [deltaDefinition.createDefault("delta-endurance")],
      },
    },
  };
}

describe("mapTelemetrySessionToLayoutType", () => {
  it("maps warmup to general", () => {
    expect(mapTelemetrySessionToLayoutType("warmup")).toBe("general");
  });

  it("maps endurance to endurance", () => {
    expect(mapTelemetrySessionToLayoutType("endurance")).toBe("endurance");
  });

  it("maps practice qualifying and race to their layout keys", () => {
    expect(mapTelemetrySessionToLayoutType("practice")).toBe("practice");
    expect(mapTelemetrySessionToLayoutType("qualifying")).toBe("qualifying");
    expect(mapTelemetrySessionToLayoutType("race")).toBe("race");
  });
});

describe("resolveRuntimeLayout", () => {
  it("uses the exact session layout when it exists", () => {
    const document = buildDocument();
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const layout = resolveRuntimeLayout(document, snapshot);
    expect(layout.type).toBe("race");
    expect(layout.widgets[0].id).toBe("delta-race");
  });

  it("falls back to general when practice qualifying or race layouts are missing", () => {
    const document = buildDocument();
    const snapshot = buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" });
    const layout = resolveRuntimeLayout(document, snapshot);
    expect(layout.type).toBe("general");
    expect(layout.widgets[0].id).toBe("delta-general");
    expect(document.layouts.qualifying).toBeUndefined();
  });

  it("selects endurance when telemetry reports endurance and the layout exists", () => {
    const document = buildDocument();
    const snapshot = {
      ...buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
      session: { type: "endurance" as const, remainingSeconds: 7200 },
    };
    const layout = resolveRuntimeLayout(document, snapshot);
    expect(layout.type).toBe("endurance");
    expect(layout.widgets[0].id).toBe("delta-endurance");
  });

  it("does not materialize missing session layouts at runtime", () => {
    const document = buildDocument();
    const before = structuredClone(document);
    resolveRuntimeLayout(
      document,
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
    );
    expect(document).toEqual(before);
  });
});

describe("selectRuntimeWidgets", () => {
  it("sorts widgets by z-index and filters disabled or invisible widgets", () => {
    const document = buildDocument();
    const delta = deltaDefinition.createDefault("delta-low");
    delta.layout.zIndex = 1;
    const standings = standingsDefinition.createDefault("standings-high");
    standings.layout.zIndex = 5;
    standings.behavior.visibleWhen = { sessionTypes: ["qualifying"] };

    const layout = {
      type: "general" as const,
      widgets: [standings, delta],
    };

    const raceSnapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const selected = selectRuntimeWidgets(layout, raceSnapshot);
    expect(selected.map((widget) => widget.id)).toEqual(["delta-low"]);

    standings.behavior.enabled = false;
    const withDisabled = selectRuntimeWidgets(
      { ...layout, widgets: [standings, delta] },
      raceSnapshot,
    );
    expect(withDisabled.map((widget) => widget.id)).toEqual(["delta-low"]);
  });
});