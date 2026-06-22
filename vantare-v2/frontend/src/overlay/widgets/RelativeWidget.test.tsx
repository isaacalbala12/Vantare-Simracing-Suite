import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RelativeWidget,
} from "./RelativeWidget";
import {
  formatLapTime,
  formatSignedGap,
  resolveClassColor,
  selectRelativeRowsByGap,
} from "./relative-widget-helpers";

describe("RelativeWidget helpers", () => {
  it("resolves class colors", () => {
    const a = {
      classHypercarColor: "#c1121f",
      classLmp2Color: "#0055A4",
      classLmp3Color: "#f59e0b",
      classGt3Color: "#2ecc71",
      classUnknownColor: "#6b7280",
    };
    expect(resolveClassColor("HYPERCAR", a)).toBe("#c1121f");
    expect(resolveClassColor("LMP2", a)).toBe("#0055A4");
    expect(resolveClassColor("LMP3", a)).toBe("#f59e0b");
    expect(resolveClassColor("LMGT3", a)).toBe("#2ecc71");
    expect(resolveClassColor("GT3", a)).toBe("#2ecc71");
    expect(resolveClassColor("UNKNOWN", a)).toBe("#6b7280");
  });

  it("formats signed gaps", () => {
    expect(formatSignedGap(undefined)).toBe("—");
    expect(formatSignedGap(0)).toBe("—");
    expect(formatSignedGap(1.234)).toBe("+1.2");
    expect(formatSignedGap(-2.5)).toBe("-2.5");
  });

  it("orders cars 3rd ahead at top, 1st ahead just above player", () => {
    const player = { id: 0, driverName: "Player", place: 4, isPlayer: true, timeGapToPlayer: 0 };
    const vehicles = [
      { id: 1, driverName: "Ahead3", place: 1, timeGapToPlayer: 8.0 },
      { id: 2, driverName: "Ahead2", place: 2, timeGapToPlayer: 3.0 },
      { id: 3, driverName: "Ahead1", place: 3, timeGapToPlayer: 1.5 },
      player,
      { id: 5, driverName: "Behind1", place: 5, timeGapToPlayer: -2.0 },
      { id: 6, driverName: "Behind2", place: 6, timeGapToPlayer: -5.0 },
      { id: 7, driverName: "Behind3", place: 7, timeGapToPlayer: -12.0 },
    ];
    const rows = selectRelativeRowsByGap(vehicles, 3, 3);
    expect(rows.map((v) => v.driverName)).toEqual([
      "Ahead3", "Ahead2", "Ahead1", "Player", "Behind1", "Behind2", "Behind3",
    ]);
  });
});
describe("RelativeWidget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function tick(ms: number) {
    act(() => { vi.advanceTimersByTime(ms); });
  }

  it("renders player and surrounding drivers in edit mode", () => {
    render(
      <RelativeWidget editMode={true} updateHz={15} />,
    );
    tick(100);
    expect(screen.getByText("VANTARE")).toBeTruthy();
    expect(screen.getByText("TOYOTA GAZOO")).toBeTruthy();
  });

  it("displays signed time gaps to the player", () => {
    render(
      <RelativeWidget editMode={true} updateHz={15} />,
    );
    tick(100);
    expect(screen.getByText("+2.4")).toBeTruthy();
    expect(screen.getByText("-1.0")).toBeTruthy();
  });

  it("uses ahead color for cars ahead on track", () => {
    render(
      <RelativeWidget editMode={true} updateHz={15} props={{ appearance: { gapAheadColor: "#ff0000" } }} />,
    );
    tick(100);
    const redSpan = screen.getByText("+2.4");
    expect(redSpan.style.color).toBe("#ff0000");
  });

  it("formats lap times as m:ss.mmm with dash fallback", () => {
    expect(formatLapTime(undefined)).toBe("-");
    expect(formatLapTime(0)).toBe("-");
    expect(formatLapTime(NaN)).toBe("-");
    expect(formatLapTime(90.876)).toBe("1:30.876");
    expect(formatLapTime(89.455)).toBe("1:29.455");
  });

  it("renders best lap and last lap columns when enabled by variant", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "class", metricId: "class", enabled: true },
              { id: "carNumber", metricId: "carNumber", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
              { id: "bestLap", metricId: "bestLap", enabled: true },
              { id: "lastLap", metricId: "lastLap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.getByText("1:30.876")).toBeTruthy();
    expect(screen.getByText("1:29.455")).toBeTruthy();
    expect(screen.getByText("1:31.221")).toBeTruthy();
    expect(screen.getByText("+3.1").parentElement?.getAttribute("style")).toContain("width:48px");
    expect(screen.getByText("1:30.876").parentElement?.getAttribute("style")).toContain("width:62px");
    expect(screen.getByText("1:31.221").parentElement?.getAttribute("style")).toContain("width:62px");
  });

  it("keeps optional lap columns hidden by default", () => {
    render(<RelativeWidget editMode={true} updateHz={15} />);

    tick(100);

    expect(screen.queryByText("1:30.876")).toBeNull();
    expect(screen.queryByText("1:29.455")).toBeNull();
  });

  it("does not truncate driver names by default when optional columns are enabled", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            columns: [
              { id: "position", metricId: "position", enabled: true, width: 24 },
              { id: "class", metricId: "class", enabled: true, width: 6 },
              { id: "carNumber", metricId: "carNumber", enabled: true, width: 28 },
              { id: "driverName", metricId: "driverName", enabled: true, width: 210, format: { mode: "full", maxChars: 18 } },
              { id: "gap", metricId: "gap", enabled: true, width: 48 },
              { id: "bestLap", metricId: "bestLap", enabled: true, width: 62, format: { display: "full", decimals: 3 } },
              { id: "lastLap", metricId: "lastLap", enabled: true, width: 62, format: { display: "compact", decimals: 2 } },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.getByText("PORSCHE PENSKE")).toBeTruthy();
    expect(screen.queryByText("PORSCHE…")).toBeNull();
    expect(screen.getByText("1:30.101")).toBeTruthy();
  });

  it("truncates driver names only when configured", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            columns: [
              { id: "driverName", metricId: "driverName", enabled: true, width: 110, format: { mode: "truncate", maxChars: 8 } },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.getByText("PORSCHE…")).toBeTruthy();
  });

  it("applies compact lap format, column width, color and alignment", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            columns: [
              { id: "driverName", metricId: "driverName", enabled: true, width: 180 },
              { id: "bestLap", metricId: "bestLap", enabled: true, width: 90, format: { display: "compact", decimals: 1 }, style: { color: "#ffcc00", align: "center" } },
            ],
          },
        }}
      />,
    );

    tick(100);

    const compact = screen.getByText("30.9");
    expect(compact.style.color).toBe("#ffcc00");
    expect(compact.parentElement?.getAttribute("style")).toContain("width:90px");
    expect(compact.parentElement?.className).toContain("justify-center");
  });

  it("filters relative rows to the player class when configured", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            filters: { classScope: "sameClass", rangeAhead: 3, rangeBehind: 3, includePlayer: true },
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.getByText("TOYOTA GAZOO")).toBeTruthy();
    expect(screen.queryByText("UNITED AUTOSPORTS")).toBeNull();
  });

  it("can hide the player row when includePlayer is false", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            filters: { rangeAhead: 1, rangeBehind: 1, includePlayer: false },
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    expect(screen.queryByText("TOYOTA GAZOO")).toBeNull();
    expect(screen.getByText("CADILLAC RACING")).toBeTruthy();
    expect(screen.getByText("PEUGEOT")).toBeTruthy();
  });

  it("can render compact rows without forcing the panel to full height", () => {
    render(
      <RelativeWidget
        editMode={true}
        updateHz={15}
        props={{
          variant: {
            id: "variant-relative-default",
            templateId: "relative-vantare-default",
            filters: { rangeAhead: 1, rangeBehind: 1, includePlayer: true, rowHeightMode: "compact" },
            columns: [
              { id: "position", metricId: "position", enabled: true },
              { id: "driverName", metricId: "driverName", enabled: true },
              { id: "gap", metricId: "gap", enabled: true },
            ],
          },
        }}
      />,
    );

    tick(100);

    const panel = screen.getByTestId("relative-panel");
    expect(panel.className).not.toContain("h-full");
    expect(panel.className).not.toContain("w-full");
    expect(panel.getAttribute("style")).toContain("width: 224px");
    expect(screen.getByText("TOYOTA GAZOO").parentElement?.getAttribute("style")).toContain("height:31px");
  });
});
