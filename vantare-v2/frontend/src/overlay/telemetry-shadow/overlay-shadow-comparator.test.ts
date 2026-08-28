import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3, WidgetType } from "../core/profile-document";
import { widgetTypeRegistry } from "../core/widget-registry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type {
  OverlayMappedField,
  OverlayProjectionAdaptation,
  OverlayProjectionMapping,
} from "../projection/overlay-projection-adapter";
import {
  OVERLAY_SHADOW_POLICIES,
  compareOverlayShadow,
} from "./overlay-shadow-comparator";
import { overlayV2ViewModelRegistry } from "../core/overlay-v2-view-models";

const PII = {
  driver: "PII_DRIVER_ISAAC_105",
  team: "PII_TEAM_VANTARE_105",
  vehicleId: "PII_VEHICLE_ID_105",
  path: "C:/Users/isaac/secret/session.ld",
  error: "PII_ERROR_TOKEN_105",
} as const;

function snapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    status: "ready",
    capturedAt: 1_785_430_800_000,
    session: { type: "race", trackName: "Spa" },
    player: {
      inPit: false,
      throttle: 0.5,
      brake: 0.25,
      clutch: 0,
      speedKph: 50,
      rpm: 7_000,
      gear: 4,
      totalLaps: 12,
      lapNumber: 13,
    },
    scoring: [
      {
        id: PII.vehicleId,
        place: 1,
        isPlayer: true,
        driverName: PII.driver,
        name: PII.driver,
        teamName: PII.team,
        team: PII.team,
        vehicleClass: "HYPERCAR",
        totalLaps: 12,
        inPits: false,
      },
      {
        id: "PII_VEHICLE_RIVAL_105",
        place: 2,
        isPlayer: false,
        driverName: "PII_RIVAL_105",
        teamName: "PII_RIVAL_TEAM_105",
        vehicleClass: "HYPERCAR",
        totalLaps: 12,
        inPits: false,
      },
    ],
    ...overrides,
  };
}

function quality(
  targetPath: string,
  freshness: OverlayMappedField["freshness"] = "fresh",
): OverlayMappedField {
  return {
    sourcePath: targetPath === "player" ? "playerVehicleId" : `source.${targetPath}`,
    targetPath,
    present: freshness !== "missing",
    provenance: freshness === "missing" ? "unknown" : "observed",
    freshness,
    usable: freshness === "fresh" || freshness === "stale",
  };
}

function vehicleQuality(
  index: number,
  field: string,
  targetPath: string,
  freshness: OverlayMappedField["freshness"] = "fresh",
): OverlayMappedField {
  return {
    sourcePath: `vehicles[${index}].${field}`,
    targetPath,
    present: freshness !== "missing",
    provenance: freshness === "missing" ? "unknown" : "observed",
    freshness,
    usable: freshness === "fresh" || freshness === "stale",
  };
}

function mapped(
  projectedSnapshot = snapshot(),
  qualityOverrides: readonly OverlayMappedField[] = [],
): OverlayProjectionMapping {
  const defaults = [
    quality("session.type"),
    quality("player"),
    quality("player.inPit"),
    quality("player.throttle"),
    quality("player.brake"),
    quality("player.clutch"),
    quality("player.speedKph"),
    quality("player.rpm"),
    quality("player.gear"),
    quality("player.lapNumber"),
    quality("player.totalLaps"),
    vehicleQuality(0, "id", "scoring[].id"),
    vehicleQuality(0, "position", "scoring[].place"),
    vehicleQuality(0, "driverName", "scoring[].driverName"),
    vehicleQuality(0, "vehicleClass", "scoring[].vehicleClass"),
    vehicleQuality(0, "relativeTimeGapSeconds", "scoring[].timeGapToPlayer"),
    vehicleQuality(0, "completedLaps", "scoring[].totalLaps"),
    vehicleQuality(0, "inPit", "scoring[].inPits"),
    vehicleQuality(1, "id", "scoring[].id"),
    vehicleQuality(1, "position", "scoring[].place"),
    vehicleQuality(1, "driverName", "scoring[].driverName"),
    vehicleQuality(1, "vehicleClass", "scoring[].vehicleClass"),
    vehicleQuality(1, "relativeTimeGapSeconds", "scoring[].timeGapToPlayer"),
    vehicleQuality(1, "completedLaps", "scoring[].totalLaps"),
    vehicleQuality(1, "inPit", "scoring[].inPits"),
  ];
  const bySource = new Map(defaults.map((field) => [field.sourcePath, field]));
  for (const field of qualityOverrides) bySource.set(field.sourcePath, field);
  return {
    kind: "mapped",
    snapshot: projectedSnapshot,
    quality: [...bySource.values()],
    unsupported: [],
  };
}

