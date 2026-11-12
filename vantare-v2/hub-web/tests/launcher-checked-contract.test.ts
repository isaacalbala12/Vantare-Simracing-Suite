import { describe, expect, it } from "vitest";
import { isResidentExecution } from "../src/contract/resident-execution-validation";
import { isHostMessage, isUiMessage } from "../src/contract/validation";

const request = {
  method: "launcher.launchChecked",
  profile: "qa",
  baseRevision: "b".repeat(64),
  armedGeneration: "a".repeat(64),
};
const wire = (request: unknown) => ({ kind: "request", id: 1, request });
describe("checked launch surface", () => {
  it("requires the captured generation and a closed payload", () => {
    expect(isUiMessage(wire(request))).toBe(true);
    for (const patch of [
      { armedGeneration: null },
      { armedGeneration: "A".repeat(64) },
      { armedGeneration: undefined },
      { revision: "private" },
      { path: "/private" },
      { args: [] },
    ])
      expect(isUiMessage(wire({ ...request, ...patch }))).toBe(false);
  });
  it("Queued carries only an opaque request, with no success assertion", () => {
    const value = { kind: "queued", request: "a".repeat(32) };
    const response = (value: unknown) => ({
      kind: "response",
      id: 1,
      result: { method: "launcher.launchChecked", value },
    });
    expect(isHostMessage(response(value))).toBe(true);
    expect(isHostMessage(response({ ...value, completed: true }))).toBe(false);
    expect(isHostMessage(response({ ...value, request: 1 }))).toBe(false);
  });
  it("preserves u64 sequence strings and rejects future or private event data", () => {
    const value = {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      firstRetainedSeq: "9007199254740993",
      events: [
        {
          seq: "9007199254740993",
          kind: {
            kind: "finished",
            run: "9007199254740993",
            outcome: { kind: "cancelled", reason: "trust-declined" },
          },
        },
      ],
    };
    expect(isResidentExecution(value)).toBe(true);
    for (const patch of [
      { events: [{ ...value.events[0], seq: Number("9007199254740993") }] },
      { events: [{ ...value.events[0], kind: { kind: "completed" } }] },
      { events: Array(33).fill(value.events[0]) },
      { firstRetainedSeq: "1" },
      { command: "private" },
    ])
      expect(isResidentExecution({ ...value, ...patch })).toBe(false);
    expect(
      isResidentExecution({ ...value, events: [], firstRetainedSeq: "1" }),
    ).toBe(true);
  });
});
