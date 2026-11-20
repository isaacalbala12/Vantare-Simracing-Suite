// E5f: fuel and energy fixed by hand in a stop. The wire shape of the two
// requests, of the typed refusal and of what the edit says (what is fixed, the
// limits of each stop and the cause), and the mock answering like the host.
import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import {
  strategyAmountIssues,
  strategyMethods,
  strategyStopServiceReasons,
} from "../src/contract/generated/strategy";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requests } from "./strategy-corpus";

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;

const revision = "a".repeat(64);
const set = {
  method: "strategy.setStopService",
  revision,
  computeId: 7,
  index: 1,
  fuelLiters: 60,
  vePercent: null,
  changeTyres: null,
};
const clear = { method: "strategy.clearStopServices", revision, computeId: 7 };

it("lists the two methods and accepts their requests and nothing looser", () => {
  expect(strategyMethods).toContain("strategy.setStopService");
  expect(strategyMethods).toContain("strategy.clearStopServices");
  const sent = requests.filter(
    ({ method }) => method === set.method || method === clear.method,
  );
  // both amounts of the corpus: one fixed and the other automatic, each way,
  // and the tyres alone
  expect(sent).toHaveLength(4);
  for (const request of sent)
    expect(isRequest(request as Record<string, unknown>)).toBe(true);
  for (const good of [
    set,
    clear,
    { ...set, fuelLiters: null },
    { ...set, fuelLiters: 0, vePercent: 97.5 },
    // whether a number can be fixed is the answer of the host, typed
    { ...set, fuelLiters: -1 },
    { ...set, fuelLiters: 1e9 },
  ])
    expect(isRequest(good), JSON.stringify(good)).toBe(true);
  const without = (key: string) => {
    const request: Record<string, unknown> = { ...set };
    delete request[key];
    return request;
  };
  for (const bad of [
    // both amounts are stated every time
    without("fuelLiters"),
    without("vePercent"),
    without("index"),
    without("computeId"),
    { ...set, fuelLiters: undefined },
    { ...set, fuelLiters: "60" },
    { ...set, fuelLiters: Number.NaN },
    { ...set, vePercent: Number.POSITIVE_INFINITY },
    { ...set, index: -1 },
    { ...set, index: 1.5 },
    { ...set, computeId: 0 },
    { ...set, revision: "z" },
    // neither the service mode nor a path
    { ...set, serviceMode: "parallel" },
    { ...set, path: "x" },
    { ...clear, index: 0 },
    { ...clear, path: "x" },
    { ...clear, computeId: undefined },
  ])
    expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
});

const refusal = {
  kind: "strategyInvalidStopService",
  amount: "fuelLiters",
  reason: "offGrid",
  below: 70,
  above: 71,
};

it("accepts the typed refusal of an amount with its neighbours and no free text", () => {
  const samples = corpus.host
    .map((message) => ("error" in message ? message.error : undefined))
    .filter((error) => error?.kind === refusal.kind);
  // one per reason
  expect(samples.map((error) => (error as Json).reason).sort()).toEqual(
    [...strategyStopServiceReasons].sort(),
  );
  for (const error of samples)
    expect(isError(error as Record<string, unknown>)).toBe(true);
  for (const good of [
    refusal,
    { ...refusal, above: null },
    { ...refusal, amount: "vePercent", reason: "aboveCapacity", above: null },
    { ...refusal, reason: "negative", below: null, above: 0 },
    { ...refusal, reason: "notInUse", below: null, above: null },
  ])
    expect(isError(good), JSON.stringify(good)).toBe(true);
  for (const bad of [
    { ...refusal, reason: "tooMuch" },
    { ...refusal, amount: "changeTyres" },
    { ...refusal, message: "x" },
    { ...refusal, below: "70" },
    { ...refusal, below: -1 },
    { ...refusal, below: 71, above: 70 },
    { ...refusal, below: 70, above: 70 },
    { kind: refusal.kind, amount: "fuelLiters", reason: "offGrid" },
    { ...refusal, reason: "notInUse" },
    { ...refusal, reason: "negative" },
    { ...refusal, reason: "aboveCapacity" },
  ])
    expect(isError(bad), JSON.stringify(bad)).toBe(false);
});

type Reply = Record<string, unknown> & { value: { plan: Json } };
const replies = corpus.host
  .map((message) => ("result" in message ? message.result : undefined))
  .filter((result) => result !== undefined) as unknown as Reply[];
