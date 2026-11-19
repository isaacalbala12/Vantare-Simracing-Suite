import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requestOf, requests } from "./strategy-corpus";

const compute = requestOf("strategy.compute");
if (compute?.method !== "strategy.compute")
  throw Error("Missing Strategy calculation sample");

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;

const revision = "a".repeat(64);
const edits = {
  boundary: {
    method: "strategy.moveBoundary",
    revision,
    computeId: 7,
    index: 0,
    lap: 1,
  },
  stop: {
    method: "strategy.moveStop",
    revision,
    computeId: 7,
    index: 0,
    delta: -1,
  },
  recalculate: { method: "strategy.recalculate", revision, computeId: 7 },
  reset: { method: "strategy.resetEdit", revision, computeId: 7 },
};

it("accepts the four edit requests of the corpus and nothing looser", () => {
  const sent = requests;
  for (const method of [
    "strategy.moveBoundary",
    "strategy.moveStop",
    "strategy.recalculate",
    "strategy.resetEdit",
  ]) {
    const sample = sent.find((request) => request.method === method);
    expect(sample, method).toBeDefined();
    expect(isRequest(sample as Record<string, unknown>), method).toBe(true);
  }
  for (const request of Object.values(edits))
    expect(isRequest(request)).toBe(true);
  for (const bad of [
    { ...edits.stop, delta: 0 },
    { ...edits.stop, delta: 2 },
    { ...edits.stop, delta: "1" },
    { ...edits.boundary, index: -1 },
    { ...edits.boundary, lap: 1.5 },
    { ...edits.boundary, computeId: 0 },
    { ...edits.boundary, path: "x" },
    { ...edits.boundary, revision: "z" },
    { ...edits.recalculate, computeId: undefined },
    { ...edits.reset, lap: 1 },
  ])
    expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
});

it("accepts the typed edit-pending error and no free text", () => {
  expect(isError({ kind: "strategyEditPending" })).toBe(true);
  expect(isError({ kind: "strategyEditPending", message: "x" })).toBe(false);
});

const views = corpus.host.filter(
  (message) => message.result?.method !== undefined,
);
type Reply = Record<string, unknown> & { value: { plan: Json } };
function sample(state: string): Reply {
  const found = views.find(
    (message) =>
      message.result?.value &&
      "plan" in message.result.value &&
      message.result.value.plan?.state === state,
  )?.result;
  if (!found) throw Error(`Missing ${state} sample`);
  return structuredClone(found) as unknown as Reply;
}

it("validates the edited, recalculating and calculated plans with their edit", () => {
  for (const state of ["edited", "calculating", "calculated"])
    expect(isReply(sample(state)), state).toBe(true);
  // a plan without a schedule (more than 16 stops) has no edit
  const bare = sample("calculated");
  bare.value.plan.edit = null;
  expect(isReply(bare)).toBe(true);
});

it("rejects an inconsistent edit", () => {
  const broken = (change: (plan: Reply["value"]["plan"]) => void) => {
    const reply = sample("edited");
    change(reply.value.plan);
    return isReply(reply);
  };
  expect(broken(() => {})).toBe(true);
  expect(broken((plan) => (plan.edit = null))).toBe(false);
  expect(broken((plan) => plan.edit.stops.pop())).toBe(false);
  expect(broken((plan) => (plan.edit.stops[0].lap += 1))).toBe(false);
  expect(broken((plan) => (plan.edit.stints[1].fromLap += 1))).toBe(false);
  expect(broken((plan) => (plan.edit.stints[0].fromLap = 0))).toBe(false);
  expect(
    broken((plan) => (plan.edit.stops[0].minLap = plan.edit.stops[0].lap + 1)),
  ).toBe(false);
  expect(
    broken((plan) => (plan.edit.stops[0].maxLap = plan.edit.stops[0].lap - 1)),
  ).toBe(false);
  expect(broken((plan) => (plan.edit.error = "path"))).toBe(false);
  expect(broken((plan) => (plan.edit.error = "scheduleNotPreserved"))).toBe(
    true,
  );
  expect(broken((plan) => (plan.edit.canReset = "yes"))).toBe(false);
  expect(broken((plan) => (plan.edit.stops[0].path = "x"))).toBe(false);
  expect(broken((plan) => (plan.edit.stops[0].fuelLiters = -1))).toBe(false);
  expect(broken((plan) => (plan.result = null))).toBe(false);
  expect(broken((plan) => (plan.error = "failed"))).toBe(false);
  expect(broken((plan) => (plan.computeId = null))).toBe(false);
  // an edit only exists with a plan
  for (const state of ["uncalculated", "pendingChanges"]) {
    const reply = sample("calculated");
    Object.assign(reply.value.plan, { state, computeId: null, result: null });
    expect(isReply(reply), state).toBe(false);
  }
  const error = sample("error");
  error.value.plan.edit = sample("edited").value.plan.edit;
  expect(isReply(error)).toBe(false);
  // 17 stints at most
  const many = sample("edited");
  many.value.plan.edit.stints = Array.from({ length: 18 }, (_, index) => ({
    fromLap: index + 1,
    toLap: index + 1,
  }));
  many.value.plan.edit.stops = Array.from({ length: 17 }, (_, index) => ({
    lap: index + 1,
    minLap: index + 1,
    maxLap: index + 1,
    fuelLiters: 1,
    vePercent: 1,
  }));
  expect(isReply(many)).toBe(false);
});

