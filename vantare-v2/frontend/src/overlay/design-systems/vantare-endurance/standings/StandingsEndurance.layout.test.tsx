import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createDefaultStandingsContent } from "../../../widget-types/standings/standings-content";
import { buildStandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { StandingsEndurance } from "./StandingsEndurance";
import {
  measureStandingsFlowHeight,
  type StandingsEnduranceLayoutTemplate,
} from "./standings-endurance-layout";

type CssGeometry = Readonly<{
  templateId: StandingsEnduranceLayoutTemplate;
  rowSelector: string;
  rowHeight: number;
  headerHeight: number;
  baseHeight: number;
  groupHeight: number;
  transientReserveHeight?: number;
  cssMarker: string;
  cssGeometryMarkers: readonly string[];
}>;

const CSS_GEOMETRY: readonly CssGeometry[] = [
  { templateId: "standings-f1", rowSelector: ".ven-f1-row", rowHeight: 30, headerHeight: 54, baseHeight: 0, groupHeight: 24, cssMarker: ".ven-f1-row", cssGeometryMarkers: ["line-height: 30px;", "height: 30px;"] },
  { templateId: "standings-wec", rowSelector: ".ven-wec-row", rowHeight: 34, headerHeight: 42, baseHeight: 20, groupHeight: 27, cssMarker: ".ven-wec-row", cssGeometryMarkers: ["height: 34px;"] },
  { templateId: "standings-lmu", rowSelector: ".ven-lmu-row", rowHeight: 36, headerHeight: 31, baseHeight: 0, groupHeight: 0, cssMarker: ".ven-lmu-row", cssGeometryMarkers: ["height: 36px;"] },
  { templateId: "standings-racelabs", rowSelector: ".ven-rl-row", rowHeight: 32, headerHeight: 32, baseHeight: 0, groupHeight: 0, cssMarker: ".ven-rl-row", cssGeometryMarkers: ["height: 32px;", "line-height: 32px;"] },
  { templateId: "standings-apex", rowSelector: ".ven-apex-row", rowHeight: 27, headerHeight: 32, baseHeight: 0, groupHeight: 19, cssMarker: ".ven-apex-row", cssGeometryMarkers: ["line-height: 27px;"] },
  { templateId: "standings-neo", rowSelector: ".ven-neo-row", rowHeight: 38, headerHeight: 38, baseHeight: 0, groupHeight: 37, cssMarker: ".ven-neo-row", cssGeometryMarkers: ["height: 38px;"] },
  { templateId: "standings-redline", rowSelector: ".ven-red-row", rowHeight: 30, headerHeight: 28, baseHeight: 16, groupHeight: 28, transientReserveHeight: 54, cssMarker: ".ven-red-row", cssGeometryMarkers: ["height: 30px;"] },
  { templateId: "standings-tower", rowSelector: ".ven-standings-row", rowHeight: 20, headerHeight: 24, baseHeight: 20, groupHeight: 16, cssMarker: ".ven-standings-row td", cssGeometryMarkers: ["padding: 2px 4px;", "border-bottom: 1px solid"] },
  { templateId: "standings-strip", rowSelector: ".ven-standings-row", rowHeight: 20, headerHeight: 24, baseHeight: 20, groupHeight: 0, cssMarker: ".ven-standings-row td", cssGeometryMarkers: ["padding: 2px 4px;", "border-bottom: 1px solid"] },
];

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../tokens.css"), "utf8");
const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
const baseModel = buildStandingsViewModel(snapshot, createDefaultStandingsContent());

afterEach(cleanup);

describe("StandingsEndurance complete-row DOM geometry", () => {
  it.each(CSS_GEOMETRY)("fits the last complete row for $templateId even when overflow clips", (geometry) => {
    const cssRuleStart = css.indexOf(`${geometry.cssMarker} {`);
    const cssRule = css.slice(cssRuleStart, css.indexOf("}", cssRuleStart) + 1);
    expect(cssRuleStart).toBeGreaterThanOrEqual(0);
    for (const marker of geometry.cssGeometryMarkers) expect(cssRule).toContain(marker);
    expect(css).toMatch(/\.ven-root[\s\S]*?overflow:\s*hidden;/);

    const model = {
      ...baseModel,
      rows: Array.from({ length: 40 }, (_, index) => ({
        ...baseModel.rows[index % baseModel.rows.length]!,
        id: `${geometry.templateId}-${index}`,
        position: index + 1,
        vehicleClass: "HYPERCAR",
        isPlayer: index === 3,
      })),
    };
    const viewportHeight = geometry.baseHeight
      + geometry.headerHeight
      + geometry.groupHeight
      + (geometry.transientReserveHeight ?? 0)
      + geometry.rowHeight * 5
      - 1;
    const view = render(
      <StandingsEndurance
        model={model}
        settings={{ templateId: geometry.templateId, showSessionHeader: true }}
        renderMode="harness"
        layout={{ x: 0, y: 0, w: 520, h: viewportHeight, zIndex: 0, aspectLocked: false }}
      />,
    );
    const root = view.container.querySelector<HTMLElement>(`[data-template="${geometry.templateId}"]`)!;
    const rowCount = root.querySelectorAll(geometry.rowSelector).length;
    const groupCount = root.querySelectorAll("[data-class-block]").length;
    const independentlyMeasuredHeight = geometry.baseHeight
      + geometry.headerHeight
      + geometry.groupHeight
      + rowCount * geometry.rowHeight
      + (geometry.transientReserveHeight ?? 0);
    const helperMeasuredHeight = measureStandingsFlowHeight({
      templateId: geometry.templateId,
      rowCount,
      groupCount,
      showSessionHeader: true,
    }) + (geometry.transientReserveHeight ?? 0);

    expect(root.querySelectorAll("[data-standings-row]")).toHaveLength(rowCount);
    expect(rowCount).toBe(4);
    expect(helperMeasuredHeight).toBe(independentlyMeasuredHeight);
    expect(independentlyMeasuredHeight).toBeLessThanOrEqual(viewportHeight);
    expect(independentlyMeasuredHeight + geometry.rowHeight).toBeGreaterThan(viewportHeight);
  });
});
