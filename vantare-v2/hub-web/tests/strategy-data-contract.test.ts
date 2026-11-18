// E4-datos: `hasInputs` in the event summary, `form` in the view and `inputs` in
// `strategy.create`. The document keeps confirmed inputs, not a plan: the flag
// says a plan can be calculated, never that one exists.
import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import type {
  StrategyFields,
  StrategySolverFields,
  StrategyView,
} from "../src/contract/generated/strategy";
import { strategyLimits } from "../src/contract/generated/strategy";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";
import { requests } from "./strategy-corpus";

type Loose = Record<string, unknown>;

const creates = requests.filter(
  (request) => request.method === "strategy.create",
);
const plain = creates.find((request) => request.inputs === null);
const full = creates.find((request) => request.inputs !== null);
if (!plain || !full?.inputs) throw Error("Missing Strategy creation samples");
const inputs: StrategySolverFields = full.inputs;
const fields: StrategyFields = full.fields;

function session(scene: string) {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  const view = (request: unknown): StrategyView => {
    const reply = send(request);
    if (reply?.kind !== "response") throw Error(JSON.stringify(reply));
    return (reply.result as { value: unknown }).value as StrategyView;
  };
  const failure = (request: unknown) => {
    const reply = send(request);
    if (reply?.kind !== "failure")
      throw Error(`${JSON.stringify(request)} -> ${JSON.stringify(reply)}`);
    return reply.error;
  };
  const open = () => view({ method: "strategy.open" });
  const create = (
    revision: string,
    changes: Loose = {},
    base: Loose = full as Loose,
  ) => ({ ...base, revision, ...changes });
  return { send, view, failure, open, create };
}

// How the host spells what it reads: the confirmed inputs as plain numbers, the
// reserve laps (kept by the event) as the document stores a number: «1.0».
const spell = (value: string) =>
  Number.isInteger(Number(value))
    ? `${Number(value)}.0`
    : String(Number(value));
const hostInputs = (value: StrategySolverFields): StrategySolverFields => ({
  ...value,
  reserveLaps: spell(value.reserveLaps),
});

const blank = (value: StrategySolverFields) =>
  Object.fromEntries(Object.keys(value).map((key) => [key, ""]));

// ---- the contract: the corpus and the validators ----

it("the corpus holds a create with the inputs and a create without them", () => {
  for (const request of creates) expect(isRequest(request)).toBe(true);
  expect(plain.inputs).toBeNull();
  expect(full.inputs).toEqual(inputs);
  // the inputs replace the loose pair: they never travel together
  expect(full.basePaceSeconds).toBeNull();
  expect(full.fuelPerLapLiters).toBeNull();
});

it("a create has the key inputs, with the exact 15 texts of compute or null", () => {
  const { inputs: _omitted, ...without } = full;
  expect(isRequest(without)).toBe(false);
  expect(isRequest({ ...full, inputs: null })).toBe(true);
  const keys = Object.keys(inputs) as (keyof StrategySolverFields)[];
  expect(keys).toHaveLength(15);
  for (const key of keys) {
    const { [key]: _removed, ...missing } = inputs;
    expect(isRequest({ ...full, inputs: missing }), `missing ${key}`).toBe(
      false,
    );
    expect(
      isRequest({ ...full, inputs: { ...inputs, [key]: 7 } }),
      `number ${key}`,
    ).toBe(false);
    expect(
      isRequest({
        ...full,
        inputs: { ...inputs, [key]: "x".repeat(strategyLimits.text + 1) },
      }),
      `long ${key}`,
    ).toBe(false);
    expect(
      isRequest({
        ...full,
        inputs: { ...inputs, [key]: "x".repeat(strategyLimits.text) },
      }),
      `limit ${key}`,
    ).toBe(true);
    expect(
      isRequest({ ...full, inputs: { ...inputs, [key]: "a\u0007" } }),
      `control ${key}`,
    ).toBe(false);
  }
  for (const extra of [{ path: "C:\\x" }, { dataDir: "x" }, { file: "x" }])
    expect(isRequest({ ...full, ...extra })).toBe(false);
  expect(isRequest({ ...full, inputs: { ...inputs, extra: "x" } })).toBe(false);
  expect(isRequest({ ...full, inputs: [] })).toBe(false);
  expect(isRequest({ ...full, inputs: "90" })).toBe(false);
});

