import { describe, expect, it } from "vitest";
import { clampPedalPercent, formatPedalHeightPercent } from "./pedals-format";

describe("clampPedalPercent", () => {
  const cases: Array<[unknown, number]> = [
    [0, 0],
    [50.4, 50],
    [50.6, 51],
    [100, 100],
    [150, 100],
    [Infinity, 0],
    [-Infinity, 0],
    [NaN, 0],
    [-20, 0],
    [undefined, 0],
    [null, 0],
    ["78", 0],
    [{}, 0],
  ];
  for (const [input, expected] of cases) {
    it(`clamps ${JSON.stringify(input)} to ${expected}`, () => {
      expect(clampPedalPercent(input)).toBe(expected);
    });
  }
});

describe("formatPedalHeightPercent", () => {
  it("formats a normal value", () => {
    expect(formatPedalHeightPercent(78)).toBe("78%");
  });
  it("clamps negative to 0%", () => {
    expect(formatPedalHeightPercent(-5)).toBe("0%");
  });
  it("clamps over 100 to 100%", () => {
    expect(formatPedalHeightPercent(200)).toBe("100%");
  });
  it("handles undefined as 0%", () => {
    expect(formatPedalHeightPercent(undefined)).toBe("0%");
  });
  it("handles NaN as 0%", () => {
    expect(formatPedalHeightPercent(NaN)).toBe("0%");
  });
});
