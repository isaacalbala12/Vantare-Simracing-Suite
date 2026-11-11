import assert from "node:assert/strict";

export function fiveSampleStats(values: number[]) {
  assert.equal(values.length, 5, "Five valid repetitions required");
  assert.ok(values.every(Number.isFinite), "Non-finite measurement");
  const ordered = [...values].sort((a, b) => a - b);
  const median = ordered[2];
  return {
    n: 5,
    median,
    min: ordered[0],
    max: ordered[4],
    mad: values
      .map((value) => Math.abs(value - median))
      .sort((a, b) => a - b)[2],
  };
}