it("inputs never travel together with the loose pace or consumption", () => {
  for (const loose of [
    { basePaceSeconds: "90.5" },
    { fuelPerLapLiters: "1.83" },
    { basePaceSeconds: "90.5", fuelPerLapLiters: "1.83" },
    { basePaceSeconds: "" },
  ])
    expect(isRequest({ ...full, ...loose })).toBe(false);
  // the pair alone is still a valid create
  expect(
    isRequest({
      ...plain,
      basePaceSeconds: "90.5",
      fuelPerLapLiters: "1.83",
      inputs: null,
    }),
  ).toBe(true);
});

const views = corpus.host
  .map((message) => message.result)
  .filter(
    (result): result is NonNullable<typeof result> =>
      !!result && "value" in result && "form" in (result.value as object),
  );

it("every sample view has the flag in each event and a form or null", () => {
  expect(views.length).toBeGreaterThan(10);
  for (const result of views) {
    expect(isReply(result as unknown as Loose)).toBe(true);
    const value = result.value as unknown as StrategyView;
    expect(
      value.events.every((event) => typeof event.hasInputs === "boolean"),
    ).toBe(true);
  }
  expect(
    views.some((r) => (r.value as unknown as StrategyView).form === null),
  ).toBe(true);
  expect(
    views.some((r) => (r.value as unknown as StrategyView).form !== null),
  ).toBe(true);
  // an event with no inputs, whose form holds empty inputs apart from pace and consumption
  const noInputs = views
    .map((r) => r.value as unknown as StrategyView)
    .find((v) => v.events[0]?.hasInputs === false && v.form);
  expect(noInputs?.form?.inputs.raceLaps).toBe("");
  expect(noInputs?.form?.inputs.basePaceSeconds).not.toBe("");
});

const sampleView = () =>
  structuredClone(
    corpus.host.find((m) => m.result?.method === "strategy.open")?.result
      ?.value,
  ) as unknown as Loose;
const reply = (value: Loose) => ({ method: "strategy.open", value });

it("a view needs the flag as a boolean and the key form", () => {
  const ready = sampleView();
  expect(isReply(reply(ready))).toBe(true);
  const { form: _form, ...noForm } = ready;
  expect(isReply(reply(noForm))).toBe(false);
  for (const flag of [undefined, null, 1, "true"]) {
    const bad = structuredClone(ready) as { events: Loose[] };
    if (bad.events[0]) bad.events[0].hasInputs = flag;
    expect(isReply(reply(bad as unknown as Loose)), `${flag}`).toBe(false);
  }
  const unknown = structuredClone(ready) as { events: Loose[] };
  if (unknown.events[0]) unknown.events[0].hasPlan = true;
  expect(isReply(reply(unknown as unknown as Loose))).toBe(false);
});

it("a form is the 13 fields and the 15 inputs as texts within the limit", () => {
  const ready = sampleView() as { form: { fields: Loose; inputs: Loose } };
  expect(Object.keys(ready.form)).toEqual(["fields", "inputs"]);
  expect(Object.keys(ready.form.fields)).toHaveLength(13);
  expect(Object.keys(ready.form.inputs)).toHaveLength(15);
  const set = (path: "fields" | "inputs", key: string, value: unknown) => {
    const copy = structuredClone(ready);
    copy.form[path][key] = value;
    return copy as unknown as Loose;
  };
  for (const path of ["fields", "inputs"] as const)
    for (const key of Object.keys(ready.form[path])) {
      expect(
        isReply(reply(set(path, key, "x".repeat(strategyLimits.text)))),
        key,
      ).toBe(true);
      expect(
        isReply(reply(set(path, key, "x".repeat(strategyLimits.text + 1)))),
        key,
      ).toBe(false);
      expect(isReply(reply(set(path, key, "a\u0007"))), key).toBe(false);
      expect(isReply(reply(set(path, key, 1))), key).toBe(false);
    }
  const extra = structuredClone(ready);
  (extra.form as Loose).path = "C:\\x";
  expect(isReply(reply(extra as unknown as Loose))).toBe(false);
  const short = structuredClone(ready);
  delete short.form.inputs.serviceMode;
  expect(isReply(reply(short as unknown as Loose))).toBe(false);
});

