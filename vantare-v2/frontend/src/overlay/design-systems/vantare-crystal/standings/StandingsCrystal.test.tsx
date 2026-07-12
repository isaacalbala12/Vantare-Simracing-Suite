import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createDefaultStandingsContent } from "../../../widget-types/standings/standings-content";
import { buildStandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { StandingsCrystal } from "./StandingsCrystal";

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
  activeClass: "—",
  sessionLabel: "—",
  remainingText: "—",
  columns: readyModel.columns,
  rows: [],
});

function renderCrystal(
  model: StandingsViewModel,
  settings: Readonly<Record<string, unknown>> = { showSessionHeader: true, compactRows: false },
) {
  const view = render(<StandingsCrystal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
  return { root, view };
}

describe("StandingsCrystal", () => {
  it("exposes the Crystal system root and standings renderer marker", () => {
    const { root } = renderCrystal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("standings");
    expect(root.getAttribute("data-status")).toBe("ready");
  });

  it("uses a structurally distinct Crystal composition", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector(".vc-standings-frame")).toBeTruthy();
    expect(root.querySelector(".vc-standings-table-header")).toBeTruthy();
    expect(root.querySelector(".vc-standings-row")).toBeTruthy();
    expect(root.querySelector("[data-crystal-primitive='brand']")).toBeTruthy();
    expect(root.querySelector("[data-crystal-primitive='footer']")).toBeTruthy();
    expect(root.querySelector(".vo-standings-table")).toBeNull();
    expect(root.querySelector("table")).toBeNull();
  });

  it("renders the canonical standings slots", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector(".vc-standings-table-header")?.textContent).toContain("POS");
    expect(root.querySelector(".vc-standings-table-header")?.textContent).toContain("LAST");
    expect(root.querySelector(".vc-standings-class-bar")).toBeTruthy();
    expect(root.querySelector(".vc-standings-last")).toBeTruthy();
  });

  it("does not render obsolete configurable columns", () => {
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
    const { root } = renderCrystal(model);
    expect(root.querySelector('[data-metric="bestLap"]')).toBeNull();
  });

  it("marks player leader pit and tire states on canonical rows", () => {
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
    const { root } = renderCrystal(model);
    const leader = root.querySelector('[data-standings-row="1"]') as HTMLElement;
    const player = root.querySelector('[data-standings-row="2"]') as HTMLElement;
    expect(leader.getAttribute("data-leader")).toBe("true");
    expect(player.getAttribute("data-player")).toBe("true");
    expect(player.getAttribute("data-pit")).toBe("true");
    expect(player.getAttribute("data-tire")).toBe("MED");
    expect(player.querySelector(".vc-standings-tire-badge")?.textContent).toBe("M");
    expect(player.querySelector(".vc-standings-pit-tag")?.textContent).toBe("PIT");
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
    const { root } = renderCrystal(model);
    const rowIds = [...root.querySelectorAll("[data-standings-row]")].map((row) =>
      row.getAttribute("data-standings-row"),
    );
    expect(rowIds).toHaveLength(60);
    expect(new Set(rowIds).size).toBe(60);
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderCrystal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelectorAll("[data-standings-row]")).toHaveLength(0);
      cleanup();
    }

    const { root } = renderCrystal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vc-standings-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes showSessionHeader and compactRows appearance settings", () => {
    const hidden = renderCrystal(readyModel, { showSessionHeader: false, compactRows: false });
    expect(hidden.root.querySelector(".vc-standings-header")).toBeNull();
    expect(hidden.root.getAttribute("data-compact")).not.toBe("true");
    cleanup();

    const compact = renderCrystal(readyModel, { showSessionHeader: true, compactRows: true });
    expect(compact.root.querySelector(".vc-standings-header")).toBeTruthy();
    expect(compact.root.getAttribute("data-compact")).toBe("true");
  });

  it("does not render editor controls", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "StandingsCrystal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
  });
});
