import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requestOf, requests } from "./strategy-corpus";

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;

const revision = "a".repeat(64);
const accept = { method: "strategy.accept", revision, computeId: 7 };
const unaccept = { method: "strategy.unaccept", revision };
const showAccepted = { method: "strategy.showAccepted", revision };

it("accepts the three requests of the corpus and nothing looser", () => {
  for (const method of [
    "strategy.accept",
    "strategy.unaccept",
    "strategy.showAccepted",
  ]) {
    const sample = requests.find((request) => request.method === method);
    expect(sample, method).toBeDefined();
    expect(isRequest(sample as Record<string, unknown>), method).toBe(true);
  }
  for (const request of [accept, unaccept, showAccepted])
    expect(isRequest(request)).toBe(true);
  // no path, plan or date travels with a request: the host decides all of it
  for (const bad of [
    { ...accept, computeId: 0 },
    { ...accept, computeId: -1 },
    { ...accept, computeId: 1.5 },
    { ...accept, computeId: undefined },
    { ...accept, revision: "z" },
    { ...accept, path: "C:\\a" },
    { ...accept, plan: {} },
    { ...accept, acceptedAt: "2026-11-19T18:42:00Z" },
    { ...unaccept, computeId: 7 },
    { ...unaccept, path: "x" },
    { ...showAccepted, computeId: 7 },
    { ...showAccepted, revision: "0" },
  ])
    expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
});

it("accepts the two new typed errors and no free text", () => {
  for (const kind of ["strategyNotAcceptable", "strategyNoAcceptedPlan"]) {
    expect(isError({ kind }), kind).toBe(true);
    expect(isError({ kind, message: "x" }), kind).toBe(false);
  }
});

type Reply = Record<string, unknown> & { value: Json };
const replies = corpus.host
  .map((message) => message.result)
  .filter((result): result is NonNullable<typeof result> => !!result);
function withState(state: string, saved?: boolean): Reply {
  const found = replies.find(
    (result) =>
      (result.value as Json).plan?.accepted?.state === state &&
      (saved === undefined ||
        (result.value as Json).plan.accepted.saved === saved),
  );
  if (!found) throw Error(`Missing ${state} sample`);
  return structuredClone(found) as unknown as Reply;
}

it("validates every state of the accepted plan, with and without a comparison", () => {
  for (const state of ["accepted", "stale", "staleUnreachable"])
    expect(isReply(withState(state)), state).toBe(true);
  const causes = replies
    .map((result) => (result.value as Json).plan?.accepted?.unreachable?.cause)
    .filter(Boolean);
  expect(new Set(causes)).toEqual(
    new Set([
      "resourceExhausted",
      "reserveNotMet",
      "scheduleMismatch",
      "other",
    ]),
  );
  const compares = replies
    .map((result) => (result.value as Json).plan?.accepted?.compare)
    .filter(Boolean);
  // the proposal slower (positive), faster (negative) and the same plan
  expect(compares.some((compare) => compare.deltaSeconds > 0)).toBe(true);
  expect(compares.some((compare) => compare.deltaSeconds < 0)).toBe(true);
  expect(compares.some((compare) => compare.same)).toBe(true);
  expect(withState("accepted", true)).toBeDefined();
  expect(withState("accepted", false)).toBeDefined();
});

