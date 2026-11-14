import { expect, it } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import { residentOrderReceiptTimeoutMs } from "../src/contract/generated/launcher_resident";
import {
  observeRemoval,
  queueRemoval,
  type RemovalAttempt,
} from "../src/renderer/screens/launcher/resident-removal-model";

function setup() {
  const view: ResidentView = {
    online: true,
    protected: false,
    running: false,
    error: false,
    decision: null,
    registrations: [],
    ownership: { kind: "unknown" },
    execution: {
      instance: "b".repeat(64),
      revisionCheckedLaunch: false,
      checkedAnswer: false,
      checkedControl: false,
      results: { kind: "unsupported" },
      question: null,
      active: null,
      events: [],
      firstRetainedSeq: "1",
    },
  };
  const attempt: RemovalAttempt = queueRemoval(
    {
      target: {
        instance: "b".repeat(64),
        accountGeneration: "a".repeat(64),
        profile: "creator",
        revision: "c".repeat(64),
      },
      cursor: 0n,
      phase: { kind: "sending" },
    },
    "d".repeat(32),
    0,
  );
  if (!view.execution) throw new Error("execution");
  return {
    execution: view.execution,
    view,
    attempt,
    events: view.execution.events,
    request: "d".repeat(32),
  };
}
it("Queued and Accepted do not prove removal; only its matching Finished after receipt does", () => {
  const f = setup();
  expect(observeRemoval(f.attempt, f.view, 1).phase.kind).toBe("queued");
  f.events.push({
    seq: "1",
    kind: {
      kind: "removal-received",
      request: f.request,
      receipt: { kind: "accepted" },
    },
  });
  const accepted = observeRemoval(f.attempt, f.view, 2);
  expect(accepted.phase.kind).toBe("accepted");
  f.events.push({
    seq: "2",
    kind: {
      kind: "removal-finished",
      request: f.request,
      outcome: { kind: "removed", revision: "e".repeat(64) },
    },
  });
  expect(observeRemoval(accepted, f.view, 10000).phase).toEqual({
    kind: "removed",
    revision: "e".repeat(64),
  });
});
it("ignores another request and a Finished without its own acceptance", () => {
  const f = setup();
  f.events.push(
    {
      seq: "1",
      kind: {
        kind: "removal-received",
        request: "f".repeat(32),
        receipt: { kind: "accepted" },
      },
    },
    {
      seq: "2",
      kind: {
        kind: "removal-finished",
        request: f.request,
        outcome: { kind: "removed", revision: "e".repeat(64) },
      },
    },
  );
  expect(observeRemoval(f.attempt, f.view, 1).phase.kind).toBe("queued");
});
it.each([
  "owned-live",
  "ownership-unknown",
  "write-conflict",
  "io",
  "account-changed",
] as const)("shows typed rejection %s", (reason) => {
  const f = setup();
  f.events.push({
    seq: "1",
    kind: {
      kind: "removal-received",
      request: f.request,
      receipt: { kind: "rejected", reason },
    },
  });
  expect(observeRemoval(f.attempt, f.view, 1).phase).toEqual({
    kind: "rejected",
    reason,
  });
});
it("keeps a failed write distinct from a removed profile", () => {
  const f = setup();
  f.events.push(
    {
      seq: "1",
      kind: {
        kind: "removal-received",
        request: f.request,
        receipt: { kind: "accepted" },
      },
    },
    {
      seq: "2",
      kind: {
        kind: "removal-finished",
        request: f.request,
        outcome: { kind: "failed", reason: "io" },
      },
    },
  );
  expect(observeRemoval(f.attempt, f.view, 1).phase).toEqual({
    kind: "rejected",
    reason: "io",
  });
});
it.each(["gap", "restart", "offline", "timeout"] as const)(
  "marks %s Unknown without a fabricated success",
  (kind) => {
    const f = setup();
    if (kind === "gap") f.execution.firstRetainedSeq = "3";
    if (kind === "restart") f.execution.instance = "e".repeat(64);
    if (kind === "offline") f.view.online = false;
    expect(
      observeRemoval(
        f.attempt,
        f.view,
        kind === "timeout" ? residentOrderReceiptTimeoutMs : 1,
      ).phase.kind,
    ).toBe("unknown");
  },
);
it("uses exact event sequences beyond JavaScript Number precision", () => {
  const f = setup();
  f.attempt.cursor = 9007199254740992n;
  f.execution.firstRetainedSeq = "9007199254740992";
  f.events.push({
    seq: "9007199254740993",
    kind: {
      kind: "removal-received",
      request: f.request,
      receipt: { kind: "accepted" },
    },
  });
  expect(observeRemoval(f.attempt, f.view, 1).phase.kind).toBe("accepted");
});
it("never turns terminal success or rejection into Unknown on disconnect", () => {
  const f = setup();
  for (const phase of [
    { kind: "removed", revision: "e".repeat(64) },
    { kind: "rejected", reason: "io" },
  ] as const)
    expect(
      observeRemoval({ ...f.attempt, phase }, undefined, 10000).phase,
    ).toEqual(phase);
});