const fixedReplies = replies.filter(
  ({ method }) => method === set.method || method === clear.method,
);
function replyWith(found: (plan: Json) => boolean): Reply {
  const reply = replies.find(
    ({ value }) => value?.plan?.edit && found(value.plan),
  );
  if (!reply) throw Error("Missing sample");
  return structuredClone(reply);
}
// the second stop of the samples: `issue` is the one of its fuel
const withIssue = (issue: string | null, failLap = false) =>
  replyWith((plan) => {
    const limits = plan.edit.stops[1]?.limits;
    return (
      limits?.kind === "exact" &&
      limits.fuel.kind === "used" &&
      plan.edit.stops[1].fixed.fuelLiters !== null &&
      limits.fuel.issue === issue &&
      (limits.fuel.failLap !== null) === failLap
    );
  });

it("validates what the corpus says of a fixed amount in every state", () => {
  expect(fixedReplies.length).toBeGreaterThanOrEqual(7);
  for (const reply of fixedReplies) expect(isReply(reply)).toBe(true);
  // each issue, with and without the lap it runs out in
  expect(isReply(withIssue(null))).toBe(true);
  expect(isReply(withIssue("belowMin", true))).toBe(true);
  expect(isReply(withIssue("belowMin", false))).toBe(true);
  expect(isReply(withIssue("aboveMax"))).toBe(true);
  expect(isReply(withIssue("noRange"))).toBe(true);
  const issues = fixedReplies
    .map(({ value }) => value.plan.edit.stops[1].limits)
    .filter((limits: Json) => limits.kind === "exact")
    .map((limits: Json) => limits.fuel.issue)
    .filter(Boolean);
  expect([...new Set(issues)].sort()).toEqual([...strategyAmountIssues].sort());
  // no limits at all, and a car without virtual energy
  expect(
    isReply(
      replyWith((plan) => plan.edit.stops[1]?.limits.kind === "unavailable"),
    ),
  ).toBe(true);
  expect(
    isReply(
      replyWith((plan) => plan.edit.stops[1]?.limits.ve?.kind === "unused"),
    ),
  ).toBe(true);
  // the cause of a recalculation without a plan, and a plan with a fixed amount
  const caused = replyWith((plan) => plan.edit.cause !== null);
  expect(caused.value.plan.edit.cause).toEqual({
    kind: "fixedAmountUnreachable",
    stop: 1,
  });
  expect(isReply(caused)).toBe(true);
  const pinned = replyWith((plan) =>
    plan.result?.timeline?.pits.some((pit: Json) => pit.pinned.fuelLiters),
  );
  expect(pinned.value.plan.edit.automatic).not.toBeNull();
  expect(isReply(pinned)).toBe(true);
});

