import { expect, it } from "vitest";
import type {
  ResidentExecutionEvent,
  ResidentView,
} from "../src/contract/generated/contract";
import {
  type ControlAttempt,
  observeControl,
  queuedControl,
} from "../src/renderer/screens/launcher/resident-control-model";

const request = "d".repeat(32);
const attempt: ControlAttempt = {
  kind: "rehearse",
  target: {
    instance: "b".repeat(64),
    accountGeneration: "a".repeat(64),
    profile: "creator",
    revision: "c".repeat(64),
  },
  cursor: 0n,
  phase: { kind: "sending" },
};
function view(events: ResidentExecutionEvent[]): ResidentView {
  return {
    online: true,
    protected: false,
    running: true,
    error: false,
    decision: null,
    registrations: [],
    execution: {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: true,
      results: { kind: "unsupported" },
      active: null,
      question: null,
      firstRetainedSeq: "1",
      events,
    },
  };
}
const accepted: ResidentExecutionEvent = {
  seq: "1",
  kind: {
    kind: "order-received",
    request,
    receipt: { kind: "accepted", run: "1" },
  },
};
it.each(["unknown-run", "no-failed-steps"] as const)(
  "L54 treats retry-only rejection %s as Unknown",
  (reason) => {
    const state = observeControl(
      queuedControl(attempt, request, 0),
      view([
        {
          seq: "1",
          kind: {
            kind: "order-received",
            request,
            receipt: { kind: "rejected", reason },
          },
        },
      ]),
      1,
    );
    expect(state.phase.kind).toBe("unknown");
  },
);
it("Queued does not imply Accepted, and Accepted has no chain deadline", () => {
  const queued = queuedControl(attempt, request, 0);
  expect(observeControl(queued, view([]), 1).phase.kind).toBe("queued");
  const state = observeControl(queued, view([accepted]), 2);
  expect(state.phase).toEqual({ kind: "accepted", request, run: "1" });
  expect(observeControl(state, view([accepted]), 999999).phase.kind).toBe(
    "accepted",
  );
  expect(
    observeControl(
      state,
      view([
        accepted,
        {
          seq: "2",
          kind: { kind: "finished", run: "1", outcome: { kind: "completed" } },
        },
      ]),
      999999,
    ).phase,
  ).toEqual({ kind: "finished", outcome: { kind: "completed" } });
});
it.each(["busy", "no-steps", "document-unavailable", "start-failed"] as const)(
  "preserves rejection %s",
  (reason) => {
    expect(
      observeControl(
        queuedControl(attempt, request, 0),
        view([
          {
            seq: "1",
            kind: {
              kind: "order-received",
              request,
              receipt: { kind: "rejected", reason },
            },
          },
        ]),
        1,
      ).phase,
    ).toEqual({ kind: "rejected", reason });
  },
);
it("ignores a foreign receipt and Finished without its own acceptance", () => {
  expect(
    observeControl(
      queuedControl(attempt, request, 0),
      view([
        {
          seq: "1",
          kind: {
            kind: "order-received",
            request: "e".repeat(32),
            receipt: { kind: "accepted", run: "1" },
          },
        },
        {
          seq: "2",
          kind: { kind: "finished", run: "1", outcome: { kind: "completed" } },
        },
      ]),
      1,
    ).phase.kind,
  ).toBe("queued");
});
it("no receipt, gap, restart and loss of subscription are Unknown", () => {
  const queued = queuedControl(attempt, request, 0);
  expect(observeControl(queued, view([]), 5000).phase.kind).toBe("unknown");
  expect(observeControl(queued, undefined, 1).phase.kind).toBe("unknown");
  const gap = view([]);
  if (gap.execution) gap.execution.firstRetainedSeq = "2";
  expect(observeControl(queued, gap, 1).phase.kind).toBe("unknown");
  const reboot = view([]);
  if (reboot.execution) reboot.execution.instance = "f".repeat(64);
  expect(observeControl(queued, reboot, 1).phase.kind).toBe("unknown");
});
it("does not accept cancellation of a different run", () => {
  const cancel: ControlAttempt = {
    kind: "cancel",
    target: {
      instance: "b".repeat(64),
      accountGeneration: "a".repeat(64),
      run: "9007199254740993",
      revision: "c".repeat(64),
    },
    cursor: 0n,
    phase: { kind: "sending" },
  };
  expect(
    observeControl(queuedControl(cancel, request, 0), view([accepted]), 1).phase
      .kind,
  ).toBe("unknown");
});
it("cleanup failure stays a failure rather than successful cancellation", () => {
  const state = observeControl(
    queuedControl(attempt, request, 0),
    view([
      accepted,
      {
        seq: "2",
        kind: {
          kind: "finished",
          run: "1",
          outcome: { kind: "failed", reason: "cleanup-failed" },
        },
      },
    ]),
    1,
  );
  expect(state.phase).toEqual({
    kind: "finished",
    outcome: { kind: "failed", reason: "cleanup-failed" },
  });
});
