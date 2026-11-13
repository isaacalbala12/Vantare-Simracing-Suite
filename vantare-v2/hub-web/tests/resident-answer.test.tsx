// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type {
  CoreStatus,
  ResidentView,
} from "../src/contract/generated/contract";
import { coreKey } from "../src/renderer/app/Host";
import { HostFailure } from "../src/renderer/bridge/client";
import {
  type AnswerClock,
  useResidentAnswer,
} from "../src/renderer/screens/launcher/resident-answer";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => host,
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  host.client.request.mockReset();
});
function setup() {
  const core = {
    ...structuredClone(coreFixture),
    services: "connected",
    accountGeneration: "a".repeat(64),
  } as CoreStatus;
  core.access.verified = true;
  const view: ResidentView = {
    protected: false,
    online: true,
    running: true,
    error: false,
    registrations: [],
    decision: {
      id: "2",
      kind: "alreadyRunning",
      actions: [
        { id: "reuse", label: "Reutilizar" },
        { id: "cancel", label: "Cancelar" },
        { id: "trust", label: "Confiar y lanzar" },
      ],
    },
    execution: {
      instance: "b".repeat(64),
      checkedAnswer: true,
      revisionCheckedLaunch: true,
      question: {
        decision: "2",
        run: "1",
        revision: "c".repeat(64),
        accountGeneration: core.accountGeneration as string,
      },
      firstRetainedSeq: "1",
      events: [{ seq: "1", kind: { kind: "started", run: "1" } }],
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  cache.setQueryData(coreKey, core);
  let now = 0;
  let timeout: (() => void) | undefined;
  const time: AnswerClock = {
    now: () => now,
    schedule: (callback) => {
      timeout = callback;
      return () => {
        timeout = undefined;
      };
    },
  };
  const hook = renderHook(({ value }) => useResidentAnswer(value, time), {
    initialProps: { value: view },
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return {
    ...hook,
    view,
    core,
    cache,
    expire: () => {
      now = 5000;
      timeout?.();
    },
  };
}
it("captures the exact question scope and blocks a second click before Queued", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.answer("reuse");
    void hook.result.current.answer("reuse");
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
  expect(host.client.request).toHaveBeenCalledWith({
    method: "launcher.resident.answer",
    target: {
      ...hook.view.execution?.question,
      instance: "b".repeat(64),
      action: "reuse",
    },
  });
  await act(async () => {
    resolve({
      method: "launcher.resident.answer",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("queued");
  act(hook.expire);
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("Trust never issues a request, and reducing actions remain available after rights revocation", async () => {
  const hook = setup();
  act(() => {
    void hook.result.current.answer("trust");
  });
  expect(host.client.request).not.toHaveBeenCalled();
  act(() => {
    hook.cache.setQueryData(coreKey, {
      ...hook.core,
      access: { ...hook.core.access, verified: false, blocked: true },
    });
  });
  hook.rerender({ value: structuredClone(hook.view) });
  await waitFor(() =>
    expect(hook.result.current.available("reuse")).toBe(false),
  );
  expect(hook.result.current.available("cancel")).toBe(true);
});
it("does not attach a late Queued response to a different account", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.answer("cancel");
  });
  act(() => {
    hook.cache.setQueryData(coreKey, {
      ...hook.core,
      accountGeneration: "e".repeat(64),
    });
  });
  hook.rerender({ value: structuredClone(hook.view) });
  await act(async () => {
    resolve({
      method: "launcher.resident.answer",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
  expect(hook.result.current.available("cancel")).toBe(false);
});
it("observes a receipt that arrived before Queued and never infers Finished from running=false", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.answer("reuse");
  });
  const received = structuredClone(hook.view);
  if (!received.execution) throw new Error("fixture execution");
  received.execution.events.push({
    seq: "2",
    kind: {
      kind: "order-received",
      request: "d".repeat(32),
      receipt: { kind: "accepted", run: "1" },
    },
  });
  received.execution.question = null;
  received.decision = null;
  received.running = false;
  hook.rerender({ value: received });
  await act(async () => {
    resolve({
      method: "launcher.resident.answer",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("accepted");
  const finished = structuredClone(received);
  finished.execution?.events.push({
    seq: "3",
    kind: {
      kind: "finished",
      run: "1",
      outcome: { kind: "cancelled", reason: "user" },
    },
  });
  hook.rerender({ value: finished });
  expect(hook.result.current.attempt?.phase).toEqual({
    kind: "finished",
    outcome: { kind: "cancelled", reason: "user" },
  });
});
it("a second scoped question can be answered while the chain is still running", async () => {
  const hook = setup();
  host.client.request.mockResolvedValue({
    method: "launcher.resident.answer",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await hook.result.current.answer("reuse");
  });
  const next = structuredClone(hook.view);
  if (!next.execution?.question || !next.decision)
    throw new Error("fixture question");
  next.execution.question.decision = "3";
  next.decision.id = "3";
  next.execution.events.push({
    seq: "2",
    kind: {
      kind: "order-received",
      request: "d".repeat(32),
      receipt: { kind: "accepted", run: "1" },
    },
  });
  hook.rerender({ value: next });
  expect(hook.result.current.available("cancel")).toBe(true);
  await act(async () => {
    await hook.result.current.answer("cancel");
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  expect(host.client.request.mock.calls[1][0].target.decision).toBe("3");
});

it("does not resurrect a pending answer after disconnect and reconnect", async () => {
  const hook = setup();
  let resolve!: (value: unknown) => void;
  host.client.request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let sent!: Promise<void>;
  act(() => {
    sent = hook.result.current.answer("cancel");
  });
  act(() => {
    hook.cache.setQueryData(coreKey, { ...hook.core, services: "unavailable" });
  });
  hook.rerender({ value: structuredClone(hook.view) });
  await waitFor(() =>
    expect(hook.result.current.attempt?.phase.kind).toBe("unknown"),
  );
  act(() => {
    hook.cache.setQueryData(coreKey, hook.core);
  });
  hook.rerender({ value: structuredClone(hook.view) });
  await act(async () => {
    resolve({
      method: "launcher.resident.answer",
      value: { kind: "queued", request: "d".repeat(32) },
    });
    await sent;
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
});

it("does not issue twice between Queued and the next React commit", async () => {
  const hook = setup();
  host.client.request.mockResolvedValue({
    method: "launcher.resident.answer",
    value: { kind: "queued", request: "d".repeat(32) },
  });
  await act(async () => {
    await hook.result.current.answer("cancel");
    await hook.result.current.answer("cancel");
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("known rejection permits a new explicit answer; uncertain transport does not", async () => {
  const hook = setup();
  host.client.request.mockRejectedValueOnce(
    new HostFailure({
      kind: "residentAnswerRejected",
      reason: "stale-question",
    }),
  );
  await act(async () => {
    await hook.result.current.answer("cancel");
  });
  expect(hook.result.current.attempt?.phase).toEqual({
    kind: "rejected",
    reason: "stale-question",
  });
  expect(hook.result.current.available("cancel")).toBe(true);
  host.client.request.mockRejectedValueOnce(new Error("transport"));
  await act(async () => {
    await hook.result.current.answer("cancel");
  });
  expect(hook.result.current.attempt?.phase.kind).toBe("unknown");
  expect(hook.result.current.available("cancel")).toBe(false);
  expect(host.client.request).toHaveBeenCalledTimes(2);
});
it("a resident without checkedAnswer cannot be answered", async () => {
  const hook = setup();
  const legacy = structuredClone(hook.view);
  if (legacy.execution) legacy.execution.checkedAnswer = false;
  hook.rerender({ value: legacy });
  await act(async () => {
    await hook.result.current.answer("cancel");
  });
  expect(host.client.request).not.toHaveBeenCalled();
});
