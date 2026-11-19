import { describe, expect, it } from "vitest";
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

// The QA scenes of what goes wrong when the plan is exported (#2715): the four of
// the export and the four of E4a that an export can meet too.
const faults = [
  ["exportInUse", "strategyFileInUse"],
  ["exportNotCsv", "strategyExportNotCsv"],
  ["fileUnavailable", "strategyFileUnavailable"],
  ["fileTooLarge", "strategyFileTooLarge"],
  ["pickExpired", "strategyPickExpired"],
  ["targetExists", "strategyTargetExists"],
] as const;

describe.each(faults)("the scene %s", (scene, kind) => {
  it(`fails the file export with ${kind} and leaves the text export alone`, () => {
    const { send, value, host } = planned(`strategy-${scene}`);
    const request = {
      method: "strategy.exportFile",
      revision: value.revision,
      target: proposal(value),
    };
    // without the main process the dialog answers at once
    const direct = send(request);
    expect(isHostMessage(direct)).toBe(true);
    expect(direct).toMatchObject({ kind: "failure", error: { kind } });
    // with it, the failure is the final answer after the ticket; a cancelled
    // dialog is only that, whatever the scene
    expect(send(request, 0x80000000).result.value).toMatchObject({
      kind: "ticket",
    });
    const done = host({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: "D:/x/plan.csv",
    }) as Json;
    expect(isHostMessage(done)).toBe(true);
    expect(done).toMatchObject({ kind: "failure", error: { kind } });
    send(request, 0x80000001);
    expect(
      host({ kind: "pickedStrategyFile", id: 0x80000001, path: null }),
    ).toMatchObject({ result: { value: { kind: "cancelled" } } });
    // the text never opens a dialog
    const text = send({
      method: "strategy.export",
      revision: value.revision,
      target: proposal(value),
    });
    expect(text.result.value.text).toMatch(/^PROPUESTA SIN ACEPTAR\n/);
  });
});

describe.each([
  ["exportBusy", "busy"],
  ["nothingToExport", "strategyNothingToExport"],
] as const)("the scene %s", (scene, kind) => {
  it(`refuses both exports with ${kind}, and never takes the ticket`, () => {
    const { send, value, host } = planned(`strategy-${scene}`);
    for (const method of ["strategy.export", "strategy.exportFile"]) {
      for (const own of [undefined, 0x80000000]) {
        const refused = send(
          { method, revision: value.revision, target: proposal(value) },
          own,
        );
        expect(isHostMessage(refused)).toBe(true);
        expect(refused).toMatchObject({ kind: "failure", error: { kind } });
      }
    }
    // a stale revision is still the conflict of the plan, before anything else
    expect(
      send({
        method: "strategy.export",
        revision: "0".repeat(64),
        target: proposal(value),
      }),
    ).toMatchObject({ error: { kind: "strategyConflict" } });
    // no ticket was kept: the dialog has nothing to answer
    expect(
      host({ kind: "pickedStrategyFile", id: 0x80000000, path: null }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
  });
});

it("plays the faults of the export on Opus' Fuji plan, already calculated", () => {
  const host = createMockHost("strategy-plannedFujiExportInUse");
  const send = (request: unknown) =>
    host({ kind: "request", id: 1, request }) as Json;
  const opened = send({ method: "strategy.open" }).result.value;
  expect(opened.plan.state).toBe("calculated");
  expect(opened.plan.result.metrics.pitCount).toBe(5);
  expect(
    send({
      method: "strategy.exportFile",
      revision: opened.revision,
      target: proposal(opened),
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "strategyFileInUse" } });
  // another scene of the same family is a different fault
  const busy = createMockHost("strategy-plannedFujiExportBusy");
  const first = busy({
    kind: "request",
    id: 1,
    request: { method: "strategy.open" },
  }) as Json;
  expect(
    busy({
      kind: "request",
      id: 2,
      request: {
        method: "strategy.export",
        revision: first.result.value.revision,
        target: proposal(first.result.value),
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "busy" } });
});

it("plays the faults of the export on the accepted plan of Opus' Fuji case too", () => {
  const host = createMockHost("strategy-acceptedFujiFileUnavailable");
  const send = (request: unknown) =>
    host({ kind: "request", id: 1, request }) as Json;
  const opened = send({ method: "strategy.open" }).result.value;
  // the file already holds the accepted plan, and no proposal is on view
  expect(opened.plan.accepted.state).toBe("accepted");
  expect(opened.plan.result).toBeNull();
  expect(
    send({
      method: "strategy.exportFile",
      revision: opened.revision,
      target: { kind: "accepted" },
    }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "strategyFileUnavailable" },
  });
  // and the text still goes
  expect(
    send({
      method: "strategy.export",
      revision: opened.revision,
      target: { kind: "accepted" },
    }).result.value.text,
  ).toMatch(/^PLAN ACEPTADO · /);
});
