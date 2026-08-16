import { describe, expect, it } from "vitest";
import type { RelativeRowViewModel } from "../../../widget-types/relative/relative-view-model";
import {
  classShortLabel,
  findLappingThreat,
  isFasterClass,
  isImminent,
  proximity,
  signedGap,
} from "./relative-redline-shared";

function row(partial: Partial<RelativeRowViewModel> & { id: string }): RelativeRowViewModel {
  return {
    position: 1,
    vehicleClass: "GT3",
    driverNumber: "0",
    driverName: "Driver",
    gapText: "—",
    bestLapText: "-",
    lastLapText: "-",
    isPlayer: false,
    side: "behind",
    tone: "neutral",
    gapSeconds: null,
    ...partial,
  };
}

describe("relative-redline-shared", () => {
  it("shortens only the class labels that would overflow the chip", () => {
    expect(classShortLabel("HYPERCAR")).toBe("HY");
    expect(classShortLabel("LMGT3")).toBe("GT3");
    expect(classShortLabel("lmp2")).toBe("LMP2");
    expect(classShortLabel("GT3")).toBe("GT3");
  });

  it("ranks categories so only quicker classes count as lapping traffic", () => {
    expect(isFasterClass("HYPERCAR", "GT3")).toBe(true);
    expect(isFasterClass("LMP2", "GT3")).toBe(true);
    expect(isFasterClass("GT3", "GT3")).toBe(false);
    expect(isFasterClass("GT3", "HYPERCAR")).toBe(false);
    expect(isFasterClass("", "GT3")).toBe(false);
    expect(isFasterClass("UNKNOWN", "GT3")).toBe(false);
  });

  it("maps gaps onto one shared proximity scale regardless of side", () => {
    expect(proximity(0)).toBe(1);
    expect(proximity(5)).toBe(0);
    expect(proximity(10)).toBe(0);
    expect(proximity(-2.5)).toBeCloseTo(0.5);
    expect(proximity(2.5)).toBeCloseTo(0.5);
    expect(proximity(null)).toBe(0);
  });

  it("flags only rivals within a second as imminent, never the player", () => {
    expect(isImminent(row({ id: "a", gapSeconds: 0.4 }))).toBe(true);
    expect(isImminent(row({ id: "b", gapSeconds: -0.9 }))).toBe(true);
    expect(isImminent(row({ id: "c", gapSeconds: 2.6 }))).toBe(false);
    expect(isImminent(row({ id: "d", gapSeconds: 0.1, isPlayer: true }))).toBe(false);
    expect(isImminent(row({ id: "e", gapSeconds: null }))).toBe(false);
  });

  it("signs gaps with a true minus and one decimal, falling back to the raw text", () => {
    expect(signedGap(row({ id: "a", gapSeconds: 1.84 }))).toBe("+1.8");
    expect(signedGap(row({ id: "b", gapSeconds: -0.32 }))).toBe("−0.3");
    expect(signedGap(row({ id: "c", gapSeconds: null, gapText: "—" }))).toBe("—");
  });

  it("finds the nearest quicker car closing from behind and ignores everything else", () => {
    const rows = [
      row({ id: "ahead-hy", vehicleClass: "HYPERCAR", gapSeconds: 4.2 }),
      row({ id: "behind-gt3", vehicleClass: "GT3", gapSeconds: -0.3 }),
      row({ id: "behind-hy-far", vehicleClass: "HYPERCAR", gapSeconds: -8 }),
      row({ id: "behind-lmp2", vehicleClass: "LMP2", gapSeconds: -2.6 }),
      row({ id: "player", isPlayer: true, gapSeconds: 0 }),
    ];
    expect(findLappingThreat(rows, "GT3")?.id).toBe("behind-lmp2");
    expect(findLappingThreat(rows, "HYPERCAR")).toBeNull();
  });
});