it("rejects an inconsistent accepted plan", () => {
  const broken = (state: string, change: (view: Json) => void) => {
    const reply = withState(state);
    change(reply.value);
    return isReply(reply);
  };
  const accepted = (view: Json) => view.plan.accepted;
  for (const state of ["accepted", "stale", "staleUnreachable"])
    expect(
      broken(state, () => {}),
      state,
    ).toBe(true);
  // it needs a plan with metrics and a timeline, proven or not, and nothing else
  expect(broken("accepted", (v) => (accepted(v).result.timeline = null))).toBe(
    false,
  );
  expect(broken("accepted", (v) => (accepted(v).result.metrics = null))).toBe(
    false,
  );
  expect(
    broken("accepted", (v) => (accepted(v).result.certificate = null)),
  ).toBe(false);
  expect(
    broken("accepted", (v) => (accepted(v).result.certificate = "no_solution")),
  ).toBe(false);
  expect(
    broken("accepted", (v) => (accepted(v).result.timeline.pits[0].lap += 1)),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.stints[0].fromLap = 2),
    ),
  ).toBe(false);
  expect(
    broken("accepted", (v) => accepted(v).result.timeline.pits.pop()),
  ).toBe(false);
  // a state says what the changes and the cause say
  expect(
    broken("accepted", (v) =>
      accepted(v).changes.push({ field: "raceLaps", before: "3", after: "4" }),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).unreachable = { cause: "other", failLap: null }),
    ),
  ).toBe(false);
  expect(broken("stale", (v) => (accepted(v).changes = []))).toBe(false);
  expect(
    broken(
      "stale",
      (v) => (accepted(v).unreachable = { cause: "other", failLap: null }),
    ),
  ).toBe(false);
  expect(
    broken("staleUnreachable", (v) => (accepted(v).unreachable = null)),
  ).toBe(false);
  expect(
    broken("staleUnreachable", (v) => (accepted(v).unreachable.cause = "path")),
  ).toBe(false);
  expect(
    broken("staleUnreachable", (v) => (accepted(v).unreachable.failLap = -1)),
  ).toBe(false);
  expect(
    broken("staleUnreachable", (v) => (accepted(v).unreachable.failLap = 12)),
  ).toBe(true);
  expect(
    broken("staleUnreachable", (v) => (accepted(v).unreachable.path = "x")),
  ).toBe(false);
  // the changes: closed fields, never a label, no repeats, bounded texts
  expect(broken("stale", (v) => (accepted(v).changes[0].field = "name"))).toBe(
    false,
  );
  expect(
    broken("stale", (v) => (accepted(v).changes[0].field = "variantNote")),
  ).toBe(false);
  expect(
    broken("stale", (v) => (accepted(v).changes[0].field = "unknown")),
  ).toBe(false);
  expect(
    broken("stale", (v) =>
      accepted(v).changes.push(structuredClone(accepted(v).changes[0])),
    ),
  ).toBe(false);
  expect(
    broken("stale", (v) => (accepted(v).changes[0].before = "x".repeat(65))),
  ).toBe(false);
  expect(
    broken("stale", (v) => (accepted(v).changes[0].before = "x".repeat(64))),
  ).toBe(true);
  expect(broken("stale", (v) => (accepted(v).changes[0].after = null))).toBe(
    true,
  );
  expect(broken("stale", (v) => (accepted(v).changes[0].after = 1))).toBe(
    false,
  );
  expect(broken("stale", (v) => (accepted(v).changes[0].after = "a\nb"))).toBe(
    false,
  );
  expect(broken("stale", (v) => (accepted(v).changes[0].path = "x"))).toBe(
    false,
  );
  // the rest of the accepted plan
  expect(broken("accepted", (v) => (accepted(v).saved = "yes"))).toBe(false);
  expect(broken("accepted", (v) => (accepted(v).acceptedAt = "ayer"))).toBe(
    false,
  );
  expect(
    broken("accepted", (v) => (accepted(v).acceptedAt = "2026-11-19")),
  ).toBe(false);
  // the exact spelling the host also requires of a stored plan: if the two ever
  // differ, a document the host opens would make the renderer drop its view
  for (const date of [
    "2026-11-19t18:42:00Z",
    "2026-11-19T18:42:00z",
    "2026-11-19 18:42:00Z",
    "2026-11-19T18:42:00+0100",
  ])
    expect(
      broken("accepted", (v) => (accepted(v).acceptedAt = date)),
      date,
    ).toBe(false);
  for (const date of [
    "2026-11-19T18:42:00.123456789Z",
    "2026-11-19T18:42:00+01:00",
  ])
    expect(
      broken("accepted", (v) => (accepted(v).acceptedAt = date)),
      date,
    ).toBe(true);
  expect(
    broken("accepted", (v) => (accepted(v).result.steps.fuelLiters = -1)),
  ).toBe(false);
  expect(
    broken("accepted", (v) => (accepted(v).result.steps.vePercent = -0.5)),
  ).toBe(false);
  // an unproven plan with a timeline has one of two reasons, never the no-plan ones
  for (const [reason, valid] of [
    ["searchBudgetExhausted", true],
    ["fineGridNoFallback", true],
    ["noFeasiblePlan", false],
    ["constraintsUnsatisfiable", false],
    [null, false],
  ] as const)
    expect(
      broken("accepted", (v) => {
        accepted(v).result.certificate = "not_proven";
        accepted(v).result.reason = reason;
      }),
      String(reason),
    ).toBe(valid);
  expect(broken("accepted", (v) => (accepted(v).path = "C:\\a"))).toBe(false);
  expect(
    broken("accepted", (v) => (accepted(v).compare = { same: true })),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).compare = { same: "yes", deltaSeconds: 0 }),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).compare = { same: true, deltaSeconds: Number.NaN }),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).compare = { same: false, deltaSeconds: -3.5 }),
    ),
  ).toBe(true);
  expect(broken("accepted", (v) => (accepted(v).compare = null))).toBe(true);
  // it belongs to the active variant, and the collection agrees with it
  expect(broken("accepted", (v) => (v.activeStrategyId = null))).toBe(false);
  expect(broken("accepted", (v) => (v.events[0].acceptedPlan = "none"))).toBe(
    false,
  );
  expect(broken("stale", (v) => (v.events[0].acceptedPlan = "accepted"))).toBe(
    false,
  );
  expect(broken("accepted", (v) => (v.events[0].acceptedPlan = "later"))).toBe(
    false,
  );
  expect(broken("accepted", (v) => delete v.events[0].acceptedPlan)).toBe(
    false,
  );
  // the pit carries its seconds and what was pinned by hand
  expect(
    broken(
      "accepted",
      (v) => delete accepted(v).result.timeline.pits[0].pitSeconds,
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.pits[0].pitSeconds = -1),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.pits[0].pinned = true),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.pits[0].pinned.fuelLiters = 1),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.pits[0].pinned.path = "x"),
    ),
  ).toBe(false);
  expect(
    broken(
      "accepted",
      (v) => (accepted(v).result.timeline.pits[0].pinned.fuelLiters = true),
    ),
  ).toBe(true);
});

