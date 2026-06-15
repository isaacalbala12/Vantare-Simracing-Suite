import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RelativeWidget,
  formatRelativeGap,
  formatSignedGap,
  relativeGapColor,
  resolveClassColor,
  selectRelativeRows,
  selectRelativeRowsByGap,
} from "./RelativeWidget";

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
    expect(formatSignedGap(0.5)).toBe("+0.5");
    expect(formatSignedGap(-1.2)).toBe("-1.2");
    expect(formatSignedGap(0)).toBe("—");
    expect(formatSignedGap(undefined)).toBe("—");
  });

  it("selects 3 ahead and 3 behind by time gap", () => {
    const player = { id: 0, driverName: "Player", place: 4, isPlayer: true, timeGapToPlayer: 0 };
    const vehicles = [
      { id: 1, driverName: "FarAhead", place: 1, timeGapToPlayer: 8.0 },
      { id: 2, driverName: "Ahead2", place: 2, timeGapToPlayer: 3.0 },
      { id: 3, driverName: "Ahead1", place: 3, timeGapToPlayer: 1.5 },
      player,
      { id: 5, driverName: "Behind1", place: 5, timeGapToPlayer: -2.0 },
      { id: 6, driverName: "Behind2", place: 6, timeGapToPlayer: -5.0 },
      { id: 7, driverName: "FarBehind", place: 7, timeGapToPlayer: -12.0 },
    ];
    const rows = selectRelativeRowsByGap(vehicles, 3, 3);
    expect(rows.map((v) => v.driverName)).toEqual([
      "Ahead1", "Ahead2", "FarAhead", "Player", "Behind1", "Behind2", "FarBehind",
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

  it("orders relative rows by lap distance around the player", () => {
    const vehicles = [
      { id: 1, driverName: "Ahead", lapDistance: 220, place: 8 },
      { id: 2, driverName: "Player", lapDistance: 200, place: 9, isPlayer: true },
      { id: 3, driverName: "Behind", lapDistance: 180, place: 10 },
      { id: 4, driverName: "Far", lapDistance: 900, place: 1 },
    ];
    const rows = selectRelativeRows(vehicles, 1, 1);
    expect(rows.map((v) => v.driverName)).toEqual(["Ahead", "Player", "Behind"]);
  });

  it("formats relative gap from lap distance instead of classification gap", () => {
    const player = { id: 2, driverName: "Player", lapDistance: 200, place: 9, isPlayer: true };
    const ahead = { id: 1, driverName: "Ahead", lapDistance: 220, place: 8, timeBehindNext: 99 };
    expect(formatRelativeGap(ahead, player)).toBe("20m");
  });

  it("uses ahead color for cars ahead on track", () => {
    const player = { id: 2, lapDistance: 200, place: 9, isPlayer: true };
    const ahead = { id: 1, lapDistance: 220, place: 8 };
    const behind = { id: 3, lapDistance: 180, place: 10 };
    expect(relativeGapColor(ahead, player, "#ahead", "#behind", "#player")).toBe("#ahead");
    expect(relativeGapColor(behind, player, "#ahead", "#behind", "#player")).toBe("#behind");
    expect(relativeGapColor(player, player, "#ahead", "#behind", "#player")).toBe("#player");
  });
});
