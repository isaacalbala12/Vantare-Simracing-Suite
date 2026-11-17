import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import offline from "../fixtures/core-offline.json";
import { decimal } from "../src/contract/analysis-validation";
import { analysisMethods } from "../src/contract/generated/analysis";
import corpus from "../src/contract/generated/corpus/analysis.json";
import { isError, isReply, isRequest } from "../src/contract/modules/analysis";
import type { MockContext } from "../src/mock/context";
import { create } from "../src/mock/modules/analysis";

describe("analysis contract", () => {
  it("covers exactly the generated method and error lists", () => {
    const requests = corpus.ui.filter((v) => v.kind === "request");
    expect(new Set(requests.map((v) => v.request.method))).toEqual(
      new Set(analysisMethods),
    );
    for (const v of requests) expect(isRequest(v.request)).toBe(true);
    for (const v of corpus.host) {
      if (v.kind === "response" && v.result)
        expect(isReply(v.result)).toBe(true);
      if (v.kind === "failure" && v.error) expect(isError(v.error)).toBe(true);
    }
    const generated = readFileSync(
      new URL("../src/contract/generated/analysis.ts", import.meta.url),
      "utf8",
    );
    const validator = readFileSync(
      new URL("../src/contract/modules/analysis.ts", import.meta.url),
      "utf8",
    );
    const kinds = (text: string) =>
      new Set(text.match(/"analysis[A-Z][a-zA-Z]+"/g));
    expect(kinds(validator)).toEqual(kinds(generated));
    const methods = new Set(validator.match(/"analysis\.[a-z]+"/g));
    expect(methods).toEqual(
      new Set(analysisMethods.map((method) => JSON.stringify(method))),
    );
  });
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
