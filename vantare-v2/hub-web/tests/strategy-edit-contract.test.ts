import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/strategy.json";
import { isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";

const sample = corpus.ui.find(
  (message) => message.request.method === "strategy.create",
)?.request;
if (sample?.method !== "strategy.create" || !sample.fields)
  throw Error("Missing Strategy creation sample");
const creationFields = sample.fields;

it("keeps new strategy edits in memory until a checked save or discard", () => {
  const host = createMockHost("strategy-empty");
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  expect(send({ method: "strategy.view" })).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
  const empty = send({ method: "strategy.open" });
  if (empty?.kind !== "response" || empty.result.method !== "strategy.open")
    throw Error("Missing open reply");
  const create = {
    ...sample,
    fields: creationFields,
    revision: empty.result.value.revision,
  };
  expect(isRequest(create)).toBe(true);
  expect(isRequest({ ...create, path: "private" })).toBe(false);
  expect(
    send({ ...create, fields: { ...create.fields, name: "" } }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "rejected" },
  });
  const draft = send(create);
  if (draft?.kind !== "response" || draft.result.method !== "strategy.create")
    throw Error("Missing create reply");
  expect(draft.result.value).toMatchObject({
    dirty: true,
    events: [{ name: create.fields.name }],
  });
  expect(send({ method: "strategy.open" })).toMatchObject({
    kind: "failure",
    error: { kind: "strategyDirty" },
  });
  expect(
    send({ method: "strategy.save", revision: empty.result.value.revision }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "strategyConflict", current: draft.result.value },
  });
  expect(
    send({ method: "strategy.save", revision: draft.result.value.revision }),
  ).toMatchObject({
    kind: "response",
    result: { value: { dirty: false } },
  });
  const edited = send({
    method: "strategy.confirm",
    eventId: draft.result.value.activeEventId,
    strategyId: draft.result.value.activeStrategyId,
    revision: draft.result.value.revision,
    fields: { ...create.fields, name: "Changed" },
  });
  if (
    edited?.kind !== "response" ||
    edited.result.method !== "strategy.confirm"
  )
    throw Error("Missing confirmation");
  expect(edited.result.value.events[0]?.name).toBe("Changed");
  expect(
    send({
      method: "strategy.discard",
      revision: edited.result.value.revision,
    }),
  ).toMatchObject({
    kind: "response",
    result: { value: { dirty: false, events: [{ name: create.fields.name }] } },
  });
});
