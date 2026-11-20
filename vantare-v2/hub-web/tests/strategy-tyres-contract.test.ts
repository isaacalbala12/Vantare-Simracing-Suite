// E5h: the tyres of a stop kept or changed by hand. The wire shape of the
// request, of what the edit says (what is fixed and the tyres of each stop) and
// of the plan that carries them, and the mock answering like the host.
import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { strategyTyreIssues } from "../src/contract/generated/strategy";
import { isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requests } from "./strategy-corpus";

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;
type Reply = Record<string, unknown> & { value: { plan: Json } };

const revision = "a".repeat(64);
const set = {
  method: "strategy.setStopService",
  revision,
  computeId: 7,
  index: 1,
  fuelLiters: null,
  vePercent: null,
  changeTyres: false,
};

it("states the tyres in every request that fixes a stop, and nothing looser", () => {
  const sent = requests.filter(({ method }) => method === set.method) as Json[];
  // the corpus states them each way: left to the calculation, changed and kept
  expect(sent.map(({ changeTyres }) => String(changeTyres)).sort()).toEqual([
    "false",
    "null",
    "true",
  ]);
  for (const changeTyres of [null, true, false])
    expect(isRequest({ ...set, changeTyres })).toBe(true);
  const { changeTyres: _, ...without } = set;
  const clear = { method: "strategy.clearStopServices", revision };
  for (const bad of [
    // the whole stop is stated every time: a missing key is not «automatic»
    without,
    { ...set, changeTyres: undefined },
    { ...set, changeTyres: "false" },
    { ...set, changeTyres: 0 },
    // only `setStopService` states them
    { ...clear, computeId: 7, changeTyres: null },
  ])
    expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
});

const replies = corpus.host
  .map((message) => ("result" in message ? message.result : undefined))
  .filter((result) => result !== undefined) as unknown as Reply[];
// a sample whose second stop keeps its tyres and `found` holds
function sample(found: (plan: Json) => unknown): Reply {
  const reply = replies.find(
    ({ value }) =>
      value?.plan?.edit?.stops[1]?.fixed.changeTyres === false &&
      found(value.plan),
  );
  if (!reply) throw Error("Missing sample");
  return structuredClone(reply);
}
const second = (plan: Json) => plan.edit.stops[1];
const tyres = (plan: Json) => second(plan).tyres;
const pit = (plan: Json) => plan.result.timeline.pits[1];
const edited = (plan: Json) => plan.state === "edited";
const kept = sample((plan) => edited(plan) && tyres(plan).lifeLaps === 40);
const beyond = sample((plan) => edited(plan) && tyres(plan).issue);
const unlimited = sample((plan) => tyres(plan).lifeLaps === null);
const carried = sample(
  (plan) => plan.result?.timeline?.pits[1].pinned.changeTyres,
);
const blamed = sample((plan) => plan.edit.cause);

it("validates what the corpus says of the tyres of a stop in every state", () => {
  expect(strategyTyreIssues).toEqual(["beyondLife"]);
  for (const reply of [kept, beyond, unlimited, carried, blamed])
    expect(isReply(reply)).toBe(true);
  expect(tyres(kept.value.plan)).toEqual({
    lifeLaps: 40,
    arrivalLaps: 4,
    keptLaps: 7,
    issue: null,
  });
  expect(tyres(beyond.value.plan)).toMatchObject({
    lifeLaps: 6,
    issue: "beyondLife",
  });
  // «change them» fixed by hand, in the stop before
  expect(unlimited.value.plan.edit.stops[0].fixed.changeTyres).toBe(true);
  // the plan that keeps them says so, and that it was fixed by hand
  expect(pit(carried.value.plan)).toMatchObject({
    changeTyres: false,
    pinned: { fuelLiters: false, vePercent: false, changeTyres: true },
  });
  // the stop to blame has only its tyres fixed
  expect(blamed.value.plan.edit.cause.stop).toBe(1);
  expect(second(blamed.value.plan).fixed.fuelLiters).toBeNull();
});

it("rejects tyres that disagree with what is fixed, or with themselves", () => {
  const broken = (reply: Reply, change: (plan: Json) => void) => {
    const copy = structuredClone(reply);
    change(copy.value.plan);
    return isReply(copy);
  };
  const refused: [Reply, (plan: Json) => void][] = [
    // a mark the numbers do not give, and none where they give one
    [kept, (plan) => (tyres(plan).issue = "beyondLife")],
    [beyond, (plan) => (tyres(plan).issue = null)],
    [kept, (plan) => (tyres(plan).lifeLaps = 6)],
    // only «keep them» can be marked: not automatic, not «change them»
    [beyond, (plan) => (second(plan).fixed.changeTyres = null)],
    [beyond, (plan) => (second(plan).fixed.changeTyres = true)],
    // without a limit nothing is beyond it
    [beyond, (plan) => (tyres(plan).lifeLaps = null)],
    // whole laps, at least one, more after the next stint than on arrival
    [kept, (plan) => (tyres(plan).lifeLaps = 0)],
    [kept, (plan) => (tyres(plan).lifeLaps = 40.5)],
    [kept, (plan) => (tyres(plan).arrivalLaps = 0)],
    [kept, (plan) => (tyres(plan).arrivalLaps = null)],
    [kept, (plan) => (tyres(plan).keptLaps = 4)],
    [kept, (plan) => (tyres(plan).issue = "worn")],
    [kept, (plan) => (tyres(plan).path = "x")],
    [kept, (plan) => delete tyres(plan).issue],
    [kept, (plan) => delete second(plan).tyres],
    // what is fixed: true, false or null, and always stated
    [kept, (plan) => (second(plan).fixed.changeTyres = "false")],
    [kept, (plan) => delete second(plan).fixed.changeTyres],
    // a stop with nothing fixed is never to blame
    [blamed, (plan) => (plan.edit.cause.stop = 0)],
    // the plan always says whether the tyres were fixed
    [carried, (plan) => (pit(plan).pinned.changeTyres = 1)],
    [carried, (plan) => delete pit(plan).pinned.changeTyres],
  ];
  for (const [index, [reply, change]] of refused.entries())
    expect(broken(reply, change), `case ${index}`).toBe(false);
  // tyres kept without the mark of «fixed by hand» are not refused: the host
  // never makes such a plan, and a file is not rejected for it
  expect(
    broken(carried, (plan) => (pit(plan).pinned.changeTyres = false)),
  ).toBe(true);
});

