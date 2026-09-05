import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultRelativeContent, getEnabledRelativeColumns } from "../../../widget-types/relative/relative-content";
import type { RelativeContent } from "../../../widget-types/relative/relative-content";
import type { RelativeRowViewModel, RelativeViewModel } from "../../../widget-types/relative/relative-view-model";
import { RelativeCrystal } from "./RelativeCrystal";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

function relativeRow(
  row: Pick<RelativeRowViewModel, "id" | "position" | "driverName"> &
    Partial<RelativeRowViewModel>,
): RelativeRowViewModel {
  return {
    vehicleClass: "HYPERCAR",
    driverNumber: "",
    gapText: "—",
    bestLapText: "-",
    lastLapText: "-",
    isPlayer: false,
    side: "ahead",
    tone: "neutral",
    gapSeconds: null,
    ...row,
  };
}

function buildReadyModel(
  content: RelativeContent = createDefaultRelativeContent(),
  rowHeightMode: "compact" | "fill" = "compact",
): RelativeViewModel {
  return {
    type: "relative",
    status: "ready",
    columns: getEnabledRelativeColumns(content),
    rowHeightMode,
    rows: [
      relativeRow({ id: "2", position: 2, driverName: "Ahead near", side: "ahead", tone: "ahead", gapText: "+2.0", gapSeconds: 2 }),
      relativeRow({ id: "3", position: 3, driverName: "Ahead gt", vehicleClass: "LMGT3", side: "ahead", tone: "ahead", gapText: "+1.0", gapSeconds: 1 }),
      relativeRow({ id: "4", position: 4, driverName: "Player", isPlayer: true, side: "ahead", tone: "player", gapSeconds: 0 }),
      relativeRow({ id: "5", position: 5, driverName: "Behind near", side: "behind", tone: "behind", gapText: "-1.0", gapSeconds: -1 }),
      relativeRow({ id: "6", position: 6, driverName: "Behind gt", vehicleClass: "LMGT3", side: "behind", tone: "behind", gapText: "-2.0", gapSeconds: -2 }),
    ],
  };
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

function renderCrystal(
  model: RelativeViewModel,
  settings: Readonly<Record<string, unknown>> = defaultSettings,
) {
  const view = render(<RelativeCrystal model={model} settings={settings} renderMode="harness" />);
  const root = view.container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
  return { root, view };
}

describe("RelativeCrystal", () => {
  it("exposes the Crystal system root and relative renderer marker", () => {
    const { root } = renderCrystal(readyModel);
    expect(root).toBeTruthy();
    expect(root.getAttribute("data-widget-renderer")).toBe("relative");
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(root.getAttribute("data-row-height")).toBe("compact");
  });

  it("uses a structurally distinct Crystal composition", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector(".vc-relative-frame")).toBeTruthy();
    expect(root.querySelector(".vc-relative-table-header")).toBeTruthy();
    expect(root.querySelector(".vc-relative-row")).toBeTruthy();
    expect(root.querySelector("[data-crystal-primitive='brand']")).toBeTruthy();
    expect(root.querySelector("[data-crystal-primitive='pill']")?.textContent).toBe("● RELATIVE");
    expect(root.querySelector("[data-crystal-primitive='footer']")).toBeTruthy();
    expect(root.querySelector(".vo-relative-row")).toBeNull();
  });

  it("renders enabled columns in configured order", () => {
    const { root } = renderCrystal(readyModel);
    const playerCard = root.querySelector('[data-relative-row="4"]') as HTMLElement;
    const cells = [...playerCard.querySelectorAll("[data-metric]")].map((cell) =>
      cell.getAttribute("data-metric"),
    );
    expect(cells).toEqual(readyModel.columns.map((column) => column.metricId));
  });

  it("separates the player row into a dedicated card", () => {
    const { root } = renderCrystal(readyModel);
    const player = root.querySelector('[data-relative-row="4"]') as HTMLElement;
    expect(player.className).toContain("vc-relative-player");
    expect(player.getAttribute("data-player")).toBe("true");
    expect(player.getAttribute("data-tone")).toBe("player");
  });

  it("marks ahead and behind tones on neighbor cards", () => {
    const { root } = renderCrystal(readyModel);
    const ahead = root.querySelector('[data-relative-row="2"]') as HTMLElement;
    const behind = root.querySelector('[data-relative-row="5"]') as HTMLElement;
    expect(ahead.getAttribute("data-tone")).toBe("ahead");
    expect(behind.getAttribute("data-tone")).toBe("behind");
  });

  it("keeps physical relative gaps while the player is in pit", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelectorAll("[data-relative-row]")).toHaveLength(5);
    expect(root.querySelectorAll("[data-tone='ahead']")).toHaveLength(2);
    expect(root.querySelectorAll("[data-tone='behind']")).toHaveLength(2);
    expect(root.querySelector('[data-relative-row="2"]')?.textContent).toContain("+2.0");
    expect(root.querySelector('[data-relative-row="5"]')?.textContent).toContain("-1.0");
  });

  it("applies class color bars from vehicle class", () => {
    const { root } = renderCrystal(readyModel, {
      ...defaultSettings,
      classHypercarColor: "#aa0000",
      classGt3Color: "#00aa00",
    });
    const hypercarBar = root.querySelector('[data-relative-row="2"] .vc-relative-class-bar') as HTMLElement;
    const gtBar = root.querySelector('[data-relative-row="3"] .vc-relative-class-bar') as HTMLElement;
    expect(hypercarBar.style.background).toBe("#aa0000");
    expect(gtBar.style.background).toBe("#00aa00");
  });

  it("applies fill row height mode without measuring the DOM", () => {
    const { root } = renderCrystal(buildReadyModel(createDefaultRelativeContent(), "fill"));
    expect(root.getAttribute("data-row-height")).toBe("fill");
    expect(root.style.width).toBe("100%");
  });

  it("fills the frame without overriding the canvas minimum width", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.style.minWidth).toBe("");
    expect(root.style.width).toBe("100%");
  });

  it("shows deterministic unavailable presentations", () => {
    for (const status of ["missing", "stale", "disconnected"] as const) {
      const { root } = renderCrystal(unavailable(status));
      expect(root.getAttribute("data-status")).toBe(status);
      expect(root.querySelectorAll("[data-relative-row]")).toHaveLength(0);
      cleanup();
    }

    const { root } = renderCrystal(unavailable("error", "telemetry unavailable"));
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".vc-relative-status-message")?.textContent).toBe("telemetry unavailable");
  });

  it("consumes appearance settings", () => {
    const hidden = renderCrystal(readyModel, { ...defaultSettings, showHeader: false });
    expect(hidden.root.querySelector(".vc-relative-header")).toBeNull();
    cleanup();

    const customGap = renderCrystal(readyModel, {
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

    const customAccent = renderCrystal(readyModel, { ...defaultSettings, accentColor: "#abcdef" });
    expect(customAccent.root.style.getPropertyValue("--vc-relative-accent")).toBe("#abcdef");
  });

  it("does not render editor controls", () => {
    const { root } = renderCrystal(readyModel);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("does not import forbidden runtime dependencies", () => {
    const source = readFileSync(resolve(testDir, "RelativeCrystal.tsx"), "utf8");
    expect(source).not.toMatch(/@wailsio\/runtime/);
    expect(source).not.toMatch(/telemetry-store/);
    expect(source).not.toMatch(/getTelemetryRef/);
    expect(source).not.toMatch(/profile-document/);
    expect(source).not.toMatch(/clientWidth/);
  });
});
