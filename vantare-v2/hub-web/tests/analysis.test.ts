import { describe, expect, it } from "vitest";
import offline from "../fixtures/core-offline.json";
import { decimal } from "../src/contract/analysis-validation";
import { isReply, isRequest } from "../src/contract/modules/analysis";
import type { MockContext } from "../src/mock/context";
import { create } from "../src/mock/modules/analysis";

describe("analysis contract", () => {
  it("keeps the full unsigned 64-bit range exact and rejects noncanonical counters", () => {
    for (const value of ["0", "9007199254740993", "18446744073709551615"])
      expect(decimal(value)).toBe(true);
    for (const value of [
      0,
      9007199254740992,
      "18446744073709551616",
      "-1",
      "01",
      "1e3",
      "",
    ])
      expect(decimal(value)).toBe(false);
  });
  it("rejects paths, unsafe numbers and numeric u64", () => {
    expect(isRequest({ method: "analysis.open", id: "C:/secret.duckdb" })).toBe(
      false,
    );
    expect(
      isReply({
        method: "analysis.catalog",
        max: 256,
        recordings: [
          { id: "a".repeat(64), startedAtMs: 0, sizeBytes: 2 ** 53 },
        ],
      }),
    ).toBe(false);
    expect(
      isReply({
        method: "analysis.open",
        session: "a".repeat(64),
        watermark: 1,
        attempted: "1",
        total: "1",
        finished: true,
        laps: [],
      }),
    ).toBe(false);
  });
  it("mock checks every method and observes revoked access", () => {
    const core = structuredClone(offline);
    const handler = create({ core } as MockContext);
    for (const allowed of [false, true, false]) {
      Object.assign(core.access, {
        verified: true,
        blocked: false,
        analysis: allowed,
      });
      for (const request of [
        { method: "analysis.catalog" },
        { method: "analysis.inspect", id: "a".repeat(64) },
        { method: "analysis.open", id: "a".repeat(64) },
        { method: "analysis.close", session: "a".repeat(64) },
        { method: "analysis.cancel" },
      ] as const) {
        const result = handler({ kind: "request", id: 1, request });
        if (!allowed)
          expect(result).toEqual({
            kind: "failure",
            id: 1,
            error: { kind: "denied" },
          });
        else if (request.method === "analysis.catalog")
          expect(result).toEqual({
            kind: "response",
            id: 1,
            result: { method: "analysis.catalog", recordings: [], max: 256 },
          });
        else
          expect(result).toEqual({
            kind: "failure",
            id: 1,
            error: { kind: "unsupported" },
          });
      }
    }
  });
});
