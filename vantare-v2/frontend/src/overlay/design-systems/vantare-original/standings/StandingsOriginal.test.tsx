import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createDefaultStandingsContent } from "../../../widget-types/standings/standings-content";
import { buildStandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { StandingsOriginal } from "./StandingsOriginal";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

const readyModel = buildStandingsViewModel(
  buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
  createDefaultStandingsContent(),
);

const unavailable = (status: StandingsViewModel["status"], statusMessage?: string): StandingsViewModel => ({
  type: "standings",
  status,
  statusMessage,
  sessionLabel: "—",
  remainingText: "—",
  columns: readyModel.columns,
  rows: [],
});

function renderOriginal(
  model: StandingsViewModel,
  settings: Readonly<Record<string, unknown>> = { showSessionHeader: true, compactRows: false },
) {
  const view = render(<StandingsOriginal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
  return { root, view };
}

describe("StandingsOriginal", () => {
  it("exposes the Original system root and standings renderer marker", () => {
    const { root } = renderOriginal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("standings");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("renders enabled columns in configured order", () => {
    const { root } = renderOriginal(readyModel);
    const headers = [...root.querySelectorAll("thead th")].map((cell) => cell.getAttribute("data-metric"));
    expect(headers).toEqual(readyModel.columns.map((column) => column.metricId));

    const firstRow = root.querySelector('[data-standings-row]') as HTMLElement;
    const cells = [...firstRow.querySelectorAll("td")].map((cell) => cell.getAttribute("data-metric"));
    expect(cells).toEqual(readyModel.columns.map((column) => column.metricId));
  });

  it("omits disabled columns from the table", () => {
    const content = createDefaultStandingsContent();
    const disabledBestLap = {
      ...content,
      columns: content.columns.map((column) =>
        column.metricId === "bestLap" ? { ...column, enabled: false } : column,
      ),
    };
    const model = buildStandingsViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
      disabledBestLap,
    );
    const { root } = renderOriginal(model);
    expect(root.querySelector('[data-metric="bestLap"]')).toBeNull();
    expect(model.columns.some((column) => column.metricId === "bestLap")).toBe(false);
  });

  it("marks player leader pit and tire states on rows", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = buildStandingsViewModel(
      {
        ...snapshot,
        scoring: [
          { id: 1, place: 1, driverName: "Leader", isPlayer: false, inPits: false, tireCompound: "SOFT" },
          { id: 2, place: 2, driverName: "Player", isPlayer: true, inPits: true, tireCompound: "MED" },
        ],
      },
      createDefaultStandingsContent(),
    );
    const { root } = renderOriginal(model);
    const leader = root.querySelector('[data-standings-row="1"]') as HTMLElement;
    const player = root.querySelector('[data-standings-row="2"]') as HTMLElement;
    expect(leader.getAttribute("data-leader")).toBe("true");
    expect(player.getAttribute("data-player")).toBe("true");
    expect(player.getAttribute("data-pit")).toBe("true");
    expect(player.getAttribute("data-tire")).toBe("MED");
  });

  it("keeps stable row keys for 60-row stress input", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const manyRows = Array.from({ length: 60 }, (_, index) => ({
      id: index + 1,
      place: index + 1,
      driverName: `Driver ${index + 1}`,
      vehicleClass: "HYPERCAR",
      isPlayer: index === 4,
    }));
    const model = buildStandingsViewModel({ ...snapshot, scoring: manyRows }, createDefaultStandingsContent());
    const { root } = renderOriginal(model);
    const rowIds = [...root.querySelectorAll("[data-standings-row]")].map((row) =>
      row.getAttribute("data-standings-row"),
    );
    expect(rowIds).toHaveLength(60);
    expect(new Set(rowIds).size).toBe(60);
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderOriginal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelectorAll("[data-standings-row]")).toHaveLength(0);
      cleanup();
    }

    const { root } = renderOriginal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vo-standings-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes showSessionHeader and compactRows appearance settings", () => {
    const hidden = renderOriginal(readyModel, { showSessionHeader: false, compactRows: false });
    expect(hidden.root.querySelector(".vo-standings-session")).toBeNull();
    expect(hidden.root.getAttribute("data-compact")).not.toBe("true");
    cleanup();

    const compact = renderOriginal(readyModel, { showSessionHeader: true, compactRows: true });
    expect(compact.root.querySelector(".vo-standings-session")).toBeTruthy();
    expect(compact.root.getAttribute("data-compact")).toBe("true");
  });

  it("does not render editor controls", () => {
    const { root } = renderOriginal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "StandingsOriginal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});