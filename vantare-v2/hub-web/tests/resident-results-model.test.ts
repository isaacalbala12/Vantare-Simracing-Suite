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
  kind: "retry",
  target: {
    instance: "b".repeat(64),
    accountGeneration: "a".repeat(64),
    run: "9007199254740992",
    profile: "creator",
    revision: "c".repeat(64),
    scope: "all",
  },
  cursor: 3n,
  phase: { kind: "sending" },
};
function view(events: ResidentExecutionEvent[]): ResidentView {
  return {
    ownership: { kind: "unsupported" },
    online: true,
    protected: false,
    running: true,
    error: false,
    decision: null,
    ownership: { kind: "unsupported" },
    registrations: [],
    execution: {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: false,
      checkedControl: false,
      results: { kind: "unknown" },
      active: {
        run: "9007199254740993",
        revision: "c".repeat(64),
        accountGeneration: "a".repeat(64),
      },
      question: null,
      events,
      firstRetainedSeq: "4",
    },
  };
}
const accepted: ResidentExecutionEvent = {
  seq: "4",
  kind: {
    kind: "order-received",
    request,
    receipt: { kind: "accepted", run: "9007199254740993" },
  },
};
it("correlates a new retry run using string ids, and only its Finished is terminal", () => {
  const queued = queuedControl(attempt, request, 0);
  expect(observeControl(queued, view([accepted]), 1).phase.kind).toBe(
    "accepted",
  );
  const other: ResidentExecutionEvent = {
    seq: "5",
    kind: {
      kind: "finished",
      run: attempt.target.run,
      outcome: { kind: "completed" },
    },
  };
  expect(observeControl(queued, view([accepted, other]), 1).phase.kind).toBe(
    "accepted",
  );
  const terminal: ResidentExecutionEvent = {
    seq: "6",
    kind: {
      kind: "finished",
      run: "9007199254740993",
      outcome: { kind: "failed", reason: "step-failed" },
    },
  };
  expect(
    observeControl(queued, view([accepted, other, terminal]), 1).phase,
  ).toEqual({
    kind: "finished",
    outcome: { kind: "failed", reason: "step-failed" },
  });
});
it.each(["unknown-run", "no-failed-steps", "busy", "denied"] as const)(
  "preserves retry rejection %s while L54 remains closed to retry-only reasons",
  (reason) => {
    const event: ResidentExecutionEvent = {
      seq: "4",
      kind: {
        kind: "order-received",
        request,
        receipt: { kind: "rejected", reason },
      },
    };
    expect(
      observeControl(queuedControl(attempt, request, 0), view([event]), 1)
        .phase,
    ).toEqual({ kind: "rejected", reason });
  },
);
it.each(["gap", "restart", "timeout", "wrong-receipt", "old-run"])(
  "leaves a retry Unknown or unconfirmed on %s, never Finished",
  (kind) => {
    const state = view([structuredClone(accepted)]);
    if (!state.execution) throw new Error("execution");
    let now = 1;
    if (kind === "gap") state.execution.firstRetainedSeq = "6";
    if (kind === "restart") state.execution.instance = "e".repeat(64);
    if (kind === "timeout") now = 5000;
    if (
      kind === "wrong-receipt" &&
      state.execution.events[0].kind.kind === "order-received"
    )
      state.execution.events[0].kind.request = "e".repeat(32);
    if (
      kind === "old-run" &&
      state.execution.events[0].kind.kind === "order-received"
    )
      state.execution.events[0].kind.receipt = {
        kind: "accepted",
        run: attempt.target.run,
      };
    expect(
      observeControl(queuedControl(attempt, request, 0), state, now).phase.kind,
    ).toBe(kind === "wrong-receipt" ? "queued" : "unknown");
  },
);