function planned(scene = "strategy-ready") {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  send({ method: "strategy.open" });
  send(compute);
  const done = send({ method: "strategy.view" });
  if (done?.kind !== "response") throw Error("Missing the calculated plan");
  const value = (
    done.result as { value: Reply["value"] & { revision: string } }
  ).value;
  return { send, value };
}

const plan = (
  reply: ReturnType<typeof planned>["send"] extends (r: unknown) => infer R
    ? R
    : never,
) => (reply as { result: { value: { plan: Json } } }).result.value.plan;

it("moves a boundary or a stop only in memory, as the host does", () => {
  const { send, value } = planned();
  const base = value.plan;
  expect(base.state).toBe("calculated");
  expect(base.edit.stops).toHaveLength(1);
  const request = (extra: Record<string, unknown>) => ({
    revision: value.revision,
    computeId: base.computeId,
    ...extra,
  });
  // a boundary outside its range, or a stop that cannot move that way
  expect(
    send({ method: "strategy.moveBoundary", ...request({ index: 0, lap: 3 }) }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  expect(
    send({ method: "strategy.moveStop", ...request({ index: 0, delta: 1 }) }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  expect(
    send({ method: "strategy.moveBoundary", ...request({ index: 1, lap: 1 }) }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });

  const moved = send({
    method: "strategy.moveStop",
    ...request({ index: 0, delta: -1 }),
  });
  expect(moved).toMatchObject({ kind: "response" });
  const edited = (moved as { result: { value: typeof value } }).result.value;
  expect(edited.plan.state).toBe("edited");
  expect(edited.plan.computeId).toBe(base.computeId);
  expect(edited.plan.result).toEqual(base.result);
  expect(edited.plan.edit.stints).toEqual([
    { fromLap: 1, toLap: 1 },
    { fromLap: 2, toLap: 3 },
  ]);
  expect(edited.plan.edit.canReset).toBe(true);
  expect(isReply((moved as { result: Record<string, unknown> }).result)).toBe(
    true,
  );
  // moving does not change the file's state: only confirming or recalculating would
  expect((edited as unknown as { dirty: boolean }).dirty).toBe(
    (value as unknown as { dirty?: boolean }).dirty,
  );
  expect(edited.revision).toBe(value.revision);

  // a new calculation is refused while the edit is pending
  expect(send({ ...compute, revision: value.revision })).toMatchObject({
    kind: "failure",
    error: { kind: "strategyEditPending" },
  });
  // an old id is a conflict with the current view
  expect(
    send({
      method: "strategy.moveStop",
      ...request({ computeId: base.computeId + 1, index: 0, delta: 1 }),
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "strategyConflict" } });

  const reset = send({ method: "strategy.resetEdit", ...request({}) });
  expect(plan(reset)).toEqual(base);
  expect(send({ ...compute, revision: value.revision })).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "calculating" } } },
  });
});

it("recalculates with a new id, keeps the schedule and can be cancelled", () => {
  const { send, value } = planned();
  const base = value.plan;
  const request = (extra: Record<string, unknown> = {}) => ({
    revision: value.revision,
    computeId: base.computeId,
    ...extra,
  });
  // nothing is pending yet
  expect(send({ method: "strategy.recalculate", ...request() })).toMatchObject({
    kind: "failure",
    error: { kind: "rejected" },
  });
  send({ method: "strategy.moveStop", ...request({ index: 0, delta: -1 }) });

  const started = plan(send({ method: "strategy.recalculate", ...request() }));
  expect(started.state).toBe("calculating");
  expect(started.computeId).not.toBe(base.computeId);
  expect(started.result).toEqual(base.result);
  expect(started.edit.stints[0].toLap).toBe(1);
  expect(
    send({
      method: "strategy.recalculate",
      ...request({ computeId: started.computeId }),
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "busy" } });
  expect(
    send({
      method: "strategy.moveStop",
      ...request({ computeId: started.computeId, index: 0, delta: 1 }),
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "busy" } });

  // cancelling keeps the edit pending
  const cancelled = plan(
    send({ method: "strategy.cancel", computeId: started.computeId }),
  );
  expect(cancelled.state).toBe("edited");
  expect(cancelled.edit.stints).toEqual(started.edit.stints);
  expect(plan(send({ method: "strategy.view" })).state).toBe("edited");

  const again = plan(
    send({
      method: "strategy.recalculate",
      ...request({ computeId: cancelled.computeId }),
    }),
  );
  expect(again.computeId).not.toBe(started.computeId);
  const done = plan(send({ method: "strategy.view" }));
  expect(done.state).toBe("calculated");
  expect(done.computeId).toBe(again.computeId);
  expect(done.result.timeline.stints).toEqual(done.edit.stints);
  expect(done.result.timeline.pits[0].lap).toBe(1);
  expect(done.edit.canReset).toBe(false);
  // the recalculated plan is the new base: reset keeps it
  const reset = plan(
    send({
      method: "strategy.resetEdit",
      ...request({ computeId: done.computeId }),
    }),
  );
  expect(reset.edit.stints).toEqual(done.edit.stints);
});

