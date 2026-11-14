// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  LauncherView,
  ResidentView,
} from "../src/contract/generated/contract";
import { coreKey } from "../src/renderer/app/Host";
import { HostFailure } from "../src/renderer/bridge/client";
import type { AnswerClock } from "../src/renderer/screens/launcher/resident-answer";
import { useResidentRemoval } from "../src/renderer/screens/launcher/resident-removal";
import { launcherKey } from "../src/renderer/screens/launcher/state";

const host = vi.hoisted(() => ({
  client: { request: vi.fn() },
  launch: { busy: vi.fn(() => false) },
  issue: undefined as string | undefined,
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => host,
}));
vi.mock("../src/renderer/app/LauncherRequest", () => ({
  useLauncherRequest: () => host.launch,
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  host.client.request.mockReset();
  host.issue = undefined;
  host.launch.busy.mockReturnValue(false);
});
function setup(running = false) {
  const core = {
    ...structuredClone(coreFixture),
    services: "connected",
    accountGeneration: "a".repeat(64),
  } as CoreStatus;
  core.access.verified = true;
  const document = structuredClone(launcherFixture) as LauncherView;
  document.revision = "c".repeat(64);
  document.running = running;
  const resident: ResidentView = {
    online: true,
    protected: false,
    running,
    error: false,
    ownership: {
      kind: "known",
      instance: "b".repeat(64),
      accountGeneration: "a".repeat(64),
      revision: document.revision,
      profiles: document.profiles.map((profile) => ({
        profile: profile.id,
        ownedLive: false,
      })),
    },
    registrations: [],
    decision: null,
    execution: {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: true,
      results: { kind: "unsupported" },
      active: running
        ? {
            run: "1",
            revision: "c".repeat(64),
            accountGeneration: "a".repeat(64),
          }
        : null,
      question: null,
      firstRetainedSeq: "1",
      events: running
        ? [{ seq: "1", kind: { kind: "started", run: "1" } }]
        : [],
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  cache.setQueryData(coreKey, core);
  cache.setQueryData(launcherKey, document);
  let now = 0,
    serial = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: AnswerClock = {
    now: () => now,
    schedule: (callback, delay) => {
      const id = ++serial;
      timers.set(id, { at: now + delay, callback });
      return () => {
        timers.delete(id);
      };
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers])
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
  };
  const hook = renderHook(({ value }) => useResidentRemoval(value, clock), {
    initialProps: { value: resident },
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  const target = {
    instance: "b".repeat(64),
    accountGeneration: "a".repeat(64),
    profile: document.profiles[0].id,
    revision: document.revision,
  };
  return { ...hook, resident, core, document, cache, target, advance };
}

it("sends the captured target once and waits through Accepted for Removed", async () => {
  const h = setup();
  host.client.request.mockResolvedValue({
    method: "launcher.profile.removeChecked",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await Promise.all([
      h.result.current.remove(h.target),
      h.result.current.remove(h.target),
    ]);
  });
  expect(host.client.request).toHaveBeenCalledExactlyOnceWith({
    method: "launcher.profile.removeChecked",
    target: h.target,
  });
  expect(h.result.current.attempt?.phase.kind).toBe("queued");
  const resident = structuredClone(h.resident);
  if (!resident.execution) throw new Error("execution");
  resident.execution.events.push({
    seq: "1",
    kind: {
      kind: "removal-received",
      request: "d".repeat(32),
      receipt: { kind: "accepted" },
    },
  });
  h.rerender({ value: resident });
  expect(h.result.current.attempt?.phase.kind).toBe("accepted");
  resident.execution.events.push({
    seq: "2",
    kind: {
      kind: "removal-finished",
      request: "d".repeat(32),
      outcome: { kind: "removed", revision: "e".repeat(64) },
    },
  });
  h.rerender({ value: structuredClone(resident) });
  expect(h.result.current.attempt?.phase.kind).toBe("removed");
});
it.each([
  "unknown",
  "missing",
  "owned",
  "unsupported",
  "account",
  "instance",
  "revision",
  "denied",
  "live",
  "protected",
  "offline",
] as const)("blocks %s without issuing a deletion", async (kind) => {
  const h = setup(),
    resident = structuredClone(h.resident),
    core = structuredClone(h.core),
    doc = structuredClone(h.document);
  if (resident.ownership.kind !== "known") throw new Error("known");
  if (kind === "unknown") resident.ownership = { kind: "unknown" };
  if (kind === "unsupported") resident.ownership = { kind: "unsupported" };
  if (kind === "missing" && resident.ownership.kind === "known")
    resident.ownership.profiles = [];
  if (kind === "owned" && resident.ownership.kind === "known")
    resident.ownership.profiles[0].ownedLive = true;
  if (kind === "account") core.accountGeneration = "e".repeat(64);
  if (kind === "instance" && resident.execution)
    resident.execution.instance = "e".repeat(64);
  if (kind === "revision") doc.revision = "e".repeat(64);
  if (kind === "denied") core.access.blocked = true;
  if (kind === "live") core.live = true;
  if (kind === "protected") doc.protected = true;
  if (kind === "offline") core.services = "unavailable";
  act(() => {
    h.cache.setQueryData(coreKey, core);
    h.cache.setQueryData(launcherKey, doc);
  });
  h.rerender({ value: resident });
  await act(async () => {
    await h.result.current.remove(h.target);
  });
  expect(host.client.request).not.toHaveBeenCalled();
  expect(h.result.current.reason(h.target)).toBeTruthy();
});
it("does not resend an uncertain removal, including after dismiss", async () => {
  const h = setup();
  host.client.request.mockResolvedValue({
    method: "launcher.profile.removeChecked",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await h.result.current.remove(h.target);
  });
  act(() => h.advance(5000));
  expect(h.result.current.attempt?.phase.kind).toBe("unknown");
  act(() => h.result.current.dismiss());
  await act(async () => {
    await h.result.current.remove(h.target);
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("ignores a late Queued after the account changes without substituting its generation", async () => {
  const h = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = h.result.current.remove(h.target);
  });
  act(() =>
    h.cache.setQueryData(coreKey, {
      ...h.core,
      accountGeneration: "e".repeat(64),
    }),
  );
  h.rerender({ value: structuredClone(h.resident) });
  await act(async () => {
    resolve({
      method: "launcher.profile.removeChecked",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(h.result.current.attempt?.phase.kind).toBe("unknown");
  expect(host.client.request.mock.calls[0][0].target.accountGeneration).toBe(
    "a".repeat(64),
  );
});
it("keeps a terminal rejection after a transport issue", async () => {
  const h = setup();
  host.client.request.mockRejectedValue(
    new HostFailure({ kind: "residentRemovalRejected", reason: "owned-live" }),
  );
  await act(async () => {
    await h.result.current.remove(h.target);
  });
  host.issue = "offline";
  h.rerender({ value: structuredClone(h.resident) });
  expect(h.result.current.attempt?.phase).toEqual({
    kind: "rejected",
    reason: "owned-live",
  });
});

it("correlates receipts arriving before the Queued reply without optimistic deletion", async () => {
  const h = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = h.result.current.remove(h.target);
  });
  const resident = structuredClone(h.resident);
  if (!resident.execution) throw new Error("execution");
  resident.execution.events.push(
    {
      seq: "1",
      kind: {
        kind: "removal-received",
        request: "d".repeat(32),
        receipt: { kind: "accepted" },
      },
    },
    {
      seq: "2",
      kind: {
        kind: "removal-finished",
        request: "d".repeat(32),
        outcome: { kind: "removed", revision: "e".repeat(64) },
      },
    },
  );
  h.rerender({ value: resident });
  expect(h.result.current.attempt?.phase.kind).toBe("sending");
  await act(async () => {
    resolve({
      method: "launcher.profile.removeChecked",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(h.result.current.attempt?.phase.kind).toBe("removed");
});