it("rejects limits that disagree with what is fixed", () => {
  const broken = (sample: Reply, change: (plan: Json) => void) => {
    const reply = structuredClone(sample);
    change(reply.value.plan);
    return isReply(reply);
  };
  const inside = withIssue(null);
  const second = (plan: Json) => plan.edit.stops[1];
  const fuel = (plan: Json) => second(plan).limits.fuel;
  expect(broken(inside, () => {})).toBe(true);
  // an issue the numbers do not give, and none where they give one
  for (const issue of strategyAmountIssues)
    expect(
      broken(inside, (plan) => (fuel(plan).issue = issue)),
      issue,
    ).toBe(false);
  expect(
    broken(withIssue("belowMin", true), (plan) => (fuel(plan).issue = null)),
  ).toBe(false);
  expect(
    broken(withIssue("aboveMax"), (plan) => (fuel(plan).issue = "belowMin")),
  ).toBe(false);
  expect(broken(inside, (plan) => (fuel(plan).range = null))).toBe(false);
  expect(
    broken(withIssue("noRange"), (plan) => (fuel(plan).issue = null)),
  ).toBe(false);
  // an automatic amount has no issue
  expect(
    broken(
      withIssue("aboveMax"),
      (plan) => (second(plan).fixed.fuelLiters = null),
    ),
  ).toBe(false);
  // the lap it runs out in: only with too little, and after the stop
  expect(broken(inside, (plan) => (fuel(plan).failLap = 8))).toBe(false);
  expect(
    broken(
      withIssue("belowMin", true),
      (plan) => (fuel(plan).failLap = second(plan).lap),
    ),
  ).toBe(false);
  expect(
    broken(withIssue("belowMin", true), (plan) => (fuel(plan).failLap = 1.5)),
  ).toBe(false);
  // shapes
  expect(
    broken(inside, (plan) => (fuel(plan).range.min = fuel(plan).range.max + 1)),
  ).toBe(false);
  expect(broken(inside, (plan) => (fuel(plan).arrival.min = -1))).toBe(false);
  expect(broken(inside, (plan) => (fuel(plan).kind = "exact"))).toBe(false);
  expect(broken(inside, (plan) => (fuel(plan).path = "x"))).toBe(false);
  expect(broken(inside, (plan) => delete fuel(plan).failLap)).toBe(false);
  expect(broken(inside, (plan) => (second(plan).limits.kind = "none"))).toBe(
    false,
  );
  expect(broken(inside, (plan) => (second(plan).limits = null))).toBe(false);
  expect(
    broken(
      inside,
      (plan) => (second(plan).limits = { kind: "unavailable", fuel: 1 }),
    ),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (second(plan).limits = { kind: "unavailable" })),
  ).toBe(true);
  // a resource not in use has nothing fixed
  expect(
    broken(inside, (plan) => (second(plan).limits.fuel = { kind: "unused" })),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (second(plan).limits.ve = { kind: "unused" })),
  ).toBe(true);
  expect(
    broken(
      inside,
      (plan) => (second(plan).limits.ve = { kind: "unused", range: null }),
    ),
  ).toBe(false);
  // what is fixed and the time of the stop
  expect(broken(inside, (plan) => (second(plan).fixed.fuelLiters = "14"))).toBe(
    false,
  );
  expect(broken(inside, (plan) => (second(plan).fixed.fuelLiters = -1))).toBe(
    false,
  );
  expect(broken(inside, (plan) => delete second(plan).fixed.vePercent)).toBe(
    false,
  );
  expect(broken(inside, (plan) => (second(plan).pitSeconds = null))).toBe(
    false,
  );
  expect(broken(inside, (plan) => (second(plan).pitSeconds = -1))).toBe(false);
  // the cause names a stop with something fixed
  const cause = { kind: "fixedAmountUnreachable", stop: 1 };
  expect(broken(inside, (plan) => (plan.edit.cause = cause))).toBe(true);
  expect(
    broken(inside, (plan) => (plan.edit.cause = { ...cause, stop: 0 })),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (plan.edit.cause = { ...cause, stop: 2 })),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (plan.edit.cause = { ...cause, kind: "other" })),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (plan.edit.cause = { ...cause, text: "x" })),
  ).toBe(false);
  expect(
    broken(inside, (plan) => (plan.edit.cause = "fixedAmountUnreachable")),
  ).toBe(false);
  // the plan to compare with is there only while something is fixed
  expect(broken(inside, (plan) => (plan.edit.automatic = null))).toBe(true);
  expect(
    broken(inside, (plan) => (plan.edit.automatic.totalSeconds = "301")),
  ).toBe(false);
  expect(broken(inside, (plan) => (plan.edit.automatic.path = "x"))).toBe(
    false,
  );
  expect(broken(inside, (plan) => (second(plan).fixed.fuelLiters = null))).toBe(
    false,
  );
  expect(broken(inside, (plan) => delete plan.edit.automatic)).toBe(false);
  expect(broken(inside, (plan) => delete plan.edit.cause)).toBe(false);
});

// The Fuji scene of the mock: 5 stops, with the limits of the solver for it.
function fuji() {
  const host = createMockHost("strategy-plannedFuji");
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  const opened = send({ method: "strategy.open" });
  if (opened?.kind !== "response") throw Error("Missing the Fuji plan");
  const value = (opened.result as unknown as Reply).value as Json;
  return { send, value };
}
const planOf = (answer: unknown) => {
  const reply = answer as { kind: string; result: Reply };
  expect(reply.kind).toBe("response");
  expect(isReply(reply.result)).toBe(true);
  return reply.result.value.plan;
};
const errorOf = (answer: unknown) => {
  const failure = answer as { kind: string; error: Record<string, unknown> };
  expect(failure.kind).toBe("failure");
  if (String(failure.error.kind).startsWith("strategy"))
    expect(isError(failure.error)).toBe(true);
  return failure.error;
};

