import { describe, expect, it } from "vitest";
import { residentOrderReceiptTimeoutMs } from "../src/contract/generated/launcher_resident";
import {
  isError,
  isReply,
  isRequest,
} from "../src/contract/modules/launcher_resident";
import { isResidentExecution } from "../src/contract/resident-execution-validation";

const cancel = {
  instance: "b".repeat(64),
  accountGeneration: "a".repeat(64),
  run: "9007199254740993",
  revision: "d".repeat(64),
};
const rehearse = {
  instance: cancel.instance,
  accountGeneration: cancel.accountGeneration,
  profile: "qa",
  revision: cancel.revision,
};
describe("checked resident control", () => {
  it("accepts exactly the closed cancel/rehearse targets without executable data", () => {
    for (const [method, target] of [
      ["launcher.resident.cancel", cancel],
      ["launcher.resident.rehearse", rehearse],
    ] as const) {
      expect(isRequest({ method, target })).toBe(true);
      for (const patch of [
        { instance: "old" },
        { accountGeneration: "personal" },
        { revision: "D".repeat(64) },
        { request: "f".repeat(32) },
        { command: "never" },
        { selected: [0] },
        { document: {} },
      ])
        expect(isRequest({ method, target: { ...target, ...patch } })).toBe(
          false,
        );
    }
    for (const run of [
      0,
      Number("9007199254740993"),
      "0",
      "01",
      "18446744073709551616",
    ])
      expect(
        isRequest({
          method: "launcher.resident.cancel",
          target: { ...cancel, run },
        }),
      ).toBe(false);
    for (const profile of ["", "x".repeat(257), "é".repeat(129), "bad\0id"])
      expect(
        isRequest({
          method: "launcher.resident.rehearse",
          target: { ...rehearse, profile },
        }),
      ).toBe(false);
  });
  it("queues an opaque request and preserves the same receipt timeout policy", () => {
    for (const method of [
      "launcher.resident.cancel",
      "launcher.resident.rehearse",
    ]) {
      expect(
        isReply({ method, value: { kind: "queued", request: "e".repeat(32) } }),
      ).toBe(true);
      expect(isReply({ method, value: { kind: "completed" } })).toBe(false);
      expect(
        isReply({
          method,
          value: { kind: "queued", request: "e".repeat(32), run: "1" },
        }),
      ).toBe(false);
    }
    expect(residentOrderReceiptTimeoutMs).toBe(5000);
  });
  it("keeps the existing answer RPC error narrow while new receipts carry control failures", () => {
    for (const reason of [
      "busy",
      "document-unavailable",
      "no-steps",
      "start-failed",
    ]) {
      expect(isError({ kind: "residentControlRejected", reason })).toBe(true);
      expect(isError({ kind: "residentAnswerRejected", reason })).toBe(false);
    }
    expect(
      isError({ kind: "residentControlRejected", reason: "unknown-command" }),
    ).toBe(false);
    expect(
      isError({
        kind: "residentAnswerRejected",
        reason: "trust-requires-editor",
      }),
    ).toBe(true);
  });
  it("scopes active execution even without a question and never infers a terminal from a receipt", () => {
    const active = {
      run: cancel.run,
      revision: cancel.revision,
      accountGeneration: cancel.accountGeneration,
    };
    const execution = {
      instance: cancel.instance,
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: true,
      question: null,
      active,
      firstRetainedSeq: cancel.run,
      events: [
        { seq: cancel.run, kind: { kind: "started", run: cancel.run } },
        {
          seq: "9007199254740994",
          kind: {
            kind: "order-received",
            request: "e".repeat(32),
            receipt: { kind: "rejected", reason: "no-steps" },
          },
        },
      ],
    };
    expect(isResidentExecution(execution)).toBe(true);
    expect(isResidentExecution({ ...execution, checkedControl: false })).toBe(
      false,
    );
    expect(isResidentExecution({ ...execution, events: [] })).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        active: { ...active, run: "9007199254740995" },
      }),
    ).toBe(false);
    expect(
      isResidentExecution({ ...execution, active: { ...active, pid: 123 } }),
    ).toBe(false);
    expect(
      isResidentExecution({
        ...execution,
        question: {
          ...active,
          decision: "1",
          accountGeneration: "f".repeat(64),
        },
      }),
    ).toBe(false);
  });
});