function widget(type: WidgetType, content?: Record<string, unknown>): WidgetInstanceV3 {
  const instance = widgetTypeRegistry.get(type).createDefault(`PII_WIDGET_ID_${type}`);
  return content === undefined ? instance : { ...instance, content };
}

function partialWidget(type: WidgetType): WidgetInstanceV3 {
  switch (type) {
    case "standings": {
      const instance = widget(type);
      const content = instance.content as { columns: readonly Record<string, unknown>[] };
      return widget(type, {
        columns: content.columns.map((column) => ({ ...column, enabled: true })),
      });
    }
    case "broadcast-tower":
      return widget(type, { rowCount: 10, showWeather: false, showSof: false });
    case "pedals-telemetry":
      return widget(type, { showPosition: true, showClutch: false });
    case "pedals-telemetry-compact":
      return widget(type, { showSpeed: true, showRpm: true, showClutch: false });
    case "input-telemetry":
      return widget(type, { historySeconds: 8, showClutch: true });
    default:
      return widget(type);
  }
}

function resultFor(
  type: WidgetType,
  legacy = snapshot(),
  projection: OverlayProjectionAdaptation = mapped(),
) {
  const report = compareOverlayShadow({
    legacySnapshot: legacy,
    projection,
    widgets: [widget(type)],
  });
  return { report, widget: report.widgets[0] };
}

