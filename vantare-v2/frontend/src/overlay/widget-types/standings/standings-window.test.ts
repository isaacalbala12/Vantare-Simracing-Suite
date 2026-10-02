import { describe, expect, it } from "vitest";
import {
  selectDefaultStandingsWindow,
  STANDINGS_WINDOW_AROUND_OPTIONS,
} from "./standings-window";

function rows(count: number, playerPosition?: number): { position: number; isPlayer: boolean }[] {
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    isPlayer: index + 1 === playerPosition,
  }));
}

describe("selectDefaultStandingsWindow", () => {
  it("keeps the top three and two neighbours on each side of a central player", () => {
    expect(selectDefaultStandingsWindow(rows(12, 9), 4).map((row) => row.position)).toEqual([
      1, 2, 3, 7, 8, 9, 10, 11,
    ]);
  });

  it("shifts the window at the tail without duplicating the fixed podium", () => {
    expect(selectDefaultStandingsWindow(rows(12, 12), 4).map((row) => row.position)).toEqual([
      1, 2, 3, 8, 9, 10, 11, 12,
    ]);
  });

  it("fills forward when the player is just below the podium", () => {
    expect(selectDefaultStandingsWindow(rows(12, 4), 4).map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("keeps the podium when the player is already in it", () => {
    expect(selectDefaultStandingsWindow(rows(12, 2), 4).map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("does not invent a focus row when the player is absent", () => {
    expect(selectDefaultStandingsWindow(rows(5), 4).map((row) => row.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each(STANDINGS_WINDOW_AROUND_OPTIONS)("supports around=%i on small grids", (around) => {
    const selected = selectDefaultStandingsWindow(rows(2, 2), around);
    expect(selected.map((row) => row.position)).toEqual([1, 2]);
    expect(new Set(selected).size).toBe(selected.length);
  });
});
