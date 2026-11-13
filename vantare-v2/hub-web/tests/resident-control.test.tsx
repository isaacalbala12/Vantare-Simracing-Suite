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
import { useResidentControl } from "../src/renderer/screens/launcher/resident-control";
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
    registrations: [],
    decision: null,
    execution: {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: true,
      checkedControl: true,
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
  const hook = renderHook(({ value }) => useResidentControl(value, clock), {
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
it("issues only the closed rehearse method once, without requiring LMU to be launchable", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.rehearse(hook.target);
    void hook.result.current.rehearse(hook.target);
  });
  expect(host.client.request).toHaveBeenCalledExactlyOnceWith({
    method: "launcher.resident.rehearse",
    target: hook.target,
  });
  await act(async () => {
    resolve({
      method: "launcher.resident.rehearse",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("queued");
  act(() => hook.advance(5000));
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("cancels the observed run even after rights revocation or document changes", async () => {
  const hook = setup(true);
  const target = hook.result.current.cancelTarget;
  if (!target) throw new Error("fixture active");
  act(() => {
    hook.cache.setQueryData(coreKey, {
      ...hook.core,
      access: { ...hook.core.access, verified: false, blocked: true },
    });
    hook.cache.setQueryData(launcherKey, {
      ...hook.document,
      revision: "e".repeat(64),
      protected: true,
    });
  });
  hook.rerender({ value: structuredClone(hook.resident) });
  host.client.request.mockResolvedValue({
    method: "launcher.resident.cancel",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await hook.result.current.cancel(target);
  });
  expect(host.client.request).toHaveBeenCalledExactlyOnceWith({
    method: "launcher.resident.cancel",
    target,
  });
});
it("an old cancel button cannot cancel a new run", async () => {
  const hook = setup(true);
  const target = hook.result.current.cancelTarget;
  if (!target) throw new Error("fixture active");
  const next = structuredClone(hook.resident);
  if (next.execution?.active) next.execution.active.run = "2";
  hook.rerender({ value: next });
  await act(async () => {
    await hook.result.current.cancel(target);
  });
  expect(host.client.request).not.toHaveBeenCalled();
});
it.each([
  "instance",
  "account",
  "revision",
  "capability",
  "offline",
  "denied",
  "live",
  "protected",
  "scanning",
])("rejects stale or unavailable rehearse intent: %s", async (kind) => {
  const hook = setup();
  const next = structuredClone(hook.resident);
  if (kind === "instance" && next.execution)
    next.execution.instance = "e".repeat(64);
  if (kind === "capability" && next.execution)
    next.execution.checkedControl = false;
  if (kind === "offline") next.online = false;
  if (kind === "account")
    act(() => {
      hook.cache.setQueryData(coreKey, {
        ...hook.core,
        accountGeneration: "e".repeat(64),
      });
    });
  if (kind === "denied")
    act(() => {
      hook.cache.setQueryData(coreKey, {
        ...hook.core,
        access: { ...hook.core.access, blocked: true },
      });
    });
  if (kind === "live")
    act(() => {
      hook.cache.setQueryData(coreKey, { ...hook.core, live: true });
    });
  if (kind === "revision")
    act(() => {
      hook.cache.setQueryData(launcherKey, {
        ...hook.document,
        revision: "e".repeat(64),
      });
    });
  if (kind === "scanning")
    act(() => {
      hook.cache.setQueryData(launcherKey, {
        ...hook.document,
        scanning: true,
      });
    });
  if (kind === "protected")
    act(() => {
      hook.cache.setQueryData(launcherKey, {
        ...hook.document,
        protected: true,
      });
    });
  hook.rerender({ value: next });
  await act(async () => {
    await hook.result.current.rehearse(hook.target);
  });
  expect(host.client.request).not.toHaveBeenCalled();
});
it("Accepted is not Finished and a terminal notice expires", async () => {
  const hook = setup();
  host.client.request.mockResolvedValue({
    method: "launcher.resident.rehearse",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await hook.result.current.rehearse(hook.target);
  });
  const accepted = structuredClone(hook.resident);
  if (!accepted.execution) throw new Error("fixture");
  accepted.running = true;
  accepted.execution.active = {
    run: "1",
    revision: hook.target.revision,
    accountGeneration: hook.target.accountGeneration,
  };
  accepted.execution.events = [
    {
      seq: "1",
      kind: {
        kind: "order-received",
        request: "d".repeat(32),
        receipt: { kind: "accepted", run: "1" },
      },
    },
  ];
  hook.rerender({ value: accepted });
  expect(hook.result.current.attempt?.phase.kind).toBe("accepted");
  act(() => hook.advance(99999));
  expect(hook.result.current.attempt?.phase.kind).toBe("accepted");
  const finished = structuredClone(accepted);
  finished.execution?.events.push({
    seq: "2",
    kind: { kind: "finished", run: "1", outcome: { kind: "completed" } },
  });
  hook.rerender({ value: finished });
  expect(hook.result.current.attempt?.phase.kind).toBe("finished");
  act(() => hook.advance(10000));
  expect(hook.result.current.attempt).toBeUndefined();
});
it.each(["no-steps", "document-unavailable", "busy"] as const)(
  "preserves typed host rejection %s",
  async (reason) => {
    const hook = setup();
    host.client.request.mockRejectedValue(
      new HostFailure({ kind: "residentControlRejected", reason }),
    );
    await act(async () => {
      await hook.result.current.rehearse(hook.target);
    });
    expect(hook.result.current.attempt?.phase).toEqual({
      kind: "rejected",
      reason,
    });
  },
);
it("drops a late Queued after a resident restart", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.rehearse(hook.target);
  });
  const reboot = structuredClone(hook.resident);
  if (reboot.execution) reboot.execution.instance = "e".repeat(64);
  hook.rerender({ value: reboot });
  await act(async () => {
    resolve({
      method: "launcher.resident.rehearse",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
});
it.each(["finished", "rejected"] as const)(
  "keeps %s across disconnection and host issues",
  async (terminal) => {
    const hook = setup(true);
    const target = hook.result.current.cancelTarget;
    if (!target) throw new Error("active fixture");
    host.client.request.mockResolvedValue({
      method: "launcher.resident.cancel",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await act(async () => {
      await hook.result.current.cancel(target);
    });
    const next = structuredClone(hook.resident);
    if (!next.execution) throw new Error("execution fixture");
    next.execution.events.push({
      seq: "2",
      kind: {
        kind: "order-received",
        request: "d".repeat(32),
        receipt:
          terminal === "rejected"
            ? { kind: "rejected", reason: "wrong-run" }
            : { kind: "accepted", run: "1" },
      },
    });
    if (terminal === "finished")
      next.execution.events.push({
        seq: "3",
        kind: {
          kind: "finished",
          run: "1",
          outcome: { kind: "cancelled", reason: "user" },
        },
      });
    hook.rerender({ value: next });
    const phase = hook.result.current.attempt?.phase;
    expect(phase?.kind).toBe(terminal);
    act(() => {
      hook.cache.setQueryData(coreKey, { ...hook.core, services: "offline" });
    });
    next.online = false;
    hook.rerender({ value: structuredClone(next) });
    expect(hook.result.current.attempt?.phase).toEqual(phase);
    host.issue = "Disconnected host";
    hook.rerender({ value: structuredClone(next) });
    expect(hook.result.current.attempt?.phase).toEqual(phase);
    act(() => hook.advance(10000));
    expect(hook.result.current.attempt).toBeUndefined();
  },
);
it.each(["stopped", "replaced"] as const)(
  "releases an Accepted attempt when its run is %s without inventing Finished",
  async (transition) => {
    const hook = setup(true);
    const target = hook.result.current.cancelTarget;
    if (!target) throw new Error("active fixture");
    host.client.request.mockResolvedValue({
      method: "launcher.resident.cancel",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await act(async () => {
      await hook.result.current.cancel(target);
    });
    const next = structuredClone(hook.resident);
    if (!next.execution?.active) throw new Error("execution fixture");
    next.execution.events.push({
      seq: "2",
      kind: {
        kind: "order-received",
        request: "d".repeat(32),
        receipt: { kind: "accepted", run: "1" },
      },
    });
    hook.rerender({ value: structuredClone(next) });
    expect(hook.result.current.busy).toBe(true);
    expect(hook.result.current.attempt?.phase.kind).toBe("accepted");
    if (transition === "replaced") next.execution.active.run = "2";
    else next.running = false;
    hook.rerender({ value: structuredClone(next) });
    expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
    expect(hook.result.current.busy).toBe(transition === "replaced");
    next.running = false;
    next.execution.active = null;
    hook.rerender({ value: structuredClone(next) });
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
  },
);