it("the mock fixes an amount only in the session and says what the limits say", () => {
  const { send, value } = fuji();
  const base = value.plan;
  expect(base.edit.stops).toHaveLength(5);
  // the limits of the Fuji case are the ones of the solver (#2692)
  expect(base.edit.stops[1].limits.fuel.range).toEqual({ min: 73, max: 81 });
  expect(base.edit.stops[0].limits.fuel.range).toEqual({ min: 74, max: 78 });
  expect(base.edit.stops[4].limits.ve.range).toEqual({ min: 56, max: 99 });
  const request = (extra: Record<string, unknown> = {}) => ({
    revision: value.revision,
    computeId: base.computeId,
    ...extra,
  });
  const fix = (
    index: number,
    fuelLiters: number | null,
    vePercent: number | null = null,
  ) =>
    send({
      ...request(),
      method: set.method,
      index,
      fuelLiters,
      vePercent,
      changeTyres: null,
    });

  // 60 L in the second stop: too little, and it runs out in lap 121
  const edited = planOf(fix(1, 60));
  expect(edited.state).toBe("edited");
  expect(edited.result).toEqual(base.result);
  expect(edited.edit.stops[1].fixed).toEqual({
    fuelLiters: 60,
    vePercent: null,
    changeTyres: null,
  });
  expect(edited.edit.stops[1].fuelLiters).toBe(base.edit.stops[1].fuelLiters);
  expect(edited.edit.stops[1].limits.fuel).toMatchObject({
    range: { min: 73, max: 81 },
    issue: "belowMin",
    failLap: 121,
  });
  expect(edited.edit.stops[1].limits.ve.issue).toBeNull();
  expect(edited.edit.automatic).toEqual({
    totalSeconds: base.result.metrics.totalSeconds,
    fuelFinishLiters: base.result.timeline.fuelFinishLiters,
    veFinishPercent: base.result.timeline.veFinishPercent,
  });
  // the document did not move
  const view = (send({ method: "strategy.view" }) as { result: Reply }).result
    .value as Json;
  expect([view.revision, view.dirty]).toEqual([value.revision, value.dirty]);
  // too much, and energy in another stop (what is fixed in the second stays)
  expect(planOf(fix(1, 82)).edit.stops[1].limits.fuel.issue).toBe("aboveMax");
  const energy = planOf(fix(4, null, 40));
  expect(energy.edit.stops[1].fixed.fuelLiters).toBe(82);
  expect(energy.edit.stops[4].limits.ve).toMatchObject({
    issue: "belowMin",
    range: { min: 56, max: 99 },
  });
  // «Volver todo a automático»
  fix(1, 77);
  const cleared = planOf(send({ ...request(), method: clear.method }));
  for (const stop of cleared.edit.stops)
    expect(stop.fixed).toEqual({
      fuelLiters: null,
      vePercent: null,
      changeTyres: null,
    });
  expect(cleared.edit.automatic).toBeNull();
  expect(cleared.state).toBe("edited");
  // «Restablecer» returns to the plan, which had nothing fixed
  fix(1, 60);
  expect(planOf(send({ ...request(), method: "strategy.resetEdit" }))).toEqual(
    base,
  );
});

it("the mock refuses an amount that cannot be fixed, with the reasons of the host", () => {
  const { send, value } = fuji();
  const base = value.plan;
  const request = {
    revision: value.revision,
    computeId: base.computeId,
    method: set.method,
  };
  const fix = (
    index: number,
    fuelLiters: number | null,
    vePercent: number | null = null,
  ) => send({ ...request, index, fuelLiters, vePercent, changeTyres: null });
  const fuel = { kind: refusal.kind, amount: "fuelLiters" };
  expect(errorOf(fix(1, 60.5))).toEqual({
    ...fuel,
    reason: "offGrid",
    below: 60,
    above: 61,
  });
  expect(errorOf(fix(1, 90))).toEqual({
    ...fuel,
    reason: "aboveCapacity",
    below: 82,
    above: null,
  });
  expect(errorOf(fix(1, -1))).toEqual({
    ...fuel,
    reason: "negative",
    below: null,
    above: 0,
  });
  expect(errorOf(fix(1, null, 103))).toEqual({
    kind: refusal.kind,
    amount: "vePercent",
    reason: "aboveCapacity",
    below: 100,
    above: null,
  });
  // fuel is checked before energy
  expect(errorOf(fix(1, 60.5, 103))).toMatchObject({ amount: "fuelLiters" });
  expect(errorOf(fix(9, 60))).toEqual({ kind: "rejected" });
  // nothing was fixed
  const view = planOf(send({ method: "strategy.view" }));
  expect(view).toEqual(base);
  // another plan is a conflict with the current view
  expect(
    errorOf(
      send({
        ...request,
        computeId: base.computeId + 1,
        index: 1,
        fuelLiters: 77,
        vePercent: null,
        changeTyres: null,
      }),
    ),
  ).toMatchObject({ kind: "strategyConflict" });
  expect(
    errorOf(
      send({
        revision: value.revision,
        computeId: base.computeId + 1,
        method: clear.method,
      }),
    ),
  ).toMatchObject({ kind: "strategyConflict" });
});

