import type {
  CoreStatus,
  ResidentExecutionEvent,
  ResidentOutcome,
  ResidentView,
} from "../../src/contract/generated/contract";

export const instance = "a".repeat(64);
export const generation = "b".repeat(64);
export const notificationCore: CoreStatus = {
  accountGeneration: generation,
  photos: "connected",
  rights: "connected",
  services: "connected",
  access: {
    verified: true,
    blocked: false,
    tester: true,
    calendar: true,
    engineer: false,
    strategy: false,
    analysis: false,
  },
  live: false,
};
export function residentCompletionView(
  events: ResidentExecutionEvent[] = [],
  outcome: ResidentOutcome = { kind: "completed" },
): ResidentView {
  return {
    online: true,
    protected: false,
    running: false,
    error: false,
    decision: null,
    registrations: [],
    reviewOutcome: null,
    ownership: {
      kind: "known",
      instance,
      accountGeneration: generation,
      revision: "c".repeat(64),
      profiles: [{ profile: "creator", ownedLive: false }],
    },
    execution: {
      instance,
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: true,
      active: null,
      question: null,
      firstRetainedSeq: "1",
      events,
      results: {
        kind: "known",
        value: {
          run: "1",
          profile: "creator",
          revision: "c".repeat(64),
          accountGeneration: generation,
          mode: "profile",
          outcome,
          retryFailed: false,
          steps: [{ index: 0, state: "ready" }],
        },
      },
    },
  };
}
export const received: ResidentExecutionEvent = {
  seq: "1",
  kind: {
    kind: "received",
    request: "d".repeat(32),
    receipt: { kind: "accepted", run: "1" },
  },
};
export const finished: ResidentExecutionEvent = {
  seq: "2",
  kind: { kind: "finished", run: "1", outcome: { kind: "completed" } },
};