const compute = requestOf("strategy.compute");
if (compute?.method !== "strategy.compute")
  throw Error("Missing Strategy calculation sample");

function planned(scene = "strategy-ready") {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request }) as Json;
  send({ method: "strategy.open" });
  send(compute);
  const done = send({ method: "strategy.view" });
  if (done?.kind !== "response") throw Error("Missing the calculated plan");
  return { send, value: done.result.value as Json };
}
function opened(scene: string) {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request }) as Json;
  const reply = send({ method: "strategy.open" });
  return { send, value: reply.result.value as Json };
}

it("accepts the plan on screen in memory, as the host does", () => {
  const { send, value } = planned();
  expect(value.plan.accepted).toBeNull();
  expect(value.events[0].acceptedPlan).toBe("none");
  const request = {
    method: "strategy.accept",
    revision: value.revision,
    computeId: value.plan.computeId,
  };
  const done = send(request);
  expect(done.kind).toBe("response");
  expect(isReply(done.result)).toBe(true);
  const view = done.result.value;
  // «Sin guardar», a new revision; the proposal stays exactly as it was
  expect(view.dirty).toBe(true);
  expect(view.revision).not.toBe(value.revision);
  expect(view.plan.state).toBe(value.plan.state);
  expect(view.plan.computeId).toBe(value.plan.computeId);
  expect(view.plan.result).toEqual(value.plan.result);
  expect(view.plan.edit).toEqual(value.plan.edit);
  expect(view.plan.accepted).toMatchObject({
    state: "accepted",
    saved: false,
    changes: [],
    unreachable: null,
    compare: { same: true, deltaSeconds: 0 },
  });
  expect(view.plan.accepted.result).toEqual(value.plan.result);
  expect(view.events[0].acceptedPlan).toBe("accepted");
  // saved: the plan is in the file
  const saved = send({ method: "strategy.save", revision: view.revision });
  expect(saved.result.value.plan.accepted.saved).toBe(true);
  expect(saved.result.value.dirty).toBe(false);
  expect(isReply(saved.result)).toBe(true);
});

