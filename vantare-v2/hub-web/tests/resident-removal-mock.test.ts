import { afterEach, expect, it, vi } from "vitest";
import type {
  HostToUi,
  ResidentRemoveTarget,
} from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

function setup(scene = "launcher-removal-finished") {
  vi.useFakeTimers();
  const events: HostToUi[] = [];
  const host = createMockHost(scene, (message) => {
    expect(isHostMessage(message)).toBe(true);
    events.push(message);
  });
  const doc = host({
      kind: "request",
      id: 1,
      request: { method: "launcher.get" },
    }),
    resident = host({
      kind: "request",
      id: 2,
      request: { method: "launcher.resident.get" },
    });
  if (
    doc?.kind !== "response" ||
    doc.result.method !== "launcher.get" ||
    resident?.kind !== "response" ||
    resident.result.method !== "launcher.resident.get"
  )
    throw new Error("snapshot");
  expect(isHostMessage(resident)).toBe(true);
  const own = resident.result.value.ownership;
  const target: ResidentRemoveTarget = {
    instance: own.kind === "known" ? own.instance : "b".repeat(64),
    accountGeneration: "a".repeat(64),
    profile: doc.result.value.profiles[0].id,
    revision: doc.result.value.revision,
  };
  return {
    host,
    target,
    events,
    doc: doc.result.value,
    view: resident.result.value,
    send: () =>
      host({
        kind: "request",
        id: 3,
        request: { method: "launcher.profile.removeChecked", target },
      }),
    get: () =>
      host({ kind: "request", id: 4, request: { method: "launcher.get" } }),
  };
}

afterEach(() => vi.useRealTimers());
it("legacy delete is Unsupported and preserves profiles even with valid CAS", () => {
  const f = setup();
  expect(
    f.host({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.profile.delete",
        id: f.target.profile,
        baseRevision: f.target.revision,
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "unsupported" } });
  expect(f.get()).toMatchObject({
    kind: "response",
    result: { value: { profiles: f.doc.profiles } },
  });
});
it("mock uses Queued, then Accepted, then Removed, never deleting on Accepted", () => {
  const f = setup();
  expect(f.send()).toMatchObject({
    kind: "response",
    result: { value: { kind: "queued" } },
  });
  expect(f.events).toHaveLength(0);
  vi.advanceTimersByTime(0);
  expect(f.events).toHaveLength(1);
  expect(f.events[0]).toMatchObject({
    kind: "event",
    event: {
      value: {
        execution: {
          events: [
            {
              kind: { kind: "removal-received", receipt: { kind: "accepted" } },
            },
          ],
        },
      },
    },
  });
  expect(f.get()).toMatchObject({
    kind: "response",
    result: { value: { profiles: f.doc.profiles } },
  });
  vi.advanceTimersByTime(1000);
  const after = f.get();
  if (after?.kind !== "response" || after.result.method !== "launcher.get")
    throw new Error("doc");
  expect(
    after.result.value.profiles.some((p) => p.id === f.target.profile),
  ).toBe(false);
  expect(f.events.at(-1)).toMatchObject({
    kind: "event",
    event: {
      value: {
        execution: {
          events: [
            expect.anything(),
            {
              kind: { kind: "removal-finished", outcome: { kind: "removed" } },
            },
          ],
        },
      },
    },
  });
});
it.each([
  ["owned", "owned-live"],
  ["unknown", "ownership-unknown"],
  ["unsupported", "unsupported"],
])("%s is not an empty ownership snapshot", (state, reason) => {
  const f = setup(`launcher-removal-${state}`);
  expect(f.send()).toMatchObject(
    reason === "unsupported"
      ? { kind: "failure", error: { kind: "unsupported" } }
      : { kind: "failure", error: { kind: "residentRemovalRejected", reason } },
  );
  expect(f.events).toHaveLength(0);
  expect(f.get()).toMatchObject({
    kind: "response",
    result: { value: { profiles: f.doc.profiles } },
  });
});
it("account and revision cannot be substituted by the mock", () => {
  const f = setup();
  expect(
    f.host({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.profile.removeChecked",
        target: { ...f.target, accountGeneration: "e".repeat(64) },
      },
    }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "residentRemovalRejected", reason: "account-changed" },
  });
  expect(
    f.host({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.profile.removeChecked",
        target: { ...f.target, revision: "e".repeat(64) },
      },
    }),
  ).toMatchObject({ kind: "failure", error: { reason: "revision-mismatch" } });
});
it.each(["accepted", "failed", "timeout", "restart", "gap"])(
  "%s does not fabricate deletion",
  (state) => {
    const f = setup(`launcher-removal-${state}`);
    f.send();
    vi.runAllTimers();
    expect(f.get()).toMatchObject({
      kind: "response",
      result: { value: { profiles: f.doc.profiles } },
    });
  },
);
