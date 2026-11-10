import { expect, it } from "vitest";
import { summarize } from "../scripts/measure.ts";

it("reports the median and full range without dropping slow outliers", () => {
  expect(summarize([1000, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toEqual({
    n: 10,
    median: 5.5,
    min: 1,
    max: 1000,
  });
  expect(summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).median).toBe(6);
});
it("refuses insufficient or non-finite measurements", () => {
  expect(() => summarize([1, 2, 3])).toThrow();
  expect(() => summarize([...Array(9).fill(1), Number.NaN])).toThrow();
});