it("answers like the host when the plan has no edit: recalculate is rejected, the rest conflict", () => {
  const { send, value } = planned();
  // an invalid form leaves an error plan that has an id but no schedule
  const failed = plan(
    send({
      ...compute,
      revision: value.revision,
      form: {
        ...compute.form,
        inputs: { ...compute.form?.inputs, basePaceSeconds: "" },
      },
    }),
  );
  expect(failed.state).toBe("calculating");
  const error = plan(send({ method: "strategy.view" }));
  expect(error.state).toBe("error");
  const request = (extra: Record<string, unknown>) => ({
    revision: (value as { revision: string }).revision,
    computeId: error.computeId,
    ...extra,
  });
  expect(
    send({ method: "strategy.recalculate", ...request({}) }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  for (const message of [
    { method: "strategy.resetEdit", ...request({}) },
    { method: "strategy.moveStop", ...request({ index: 0, delta: 1 }) },
    { method: "strategy.moveBoundary", ...request({ index: 0, lap: 1 }) },
  ])
    expect(send(message)).toMatchObject({
      kind: "failure",
      error: { kind: "strategyConflict" },
    });
});

it("keeps the edit when a calculation is refused for naming another strategy", () => {
  const { send, value } = planned();
  const base = value.plan;
  expect(
    send({
      ...compute,
      revision: value.revision,
      eventId: "another-event",
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  const moved = send({
    method: "strategy.moveStop",
    revision: value.revision,
    computeId: base.computeId,
    index: 0,
    delta: -1,
  });
  expect(moved).toMatchObject({
    kind: "response",
    result: { value: { plan: { state: "edited" } } },
  });
});

it("shows a recalculation that fails to keep the schedule (QA scene)", () => {
  const { send, value } = planned("strategy-recalcError");
  const request = (computeId: number) => ({
    revision: value.revision,
    computeId,
  });
  const base = value.plan;
  send({
    method: "strategy.moveStop",
    ...request(base.computeId),
    index: 0,
    delta: -1,
  });
  const started = plan(
    send({ method: "strategy.recalculate", ...request(base.computeId) }),
  );
  const failed = send({ method: "strategy.view" });
  expect(isReply((failed as { result: Record<string, unknown> }).result)).toBe(
    true,
  );
  const after = plan(failed);
  expect(after.state).toBe("edited");
  expect(after.computeId).toBe(started.computeId);
  expect(after.edit.error).toBe("scheduleNotPreserved");
  expect(after.edit.canReset).toBe(true);
  // moving again clears the error
  const moved = plan(
    send({
      method: "strategy.moveStop",
      ...request(after.computeId),
      index: 0,
      delta: 1,
    }),
  );
  expect(moved.edit.error).toBeNull();
});

it("shows a schedule without a solution and the way back (QA scene)", () => {
  const { send, value } = planned("strategy-recalcNoSolution");
  const request = (computeId: number) => ({
    revision: value.revision,
    computeId,
  });
  const base = value.plan;
  send({
    method: "strategy.moveStop",
    ...request(base.computeId),
    index: 0,
    delta: -1,
  });
  send({ method: "strategy.recalculate", ...request(base.computeId) });
  const answer = send({ method: "strategy.view" });
  expect(isReply((answer as { result: Record<string, unknown> }).result)).toBe(
    true,
  );
  const none = plan(answer);
  expect(none.state).toBe("calculated");
  expect(none.result.certificate).toBe("no_solution");
  expect(none.result.metrics).toBeNull();
  expect(none.result.timeline).toBeNull();
  expect(none.edit.canReset).toBe(true);
  const reset = plan(
    send({ method: "strategy.resetEdit", ...request(none.computeId) }),
  );
  expect(reset.result).toEqual(base.result);
  expect(reset.edit.stints).toEqual(base.edit.stints);
});