describe("overlay shadow comparator policies", () => {
  it("covers every registered widget type", () => {
    const registered = widgetTypeRegistry.list().map((definition) => definition.type).sort();
    const policyTypes = Object.keys(OVERLAY_SHADOW_POLICIES).sort();

    expect(registered).toHaveLength(20);
    expect(policyTypes).toEqual(registered);
    expect(OVERLAY_SHADOW_POLICIES.pedals.coverage).toBe("exact");
    expect(OVERLAY_SHADOW_POLICIES["race-schedule"].coverage).toBe("external");
    expect(OVERLAY_SHADOW_POLICIES["engineer-radio"].coverage).toBe("external");
    expect(
      Object.values(OVERLAY_SHADOW_POLICIES).reduce<Record<string, number>>(
        (counts, policy) => ({
          ...counts,
          [policy.coverage]: (counts[policy.coverage] ?? 0) + 1,
        }),
        {},
      ),
    ).toEqual({
      exact: 2,
      partial: 11,
      "not-comparable": 5,
      external: 2,
    });
    for (const [type, policy] of Object.entries(OVERLAY_SHADOW_POLICIES)) {
      expect(policy.widgetType).toBe(type);
      const paths = policy.rules.map((rule) => rule.path);
      expect(new Set(paths).size).toBe(paths.length);
      for (const rule of policy.rules) {
        if (rule.kind === "list") {
          const fieldPaths = rule.fields.map((field) => field.path);
          expect(new Set(fieldPaths).size).toBe(fieldPaths.length);
        }
        if (rule.kind === "scalar" && rule.tolerance !== undefined) {
          expect(Number.isFinite(rule.tolerance)).toBe(true);
          expect(rule.tolerance).toBeGreaterThanOrEqual(0);
        }
      }
    }

    const telemetryPolicies = Object.values(OVERLAY_SHADOW_POLICIES)
      .filter((policy) => policy.coverage !== "external")
      .map((policy) => policy.widgetType)
      .sort();
    expect([...overlayV2ViewModelRegistry.keys()].sort()).toEqual(telemetryPolicies);
    expect(OVERLAY_SHADOW_POLICIES["race-schedule"].rules).toEqual([
      { kind: "external", path: "events" },
    ]);
    expect(OVERLAY_SHADOW_POLICIES["engineer-radio"].rules).toEqual([
      { kind: "external", path: "engineerPresentation" },
    ]);
  });

  it("conserva la ruta auxiliar exacta incluso si la proyección V1 está bloqueada", () => {
    for (const [type, path] of [["race-schedule", "events"], ["engineer-radio", "engineerPresentation"]] as const) {
      const result = resultFor(type, snapshot(), { kind: "blocked", reason: "invalid-contract" }).widget;
      expect(result.outcome).toBe("external");
      expect(result.entries).toContainEqual(expect.objectContaining({
        path,
        classification: "external-consumer",
      }));
    }
  });

  it("returns one deterministic result for every registered ViewModel", () => {
    const widgets = widgetTypeRegistry.list().map((definition) =>
      partialWidget(definition.type),
    );
    const report = compareOverlayShadow({
      legacySnapshot: snapshot(),
      projection: mapped(),
      widgets: [...widgets].reverse(),
    });

    expect(report.widgets).toHaveLength(20);
    expect(report.widgets.map((entry) => entry.widgetType)).toEqual(
      [...report.widgets.map((entry) => entry.widgetType)].sort(),
    );
    expect(report.summary.widgets).toBe(20);
    expect(report.widgets.find((entry) => entry.widgetType === "race-schedule")?.entries)
      .toContainEqual(expect.objectContaining({ classification: "external-consumer" }));
    for (const entry of report.widgets) {
      if (entry.coverage === "not-comparable") expect(entry.outcome).toBe("not-comparable");
      if (entry.coverage === "external") expect(entry.outcome).toBe("external");
      if (entry.coverage === "partial") {
        expect(entry.outcome).not.toBe("equal");
        expect(entry.summary.mismatches).toBeGreaterThan(0);
      }
    }
  });

  it("declares the real Delta builder dependencies per output field", () => {
    expect(scalarSources("delta", "tone")).toEqual(["player.deltaSeconds"]);
    expect(scalarSources("delta", "lastLapText")).toEqual(["player.lastLapSeconds"]);
    expect(scalarSources("delta", "bestLapText")).toEqual(["player.bestLapSeconds"]);
    expect(scalarSources("delta", "lapText")).toEqual([
      "player.lapNumber",
      "player.totalLaps",
    ]);
    expect(scalarSources("delta", "predictedLapText")).toEqual([
      "player.predictedLapSeconds",
    ]);
    expect(scalarSources("delta", "splitText")).toEqual(["player.deltaSeconds"]);
  });

  it("declares real Standings sources instead of ViewModel-only aliases", () => {
    expect(listFieldSources("standings", "rows", "driverName"))
      .toEqual(["vehicles[].driverName"]);
    expect(listFieldSources("standings", "rows", "intervalText"))
      .toEqual(["vehicles[].timeBehindNextSeconds"]);
    expect(unsupportedSources("standings", "rows[].gapText")).toEqual([
      "session.type",
      "scoring[].id",
      "scoring[].place",
      "scoring[].vehicleClass",
      "scoring[].isPlayer",
      "scoring[].bestLapTime",
      "scoring[].fastestLap",
      "scoring[].lapsBehindLeader",
      "scoring[].timeBehindLeader",
    ]);
    expect(unsupportedSources("standings", "rows[].gapText"))
      .not.toContain("scoring[].gapText");
  });

  it("declares Relative selection and row dependencies independently", () => {
    expect(listFieldSources("relative", "rows", "id"))
      .toEqual(["vehicles[].id"]);
    expect(listFieldSources("relative", "rows", "driverName"))
      .toEqual(["vehicles[].driverName"]);
    expect(listFieldSources("relative", "rows", "position"))
      .toEqual(["vehicles[].position"]);
    expect(listFieldSources("relative", "rows", "tone"))
      .toEqual(["vehicles[].relativeTimeGapSeconds"]);
    expect(listFieldSources("relative", "rows", "bestLapText"))
      .toEqual(["vehicles[].bestLapSeconds"]);
  });

  it("declares structural ID quality for Standings and Broadcast player flags", () => {
    expect(listFieldSources("standings", "rows", "id"))
      .toEqual(["vehicles[].id"]);
    expect(listFieldSources("standings", "rows", "isPlayer"))
      .toEqual(["vehicles[].id", "playerVehicleId"]);
    expect(listFieldSources("broadcast-tower", "rows", "isPlayer"))
      .toEqual(["vehicles[].id", "playerVehicleId"]);
  });
});

