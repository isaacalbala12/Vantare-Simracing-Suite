import { describe, expect, it } from "vitest";
import {
  isError,
  isReply,
  isRequest,
} from "../src/contract/modules/launcher_resident";
import { isResidentExecution } from "../src/contract/resident-execution-validation";

const target = {
  instance: "b".repeat(64),
  accountGeneration: "c".repeat(64),
  run: "9007199254740993",
  revision: "d".repeat(64),
  decision: "18446744073709551615",
  action: "stop",
};
describe("checked resident answers", () => {
  it("keeps target values exact and rejects executable data or lossy identifiers", () => {
    expect(isRequest({ method: "launcher.resident.answer", target })).toBe(
      true,
    );
    for (const patch of [
      { decision: Number("9007199254740993") },
      { decision: "01" },
      { run: "0" },
      { decision: "18446744073709551616" },
      { instance: "old" },
      { accountGeneration: "personal@example.invalid" },
      { revision: "D".repeat(64) },
      { action: "kill" },
      { command: "must-not-execute" },
    ])
      expect(
        isRequest({
          method: "launcher.resident.answer",
          target: { ...target, ...patch },
        }),
      ).toBe(false);
  });
  it("distinguishes queued, rejected trust and an execution terminal", () => {
    expect(
      isReply({
        method: "launcher.resident.answer",
        value: { kind: "queued", request: "a".repeat(32) },
      }),
    ).toBe(true);
    expect(
      isReply({
        method: "launcher.resident.answer",
        value: { kind: "completed" },
      }),
    ).toBe(false);
    expect(
      isError({
        kind: "residentAnswerRejected",
        reason: "trust-requires-editor",
      }),
    ).toBe(true);
    expect(
      isError({ kind: "residentAnswerRejected", reason: "trust-granted" }),
    ).toBe(false);
    const execution = {
      instance: target.instance,
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: false,
      active: null,
      question: {
        decision: target.decision,
        run: "1",
        revision: target.revision,
        accountGeneration: target.accountGeneration,
      },
      firstRetainedSeq: "1",
      events: [
        { seq: "1", kind: { kind: "started", run: "1" } },
        {
          seq: "2",
          kind: {
            kind: "order-received",
            request: "a".repeat(32),
            receipt: { kind: "accepted", run: "1" },
          },
        },
      ],
    };
    expect(isResidentExecution(execution)).toBe(true);
    expect(isResidentExecution({ ...execution, checkedAnswer: false })).toBe(
      false,
    );
    expect(isResidentExecution({ ...execution, events: [] })).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        question: { ...execution.question, run: "3" },
      }),
    ).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        question: { ...execution.question, path: "forbidden" },
      }),
    ).toBe(false);
  });
});
