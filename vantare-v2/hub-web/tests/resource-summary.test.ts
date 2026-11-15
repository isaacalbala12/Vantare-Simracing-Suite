import { expect, it } from "vitest";
import { type Sample, summarize } from "../scripts/resources/summary";

const sample: Sample = {
  identity: "12:a",
  pid: 12,
  role: "renderer",
  privateBytes: 10 * 2 ** 20,
  workingSetBytes: 20 * 2 ** 20,
  cpuOneCorePercent: null,
};
it("keeps private and resident memory distinct and normalizes CPU explicitly", () => {
  const [row] = summarize(
    [sample, { ...sample, privateBytes: 14 * 2 ** 20, cpuOneCorePercent: 40 }],
    8,
  );
  expect(row.privateMiBMean).toBe(12);
  expect(row.workingSetMiBMean).toBe(20);
  expect(row.cpuOneCorePercentMean).toBe(40);
  expect(row.cpuMachinePercentMean).toBe(5);
});
it("does not merge reused PIDs or invent a zero CPU for a newly observed process", () => {
  const rows = summarize([sample, { ...sample, identity: "12:b" }], 8);
  expect(rows).toHaveLength(2);
  expect(rows[0].cpuMachinePercentMean).toBeNull();
  expect(() => summarize([], 0)).toThrow();
});
