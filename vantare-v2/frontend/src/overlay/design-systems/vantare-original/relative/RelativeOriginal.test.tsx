import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../../core/mock-scenarios";
import { createDefaultRelativeContent } from "../../../widget-types/relative/relative-content";
import { computeRelativeIntrinsicWidth } from "../../../widget-types/relative/relative-renderer-helpers";
import { buildRelativeViewModel } from "../../../widget-types/relative/relative-view-model";
import type { RelativeViewModel } from "../../../widget-types/relative/relative-view-model";
import { RelativeOriginal } from "./RelativeOriginal";

const testDir = dirname(fileURLToPath(import.meta.url));

const vehicles = [
  { id: 1, driverName: "Ahead far", place: 1, vehicleClass: "HYPERCAR", timeGapToPlayer: 6, driverNumber: "7" },
  { id: 2, driverName: "Ahead near", place: 2, vehicleClass: "HYPERCAR", timeGapToPlayer: 2, driverNumber: "36" },
  { id: 3, driverName: "Ahead gt", place: 3, vehicleClass: "LMGT3", timeGapToPlayer: 1, driverNumber: "12" },
  { id: 4, driverName: "Player", place: 4, vehicleClass: "HYPERCAR", isPlayer: true, timeGapToPlayer: 0, driverNumber: "8" },
  { id: 5, driverName: "Behind near", place: 5, vehicleClass: "HYPERCAR", timeGapToPlayer: -1, driverNumber: "23" },
  { id: 6, driverName: "Behind gt", place: 6, vehicleClass: "LMGT3", timeGapToPlayer: -2, driverNumber: "44" },
  { id: 7, driverName: "Behind far", place: 7, vehicleClass: "HYPERCAR", timeGapToPlayer: -5, driverNumber: "99" },
];

afterEach(() => cleanup());

function buildReadyModel(rowHeightMode: "compact" | "fill" = "compact"): RelativeViewModel {
  const content = createDefaultRelativeContent();
  const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
  return buildRelativeViewModel(
    { ...snapshot, scoring: vehicles },
    { ...content, rowHeightMode },
  );
}

const readyModel = buildReadyModel();

const unavailable = (status: RelativeViewModel["status"], statusMessage?: string): RelativeViewModel => ({
  type: "relative",
  status,
  statusMessage,
  columns: readyModel.columns,
  rowHeightMode: "compact",
  rows: [],
});

const defaultSettings = {
  showHeader: true,
  accentColor: "#e63946",
  gapAheadColor: "#f87171",
  gapBehindColor: "#4ade80",
  classHypercarColor: "#c1121f",
  classLmp2Color: "#0055a4",
  classLmp3Color: "#f59e0b",
  classGt3Color: "#2ecc71",
  classUnknownColor: "#6b7280",
};

function renderOriginal(
  model: RelativeViewModel,
  settings: Readonly<Record<string, unknown>> = defaultSettings,
) {
  const view = render(<RelativeOriginal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-original"]') as HTMLElement;
  return { root, view };
}

describe("RelativeOriginal", () => {
  it("exposes the Original system root and relative renderer marker", () => {
    const { root } = renderOriginal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("relative");
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(root.getAttribute("data-row-height")).toBe("compact");
  });

  it("renders enabled columns in configured order", () => {
    const { root } = renderOriginal(readyModel);
    const firstRow = root.querySelector('[data-relative-row="4"]') as HTMLElement;
    const cells = [...firstRow.querySelectorAll("[data-metric]")].map((cell) =>
      cell.getAttribute("data-metric"),
    );
    expect(cells).toEqual(readyModel.columns.map((column) => column.metricId));
  });

  it("omits disabled columns from rows", () => {
    const content = createDefaultRelativeContent();
    const disabledBestLap = {
      ...content,
      columns: content.columns.map((column) =>
        column.metricId === "bestLap" ? { ...column, enabled: false } : column,
      ),
    };
    const model = buildRelativeViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
      disabledBestLap,
    );
    const { root } = renderOriginal(model);
    expect(root.querySelector('[data-metric="bestLap"]')).toBeNull();
  });

  it("marks player ahead and behind tones on rows", () => {
    const { root } = renderOriginal(readyModel);
    const player = root.querySelector('[data-relative-row="4"]') as HTMLElement;
    const ahead = root.querySelector('[data-relative-row="2"]') as HTMLElement;
    const behind = root.querySelector('[data-relative-row="5"]') as HTMLElement;
    expect(player.getAttribute("data-player")).toBe("true");
    expect(player.getAttribute("data-tone")).toBe("player");
    expect(ahead.getAttribute("data-tone")).toBe("ahead");
    expect(behind.getAttribute("data-tone")).toBe("behind");
  });

  it("applies class color bars from vehicle class", () => {
    const { root } = renderOriginal(readyModel, {
      ...defaultSettings,
      classHypercarColor: "#aa0000",
      classGt3Color: "#00aa00",
    });
    const hypercarBar = root.querySelector('[data-relative-row="2"] .vo-relative-class-bar') as HTMLElement;
    const gtBar = root.querySelector('[data-relative-row="3"] .vo-relative-class-bar') as HTMLElement;
    expect(hypercarBar.style.background).toBe("#aa0000");
    expect(gtBar.style.background).toBe("#00aa00");
  });

  it("applies fill row height mode without measuring the DOM", () => {
    const { root } = renderOriginal(buildReadyModel("fill"));
    expect(root.getAttribute("data-row-height")).toBe("fill");
    expect(root.style.width).toBe("100%");
    expect(root.querySelector(".vo-relative-row")).toBeTruthy();
  });

  it("sets intrinsic minimum width from enabled columns", () => {
    const { root } = renderOriginal(readyModel);
    const expected = `${computeRelativeIntrinsicWidth(readyModel.columns)}px`;
    expect(root.style.minWidth).toBe(expected);
    expect(root.style.width).toBe(expected);
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderOriginal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelectorAll("[data-relative-row]")).toHaveLength(0);
      cleanup();
    }

    const { root } = renderOriginal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vo-relative-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes appearance settings", () => {
    const hidden = renderOriginal(readyModel, { ...defaultSettings, showHeader: false });
    expect(hidden.root.querySelector(".vo-relative-header")).toBeNull();
    cleanup();

    const customGap = renderOriginal(readyModel, {
      ...defaultSettings,
      gapAheadColor: "#112233",
      gapBehindColor: "#445566",
    });
    const aheadGap = customGap.root.querySelector(
      '[data-relative-row="2"] [data-metric="gap"]',
    ) as HTMLElement;
    const behindGap = customGap.root.querySelector(
      '[data-relative-row="5"] [data-metric="gap"]',
    ) as HTMLElement;
    expect(aheadGap.style.color).toBe("#112233");
    expect(behindGap.style.color).toBe("#445566");
    cleanup();

    const customAccent = renderOriginal(readyModel, { ...defaultSettings, accentColor: "#abcdef" });
    expect(customAccent.root.style.getPropertyValue("--vo-relative-accent")).toBe("#abcdef");
  });

  it("does not render editor controls", () => {
    const { root } = renderOriginal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "RelativeOriginal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
    expect(source).not.toMatch(/clientWidth/);
  });
});