it("a form exists only with an active event and variant, and the error views follow", () => {
  const ready = sampleView() as Loose;
  for (const lost of [{ activeEventId: null }, { activeStrategyId: null }])
    expect(isReply(reply({ ...ready, ...lost })), JSON.stringify(lost)).toBe(
      false,
    );
  expect(
    isReply(
      reply({
        ...ready,
        activeEventId: null,
        activeStrategyId: null,
        form: null,
      }),
    ),
  ).toBe(true);
  // an active variant may have no form: a text over the limit in the document
  expect(isReply(reply({ ...ready, form: null }))).toBe(true);
  const conflict = { kind: "strategyConflict", current: ready };
  expect(isError(conflict)).toBe(true);
  const { form: _form, ...stale } = ready;
  expect(isError({ kind: "strategyConflict", current: stale })).toBe(false);
});

// ---- the mock imitates the host ----

it("a document with no event has no form; one with events has the form of the active variant", () => {
  const empty = session("strategy-empty").open();
  expect(empty).toMatchObject({ events: [], form: null });
  const ready = session("strategy-ready").open();
  expect(ready.events[0]).toMatchObject({ hasInputs: true });
  expect(ready.form?.fields.name).toBe(ready.events[0]?.name);
  expect(ready.form?.inputs.raceLaps).not.toBe("");
});

it("an event without inputs has its fields and empty inputs (QA scene)", () => {
  const view = session("strategy-noInputs").open();
  expect(view.events[0]?.hasInputs).toBe(false);
  expect(view.form?.fields.name).toBe(view.events[0]?.name);
  expect(view.form?.inputs).toMatchObject({
    raceLaps: "",
    tyreLifeLaps: "",
    serviceMode: "",
  });
});

it("a plan from the mock keeps the form and the flag of its event (QA scene)", () => {
  const view = session("strategy-planned").open();
  expect(view.plan.state).toBe("calculated");
  expect(view.events[0]?.hasInputs).toBe(true);
  expect(view.form).not.toBeNull();
});

it("create without inputs keeps the fields and no inputs; with them it keeps all of them", () => {
  const first = session("strategy-empty");
  const empty = first.open();
  const created = first.view(
    first.create(empty.revision, {
      inputs: null,
      basePaceSeconds: "90.472",
      fuelPerLapLiters: "1.83",
    }),
  );
  expect(created).toMatchObject({ dirty: true });
  expect(created.events[0]?.hasInputs).toBe(false);
  expect(created.form?.fields.name).toBe(fields.name.trim());
  expect(created.form?.inputs).toMatchObject({
    ...blank(inputs),
    basePaceSeconds: "90.472",
    fuelPerLapLiters: "1.83",
  });
  expect(isReply({ method: "strategy.create", value: created })).toBe(true);

  const second = session("strategy-empty");
  const start = second.open();
  const withInputs = second.view(second.create(start.revision));
  expect(withInputs).toMatchObject({ dirty: true });
  expect(withInputs.events[0]?.hasInputs).toBe(true);
  expect(withInputs.form).toEqual({
    fields: expect.objectContaining({ name: fields.name.trim() }),
    inputs: hostInputs(inputs),
  });
  expect(withInputs.plan.state).toBe("uncalculated");
  expect(isReply({ method: "strategy.create", value: withInputs })).toBe(true);
  // the view says the same as the creation did
  expect(second.view({ method: "strategy.view" }).form).toEqual(
    withInputs.form,
  );
});