describe("overlay shadow comparator behavior", () => {
  it("compares Pedals instant values exactly and honors numeric tolerances", () => {
    const equal = resultFor("pedals");
    expect(equal.widget.entries).toContainEqual(
      expect.objectContaining({ path: "throttle", classification: "equal" }),
    );

    const within = resultFor(
      "pedals",
      snapshot(),
      mapped(snapshot({ player: { ...snapshot().player, throttle: 0.5 + 5e-10 } })),
    );
    expect(within.widget.entries).toContainEqual(
      expect.objectContaining({ path: "throttle", classification: "within-tolerance" }),
    );

    const outside = resultFor(
      "pedals",
      snapshot(),
      mapped(snapshot({ player: { ...snapshot().player, throttle: 0.5 + 2e-9 } })),
    );
    expect(outside.widget.entries).toContainEqual(
      expect.objectContaining({ path: "throttle", classification: "value-mismatch" }),
    );
  });

  it("never calls equal when source quality is stale, invalid or missing", () => {
    for (const freshness of ["stale", "invalid", "missing"] as const) {
      const { widget: pedalsResult } = resultFor(
        "pedals",
        snapshot({ player: { ...snapshot().player, throttle: 0 } }),
        mapped(snapshot({ player: { ...snapshot().player, throttle: undefined } }), [
          quality("player.throttle", freshness),
        ]),
      );
      const expected = freshness === "stale"
        ? "stale-projection"
        : freshness === "invalid"
          ? "invalid-projection"
          : "missing-projection";
      expect(pedalsResult.entries).toContainEqual(
        expect.objectContaining({ path: "throttle", classification: expected }),
      );
    }
  });

  it("reports missing quality when Broadcast lap number is present", () => {
    const completeMapping = mapped();
    const missingLapSource: OverlayProjectionMapping = {
      ...completeMapping,
      quality: completeMapping.quality.filter(
        (field) => field.targetPath !== "player.lapNumber",
      ),
    };
    const lapResult = resultFor("broadcast-tower", snapshot(), missingLapSource).widget;
    expect(lapResult.entries).toContainEqual(
      expect.objectContaining({ path: "lap", classification: "missing-projection" }),
    );
  });

  it("falls back to valid total laps when Broadcast lap number is undefined", () => {
    const withoutLapNumber = snapshot({
      player: { ...snapshot().player, lapNumber: undefined },
    });
    const lapResult = resultFor(
      "broadcast-tower",
      withoutLapNumber,
      mapped(withoutLapNumber),
    ).widget;

    expect(lapResult.entries).toContainEqual(
      expect.objectContaining({ path: "lap", classification: "equal" }),
    );
  });

  it("rejects estimated projection provenance", () => {
    const estimatedThrottle = {
      ...quality("player.throttle"),
      provenance: "estimated" as const,
    };
    const pedalsResult = resultFor(
      "pedals",
      snapshot(),
      mapped(snapshot(), [estimatedThrottle]),
    ).widget;
    expect(pedalsResult.entries).toContainEqual(
      expect.objectContaining({ path: "throttle", classification: "value-mismatch" }),
    );
  });

  it("keeps stale Broadcast lap-number quality instead of choosing fresh total laps", () => {
    const report = resultFor(
      "broadcast-tower",
      snapshot(),
      mapped(snapshot(), [quality("player.lapNumber", "stale")]),
    ).widget;

    expect(report.entries).toContainEqual(
      expect.objectContaining({ path: "lap", classification: "stale-projection" }),
    );
  });

  it("keeps estimated Broadcast lap-number provenance instead of choosing fresh total laps", () => {
    const estimatedLapNumber = {
      ...quality("player.lapNumber"),
      provenance: "estimated" as const,
    };
    const report = resultFor(
      "broadcast-tower",
      snapshot(),
      mapped(snapshot(), [estimatedLapNumber]),
    ).widget;

    expect(report.entries).toContainEqual(
      expect.objectContaining({ path: "lap", classification: "value-mismatch" }),
    );
  });

  it("keeps the legacy m/s-as-kph defect visible as a real factor 3.6 mismatch", () => {
    const { widget: telemetryResult } = resultFor(
      "pedals-telemetry",
      snapshot({ player: { ...snapshot().player, speedKph: 50 } }),
      mapped(snapshot({ player: { ...snapshot().player, speedKph: 180 } })),
    );

    expect(telemetryResult.entries).toContainEqual(
      expect.objectContaining({ path: "speedKph", classification: "value-mismatch" }),
    );
    expect(telemetryResult.entries).toContainEqual(
      expect.objectContaining({
        path: "speedKph.unit",
        classification: "value-mismatch",
        rule: "unit-contract",
      }),
    );
  });

  it("uses explicit InputTelemetry histories without touching the global accumulator", () => {
    const legacy = snapshot({
      derived: {
        inputHistory: [{ capturedAt: 100, throttle: 0.2, brake: 0.3, clutch: 0 }],
        fuelHistory: [],
        deltaHistory: [],
      },
    });
    const first = resultFor("input-telemetry", legacy).report;
    const second = resultFor("input-telemetry", legacy).report;

    expect(second).toEqual(first);
    expect(first.widgets[0].entries).toContainEqual(
      expect.objectContaining({
        path: "history",
        classification: "unsupported-by-projection",
      }),
    );
  });

  it("reports list length, order and player mismatches without exposing row IDs", () => {
    const projected = snapshot({
      scoring: [
        { id: PII.vehicleId, place: 2, isPlayer: false, totalLaps: 12, inPits: false },
        { id: "PII_VEHICLE_RIVAL_105", place: 1, isPlayer: true, totalLaps: 12, inPits: false },
      ],
    });
    const { report, widget: standingsResult } = resultFor(
      "standings",
      snapshot({ errorMessage: `${PII.error} ${PII.path}` }),
      mapped(projected),
    );

    expect(standingsResult.entries).toContainEqual(
      expect.objectContaining({ path: "rows.order", classification: "shape-mismatch" }),
    );
    expect(standingsResult.entries).toContainEqual(
      expect.objectContaining({ path: "rows[].isPlayer", classification: "value-mismatch" }),
    );
    const serialized = JSON.stringify(report);
    for (const canary of Object.values(PII)) expect(serialized).not.toContain(canary);
    for (const forbiddenKey of ["snapshot", "model", "content", "payload", "raw"]) {
      expect(serialized).not.toContain(`"${forbiddenKey}"`);
    }
  });

  it("scores Standings quality per source row without contaminating the player", () => {
    const report = resultFor(
      "standings",
      snapshot(),
      mapped(snapshot(), [
        vehicleQuality(1, "position", "scoring[].place", "stale"),
      ]),
    ).widget;
    const positions = report.entries.filter((entry) => entry.path === "rows[].position");

    expect(positions).toContainEqual(
      expect.objectContaining({ item: 0, classification: "equal" }),
    );
    expect(positions).toContainEqual(
      expect.objectContaining({ item: 1, classification: "stale-projection" }),
    );
  });

  it("scores Broadcast identity fields per row without contamination from another car", () => {
    const report = resultFor(
      "broadcast-tower",
      snapshot(),
      mapped(snapshot(), [
        vehicleQuality(1, "driverName", "scoring[].driverName", "stale"),
      ]),
    ).widget;
    const names = report.entries.filter((entry) => entry.path === "rows[].name");

    expect(names).toContainEqual(
      expect.objectContaining({ item: 0, classification: "equal" }),
    );
    expect(names).toContainEqual(
      expect.objectContaining({ item: 1, classification: "stale-projection" }),
    );
  });

  it("classifies stale structural IDs for Standings and Broadcast", () => {
    const projection = mapped(snapshot(), [
      vehicleQuality(0, "id", "scoring[].id", "stale"),
    ]);
    const standings = resultFor("standings", snapshot(), projection).widget;
    const broadcast = resultFor("broadcast-tower", snapshot(), projection).widget;

    expect(standings.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "rows[].id",
        item: 0,
        classification: "stale-projection",
        sourcePaths: ["vehicles[].id"],
      }),
      expect.objectContaining({
        path: "rows[].isPlayer",
        item: 0,
        classification: "stale-projection",
        sourcePaths: ["vehicles[].id", "playerVehicleId"],
      }),
    ]));
    expect(broadcast.entries).toContainEqual(expect.objectContaining({
      path: "rows[].isPlayer",
      item: 0,
      classification: "stale-projection",
      sourcePaths: ["vehicles[].id", "playerVehicleId"],
    }));
  });

  it("uses only real Standings pit inputs, not pit-stop count", () => {
    const report = resultFor(
      "standings",
      snapshot(),
      mapped(snapshot(), [
        vehicleQuality(0, "pitStopCount", "scoring[].pitStopCount", "stale"),
      ]),
    ).widget;

    expect(report.entries).toContainEqual(
      expect.objectContaining({ path: "rows[].pitText", item: 0, classification: "equal" }),
    );
  });

  it("keeps the strict mapped fixture free of unsupported pit-stop quality", () => {
    expect(mapped().quality.some((field) =>
      field.sourcePath.includes("pitStopCount") ||
      field.targetPath?.includes("pitStopCount")
    )).toBe(false);
  });

  it("detects a different Broadcast car occupying the same place", () => {
    const projected = snapshot({
      scoring: [
        { ...snapshot().scoring[0], id: "PII_REPLACEMENT_CAR_105", place: 1 },
        snapshot().scoring[1],
      ],
    });
    const report = resultFor("broadcast-tower", snapshot(), mapped(projected)).widget;

    expect(report.entries).toContainEqual(
      expect.objectContaining({ path: "rows.order", classification: "shape-mismatch" }),
    );
  });

  it("rejects duplicate list identities deterministically", () => {
    const projected = snapshot({
      scoring: [
        snapshot().scoring[0],
        { ...snapshot().scoring[1], id: PII.vehicleId },
      ],
    });
    const report = resultFor("standings", snapshot(), mapped(projected)).widget;

    expect(report.entries).toContainEqual(
      expect.objectContaining({ path: "rows.identity", classification: "shape-mismatch" }),
    );
  });

  it("reports an omitted row as shape mismatch and does not mutate inputs", () => {
    const legacy = snapshot();
    const projected = snapshot({ scoring: snapshot().scoring.slice(0, 1) });
    const frozenWidget = deepFreeze(widget("standings"));
    deepFreeze(legacy);
    deepFreeze(projected);

    const { widget: standingsResult } = resultFor(
      "standings",
      legacy,
      mapped(projected),
    );

    expect(standingsResult.entries).toContainEqual(
      expect.objectContaining({ path: "rows.length", classification: "shape-mismatch" }),
    );
    expect(Object.isFrozen(frozenWidget.content)).toBe(true);
    const frozenReport = compareOverlayShadow({
      legacySnapshot: legacy,
      projection: mapped(projected),
      widgets: [frozenWidget],
    });
    expect(frozenReport.widgets[0].widgetType).toBe("standings");
  });

  it("does not invoke builders for blocked projections and controls builder errors", () => {
    const blocked: OverlayProjectionAdaptation = {
      kind: "blocked",
      code: "player-unavailable",
      quality: [],
      unsupported: [],
    };
    const invalidDelta = widget("delta", { invalid: true });

    const blockedReport = compareOverlayShadow({
      legacySnapshot: snapshot(),
      projection: blocked,
      widgets: [invalidDelta],
    });
    expect(blockedReport.widgets[0].entries).toContainEqual(
      expect.objectContaining({ path: "mapping", classification: "shape-mismatch" }),
    );
    expect(blockedReport.widgets[0].entries).not.toContainEqual(
      expect.objectContaining({ classification: "builder-error" }),
    );

    const builderReport = compareOverlayShadow({
      legacySnapshot: snapshot({ errorMessage: PII.error }),
      projection: mapped(),
      widgets: [invalidDelta],
    });
    expect(builderReport.widgets[0].entries).toContainEqual(
      expect.objectContaining({ path: "builder", classification: "builder-error" }),
    );
    expect(JSON.stringify(builderReport)).not.toContain(PII.error);
  });

  it("processes 128 widgets while independently capping mismatches and samples", () => {
    const widgets = Array.from({ length: 128 }, (_, index) => ({
      ...widget("delta"),
      id: `PII_WIDGET_${index}`,
    }));
    const report = compareOverlayShadow({
      legacySnapshot: snapshot(),
      projection: mapped(),
      widgets,
      maxEntries: 1_000,
    });

    const visible = report.widgets.flatMap((entry) => entry.entries);
    const mismatches = visible.filter((entry) =>
      !["equal", "within-tolerance", "external-consumer"].includes(
        entry.classification,
      ),
    );
    expect(mismatches.length).toBeLessThanOrEqual(64);
    expect(visible.length - mismatches.length).toBeLessThanOrEqual(64);
    expect(visible.length).toBeLessThanOrEqual(128);
    expect(report.widgets).toHaveLength(128);
    expect(report.summary.widgets).toBe(128);
    expect(report.truncated).toBe(true);
    expect(report.summary.fields).toBeGreaterThan(64);
  });

  it("prioritizes 64 real mismatches over equal samples across 128 widgets", () => {
    const widgets = Array.from({ length: 128 }, (_, index) => ({
      ...widget("pedals"),
      id: `PII_WIDGET_MIXED_${index}`,
    }));
    const projected = snapshot({
      player: { ...snapshot().player, throttle: 0.75 },
    });
    const report = compareOverlayShadow({
      legacySnapshot: snapshot(),
      projection: mapped(projected),
      widgets,
      maxEntries: 1_000,
    });
    const visible = report.widgets.flatMap((entry) => entry.entries);
    const mismatches = visible.filter((entry) =>
      !["equal", "within-tolerance", "external-consumer"].includes(entry.classification)
    );

    expect(report.widgets).toHaveLength(128);
    expect(report.summary).toMatchObject({
      widgets: 128,
      fields: 1_024,
      mismatches: 256,
    });
    expect(mismatches).toHaveLength(64);
    expect(mismatches.every((entry) => entry.path === "throttle")).toBe(true);
    expect(visible.length).toBeLessThanOrEqual(128);
    expect(report.truncated).toBe(true);

    const configured = compareOverlayShadow({
      legacySnapshot: snapshot(),
      projection: mapped(projected),
      widgets,
      maxEntries: 3,
    });
    const configuredVisible = configured.widgets.flatMap((entry) => entry.entries);
    expect(configured.summary.mismatches).toBe(256);
    expect(configuredVisible.filter((entry) =>
      !["equal", "within-tolerance", "external-consumer"].includes(entry.classification)
    )).toHaveLength(3);
    expect(configuredVisible.length).toBeLessThanOrEqual(67);
    expect(configured.truncated).toBe(true);
  });
});