it("refuses an old revision, another compute id and a plan that cannot be accepted", () => {
  const { send, value } = planned();
  const good = {
    method: "strategy.accept",
    revision: value.revision,
    computeId: value.plan.computeId,
  };
  for (const bad of [
    { ...good, computeId: value.plan.computeId + 1 },
    { ...good, revision: "0".repeat(64) },
  ]) {
    const refused = send(bad);
    expect(refused).toMatchObject({
      kind: "failure",
      error: {
        kind: "strategyConflict",
        current: { revision: value.revision },
      },
    });
    expect(isError(refused.error)).toBe(true);
  }
  // a plan with no solution has nothing to keep
  const noSolution = planned("strategy-recalcNoSolution");
  const moved = noSolution.send({
    method: "strategy.moveStop",
    revision: noSolution.value.revision,
    computeId: noSolution.value.plan.computeId,
    index: 0,
    delta: -1,
  });
  const edited = moved.result.value;
  expect(
    noSolution.send({
      method: "strategy.accept",
      revision: edited.revision,
      computeId: edited.plan.computeId,
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "strategyEditPending" } });
  const recalculating = noSolution.send({
    method: "strategy.recalculate",
    revision: edited.revision,
    computeId: edited.plan.computeId,
  });
  const running = recalculating.result.value.plan;
  expect(
    noSolution.send({
      method: "strategy.accept",
      revision: edited.revision,
      computeId: running.computeId,
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "busy" } });
  const finished = noSolution.send({ method: "strategy.view" }).result.value;
  expect(finished.plan.result.timeline).toBeNull();
  expect(
    noSolution.send({
      method: "strategy.accept",
      revision: finished.revision,
      computeId: finished.plan.computeId,
    }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "strategyNotAcceptable" },
  });
  // and the right pair still works
  expect(send(good).kind).toBe("response");
});

it("removes the plan, shows it again and brings it back with a discard", () => {
  const { send, value } = planned();
  const accepted = send({
    method: "strategy.accept",
    revision: value.revision,
    computeId: value.plan.computeId,
  }).result.value;
  const saved = send({
    method: "strategy.save",
    revision: accepted.revision,
  }).result.value;
  // showing it drops the proposal and leaves the document alone
  const shown = send({
    method: "strategy.showAccepted",
    revision: saved.revision,
  });
  expect(isReply(shown.result)).toBe(true);
  expect(shown.result.value.revision).toBe(saved.revision);
  expect(shown.result.value.dirty).toBe(false);
  expect(shown.result.value.plan).toMatchObject({
    state: "uncalculated",
    computeId: null,
    result: null,
    accepted: { state: "accepted", saved: true, compare: null },
  });
  // removing it is also «Sin guardar»; the second time there is nothing to remove
  const removed = send({
    method: "strategy.unaccept",
    revision: saved.revision,
  });
  expect(isReply(removed.result)).toBe(true);
  expect(removed.result.value.dirty).toBe(true);
  expect(removed.result.value.plan.accepted).toBeNull();
  expect(removed.result.value.events[0].acceptedPlan).toBe("none");
  for (const method of ["strategy.unaccept", "strategy.showAccepted"])
    expect(
      send({ method, revision: removed.result.value.revision }),
    ).toMatchObject({
      kind: "failure",
      error: { kind: "strategyNoAcceptedPlan" },
    });
  expect(
    send({ method: "strategy.unaccept", revision: "0".repeat(64) }),
  ).toMatchObject({ kind: "failure", error: { kind: "strategyConflict" } });
  // the file still holds it
  const back = send({
    method: "strategy.discard",
    revision: removed.result.value.revision,
  });
  expect(back.result.value.plan.accepted).toMatchObject({
    state: "accepted",
    saved: true,
  });
});

it("opens a saved plan as accepted, stale or unreachable and never deletes it", () => {
  const accepted = opened("strategy-accepted").value;
  expect(accepted.plan).toMatchObject({
    state: "uncalculated",
    result: null,
    accepted: { state: "accepted", saved: true, changes: [], compare: null },
  });
  expect(accepted.events[0].acceptedPlan).toBe("accepted");
  const stale = opened("strategy-acceptedStale").value;
  expect(stale.plan.accepted).toMatchObject({
    state: "stale",
    unreachable: null,
    changes: [{ field: "basePaceSeconds", before: "90", after: "90.472" }],
  });
  expect(stale.events[0].acceptedPlan).toBe("stale");
  const unreachable = opened("strategy-acceptedUnreachable").value;
  expect(unreachable.plan.accepted).toMatchObject({
    state: "staleUnreachable",
    unreachable: { cause: "resourceExhausted", failLap: null },
    changes: [{ field: "fuelPerLapLiters", before: "1.5", after: "1.83" }],
  });
  for (const view of [accepted, stale, unreachable])
    expect(isReply({ method: "strategy.open", value: view })).toBe(true);
  // the plan kept is the same one whatever the data say
  expect(stale.plan.accepted.result).toEqual(accepted.plan.accepted.result);
  expect(unreachable.plan.accepted.result).toEqual(
    accepted.plan.accepted.result,
  );
});

