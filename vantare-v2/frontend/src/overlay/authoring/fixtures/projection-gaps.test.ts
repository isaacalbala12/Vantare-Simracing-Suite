import { describe, expect, it } from "vitest";
import { WIDGET_PROJECTION_GAPS, projectionGapsFor } from "./projection-gaps";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { buildWorkshopFrameV2, createScenarioWidget } from "./authoring-v2-workshop-frame";
import {
  buildStandingsViewModelV2,
  OVERLAY_V2_STANDINGS_DECLARED_GAPS,
} from "../../widget-types/standings/standings-view-model-v2";
import { parseStandingsContent } from "../../widget-types/standings/standings-content";
import { buildRelativeViewModelV2 } from "../../widget-types/relative/relative-view-model-v2";
import { parseRelativeContent } from "../../widget-types/relative/relative-content";
import { OVERLAY_V2_RELATIVE_DECLARED_GAPS } from "../../widget-types/relative/relative-view-model-v2";
import {
  buildDeltaViewModelV2,
  OVERLAY_V2_DELTA_DECLARED_GAPS,
} from "../../widget-types/delta/delta-view-model-v2";

describe("projection gaps", () => {
  it("freezes the V2 presentation gaps without consulting the V1 adapter", () => {
    expect(projectionGapsFor("standings").map((gap) => gap.field)).toEqual([
      "rows[].driverNumber",
      "rows[].tireCompound",
    ]);
    expect(projectionGapsFor("relative").map((gap) => gap.field)).toEqual([
      "rows[].driverNumber",
    ]);
    expect(projectionGapsFor("delta").map((gap) => gap.field)).toEqual([
      "bestLapText",
    ]);
    expect(OVERLAY_V2_STANDINGS_DECLARED_GAPS).toEqual(expect.arrayContaining(
      projectionGapsFor("standings").map((gap) => gap.field),
    ));
    expect(OVERLAY_V2_RELATIVE_DECLARED_GAPS).toEqual(expect.arrayContaining(
      projectionGapsFor("relative").map((gap) => gap.field),
    ));
    expect(OVERLAY_V2_DELTA_DECLARED_GAPS).toEqual(expect.arrayContaining(
      projectionGapsFor("delta").map((gap) => gap.field),
    ));
  });

  it("warns about the car number, which both grids put on every row", () => {
    for (const widget of ["standings", "relative"] as const) {
      expect(projectionGapsFor(widget).map((gap) => gap.field)).toContain("rows[].driverNumber");
    }
  });

  it("matches the placeholders produced by the real V2 view models", () => {
    const source = buildWorkshopFrameV2({
      session: "race", location: "track", state: "ready", widget: "standings",
      system: "vantare-endurance", variant: "default",
    });
    const standingsWidget = createScenarioWidget({
      widget: "standings", system: "vantare-endurance", variant: "default",
    });
    const standings = buildStandingsViewModelV2(
      source.overlayV2Frame!, source.overlayV2Source!, parseStandingsContent(standingsWidget.content),
    );
    expect(standings.rows.length).toBeGreaterThan(0);
    expect(standings.rows.every((row) => row.driverNumber === "" && row.tireCompound === "")).toBe(true);

    const relativeWidget = createScenarioWidget({
      widget: "relative", system: "vantare-endurance", variant: "default",
    });
    const relative = buildRelativeViewModelV2(
      source.overlayV2Frame!, source.overlayV2Source!, parseRelativeContent(relativeWidget.content),
    );
    expect(relative.rows.length).toBeGreaterThan(0);
    expect(relative.rows.every((row) => row.driverNumber === "")).toBe(true);

    expect(buildDeltaViewModelV2(source.overlayV2Frame!, source.overlayV2Source!).bestLapText).toBe("—");
  });

  it("keys every entry to a registered widget type", () => {
    const known = new Set(widgetTypeRegistry.list().map((definition) => definition.type));
    for (const widget of Object.keys(WIDGET_PROJECTION_GAPS)) {
      expect(known).toContain(widget);
    }
  });

  it("states a consequence, not just a field name", () => {
    for (const gaps of Object.values(WIDGET_PROJECTION_GAPS)) {
      for (const gap of gaps ?? []) {
        expect(gap.consequence.trim().length).toBeGreaterThan(10);
      }
    }
  });
});
