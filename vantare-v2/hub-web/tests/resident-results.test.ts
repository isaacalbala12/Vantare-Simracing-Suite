import { describe, expect, it } from "vitest";
import {
  isError,
  isReply,
  isRequest,
} from "../src/contract/modules/launcher_resident";
import {
  isResidentExecution,
  isRunResults,
} from "../src/contract/resident-execution-validation";

const run = "9007199254740993";
const target = {
  instance: "b".repeat(64),
  accountGeneration: "a".repeat(64),
  run,
  profile: "qa",
  revision: "d".repeat(64),
  scope: "all",
};
const results = {
  run,
  profile: "qa",
  revision: target.revision,
  accountGeneration: target.accountGeneration,
  mode: "rehearsal",
  outcome: { kind: "failed", reason: "step-failed" },
  steps: [
    { index: 0, state: "not-selected" },
    { index: 1, state: "failed" },
  ],
};
const execution = {
  instance: target.instance,
  revisionCheckedLaunch: true,
  checkedAnswer: false,
  checkedControl: false,
  stepResultsRetry: true,
  active: null,
  question: null,
  results,
  firstRetainedSeq: run,
  events: [
    { seq: run, kind: { kind: "started", run } },
    {
      seq: "9007199254740994",
      kind: { kind: "finished", run, outcome: results.outcome },
    },
  ],
};
describe("resident step results and checked retry", () => {
  it("accepts only a closed original scope; the renderer cannot choose indices or executable data", () => {
    for (const scope of ["failed", "all"])
      expect(
        isRequest({
          method: "launcher.resident.retry",
          target: { ...target, scope },
        }),
      ).toBe(true);
    for (const patch of [
      { run: Number(run) },
      { run: "01" },
      { profile: "" },
      { profile: "é".repeat(129) },
      { profile: "bad\0id" },
      { revision: "D".repeat(64) },
      { scope: "selected" },
      { indices: [1] },
      { command: "never" },
      { document: {} },
      { request: "f".repeat(32) },
    ])
      expect(
        isRequest({
          method: "launcher.resident.retry",
          target: { ...target, ...patch },
        }),
      ).toBe(false);
  });
  it("Queued only identifies the mailbox request and failures stay closed", () => {
    expect(
      isReply({
        method: "launcher.resident.retry",
        value: { kind: "queued", request: "f".repeat(32) },
      }),
    ).toBe(true);
    expect(
      isReply({
        method: "launcher.resident.retry",
        value: { kind: "completed", run },
      }),
    ).toBe(false);
    for (const reason of ["unknown-run", "no-failed-steps"]) {
      expect(isError({ kind: "residentControlRejected", reason })).toBe(true);
      expect(isError({ kind: "residentAnswerRejected", reason })).toBe(false);
    }
  });
  it("requires a bounded indexed summary with known states and a scoped account", () => {
    expect(isRunResults(results)).toBe(true);
    for (const patch of [
      { accountGeneration: "personal" },
      { profile: "" },
      { command: "never" },
      { mode: "selected" },
      { steps: [] },
      {
        steps: Array.from({ length: 129 }, (_, index) => ({
          index,
          state: "failed",
        })),
      },
      { steps: [{ index: 1, state: "failed" }] },
      { steps: [{ index: 0, state: "future" }] },
      { steps: [{ index: 0, state: "failed", pid: 1 }] },
      { steps: [{ index: 0, state: "pending" }] },
      { outcome: { kind: "completed" } },
    ])
      expect(isRunResults({ ...results, ...patch })).toBe(false);
    expect(
      isRunResults({
        ...results,
        outcome: null,
        steps: [{ index: 0, state: "launching" }],
      }),
    ).toBe(true);
    expect(
      isRunResults({
        ...results,
        outcome: { kind: "completed" },
        steps: [{ index: 0, state: "ready" }],
      }),
    ).toBe(true);
  });
  it("advertises support explicitly and preserves exact run ids beyond JS integers", () => {
    expect(isResidentExecution(execution)).toBe(true);
    expect(isResidentExecution({ ...execution, stepResultsRetry: false })).toBe(
      false,
    );
    expect(
      isResidentExecution({
        ...execution,
        results: { ...results, run: "9007199254740995" },
      }),
    ).toBe(false);
    expect(isResidentExecution({ ...execution, events: [] })).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        checkedControl: true,
        active: {
          run,
          revision: target.revision,
          accountGeneration: target.accountGeneration,
        },
      }),
    ).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        checkedControl: true,
        active: {
          run,
          revision: target.revision,
          accountGeneration: target.accountGeneration,
        },
        results: { ...results, outcome: null },
      }),
    ).toBe(true);
    expect(
      isResidentExecution({
        ...execution,
        checkedControl: true,
        active: {
          run,
          revision: target.revision,
          accountGeneration: "e".repeat(64),
        },
        results: { ...results, outcome: null },
      }),
    ).toBe(false);
  });
});
