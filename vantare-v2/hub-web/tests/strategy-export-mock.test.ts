import { expect, it } from "vitest";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { requestOf } from "./strategy-corpus";

// biome-ignore lint/suspicious/noExplicitAny: loose probing of the wire shape
type Json = any;

const compute = requestOf("strategy.compute");
if (compute?.method !== "strategy.compute")
  throw Error("Missing Strategy calculation sample");

function planned(scene = "strategy-ready") {
  const host = createMockHost(scene);
  let id = 0;
  const send = (request: unknown, own?: number) =>
    host({ kind: "request", id: own ?? ++id, request }) as Json;
  send({ method: "strategy.open" });
  send(compute);
  const done = send({ method: "strategy.view" });
  if (done?.kind !== "response") throw Error("Missing the calculated plan");
  return { send, value: done.result.value as Json, host };
}

const proposal = (value: Json) => ({
  kind: "proposal",
  computeId: value.plan.computeId,
});

it("answers the text of the proposal, and of the accepted plan once there is one", () => {
  const { send, value } = planned();
  const text = send({
    method: "strategy.export",
    revision: value.revision,
    target: proposal(value),
  });
  expect(isHostMessage(text)).toBe(true);
  expect(text.result.value.text).toMatch(/^PROPUESTA SIN ACEPTAR\n/);
  // nothing accepted yet
  const none = send({
    method: "strategy.export",
    revision: value.revision,
    target: { kind: "accepted" },
  });
  expect(none).toMatchObject({
    kind: "failure",
    error: { kind: "strategyNothingToExport" },
  });
  const accepted = send({
    method: "strategy.accept",
    revision: value.revision,
    computeId: value.plan.computeId,
  }).result.value;
  const kept = send({
    method: "strategy.export",
    revision: accepted.revision,
    target: { kind: "accepted" },
  });
  expect(isHostMessage(kept)).toBe(true);
  expect(kept.result.value.text).toMatch(/^PLAN ACEPTADO · /);
});

it("refuses an old revision or another calculation with the current view", () => {
  const { send, value } = planned();
  for (const request of [
    {
      method: "strategy.export",
      revision: "0".repeat(64),
      target: proposal(value),
    },
    {
      method: "strategy.exportFile",
      revision: value.revision,
      target: { kind: "proposal", computeId: value.plan.computeId + 1 },
    },
  ]) {
    const failure = send(request);
    expect(failure.kind).toBe("failure");
    expect(failure.error.kind).toBe("strategyConflict");
    expect(isHostMessage(failure)).toBe(true);
  }
});

it("plays the dialog at once for the renderer and through a ticket for the main process", () => {
  const { send, value, host } = planned();
  const request = {
    method: "strategy.exportFile",
    revision: value.revision,
    target: proposal(value),
  };
  // without the main process: the dialog answers at once with a name only
  const direct = send(request);
  expect(isHostMessage(direct)).toBe(true);
  expect(direct.result.value).toEqual({
    kind: "saved",
    file: { name: expect.stringMatching(/\.csv$/) },
  });
  // with it: a ticket, then the trusted answer of the dialog
  const ticket = send(request, 0x80000000);
  expect(ticket.result.value).toMatchObject({ kind: "ticket" });
  expect(send(request, 0x80000001)).toMatchObject({
    kind: "failure",
    error: { kind: "busy" },
  });
  const done = host({
    kind: "pickedStrategyFile",
    id: 0x80000000,
    path: "D:/x/plan.csv",
  }) as Json;
  expect(isHostMessage(done)).toBe(true);
  expect(done.result.value).toEqual({
    kind: "saved",
    file: { name: "plan.csv" },
  });
  // a path that is not a CSV is refused, and a cancelled dialog is only that
  send(request, 0x80000002);
  expect(
    host({
      kind: "pickedStrategyFile",
      id: 0x80000002,
      path: "D:/x/plan.json",
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "strategyExportNotCsv" } });
  send(request, 0x80000003);
  expect(
    host({ kind: "pickedStrategyFile", id: 0x80000003, path: null }),
  ).toMatchObject({ result: { value: { kind: "cancelled" } } });
});
