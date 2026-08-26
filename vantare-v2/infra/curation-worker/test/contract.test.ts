import { describe, expect, it } from "vitest";
import { strictDecodeBundle } from "../src/contract";

function validBundle(): Record<string, unknown> {
  return {
    admin: { uploadId: "install-0123456789abcdef", deleteHash: "client-placeholder" },
    payload: {
      contractVersion: "curationbundle.v1",
      bundleId: "bundle-1",
      combinationId: "lmu:spa:lmp2",
      epoch: "2026-W33",
      stintAggregates: [
        { stintNumber: 1, laps: 10, avgFuelPerLap: 2.5, avgVEPerLap: 1.25 },
      ],
      pitAggregates: { count: 0, avgDurationSeconds: 0 },
      observedStrategies: [{ stintCount: 1, pitLaps: [], compounds: ["medium"] }],
      channelQuality: { validSessions: 1, invalidSessions: 0 },
    },
  };
}

describe("CurationBundle v1 strict mirror", () => {
  it("accepts the closed Go allowlist", () => {
    expect(strictDecodeBundle(JSON.stringify(validBundle())).payload.combinationId).toBe("lmu:spa:lmp2");
  });

  it("rejects unknown and duplicate fields", () => {
    const unknown = validBundle();
    (unknown.payload as Record<string, unknown>).unexpected = "canary";
    expect(() => strictDecodeBundle(JSON.stringify(unknown))).toThrowError(/unknown field/);

    const encoded = JSON.stringify(validBundle()).replace(
      '"bundleId":"bundle-1"',
      '"bundleId":"bundle-1","bundleId":"bundle-2"',
    );
    expect(() => strictDecodeBundle(encoded)).toThrowError(/duplicate field/);
  });

  it("rejects non-finite numeric JSON and anomalous strings", () => {
    const infinite = JSON.stringify(validBundle()).replace("2.5", "1e9999");
    expect(() => strictDecodeBundle(infinite)).toThrowError(/finite/);

    const control = JSON.stringify(validBundle()).replace("bundle-1", "bundle-\\u0000");
    expect(() => strictDecodeBundle(control)).toThrowError(/anomalous string/);
  });

  it("rejects excessive depth and cardinality before contract validation", () => {
    expect(() => strictDecodeBundle('{"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}')).toThrowError(/nesting/);
    const values = Array.from({ length: 8_193 }, () => 1).join(",");
    expect(() => strictDecodeBundle(`[${values}]`)).toThrowError(/cardinality/);
  });
});
