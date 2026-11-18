import { describe, expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import {
  strategyFileModes,
  strategyFileNameMax,
  strategyPickCooldownMs,
  strategyPickLifetimeSeconds,
  strategyPickPathMax,
  strategyReasons,
} from "../src/contract/generated/strategy";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { isUiMessage } from "../src/contract/validation";
import { isRendererMessage } from "../src/main/security";
import { createMockHost } from "../src/mock/host";

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;

const revision = "a".repeat(64);
const pick = (mode: string) => ({
  method: "strategy.pickFile",
  mode,
  revision,
});

describe("the picker request", () => {
  it("is a mode and a revision, in the corpus and nothing looser", () => {
    expect([...strategyFileModes]).toEqual(["open", "saveAs"]);
    const sent = corpus.ui.map((message) => message.request);
    for (const mode of strategyFileModes) {
      const sample = sent.find(
        (request) =>
          request.method === "strategy.pickFile" && request.mode === mode,
      );
      expect(sample, mode).toBeDefined();
      expect(isRequest(sample as Record<string, unknown>), mode).toBe(true);
      expect(isRequest(pick(mode))).toBe(true);
    }
    for (const bad of [
      { ...pick("open"), path: "C:/x.json" },
      { ...pick("open"), file: "x.json" },
      { ...pick("open"), id: 1 },
      { ...pick("delete") },
      { ...pick("Open") },
      { ...pick("open"), mode: undefined },
      { ...pick("open"), revision: "z" },
      { method: "strategy.pickFile", mode: "open" },
      { method: "strategy.pickFile", revision },
    ])
      expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
  });

  it("is answered with a view, and the new errors are typed and closed", () => {
    for (const method of ["strategy.pickFile"]) {
      const sample = corpus.host.find(
        (message) => message.result?.method === method,
      )?.result;
      expect(sample, method).toBeDefined();
      expect(isReply(sample as Record<string, unknown>)).toBe(true);
    }
    for (const kind of [
      "strategyFileUnavailable",
      "strategyFileTooLarge",
      "strategyTargetExists",
      "strategyPickExpired",
    ]) {
      expect(isError({ kind }), kind).toBe(true);
      expect(isError({ kind, message: "C:/x" }), kind).toBe(false);
      expect(isError({ kind, path: "C:/x" }), kind).toBe(false);
      const sample = corpus.host.find(
        (message) => message.error?.kind === kind,
      );
      expect(sample, kind).toBeDefined();
    }
    expect(isError({ kind: "strategyFileMissing" })).toBe(false);
  });

  it("exports the limits of the ticket from Rust", () => {
    expect(strategyPickLifetimeSeconds).toBe(120);
    expect(strategyPickCooldownMs).toBe(1500);
    expect(strategyPickPathMax).toBe(32768);
    expect(strategyFileNameMax).toBe(256);
  });
});

describe("the trusted answer of the main process", () => {
  const picked = {
    kind: "pickedStrategyFile",
    id: 0x80000000,
    path: "D:/QA/a.json",
  };
  it("is a valid message but never one the renderer port admits", () => {
    expect(isUiMessage(picked)).toBe(true);
    expect(isUiMessage({ ...picked, path: null })).toBe(true);
    expect(isRendererMessage(picked)).toBe(false);
    expect(isRendererMessage({ ...picked, path: null })).toBe(false);
    // not as a request either, with or without a path
    for (const request of [
      { method: "pickedStrategyFile", path: picked.path },
      { method: "strategy.pickedFile", path: picked.path },
      { ...pick("open"), path: picked.path },
    ])
      expect(
        isRendererMessage({ kind: "request", id: 1, request }),
        JSON.stringify(request),
      ).toBe(false);
    // the request itself may come from the renderer, but never with an internal id
    expect(
      isRendererMessage({ kind: "request", id: 1, request: pick("open") }),
    ).toBe(true);
    expect(
      isRendererMessage({
        kind: "request",
        id: 0x80000000,
        request: pick("open"),
      }),
    ).toBe(false);
  });
  it("is exact and bounded", () => {
    for (const bad of [
      { ...picked, command: "x" },
      { ...picked, path: 1 },
      { ...picked, path: undefined },
      { ...picked, id: -1 },
      { ...picked, id: 1.5 },
      { ...picked, path: "x".repeat(strategyPickPathMax + 1) },
      { kind: "pickedStrategyFile", id: 1 },
    ])
      expect(isUiMessage(bad), JSON.stringify(bad).slice(0, 80)).toBe(false);
    expect(
      isUiMessage({ ...picked, path: "x".repeat(strategyPickPathMax) }),
    ).toBe(true);
  });
});

function sample(state: string): { value: Json } & Record<string, unknown> {
  const found = corpus.host.find(
    (message) =>
      message.result?.value &&
      "plan" in message.result.value &&
      message.result.value.plan.state === state,
  )?.result;
  if (!found) throw Error(`Missing ${state} sample`);
  return structuredClone(found) as never;
}

describe("the file of the view", () => {
  it("is the last segment of a name or null, never a path", () => {
    const reply = sample("calculated");
    expect(reply.value.file).toEqual({ name: expect.any(String) });
    expect(isReply(reply)).toBe(true);
    // the same table is in native/hub-host/src/strategy_file_tests.rs
    for (const file of [
      null,
      { name: "carreras-2026.json" },
      { name: "ñ.json" },
      { name: "x".repeat(256) },
      { name: "ñ".repeat(128) },
      { name: "a b (1).json" },
      { name: "a.b.c" },
    ]) {
      reply.value.file = file;
      expect(isReply(reply), JSON.stringify(file)?.slice(0, 40)).toBe(true);
    }
    for (const file of [
      undefined,
      {},
      { name: "" },
      { name: "a/b.json" },
      { name: "a\\b.json" },
      { name: "C:\\a.json" },
      { name: "a\u0000.json" },
      { name: "a\n.json" },
      { name: "." },
      { name: ".." },
      { name: "a:b.json" },
      { name: "a\u007fb.json" },
      { name: "a\u0085b.json" },
      { name: "a\u202eb.json" },
      { name: "a\u2067b.json" },
      { name: "a\u200fb.json" },
      { name: "x".repeat(strategyFileNameMax + 1) },
      { name: "ñ".repeat(strategyFileNameMax / 2 + 1) },
      { name: "a.json", path: "C:/a.json" },
      "a.json",
    ]) {
      reply.value.file = file;
      expect(isReply(reply), JSON.stringify(file)?.slice(0, 60)).toBe(false);
    }
    reply.value.file = { name: "x".repeat(strategyFileNameMax) };
    expect(isReply(reply)).toBe(true);
  });
});

describe("the reason of a partial or infeasible result", () => {
  const closed = [
    "searchBudgetExhausted",
    "fineGridNoFallback",
    "constraintsUnsatisfiable",
    "noFeasiblePlan",
  ];
  it("is a closed set", () => {
    expect([...strategyReasons]).toEqual(closed);
  });
  it("has a value exactly when the certificate is not proven", () => {
    const proven = sample("calculated");
    expect(proven.value.plan.result.certificate).toBe("proven");
    expect(proven.value.plan.result.reason).toBeNull();
    expect(isReply(proven)).toBe(true);
    const partial = sample("partial");
    expect(partial.value.plan.result.reason).not.toBeNull();
    expect(isReply(partial)).toBe(true);
    // a reason on a proven plan, or none on an unproven one
    proven.value.plan.result.reason = "noFeasiblePlan";
    expect(isReply(proven)).toBe(false);
    // each certificate allows only its own reasons
    const allowed: Record<string, string[]> = {
      none: ["searchBudgetExhausted", "fineGridNoFallback"],
      not_proven: ["searchBudgetExhausted", "fineGridNoFallback"],
      no_solution: ["constraintsUnsatisfiable", "noFeasiblePlan"],
    };
    for (const certificate of [null, "not_proven", "no_solution"]) {
      const result = sample("partial");
      result.value.plan.result.certificate = certificate;
      result.value.plan.result.reason = null;
      expect(isReply(result), String(certificate)).toBe(false);
      for (const reason of closed) {
        result.value.plan.result.reason = reason;
        expect(isReply(result), `${certificate} ${reason}`).toBe(
          allowed[certificate ?? "none"].includes(reason),
        );
      }
      for (const reason of [
        "",
        "budget",
        "initialLoadNotProven",
        "searchBudgetExhausted ",
        3,
        {},
      ]) {
        result.value.plan.result.reason = reason;
        expect(isReply(result), `${certificate} ${String(reason)}`).toBe(false);
      }
    }
    delete partial.value.plan.result.reason;
    expect(isReply(partial)).toBe(false);
  });
  it("travels with the result of an edited or recalculating plan too", () => {
    for (const state of ["edited", "calculating"]) {
      const found = corpus.host.find(
        (message) =>
          (message.result?.value as Json)?.plan?.state === state &&
          (message.result?.value as Json)?.plan?.result?.reason,
      );
      expect(found, state).toBeDefined();
      expect(isReply(found?.result as never), state).toBe(true);
    }
  });
  it("is in the corpus for every value", () => {
    const seen = new Set<string>();
    for (const message of corpus.host) {
      const reason = (message.result?.value as Json)?.plan?.result?.reason;
      if (reason) seen.add(reason);
    }
    expect([...seen].sort()).toEqual([...closed].sort());
  });
});

// ------------------------------------------------------------------- the mock

const INTERNAL = 0x80000000;
function session(scene: string) {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown, at = ++id) =>
    host({ kind: "request", id: at, request } as never) as Json;
  const trusted = (path: string | null, at = INTERNAL) =>
    host({ kind: "pickedStrategyFile", id: at, path } as never) as Json;
  const open = send({ method: "strategy.open" });
  return { host, send, trusted, view: open.result.value as Json };
}
const reasonScenes: [string, string, string][] = [
  ["searchBudgetExhausted", "partial", "partial"],
  ["fineGridNoFallback", "partial", "partial"],
  ["constraintsUnsatisfiable", "calculated", "no_solution"],
  ["noFeasiblePlan", "calculated", "no_solution"],
];

