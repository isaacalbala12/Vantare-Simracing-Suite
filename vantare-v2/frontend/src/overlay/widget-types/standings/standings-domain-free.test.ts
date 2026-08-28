import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_STANDINGS,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import { standingsDefinition } from "./standings-definition";
import { buildStandingsViewModelV2, standingsDisplayedValues } from "./standings-view-model-v2";

const CONTENT = standingsDefinition.parseContent({
  classScope: "all-classes",
  rowCount: 20,
});

describe("standings v2 view model", () => {
  it("is authoritative by default and remains explicitly addressable", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toContain(OVERLAY_V2_STANDINGS);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_STANDINGS)).toBe(true);
    expect(hasOverlayV2Feature([OVERLAY_V2_STANDINGS], OVERLAY_V2_STANDINGS)).toBe(true);
  });

  it.each([1, 20, 44, 104])(
    "renders the order resolved in Go for the %i-vehicle golden without re-sorting",
    (vehicles) => {
      const update = golden(vehicles);
      if (!update.frame) throw new Error("golden frame missing");
      const model = buildStandingsViewModelV2(update.frame, update.source, CONTENT);
      const expected = update.frame.standings.slice(0, 20);

      expect(model.rows).toHaveLength(expected.length);
      expect(model.rows.map((row) => row.id)).toEqual(expected.map((row) => row.id));
      expect(model.rows.map((row) => row.position)).toEqual(expected.map((row) => row.position));
      expect(model.rows[0]?.isLeader ?? true).toBe(true);
    },
  );

  it("marks the player row from the frame identity, never from a heuristic", () => {
    const update = golden(44);
    if (!update.frame) throw new Error("golden frame missing");
    const model = buildStandingsViewModelV2(update.frame, update.source, CONTENT);
    const players = model.rows.filter((row) => row.isPlayer);
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe(update.frame.player.id);
  });

  it("leaves the fields the canonical state does not carry at the placeholder", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const model = buildStandingsViewModelV2(update.frame, update.source, CONTENT);
    for (const row of model.rows) {
      expect(row.driverNumber).toBe("");
      expect(row.teamCode).toBe("");
      expect(row.teamBrandColor).toBe("");
      expect(row.tireCompound).toBe("");
      expect(row.bestLapText).toBe("—");
      expect(row.intervalText).toBe("—");
    }
  });

  it("keeps the canonical driver name available when an old profile disabled the driver column", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const legacyContent = {
      ...CONTENT,
      columns: CONTENT.columns.map((column) =>
        column.metricId === "driverName" ? { ...column, enabled: false } : column,
      ),
    };
    const model = buildStandingsViewModelV2(update.frame, update.source, legacyContent);

    expect(model.rows[0]?.configuredDriverName).toBe(model.rows[0]?.driverName);
    expect(model.rows[0]?.configuredDriverName).not.toBe("—");
  });

  it("scopes rows to the active class without reordering them", () => {
    const update = golden(44);
    if (!update.frame) throw new Error("golden frame missing");
    const scoped = buildStandingsViewModelV2(
      update.frame,
      update.source,
      { ...CONTENT, classScope: "player-class" },
    );
    expect(scoped.rows.length).toBeGreaterThan(0);
    for (const row of scoped.rows) {
      expect(row.vehicleClass.toUpperCase()).toBe(scoped.activeClass);
    }
    const positions = scoped.rows.map((row) => row.position);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it("propagates the source lifecycle instead of rendering stale rows as ready", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    expect(buildStandingsViewModelV2(update.frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildStandingsViewModelV2(update.frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.rows).toEqual([]);
  });

  it("exposes a stable displayed projection for the shadow comparator", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const displayed = standingsDisplayedValues(
      buildStandingsViewModelV2(update.frame, update.source, CONTENT),
    );
    expect(displayed.rowCount).toBe("20");
    expect(displayed.sessionLabel).toBe("RACE");
    expect(displayed.rows.split("|")).toHaveLength(20);
  });
});

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}