it("inputs that do not validate create nothing and keep the form", () => {
  const host = session("strategy-empty");
  const empty = host.open();
  const bad = (change: Partial<StrategySolverFields>) =>
    host.create(empty.revision, { inputs: { ...inputs, ...change } });
  for (const [case_, request] of Object.entries({
    "zero pace": bad({ basePaceSeconds: "0" }),
    "pace text": bad({ basePaceSeconds: "NaN" }),
    "laps text": bad({ raceLaps: "diez" }),
    "zero laps": bad({ raceLaps: "0" }),
    "fraction laps": bad({ raceLaps: "2.5" }),
    "negative fuel": bad({ fuelPerLapLiters: "-1" }),
    "empty step": bad({ fuelStep: "" }),
    "unknown mode": bad({ serviceMode: "other" }),
    "not dry": host.create(empty.revision, {
      fields: { ...fields, variantMode: "wet" },
    }),
    "no name": host.create(empty.revision, { fields: { ...fields, name: "" } }),
  })) {
    expect(host.failure(request), case_).toEqual({ kind: "rejected" });
    expect(host.view({ method: "strategy.view" }), case_).toEqual(empty);
  }
  // the loose pair with inputs never reaches the host: the port refuses it
  for (const loose of [
    { basePaceSeconds: "90.5" },
    { fuelPerLapLiters: "1.83" },
  ])
    expect(host.send(host.create(empty.revision, loose))).toBeNull();
});

it("create keeps the usual guards: a stale revision, an unsaved draft", () => {
  const host = session("strategy-empty");
  const empty = host.open();
  const draft = host.view(host.create(empty.revision));
  expect(host.failure(host.create(draft.revision))).toEqual({
    kind: "strategyDirty",
  });
  const other = session("strategy-empty");
  other.open();
  expect(other.failure(other.create("0".repeat(64)))).toMatchObject({
    kind: "strategyConflict",
    current: { form: null },
  });
  const scene = session("strategy-createRejected");
  const start = scene.open();
  expect(scene.failure(scene.create(start.revision))).toEqual({
    kind: "rejected",
  });
});

it("the form follows create, confirm and compute and returns to the saved one on discard", () => {
  const host = session("strategy-empty");
  const empty = host.open();
  const created = host.view(host.create(empty.revision));
  const saved = host.view({
    method: "strategy.save",
    revision: created.revision,
  });
  expect(saved.form).toEqual(created.form);

  const edited = host.view({
    method: "strategy.confirm",
    eventId: saved.activeEventId,
    strategyId: saved.activeStrategyId,
    revision: saved.revision,
    fields: { ...fields, name: "Changed", team: "Local team" },
  });
  expect(edited.form?.fields).toMatchObject({
    name: "Changed",
    team: "Local team",
  });
  expect(edited.form?.inputs).toEqual(hostInputs(inputs));

  expect(
    host.view({ method: "strategy.discard", revision: edited.revision }).form,
  ).toEqual(saved.form);

  const confirmed = host.view({
    method: "strategy.confirm",
    eventId: saved.activeEventId,
    strategyId: saved.activeStrategyId,
    revision: saved.revision,
    fields: { ...fields, name: "Changed" },
  });
  const next = { ...inputs, raceLaps: "12", basePaceSeconds: "91.25" };
  host.view({
    method: "strategy.compute",
    eventId: confirmed.activeEventId,
    strategyId: confirmed.activeStrategyId,
    revision: confirmed.revision,
    form: { fields: { ...fields, name: "Computed" }, inputs: next },
  });
  const computed = host.view({ method: "strategy.view" });
  expect(computed.plan.state).toBe("calculated");
  expect(computed.form?.fields.name).toBe("Computed");
  expect(computed.form?.inputs).toEqual(hostInputs(next));
  expect(computed.events[0]?.hasInputs).toBe(true);
});

it("a calculation that confirms inputs marks an event created without them", () => {
  const host = session("strategy-empty");
  const empty = host.open();
  const created = host.view(host.create(empty.revision, { inputs: null }));
  expect(created.events[0]?.hasInputs).toBe(false);
  host.view({
    method: "strategy.compute",
    eventId: created.activeEventId,
    strategyId: created.activeStrategyId,
    revision: created.revision,
    form: { fields, inputs },
  });
  const computed = host.view({ method: "strategy.view" });
  expect(computed.events[0]?.hasInputs).toBe(true);
  expect(computed.form?.inputs).toEqual(hostInputs(inputs));
});

it("selecting another variant or event shows its own form", () => {
  const host = session("strategy-ready");
  const opened = host.open();
  const other = host.view({
    method: "strategy.select",
    eventId: "event-1",
    strategyId: "variant-2",
    revision: opened.revision,
  });
  expect(other.activeStrategyId).toBe("variant-2");
  expect(other.form?.fields.variantName).toBe(
    opened.events[0]?.strategies[1]?.name,
  );
  expect(isReply({ method: "strategy.select", value: other })).toBe(true);
});

