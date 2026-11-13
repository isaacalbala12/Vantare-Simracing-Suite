import { describe, expect, it } from "vitest";
import type {
  ResidentExecutionEvent,
  ResidentView,
} from "../src/contract/generated/launcher_resident";
import {
  type AnswerAttempt,
  observeAnswer,
  queuedAnswer,
} from "../src/renderer/screens/launcher/resident-answer-model";

const request = "a".repeat(32);
const run = "9007199254740993";
const attempt: AnswerAttempt = {
  target: {
    instance: "b".repeat(64),
    accountGeneration: "c".repeat(64),
    revision: "d".repeat(64),
    decision: "4",
    run,
    action: "continue",
  },
  cursor: BigInt(run),
  phase: { kind: "sending" },
};
function view(events: ResidentExecutionEvent[]): ResidentView {
  return {
    online: true,
    protected: false,
    running: true,
    error: false,
    decision: null,
    ownership: {kind: "unsupported"},
    registrations: [],
    execution: {
      instance: attempt.target.instance,
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: false,
      results: { kind: "unsupported" },
      active: null,
      question: null,
      firstRetainedSeq: run,
      events: [{ seq: run, kind: { kind: "started", run } }, ...events],
    },
  };
}
function receipt(): ResidentExecutionEvent {
  return {
    seq: String(BigInt(run) + 1n),
    kind: {
      kind: "order-received",
      request,
      receipt: { kind: "accepted", run },
    },
  };
}
describe("checked resident answer receipts", () => {
  it("Queued is not Accepted, and only its own receipt accepts", () => {
    const queued = queuedAnswer(attempt, request, 100);
    expect(observeAnswer(queued, view([]), 101).phase.kind).toBe("queued");
    const other = receipt();
    if (other.kind.kind === "order-received")
      other.kind.request = "e".repeat(32);
    expect(observeAnswer(queued, view([other]), 101).phase.kind).toBe("queued");
    expect(observeAnswer(queued, view([receipt()]), 101).phase.kind).toBe(
      "accepted",
    );
  });
  it("Accepted has no chain deadline; Finished is explicit", () => {
    const accepted = observeAnswer(
      queuedAnswer(attempt, request, 0),
      view([receipt()]),
      1,
    );
    expect(observeAnswer(accepted, view([receipt()]), 999999).phase.kind).toBe(
      "accepted",
    );
    expect(
      observeAnswer(
        accepted,
        view([
          receipt(),
          {
            seq: String(BigInt(run) + 2n),
            kind: { kind: "finished", run, outcome: { kind: "completed" } },
          },
        ]),
        999999,
      ).phase,
    ).toEqual({ kind: "finished", outcome: { kind: "completed" } });
  });
  it("no receipt at exactly five seconds is Unknown, never retried by a late receipt", () => {
    const unknown = observeAnswer(
      queuedAnswer(attempt, request, 0),
      view([]),
      5000,
    );
    expect(unknown.phase.kind).toBe("unknown");
    expect(observeAnswer(unknown, view([receipt()]), 5001)).toBe(unknown);
  });
  it("preserves the closed rejection", () => {
    const rejected = receipt();
    if (rejected.kind.kind === "order-received")
      rejected.kind.receipt = { kind: "rejected", reason: "stale-question" };
    expect(
      observeAnswer(queuedAnswer(attempt, request, 0), view([rejected]), 1)
        .phase,
    ).toEqual({ kind: "rejected", reason: "stale-question" });
  });
  it("restart, loss of observation and a ring gap are Unknown", () => {
    const queued = queuedAnswer(attempt, request, 0);
    const restarted = view([]);
    if (restarted.execution) restarted.execution.instance = "f".repeat(64);
    expect(observeAnswer(queued, restarted, 1).phase.kind).toBe("unknown");
    expect(observeAnswer(queued, undefined, 1).phase.kind).toBe("unknown");
    const gap = view([]);
    if (gap.execution)
      gap.execution.firstRetainedSeq = String(BigInt(run) + 2n);
    expect(observeAnswer(queued, gap, 1).phase.kind).toBe("unknown");
  });
});
it("does not acknowledge from a launch receipt or a terminal event without the answer receipt", () => {
  const queued = queuedAnswer(attempt, request, 0);
  expect(
    observeAnswer(
      queued,
      view([
        {
          seq: String(BigInt(run) + 1n),
          kind: {
            kind: "received",
            request,
            receipt: { kind: "accepted", run },
          },
        },
        {
          seq: String(BigInt(run) + 2n),
          kind: { kind: "finished", run, outcome: { kind: "completed" } },
        },
      ]),
      1,
    ).phase.kind,
  ).toBe("queued");
});
it("ignores terminal events from a different chain after acceptance", () => {
  const accepted = observeAnswer(
    queuedAnswer(attempt, request, 0),
    view([receipt()]),
    1,
  );
  expect(
    observeAnswer(
      accepted,
      view([
        receipt(),
        {
          seq: String(BigInt(run) + 2n),
          kind: { kind: "finished", run: "2", outcome: { kind: "completed" } },
        },
      ]),
      2,
    ).phase.kind,
  ).toBe("accepted");
});

it("a matching receipt observed after the deadline remains Unknown", () => {
  expect(
    observeAnswer(queuedAnswer(attempt, request, 0), view([receipt()]), 5001)
      .phase.kind,
  ).toBe("unknown");
});

it("keeps known answer rejection labels and treats control-only reasons as Unknown", () => {
  for (const reason of [
    "document-unavailable",
    "no-steps",
    "start-failed",
    "busy",
    "denied",
  ] as const) {
    const event: ResidentExecutionEvent = {
      seq: String(BigInt(run) + 1n),
      kind: {
        kind: "order-received",
        request,
        receipt: { kind: "rejected", reason },
      },
    };
    expect(
      observeAnswer(queuedAnswer(attempt, request, 0), view([event]), 1).phase,
    ).toEqual(
      reason === "busy" || reason === "denied"
        ? { kind: "rejected", reason }
        : { kind: "unknown" },
    );
  }
});