describe("the mock host", () => {
  it("opens another file in one step when it plays the main process", () => {
    const { send, view } = session("strategy-ready");
    expect(view.file).toEqual({ name: "strategy-v2.json" });
    const done = send({ ...pick("open"), revision: view.revision });
    expect(done.kind).toBe("response");
    expect(done.result.method).toBe("strategy.pickFile");
    const next = done.result.value;
    expect(isReply(done.result)).toBe(true);
    expect(next.file).toEqual({ name: "carreras-2026.json" });
    expect(next.dirty).toBe(false);
    expect(next.plan.state).toBe("uncalculated");
    expect(JSON.stringify(done)).not.toMatch(/[\\/]|C:/);
  });
  it("saves as another file in one step and keeps the same document", () => {
    const { send, view } = session("strategy-ready");
    const draft = send({
      method: "strategy.confirm",
      eventId: view.activeEventId,
      strategyId: view.activeStrategyId,
      revision: view.revision,
      fields: corpus.ui.find((m) => m.request.method === "strategy.confirm")
        ?.request.fields,
    }).result.value;
    expect(draft.dirty).toBe(true);
    const done = send({ ...pick("saveAs"), revision: draft.revision });
    const saved = done.result.value;
    expect(saved.dirty).toBe(false);
    expect(saved.revision).toBe(draft.revision);
    expect(saved.events).toEqual(draft.events);
    expect(saved.file).toEqual({ name: "copia-estrategia.json" });
  });
  it("refuses what the host refuses, with the same errors", () => {
    const { send, view } = session("strategy-ready");
    expect(send({ ...pick("open"), revision: "0".repeat(64) })).toMatchObject({
      kind: "failure",
      error: { kind: "strategyConflict" },
    });
    const confirm = corpus.ui.find(
      (m) => m.request.method === "strategy.confirm",
    )?.request as Json;
    const draft = send({
      ...confirm,
      eventId: view.activeEventId,
      strategyId: view.activeStrategyId,
      revision: view.revision,
    }).result.value;
    expect(send({ ...pick("open"), revision: draft.revision })).toMatchObject({
      kind: "failure",
      error: { kind: "strategyDirty" },
    });
    const saved = send({ method: "strategy.save", revision: draft.revision })
      .result.value;
    // a calculation in flight and an edit pending
    const compute = corpus.ui.find(
      (m) => m.request.method === "strategy.compute",
    )?.request as Json;
    const running = send({
      ...compute,
      eventId: saved.activeEventId,
      strategyId: saved.activeStrategyId,
      revision: saved.revision,
    }).result.value;
    expect(send({ ...pick("open"), revision: running.revision })).toMatchObject(
      { kind: "failure", error: { kind: "busy" } },
    );
    const done = send({ method: "strategy.view" }).result.value;
    // the calculation confirmed the form: save it, then the edit is the only thing pending
    const clean = send({ method: "strategy.save", revision: done.revision })
      .result.value;
    expect(clean.dirty).toBe(false);
    const edited = send({
      method: "strategy.moveStop",
      revision: clean.revision,
      computeId: clean.plan.computeId,
      index: 0,
      delta: -1,
    }).result.value;
    expect(edited.plan.state).toBe("edited");
    expect(send({ ...pick("open"), revision: edited.revision })).toMatchObject({
      kind: "failure",
      error: { kind: "strategyEditPending" },
    });
    expect(send({ ...pick("saveAs"), revision: edited.revision }).kind).toBe(
      "response",
    );
  });
  it("keeps the two phases of the main process behind an internal id", () => {
    const { send, trusted, view } = session("strategy-ready");
    // the acknowledgement is the current view and opens nothing yet
    const ack = send({ ...pick("open"), revision: view.revision }, INTERNAL);
    expect(ack).toEqual({
      kind: "response",
      id: INTERNAL,
      result: { method: "strategy.pickFile", value: view },
    });
    expect(
      send({ ...pick("open"), revision: view.revision }, INTERNAL + 1),
    ).toMatchObject({ kind: "failure", error: { kind: "busy" } });
    // a stranger's answer is denied and the ticket stays
    expect(trusted("D:/QA/other.json", INTERNAL + 5)).toMatchObject({
      kind: "failure",
      error: { kind: "denied" },
    });
    const done = trusted("D:\\Private\\QA\\viaje.json");
    expect(done.result.value.file).toEqual({ name: "viaje.json" });
    expect(JSON.stringify(done)).not.toContain("Private");
    // one use only; and none without a ticket
    expect(trusted("D:/QA/x.json")).toMatchObject({
      kind: "failure",
      error: { kind: "denied" },
    });
    // cancelling answers with the unchanged view
    send(
      { ...pick("saveAs"), revision: done.result.value.revision },
      INTERNAL + 2,
    );
    expect(trusted(null, INTERNAL + 2).result.value).toEqual(done.result.value);
  });
  it("never overwrites the primary file from another document", () => {
    const { send, trusted, view } = session("strategy-ready");
    send({ ...pick("open"), revision: view.revision }, INTERNAL);
    const other = trusted("D:/QA/otro.json").result.value;
    send({ ...pick("saveAs"), revision: other.revision }, INTERNAL + 1);
    expect(trusted("D:/QA/strategy-v2.json", INTERNAL + 1)).toMatchObject({
      kind: "failure",
      error: { kind: "strategyTargetExists" },
    });
    // the same file as the current one is a normal save, not an error
    send({ ...pick("saveAs"), revision: other.revision }, INTERNAL + 2);
    expect(trusted("D:/QA/otro.json", INTERNAL + 2).kind).toBe("response");
    // and the primary file is fine while the primary file is the document
    const fresh = session("strategy-ready");
    fresh.send({ ...pick("saveAs"), revision: fresh.view.revision }, INTERNAL);
    expect(fresh.trusted("D:/QA/strategy-v2.json").kind).toBe("response");
  });
  it("has a scene for every new error", () => {
    for (const [scene, mode, kind] of [
      ["fileUnavailable", "open", "strategyFileUnavailable"],
      ["fileTooLarge", "open", "strategyFileTooLarge"],
      ["targetExists", "saveAs", "strategyTargetExists"],
      ["pickExpired", "open", "strategyPickExpired"],
    ]) {
      const { send, view } = session(`strategy-${scene}`);
      const failure = send({ ...pick(mode), revision: view.revision });
      expect(failure, scene).toMatchObject({
        kind: "failure",
        error: { kind },
      });
      expect(isError(failure.error), scene).toBe(true);
      // the document did not move
      expect(send({ method: "strategy.view" }).result.value.file).toEqual(
        view.file,
      );
    }
  });
  it("has a scene for opening a recovered file and a protected one", () => {
    for (const [scene, state] of [
      ["pickRecovered", "recovered"],
      ["pickProtected", "protected"],
    ]) {
      const { send, view } = session(`strategy-${scene}`);
      expect(view.state).toBe("ready");
      const done = send({ ...pick("open"), revision: view.revision });
      expect(isReply(done.result), scene).toBe(true);
      expect(done.result.value.state, scene).toBe(state);
      expect(done.result.value.file, scene).toEqual({
        name: "carreras-2026.json",
      });
      // neither has anything to save as: a protected document is not written
      // and a recovered one is empty until something is created
      expect(
        send({ ...pick("saveAs"), revision: done.result.value.revision }),
        scene,
      ).toMatchObject({
        kind: "failure",
        error: { kind: state === "protected" ? "protected" : "rejected" },
      });
    }
  });
  it("has a scene for every reason", () => {
    const compute = corpus.ui.find(
      (m) => m.request.method === "strategy.compute",
    )?.request as Json;
    for (const [reason, state, certificate] of reasonScenes) {
      const scene = `strategy-reason${reason[0].toUpperCase()}${reason.slice(1)}`;
      const { send, view } = session(scene);
      send({
        ...compute,
        eventId: view.activeEventId,
        strategyId: view.activeStrategyId,
        revision: view.revision,
      });
      const done = send({ method: "strategy.view" });
      expect(isReply(done.result), reason).toBe(true);
      const plan = done.result.value.plan;
      expect(plan.state, reason).toBe(state);
      expect(plan.result.reason, reason).toBe(reason);
      expect(plan.result.certificate ?? "none", reason).toMatch(
        certificate === "partial"
          ? /^(none|not_proven)$/
          : new RegExp(`^${certificate}$`),
      );
    }
  });
});