it("every reply of the mock passes the strict validator, with and without a form", () => {
  for (const scene of [
    "strategy-empty",
    "strategy-ready",
    "strategy-noInputs",
    "strategy-planned",
    "strategy-recovered",
    "strategy-protected",
    "strategy-importedLegacy",
  ]) {
    const host = session(scene);
    const reply = host.send({ method: "strategy.open" });
    if (reply?.kind !== "response") throw Error(scene);
    expect(isReply(reply.result as unknown as Loose), scene).toBe(true);
  }
});

// ---- the mock says what the host says ----

it("a variant with no stored inputs has empty inputs, even when another variant of its event has them", () => {
  const host = session("strategy-ready");
  const opened = host.open();
  expect(opened.form?.inputs.raceLaps).not.toBe("");
  const other = host.view({
    method: "strategy.select",
    eventId: "event-1",
    strategyId: "variant-2",
    revision: opened.revision,
  });
  expect(other.form?.inputs).toMatchObject({
    raceLaps: "",
    tyreLifeLaps: "",
    reserveLaps: "",
    serviceMode: "",
    // the pace and consumption belong to the event
    basePaceSeconds: opened.form?.inputs.basePaceSeconds,
    fuelPerLapLiters: opened.form?.inputs.fuelPerLapLiters,
  });
});

it("stored inputs that read but do not validate fill the form and leave the flag down (QA scene)", () => {
  const view = session("strategy-invalidInputs").open();
  expect(view.events[0]?.hasInputs).toBe(false);
  expect(view.form?.inputs).toMatchObject({
    raceLaps: "0",
    serviceMode: "parallel",
  });
  expect(isReply({ method: "strategy.view", value: view })).toBe(true);
});

it("create writes what the host writes: defaults, spellings and trimmed texts", () => {
  const host = session("strategy-empty");
  const empty = host.open();
  const created = host.view(
    host.create(empty.revision, {
      fields: {
        ...fields,
        name: "  Fuji  ",
        variantName: "  ",
        fuelCapacityLiters: "82",
        pitTransitSeconds: "25",
        team: " Local ",
      },
      inputs: { ...inputs, fuelPerLapLiters: "1.830", reserveLaps: "1" },
    }),
  );
  expect(created.events[0]?.strategies[0]?.name).toBe("Base");
  expect(created.form?.fields).toMatchObject({
    name: "Fuji",
    team: "Local",
    variantName: "Base",
    variantMode: "dry",
    durationMinutes: "90",
    fuelCapacityLiters: "82.0",
    pitTransitSeconds: "25.0",
  });
  expect(created.form?.inputs).toMatchObject({
    fuelPerLapLiters: "1.83",
    raceLaps: "3",
    veCapacityPercent: "100",
    reserveLaps: "1.0",
  });
  // without inputs an empty mode is «dry», and the loose pair is the event's pace
  const other = session("strategy-empty");
  const start = other.open();
  const loose = other.view(
    other.create(start.revision, {
      fields: { ...fields, variantMode: "" },
      inputs: null,
      basePaceSeconds: "90",
      fuelPerLapLiters: "1.830",
    }),
  );
  expect(loose.form?.fields.variantMode).toBe("dry");
  expect(loose.form?.inputs).toMatchObject({
    basePaceSeconds: "90.0",
    fuelPerLapLiters: "1.83",
    raceLaps: "",
  });
});

it("a full collection answers the checks of the inputs first and its limit last", () => {
  const host = session("strategy-empty");
  let view = host.open();
  for (let index = 0; index < 32; index++) {
    view = host.view(host.create(view.revision, { inputs: null }));
    view = host.view({ method: "strategy.save", revision: view.revision });
  }
  expect(view.events).toHaveLength(32);
  const bad = host.create(view.revision, {
    inputs: { ...inputs, raceLaps: "0" },
  });
  expect(host.failure(bad)).toEqual({ kind: "rejected" });
  expect(host.failure(host.create(view.revision))).toEqual({
    kind: "strategyInvalidText",
  });
});
