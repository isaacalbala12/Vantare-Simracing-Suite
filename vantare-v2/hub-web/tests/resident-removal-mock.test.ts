import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  HostToUi,
  LauncherView,
  ResidentRemoveTarget,
  ResidentView,
} from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { createResidentRemovalMock } from "../src/mock/resident-removal";

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

it("keeps the accepted removal busy until its terminal rather than enqueueing a second write", () => {
  const f = setup("launcher-removal-accepted");
  f.send();
  vi.advanceTimersByTime(0);
  expect(f.send()).toMatchObject({
    kind: "failure",
    error: { kind: "residentRemovalRejected", reason: "busy" },
  });
  expect(f.events).toHaveLength(1);
});

it.each([
  "instance",
  "account",
  "denied",
  "running",
  "unknown",
  "revision",
  "missing",
  "owned",
  "protected",
  "file-conflict",
] as const)("matches host rejection precedence for %s", (kind) => {
  const core = structuredClone(coreFixture) as CoreStatus;
  const doc = structuredClone(launcherFixture) as LauncherView;
  const view: ResidentView = {
    online: true,
    protected: false,
    running: false,
    error: false,
    execution: null,
    decision: null,
    registrations: [],
    ownership: { kind: "unknown" },
  };
  const handle = createResidentRemovalMock(
    {
      sceneName: "launcher-removal-finished",
      core,
      launcherData: doc,
      removeLauncherProfile: vi.fn(),
      visual: null,
      notes: [],
      note: vi.fn(),
    },
    view,
    vi.fn(),
  );
  if (view.ownership.kind !== "known") throw new Error("known");
  const ownership = view.ownership;
  const target: ResidentRemoveTarget = {
    instance: view.ownership.instance,
    accountGeneration: view.ownership.accountGeneration,
    profile: doc.profiles[0].id,
    revision: view.ownership.revision,
  };
  let reason: string = kind;
  if (kind === "instance") {
    target.instance = "e".repeat(64);
    target.accountGeneration = "e".repeat(64);
    reason = "wrong-instance";
  }
  if (kind === "account") {
    target.accountGeneration = "e".repeat(64);
    core.access.blocked = true;
    reason = "account-changed";
  }
  if (kind === "denied") {
    core.access.blocked = true;
    view.running = true;
  }
  if (kind === "running") {
    view.running = true;
    target.revision = "e".repeat(64);
    reason = "busy";
  }
  if (kind === "unknown") {
    view.ownership = { kind: "unknown" };
    target.revision = "e".repeat(64);
    reason = "ownership-unknown";
  }
  if (kind === "revision") {
    target.revision = "e".repeat(64);
    ownership.profiles = [];
    reason = "revision-mismatch";
  }
  if (kind === "missing") {
    ownership.profiles = [];
    doc.protected = true;
    reason = "document-unavailable";
  }
  if (kind === "owned") {
    ownership.profiles[0].ownedLive = true;
    doc.protected = true;
    reason = "owned-live";
  }
  if (kind === "protected") doc.protected = true;
  if (kind === "file-conflict") doc.revision = "e".repeat(64);
  const result = handle({
    kind: "request",
    id: 1,
    request: { method: "launcher.profile.removeChecked", target },
  });
  expect(result).toMatchObject({
    kind: "failure",
    error:
      kind === "protected"
        ? { kind: "protected" }
        : kind === "file-conflict"
          ? { kind: "launcherConflict", current: doc }
          : { kind: "residentRemovalRejected", reason },
  });
});
