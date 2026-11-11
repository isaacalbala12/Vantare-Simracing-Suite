import { describe, expect, it } from "vitest";
import { fiveSampleStats } from "../scripts/measure-summary";

describe("five paired measurement repetitions", () => {
  it("keeps an outlier visible while reporting the median and MAD", () => {
    expect(fiveSampleStats([1000, 12, 10, 11, 13])).toEqual({
      n: 5,
      median: 12,
      min: 10,
      max: 1000,
      mad: 1,
    });
  });
  it("rejects an incomplete or invalid dataset", () => {
    expect(() => fiveSampleStats([1, 2, 3, 4])).toThrow();
    expect(() => fiveSampleStats([1, 2, 3, 4, NaN])).toThrow();
  });
});
