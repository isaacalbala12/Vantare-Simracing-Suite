import { describe, expect, it } from "vitest";
import { readFiniteNumber, readNonNegativeNumber, readNormalizedInput } from "./input-readers";

describe("input readers", () => {
  it("keeps finite numbers and clamps non-negative values", () => {
    expect(readFiniteNumber(12.5)).toBe(12.5);
    expect(readFiniteNumber(Number.NaN)).toBeUndefined();
    expect(readNonNegativeNumber(-4)).toBe(0);
    expect(readNonNegativeNumber("4")).toBeUndefined();
  });

  it("normalizes percentage and fractional controls without inventing values", () => {
    expect(readNormalizedInput(78)).toBeCloseTo(0.78, 3);
    expect(readNormalizedInput(0.25)).toBe(0.25);
    expect(readNormalizedInput(140)).toBe(1);
    expect(readNormalizedInput(undefined)).toBeUndefined();
  });
});