function open(scene: string) {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  const opened = send({ method: "strategy.open" }) as { result: Reply };
  const value = opened.result.value as Json;
  const planOf = (answer: unknown) => {
    const reply = answer as { kind: string; result: Reply };
    expect(reply.kind).toBe("response");
    expect(isReply(reply.result)).toBe(true);
    return reply.result.value.plan;
  };
  const act = (method: string, computeId: number, extra = {}) =>
    planOf(send({ method, revision: value.revision, computeId, ...extra }));
  const fix = (computeId: number, index: number, changeTyres: unknown) =>
    act(set.method, computeId, {
      ...set,
      revision: value.revision,
      computeId,
      index,
      changeTyres,
    });
  const recalculate = (computeId: number) => {
    expect(act("strategy.recalculate", computeId).state).toBe("calculating");
    return planOf(send({ method: "strategy.view" }));
  };
  return { send, value, act, fix, recalculate };
}

it("the mock counts the laps of the tyres and keeps what is fixed in the session", () => {
  const { send, value, act, fix, recalculate } = open("strategy-plannedFuji");
  const base = value.plan;
  // stints of 43-42-42-43-42-24 on tyres that last 43 laps: none lasts two
  const laps = base.edit.stops.map((stop: Json) => [
    stop.tyres.lifeLaps,
    stop.tyres.arrivalLaps,
    stop.tyres.keptLaps,
    stop.tyres.issue,
  ]);
  expect(laps).toEqual([
    [43, 43, 85, null],
    [43, 42, 84, null],
    [43, 42, 85, null],
    [43, 43, 85, null],
    [43, 42, 66, null],
  ]);
  const kept = fix(base.computeId, 1, false);
  expect([kept.state, kept.result]).toEqual(["edited", base.result]);
  expect(second(kept).fixed.changeTyres).toBe(false);
  expect(tyres(kept).issue).toBe("beyondLife");
  // the next stop gets them with the laps of two stints, and says nothing of
  // itself: its tyres are not fixed
  expect(kept.edit.stops[2].tyres).toMatchObject({
    arrivalLaps: 84,
    keptLaps: 127,
    issue: null,
  });
  // the document did not move
  const view = (send({ method: "strategy.view" }) as { result: Reply }).result
    .value as Json;
  expect([view.revision, view.dirty]).toEqual([value.revision, value.dirty]);
  // no plan, and the stop that keeps them is to blame
  const none = recalculate(base.computeId);
  expect(none.result.timeline).toBeNull();
  expect(none.edit.cause).toEqual({ kind: "fixedAmountUnreachable", stop: 1 });
  // «Volver todo a automático» takes the tyres back too
  const cleared = act("strategy.clearStopServices", none.computeId);
  for (const stop of cleared.edit.stops)
    expect(stop.fixed.changeTyres).toBeNull();
  expect([cleared.edit.cause, cleared.edit.automatic]).toEqual([null, null]);
  // «change them» fixed by hand is what the plan does anyway: a plan, marked
  fix(none.computeId, 1, true);
  const done = recalculate(none.computeId);
  expect(pit(done)).toMatchObject({
    changeTyres: true,
    pinned: { fuelLiters: false, vePercent: false, changeTyres: true },
  });
  expect(done.result.timeline.pits[0].pinned.changeTyres).toBe(false);
});

it("the mock recalculates with tyres that last: the plan keeps them and says so", () => {
  const { value, act, fix, recalculate } = open("strategy-planned");
  const first = (plan: Json) => plan.result.timeline.pits[0];
  const base = value.plan;
  const { tyres } = base.edit.stops[0];
  expect(tyres.lifeLaps).toBeGreaterThanOrEqual(tyres.keptLaps);
  expect(fix(base.computeId, 0, false).edit.stops[0].tyres).toEqual(tyres);
  const done = recalculate(base.computeId);
  expect(first(done)).toMatchObject({
    changeTyres: false,
    pinned: { changeTyres: true },
  });
  expect([done.edit.cause, done.edit.canReset]).toEqual([null, false]);
  // «Restablecer» after another change returns to this plan, tyres kept
  fix(done.computeId, 0, null);
  expect(act("strategy.resetEdit", done.computeId)).toEqual(done);
  // left to the calculation again, the stop fits new tyres
  fix(done.computeId, 0, null);
  const automatic = recalculate(done.computeId);
  expect(first(automatic)).toMatchObject({
    changeTyres: true,
    pinned: { changeTyres: false },
  });
  // accepting keeps what was fixed
  fix(automatic.computeId, 0, false);
  const again = recalculate(automatic.computeId);
  const accepted = act("strategy.accept", again.computeId);
  expect(first(accepted.accepted).pinned.changeTyres).toBe(true);
});
