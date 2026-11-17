import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import offline from "../fixtures/core-offline.json";
import { decimal } from "../src/contract/analysis-validation";
import { analysisMethods } from "../src/contract/generated/analysis";
import corpus from "../src/contract/generated/corpus/analysis.json";
import { isError, isReply, isRequest } from "../src/contract/modules/analysis";
import { isHostMessage } from "../src/contract/validation";
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
          {
            id: "a".repeat(64),
            startedAtMs: 0,
            sizeBytes: 2 ** 53,
            recording: false,
          },
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
  it("requires a boolean recording flag independently of numeric validation", () => {
    const row = {
      id: "a".repeat(64),
      startedAtMs: 0,
      sizeBytes: 1,
      recording: false,
    };
    for (const recording of [false, true])
      expect(
        isReply({
          method: "analysis.catalog",
          max: 256,
          recordings: [{ ...row, recording }],
        }),
      ).toBe(true);
    for (const recording of [undefined, null, "true", 1])
      expect(
        isReply({
          method: "analysis.catalog",
          max: 256,
          recordings: [{ ...row, recording }],
        }),
      ).toBe(false);
  });
  it("mock exercises sessions, states and revoked access with valid wire messages", () => {
    const core = structuredClone(offline);
    Object.assign(core.access, {
      verified: true,
      blocked: false,
      analysis: true,
    });
    core.rights = "connected";
    const handler = create({ core } as MockContext);
    const send = (
      request: import("../src/contract/generated/contract").Request,
    ) => {
      const message = handler({ kind: "request", id: 1, request });
      expect(isHostMessage(message)).toBe(true);
      return message;
    };
    const catalog = send({ method: "analysis.catalog" });
    if (
      catalog?.kind !== "response" ||
      catalog.result.method !== "analysis.catalog"
    )
      throw new Error("catalog");
    expect(catalog.result.recordings).toHaveLength(3);
    expect(
      catalog.result.recordings.filter((row) => row.recording),
    ).toHaveLength(1);
    const [complete, recording, locked] = catalog.result.recordings;
    if (!complete || !recording || !locked) throw new Error("rows");
    for (const row of catalog.result.recordings)
      send({ method: "analysis.inspect", id: row.id });
    expect(
      send({ method: "analysis.inspect", id: recording.id }),
    ).toMatchObject({ kind: "failure", error: { kind: "analysisLocked" } });
    expect(send({ method: "analysis.inspect", id: locked.id })).toMatchObject({
      kind: "response",
      result: { state: "locked" },
    });
    const opened = send({ method: "analysis.open", id: complete.id });
    if (opened?.kind !== "response" || opened.result.method !== "analysis.open")
      throw new Error("open");
    expect(opened.result.laps.length).toBeGreaterThan(0);
    const session = opened.result.session;
    expect(send({ method: "analysis.cancel" })).toMatchObject({
      kind: "response",
      result: { cancelled: false },
    });
    expect(send({ method: "analysis.close", session })).toMatchObject({
      kind: "response",
    });
    expect(send({ method: "analysis.close", session })).toMatchObject({
      kind: "failure",
      error: { kind: "analysisNotFound" },
    });
    const reopened = send({ method: "analysis.open", id: complete.id });
    core.access.analysis = false;
    expect(send({ method: "analysis.cancel" })).toMatchObject({
      kind: "failure",
      error: { kind: "denied" },
    });
    core.access.analysis = true;
    if (
      reopened?.kind !== "response" ||
      reopened.result.method !== "analysis.open"
    )
      throw new Error("open");
    expect(
      send({ method: "analysis.close", session: reopened.result.session }),
    ).toMatchObject({ kind: "failure", error: { kind: "analysisNotFound" } });
  });
});
