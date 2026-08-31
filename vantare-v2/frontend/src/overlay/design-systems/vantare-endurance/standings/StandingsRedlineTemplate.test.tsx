import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import {
  createDefaultStandingsContent,
  type StandingsMetricId,
} from "../../../widget-types/standings/standings-content";
import { buildStandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { StandingsRedlineTemplate } from "./StandingsRedlineTemplate";
import { fitStandingsRowsToHeight, measureStandingsFlowHeight } from "./standings-endurance-layout";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function modelWithColumns(
  metrics: readonly StandingsMetricId[],
  disabledAnchors = false,
) {
  const defaults = createDefaultStandingsContent();
  const byMetric = new Map(defaults.columns.map((column) => [column.metricId, column]));
  const columns = metrics.map((metricId) => {
    const column = byMetric.get(metricId);
    if (!column) throw new Error(`missing standings column: ${metricId}`);
    return {
      ...column,
      enabled: disabledAnchors && (metricId === "position" || metricId === "driverName")
        ? false
        : true,
    };
  });
  return buildStandingsViewModel(
    buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
    { ...defaults, columns },
  );
}

function firstRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>("[data-standings-row]");
  if (!row) throw new Error("Redline row missing");
  return row;
}

describe("StandingsRedlineTemplate", () => {
  it("renders fixed anchors and flexible metrics in the configured order", () => {
    const model = modelWithColumns(
      [
        "position",
        "driverName",
        "vehicleClass",
        "tireCompound",
        "pit",
        "currentLap",
        "interval",
        "lastLap",
        "driverNumber",
        "bestLap",
        "gap",
      ],
      true,
    );
    const view = render(
      <StandingsRedlineTemplate model={model} settings={{}} showSessionHeader={false} />,
    );
    const row = firstRow(view.container);

    expect(
      [...row.querySelectorAll<HTMLElement>("[data-metric]")].map(
        (cell) => cell.dataset.metric,
      ),
    ).toEqual([
      "position",
      "driverName",
      "vehicleClass",
      "tireCompound",
      "pit",
      "currentLap",
      "interval",
      "lastLap",
      "driverNumber",
      "bestLap",
      "gap",
    ]);
    expect(row.querySelector('[data-metric="driverName"]')?.textContent).not.toBe("—");
    expect(row.querySelectorAll('[data-metric="bestLap"]')).toHaveLength(1);
  });

  it("uses canonical preset widths and configured alignment, including special cells", () => {
    const model = modelWithColumns([
      "position",
      "driverName",
      "lastLap",
      "gap",
      "bestLap",
      "tireCompound",
    ]);
    const columns = model.columns.map((column) =>
      column.metricId === "lastLap"
        ? { ...column, widthPreset: "lg" as const, style: { align: "left" as const } }
        : ["gap", "bestLap", "tireCompound"].includes(column.metricId)
          ? { ...column, style: { align: "left" as const } }
        : column,
    );
    const view = render(
      <StandingsRedlineTemplate
        model={{ ...model, columns }}
        settings={{}}
        showSessionHeader={false}
      />,
    );
    const row = firstRow(view.container);

    expect(row.style.gridTemplateColumns).toContain("90px");
    expect((row.querySelector('[data-metric="lastLap"]') as HTMLElement).style.textAlign).toBe(
      "left",
    );
    expect((row.querySelector('[data-metric="gap"]') as HTMLElement).style.justifyContent).toBe(
      "flex-start",
    );
    expect(
      (row.querySelector('[data-metric="bestLap"]') as HTMLElement).style.justifyContent,
    ).toBe("flex-start");
    expect(
      (row.querySelector('[data-metric="tireCompound"]') as HTMLElement).style.justifySelf,
    ).toBe("start");
    const root = view.container.querySelector<HTMLElement>(".ven-red-root");
    expect(root?.style.width).toBe("");
    expect(root?.style.minWidth).toMatch(/px$/);
  });

  it("renders retirement ghosts through the same configurable row", () => {
    vi.useFakeTimers();
    const full = modelWithColumns(["position", "driverName", "lastLap", "gap"]);
    const expandedRows = Array.from({ length: 18 }, (_, index) => ({
      ...full.rows[index % full.rows.length]!,
      id: `redline-${index}`,
      position: index + 1,
      isPlayer: index === 7,
      vehicleClass: "HYPERCAR",
    }));
    const fittedRows = fitStandingsRowsToHeight(expandedRows, {
      templateId: "standings-redline",
      viewportHeight: 560,
      showSessionHeader: true,
    });
    const initial = { ...full, rows: fittedRows };
    const view = render(
      <StandingsRedlineTemplate model={initial} settings={{}} showSessionHeader />,
    );

    view.rerender(
      <StandingsRedlineTemplate
        model={{ ...initial, rows: initial.rows.slice(0, -1) }}
        settings={{}}
        showSessionHeader
      />,
    );
    act(() => vi.advanceTimersByTime(0));

    const ghost = view.container.querySelector<HTMLElement>(".ven-red-ghost");
    expect(ghost).toBeTruthy();
    expect(
      [...(ghost?.querySelectorAll<HTMLElement>("[data-metric]") ?? [])].map(
        (cell) => cell.dataset.metric,
      ),
    ).toEqual(["position", "driverName", "lastLap", "gap"]);
    expect(ghost?.querySelector('[data-metric="gap"]')?.textContent).toBe("OUT");
    const rowCount = view.container.querySelectorAll(".ven-red-row").length;
    expect(measureStandingsFlowHeight({
      templateId: "standings-redline",
      rowCount,
      groupCount: view.container.querySelectorAll(".ven-red-block").length,
      showSessionHeader: true,
      battleBoxCount: 0,
    })).toBeLessThanOrEqual(560);
  });

  it("keeps a crystallized battle box within the fitted 560px flow", () => {
    vi.useFakeTimers();
    const full = modelWithColumns(["position", "driverName", "lastLap", "gap"]);
    const expandedRows = Array.from({ length: 18 }, (_, index) => ({
      ...full.rows[index % full.rows.length]!,
      id: `battle-${index}`,
      position: index + 1,
      isPlayer: index === 7,
      vehicleClass: "HYPERCAR",
      gapText: index === 8 ? "+14.4s" : index === 7 ? "+14.0s" : `+${index * 2}.0s`,
      pitText: "",
    }));
    const rows = fitStandingsRowsToHeight(expandedRows, {
      templateId: "standings-redline",
      viewportHeight: 560,
      showSessionHeader: true,
    });
    const battleModel = { ...full, sessionLabel: "RACE", rows };
    const view = render(
      <StandingsRedlineTemplate model={battleModel} settings={{}} showSessionHeader />,
    );
    expect(view.container.querySelectorAll('.ven-red-battle[data-stage="seam"]')).toHaveLength(1);
    view.rerender(
      <StandingsRedlineTemplate model={{ ...battleModel }} settings={{}} showSessionHeader />,
    );
    act(() => vi.advanceTimersByTime(2500));

    expect(view.container.querySelectorAll('.ven-red-battle[data-stage="box"]')).toHaveLength(1);
    expect(measureStandingsFlowHeight({
      templateId: "standings-redline",
      rowCount: view.container.querySelectorAll(".ven-red-row").length,
      groupCount: view.container.querySelectorAll(".ven-red-block").length,
      showSessionHeader: true,
      battleBoxCount: 1,
    })).toBeLessThanOrEqual(560);
  });
});