it("the mock recalculates with what is fixed: a plan that says so, or the stop to blame", () => {
  const { send, value } = fuji();
  const base = value.plan;
  const request = (computeId: number, extra: Record<string, unknown> = {}) => ({
    revision: value.revision,
    computeId,
    ...extra,
  });
  const fix = (computeId: number, index: number, fuelLiters: number | null) =>
    planOf(
      send({
        ...request(computeId),
        method: set.method,
        index,
        fuelLiters,
        vePercent: null,
        changeTyres: null,
      }),
    );
  const recalculate = (computeId: number) => {
    const started = planOf(
      send({ ...request(computeId), method: "strategy.recalculate" }),
    );
    expect(started.state).toBe("calculating");
    // while it runs the edit is busy
    expect(
      errorOf(
        send({
          ...request(started.computeId),
          method: set.method,
          index: 0,
          fuelLiters: 75,
          vePercent: null,
          changeTyres: null,
        }),
      ),
    ).toEqual({ kind: "busy" });
    expect(
      errorOf(send({ ...request(started.computeId), method: clear.method })),
    ).toEqual({
      kind: "busy",
    });
    return planOf(send({ method: "strategy.view" }));
  };

  // 40 L in the second stop: no plan, and the second stop is to blame
  fix(base.computeId, 1, 40);
  const none = recalculate(base.computeId);
  expect(none.result.certificate).toBe("no_solution");
  expect(none.result.timeline).toBeNull();
  expect(none.edit.cause).toEqual({ kind: "fixedAmountUnreachable", stop: 1 });
  expect(none.edit.stops[1].fixed.fuelLiters).toBe(40);
  expect(none.edit.canReset).toBe(true);
  // «Volver la parada 2 a automático»: a new question, no cause
  const back = fix(none.computeId, 1, null);
  expect(back.edit.cause).toBeNull();
  expect(back.state).toBe("edited");

  // 73 L: inside the limits, so the plan carries it and says it is fixed by hand
  fix(none.computeId, 1, 73);
  const done = recalculate(none.computeId);
  expect(done.result.timeline.pits[1]).toMatchObject({
    fuelLiters: 73,
    pinned: { fuelLiters: true, vePercent: false, changeTyres: false },
  });
  expect(done.result.timeline.pits[0].pinned.fuelLiters).toBe(false);
  expect(done.edit.stops[1].fixed.fuelLiters).toBe(73);
  expect(done.edit.cause).toBeNull();
  expect(done.edit.canReset).toBe(false);
  expect(done.edit.automatic.totalSeconds).toBe(
    base.result.metrics.totalSeconds,
  );
  expect(done.result.metrics.totalSeconds).toBeGreaterThan(
    base.result.metrics.totalSeconds,
  );
  // «Restablecer» after another change returns to this plan, 73 L fixed
  fix(done.computeId, 1, 80);
  const reset = planOf(
    send({ ...request(done.computeId), method: "strategy.resetEdit" }),
  );
  expect(reset).toEqual(done);

  // accepting keeps which amounts were fixed
  const accepted = planOf(
    send({ ...request(done.computeId), method: "strategy.accept" }),
  );
  expect(accepted.accepted.result.timeline.pits[1].pinned.fuelLiters).toBe(
    true,
  );
});

it("the mock has no limits for another calendar or another race", () => {
  const { send, value } = fuji();
  const moved = planOf(
    send({
      revision: value.revision,
      computeId: value.plan.computeId,
      method: "strategy.moveStop",
      index: 0,
      delta: -1,
    }),
  );
  for (const stop of moved.edit.stops)
    expect(stop.limits).toEqual({ kind: "unavailable" });
  // moving it back, the limits of the Fuji calendar are there again
  const back = planOf(
    send({
      revision: value.revision,
      computeId: value.plan.computeId,
      method: "strategy.moveStop",
      index: 0,
      delta: 1,
    }),
  );
  expect(back.edit.stops[0].limits.kind).toBe("exact");
});
