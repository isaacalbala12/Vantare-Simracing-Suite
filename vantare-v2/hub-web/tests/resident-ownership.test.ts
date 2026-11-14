import { expect, it } from "vitest";
import {
  isError,
  isReply,
  isRequest,
} from "../src/contract/modules/launcher_resident";
import { isResidentExecution } from "../src/contract/resident-execution-validation";
import { isResidentOwnership } from "../src/contract/resident-ownership-validation";

const target = {
  instance: "b".repeat(64),
  accountGeneration: "a".repeat(64),
  profile: "qa",
  revision: "d".repeat(64),
};
it("ownership is explicit and scoped; Unknown cannot masquerade as empty", () => {
  const value = {
    kind: "known",
    instance: target.instance,
    accountGeneration: target.accountGeneration,
    revision: target.revision,
    profiles: [{ profile: "qa", ownedLive: false }],
  };
  expect(isResidentOwnership(value)).toBe(true);
  expect(isResidentOwnership({ ...value, profiles: [] })).toBe(true);
  expect(isResidentOwnership({ kind: "unknown" })).toBe(true);
  expect(isResidentOwnership({ kind: "unknown", profiles: [] })).toBe(false);
  for (const patch of [
    { accountGeneration: "personal" },
    { profiles: [{ profile: "qa", ownedLive: 1 }] },
    { profiles: [value.profiles[0], value.profiles[0]] },
    {
      profiles: Array.from({ length: 129 }, (_, i) => ({
        profile: `qa-${i}`,
        ownedLive: false,
      })),
    },
    { pid: 1 },
  ])
    expect(isResidentOwnership({ ...value, ...patch })).toBe(false);
});
it("removal cannot receive renderer commands, PIDs, decisions or run IDs", () => {
  const request = { method: "launcher.profile.removeChecked", target };
  expect(isRequest(request)).toBe(true);
  for (const patch of [
    { run: "1" },
    { pid: 123 },
    { path: "forbidden" },
    { arguments: [] },
    { document: {} },
    { decision: "1" },
    { revision: "d".repeat(63) },
  ])
    expect(isRequest({ ...request, target: { ...target, ...patch } })).toBe(
      false,
    );
  expect(
    isReply({
      method: request.method,
      value: { kind: "queued", request: "e".repeat(32) },
    }),
  ).toBe(true);
  expect(
    isReply({
      method: request.method,
      value: { kind: "removed", revision: target.revision },
    }),
  ).toBe(false);
  expect(
    isError({ kind: "residentRemovalRejected", reason: "owned-live" }),
  ).toBe(true);
  expect(isError({ kind: "residentRemovalRejected", reason: "future" })).toBe(
    false,
  );
});
it("acceptance and terminal are separate events correlated by request without synthetic runs", () => {
  const request = "e".repeat(32);
  const execution = {
    instance: target.instance,
    revisionCheckedLaunch: false,
    checkedAnswer: false,
    checkedControl: false,
    results: { kind: "unsupported" },
    active: null,
    question: null,
    firstRetainedSeq: "9007199254740993",
    events: [
      {
        seq: "9007199254740993",
        kind: {
          kind: "removal-received",
          request,
          receipt: { kind: "accepted" },
        },
      },
      {
        seq: "9007199254740994",
        kind: {
          kind: "removal-finished",
          request,
          outcome: { kind: "removed", revision: target.revision },
        },
      },
    ],
  };
  expect(isResidentExecution(execution)).toBe(true);
  for (const receipt of [
    { kind: "accepted", run: "1" },
    { kind: "removed", revision: target.revision },
    { kind: "rejected", reason: "future" },
  ])
    expect(
      isResidentExecution({
        ...execution,
        events: [
          {
            ...execution.events[0],
            kind: { kind: "removal-received", request, receipt },
          },
        ],
      }),
    ).toBe(false);
});
