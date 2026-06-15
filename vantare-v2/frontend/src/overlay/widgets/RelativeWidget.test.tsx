import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RelativeWidget,
  formatSignedGap,
  resolveClassColor,
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
    expect(formatSignedGap(undefined)).toBe("—");
    expect(formatSignedGap(0)).toBe("—");
    expect(formatSignedGap(1.234)).toBe("+1.2");
    expect(formatSignedGap(-2.5)).toBe("-2.5");
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
});
