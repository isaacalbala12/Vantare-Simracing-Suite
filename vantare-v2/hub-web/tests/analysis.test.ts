import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import offline from "../fixtures/core-offline.json";
import { decimal } from "../src/contract/analysis-validation";
import {
  analysisErrors,
  analysisMethods,
} from "../src/contract/generated/analysis";
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
    const validator = readFileSync(
      new URL("../src/contract/modules/analysis.ts", import.meta.url),
      "utf8",
    );
    expect(
      new Set(
        corpus.host
          .filter((v) => v.kind === "failure")
          .map((v) => v.error?.kind),
      ),
    ).toEqual(new Set(analysisErrors.map((v) => v.kind)));
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
      "1\n",
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
    expect(opened.result.sessions.map((row) => row.sealed)).toEqual([
      false,
      true,
    ]);
    expect(opened.result.laps[0]).toMatchObject({
      session: 1,
      lapTimeMs: 112425,
      sectorsMs: [35000, 40000, 37425],
    });
    const session = opened.result.session;
    expect(send({ method: "analysis.cancel" })).toMatchObject({
      kind: "response",
      result: { cancelled: false },
    });
    const compared = send({ method: "analysis.compare", session, a: 0, b: 1 });
    expect(compared).toMatchObject({
      kind: "response",
      result: { method: "analysis.compare", distanceRange: [0, 5000] },
    });
    expect(compared && isHostMessage(compared)).toBe(true);
    expect(send({ method: "analysis.compare", session, a: 0, b: 1 })).toEqual(
      compared,
    );
    expect(
      send({ method: "analysis.compare", session, a: 99, b: 0 }),
    ).toMatchObject({ kind: "failure", error: { kind: "analysisNotFound" } });
    const withGap = send({ method: "analysis.compare", session, a: 0, b: 2 });
    expect(withGap).toMatchObject({
      kind: "response",
      result: {
        method: "analysis.compare",
        delta: null,
        deltaUnavailable: "gapInB",
      },
    });
    expect(withGap && isHostMessage(withGap)).toBe(true);
    expect(
      send({ method: "analysis.compare", session, a: 0, b: 3 }),
    ).toMatchObject({
      kind: "failure",
      error: { kind: "analysisIncomparable" },
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

it("strictly validates projection points, ranges, bounds and unavailable reasons", () => {
  const base = {
    method: "analysis.compare",
    distanceRange: [0, 100],
    speed: { a: [], b: [] },
    throttle: { a: [], b: [] },
    brake: { a: [], b: [] },
    delta: [],
    gaps: { a: [], b: [] },
  };
  const point = { distance: 0, elapsed: 0, value: 180, segment: 0 };
  expect(isReply(base)).toBe(true);
  for (const bad of [
    { ...base, delta: null },
    { ...base, deltaUnavailable: "gapInA" },
    { ...base, delta: null, deltaUnavailable: "unknown" },
    { ...base, distanceRange: [100, 0] },
    { ...base, delta: [{ ...point, segment: 0.1 }] },
    { ...base, delta: [{ ...point, elapsed: Infinity }] },
    { ...base, speed: { a: Array(1025).fill(point), b: [] } },
    { ...base, gaps: { a: [{ from: 20, to: 10 }], b: [] } },
    { ...base, delta: [{ ...point, secret: 1 }] },
    { ...base, delta: [{ ...point, distance: 101 }] },
  ])
    expect(isReply(bad)).toBe(false);
  expect(isReply({ ...base, delta: null, deltaUnavailable: "gapInB" })).toBe(
    true,
  );
});

it("rejects compare request paths and non-index numbers", () => {
  const base = {
    method: "analysis.compare",
    session: "a".repeat(64),
    a: 0,
    b: 0,
  };
  expect(isRequest(base)).toBe(true);
  for (const bad of [
    { ...base, a: -1 },
    { ...base, b: 0.5 },
    { ...base, a: 2 ** 32 },
    { ...base, session: "C:/recording.duckdb" },
    { ...base, raw: [] },
  ])
    expect(isRequest(bad)).toBe(false);
});

it("strictly validates recording status and prune names", () => {
  const sample = corpus.host.find(
    (v) =>
      v.kind === "response" &&
      v.result?.method === "analysis.status" &&
      v.result.status !== null,
  );
  expect(sample).toBeDefined();
  const reply = JSON.parse(JSON.stringify(sample)).result;
  expect(isReply(reply)).toBe(true);
  expect(isReply({ method: "analysis.status", status: null })).toBe(true);
  for (const name of [
    "",
    "..",
    "C:x",
    "a/b.duckdb",
    "a\\b.duckdb",
    "other.duckdb",
    "series-1-2.duckdb\n",
  ]) {
    const bad = structuredClone(reply);
    bad.status.lastPrune.items[0].name = name;
    expect(isReply(bad)).toBe(false);
  }
  for (const [key, value] of [
    ["startedAtMs", -1],
    ["startedAtMs", 2 ** 53],
    ["state", "other"],
    ["attempted", 1],
    ["cause", "other"],
    ["file", "secret"],
  ]) {
    expect(
      isReply({
        ...reply,
        status: { ...reply.status, [key as string]: value },
      }),
    ).toBe(false);
  }
  const items = Array.from(
    { length: 51 },
    () => reply.status.lastPrune.items[0],
  );
  expect(
    isReply({
      ...reply,
      status: {
        ...reply.status,
        lastPrune: { ...reply.status.lastPrune, items },
      },
    }),
  ).toBe(false);
});

it("mock status preserves catalog ids and supports missing status", () => {
  for (const sceneName of ["analysis", "analysis-status-null"]) {
    const core = structuredClone(offline);
    core.rights = "connected";
    core.access.verified = true;
    core.access.analysis = true;
    const mock = create({ core, sceneName } as MockContext);
    mock({ kind: "request", id: 1, request: { method: "analysis.catalog" } });
    const message = {
      kind: "request" as const,
      id: 2,
      request: { method: "analysis.status" as const },
    };
    const response = mock(message);
    expect(response && isHostMessage(response)).toBe(true);
    expect(response).toMatchObject({
      kind: "response",
      result: {
        method: "analysis.status",
        status:
          sceneName === "analysis-status-null"
            ? null
            : {
                state: "recording",
                rowId: "b".repeat(64),
                lastPrune: { items: expect.any(Array) },
              },
      },
    });
    expect(mock(message)).toEqual(response);
    core.access.analysis = false;
    expect(mock(message)).toMatchObject({
      kind: "failure",
      error: { kind: "denied" },
    });
  }
});

it("rejects incomplete session metadata, invalid indices and oversized sectors", () => {
  const message = corpus.host.find(
    (v) =>
      v.kind === "response" &&
      v.result?.method === "analysis.open" &&
      "sessions" in v.result &&
      Array.isArray(v.result.sessions) &&
      v.result.sessions.length > 0,
  );
  expect(message).toBeDefined();
  const reply = JSON.parse(JSON.stringify(message)).result;
  expect(isReply(reply)).toBe(true);
  const session = reply.sessions[0];
  const lap = reply.laps[0];
  for (const bad of [
    { ...reply, sessions: undefined },
    { ...reply, sessions: Array(257).fill(session) },
    { ...reply, sessions: [{ ...session, epoch: "42" }] },
    { ...reply, sessions: [{ ...session, kind: "warmup" }] },
    { ...reply, sessions: [{ ...session, endReason: "unexpected" }] },
    { ...reply, sessions: [{ ...session, trackName: "é".repeat(129) }] },
    { ...reply, sessions: [{ ...session, startedAtMs: 2 ** 53 }] },
    { ...reply, laps: [{ ...lap, session: reply.sessions.length }] },
    { ...reply, laps: [{ ...lap, sectorsMs: Array(17).fill(1) }] },
    { ...reply, laps: [{ ...lap, sectorsMs: [1.5] }] },
    { ...reply, laps: [{ ...lap, lapTimeMs: undefined }] },
  ])
    expect(isReply(bad)).toBe(false);
});

it("serves legacy recordings with the approximate time and nullable metadata", () => {
  const core = structuredClone(offline);
  Object.assign(core.access, {
    verified: true,
    blocked: false,
    analysis: true,
  });
  core.rights = "connected";
  const mock = create({ core, sceneName: "analysis-v1" } as MockContext);
  mock({ kind: "request", id: 1, request: { method: "analysis.catalog" } });
  const id = "a".repeat(64);
  const inspected = mock({
    kind: "request",
    id: 2,
    request: { method: "analysis.inspect", id },
  });
  const opened = mock({
    kind: "request",
    id: 3,
    request: { method: "analysis.open", id },
  });
  expect(isHostMessage(inspected)).toBe(true);
  expect(isHostMessage(opened)).toBe(true);
  expect(inspected).toMatchObject({ result: { sessions: [] } });
  expect(opened).toMatchObject({
    result: {
      sessions: [],
      laps: expect.arrayContaining([
        expect.objectContaining({
          lapTimeApproxMs: 112400,
          lapTimeMs: null,
          session: null,
          sectorsMs: null,
        }),
      ]),
    },
  });
});