function unsupportedSources(
  type: WidgetType,
  path: string,
): string[] {
  const rule = OVERLAY_SHADOW_POLICIES[type].rules.find((candidate) =>
    candidate.kind === "unsupported" && candidate.path === path
  );
  expect(rule).toBeDefined();
  if (!rule || rule.kind !== "unsupported") return [];
  return rule.sourcePaths.map((selector) => {
    if (selector.kind === "target" || selector.kind === "source") return selector.path;
    return `vehicles[].${selector.field}`;
  });
}

function scalarSources(type: WidgetType, path: string): string[] {
  const rule = OVERLAY_SHADOW_POLICIES[type].rules.find(
    (candidate) => candidate.kind === "scalar" && candidate.path === path,
  );
  expect(rule).toBeDefined();
  if (!rule || rule.kind !== "scalar") return [];
  return rule.quality.selectors.map((selector) => {
    if (selector.kind === "target" || selector.kind === "source") {
      return selector.path;
    }
    return `vehicles[].${selector.field}`;
  });
}

function listFieldSources(
  type: WidgetType,
  listPath: string,
  fieldPath: string,
): string[] {
  const list = OVERLAY_SHADOW_POLICIES[type].rules.find((candidate) =>
    candidate.kind === "list" && candidate.path === listPath
  );
  expect(list).toBeDefined();
  if (!list || list.kind !== "list") return [];
  const field = list.fields.find((candidate) => candidate.path === fieldPath);
  expect(field).toBeDefined();
  if (!field) return [];
  return field.quality.selectors.map((selector) => {
    if (selector.kind === "target" || selector.kind === "source") return selector.path;
    return `vehicles[].${selector.field}`;
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