it("compares a new proposal with the plan: the difference is proposal minus accepted", () => {
  const { send, value } = opened("strategy-accepted");
  send(compute);
  const done = send({ method: "strategy.view" }).result.value;
  const proposal = done.plan.result.metrics.totalSeconds;
  const kept = value.plan.accepted.result.metrics.totalSeconds;
  expect(done.plan.accepted.compare).toEqual({
    same: true,
    deltaSeconds: proposal - kept,
  });
});

it("never puts a path on the wire", () => {
  const text = JSON.stringify(corpus);
  expect(text).not.toMatch(/[A-Za-z]:\\\\/);
  expect(text).not.toContain('"path":"/');
});

// ---- the Fuji scenes of the screen (E5b): the size of a real race ----

it("opens the Fuji case with its plan accepted, outdated or not reaching the finish", () => {
  const fuji = opened("strategy-acceptedFuji").value;
  expect(fuji.plan).toMatchObject({
    state: "uncalculated",
    result: null,
    accepted: {
      state: "accepted",
      saved: true,
      changes: [],
      unreachable: null,
      compare: null,
    },
  });
  expect(fuji.plan.accepted.result.metrics).toMatchObject({
    totalSeconds: 21664,
    laps: 236,
    pitCount: 5,
  });
  expect(fuji.events[0]).toMatchObject({
    name: "Fuji 6 Horas",
    acceptedPlan: "accepted",
  });
  const stale = opened("strategy-acceptedFujiStale").value;
  expect(stale.plan.accepted).toMatchObject({
    state: "stale",
    unreachable: null,
    changes: [{ field: "basePaceSeconds", before: "90.472", after: "90.9" }],
  });
  expect(stale.events[0].acceptedPlan).toBe("stale");
  const unreachable = opened("strategy-acceptedFujiUnreachable").value;
  expect(unreachable.plan.accepted).toMatchObject({
    state: "staleUnreachable",
    unreachable: { cause: "resourceExhausted", failLap: null },
    changes: [{ field: "fuelPerLapLiters", before: "1.83", after: "1.85" }],
  });
  const partial = opened("strategy-acceptedFujiPartial").value;
  expect(partial.plan.accepted).toMatchObject({
    state: "accepted",
    result: { certificate: "not_proven", reason: "searchBudgetExhausted" },
  });
  for (const view of [fuji, stale, unreachable, partial])
    expect(isReply({ method: "strategy.open", value: view })).toBe(true);
});

it("has a new proposal two seconds slower than the plan accepted, and says what it is", () => {
  const { value } = opened("strategy-acceptedFujiNew");
  expect(value.plan).toMatchObject({
    state: "partial",
    accepted: {
      state: "accepted",
      saved: true,
      compare: { same: false, deltaSeconds: 2 },
    },
  });
  expect(value.plan.result.timeline.pits[0].lap).toBe(42);
  expect(value.plan.edit.stops[0].lap).toBe(42);
  expect(isReply({ method: "strategy.open", value })).toBe(true);
});

it("lists the events of a collection with a plan accepted, an outdated one and none", () => {
  const { value } = opened("strategy-acceptedFujiList");
  expect(
    value.events.map((event: Json) => [event.name, event.acceptedPlan]),
  ).toEqual([
    ["Fuji 6 Horas", "stale"],
    ["Le Mans 24 Horas", "accepted"],
    ["Sprint de Spa", "none"],
  ]);
  expect(isReply({ method: "strategy.open", value })).toBe(true);
});

it("accepts a proposal that is not the accepted one in place of it, and the discard brings it back", () => {
  const { send, value } = opened("strategy-acceptedFujiNew");
  const done = send({
    method: "strategy.accept",
    revision: value.revision,
    computeId: value.plan.computeId,
  }).result.value;
  expect(done.dirty).toBe(true);
  expect(done.plan.accepted).toMatchObject({
    saved: false,
    compare: { same: true, deltaSeconds: 0 },
    result: { metrics: { totalSeconds: 21666 } },
  });
  const back = send({
    method: "strategy.discard",
    revision: done.revision,
  }).result.value;
  expect(back.plan.accepted.result.metrics.totalSeconds).toBe(21664);
  expect(back.plan.accepted.saved).toBe(true);
});
