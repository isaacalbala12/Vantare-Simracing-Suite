// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  CloseReason,
  HostToUi,
  ReportFields,
  UiToHost,
} from "../src/contract/generated/contract";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import type { CloseClock } from "../src/renderer/bridge/report-close";

const fields: ReportFields = {
  actionText: "Última edición",
  expectedText: "Esperado",
  observedText: "Observado",
  contextText: "",
  module: "calendar",
};
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
  vi.restoreAllMocks();
});
function setup() {
  const { port1, port2 } = new MessageChannel();
  let time = 0,
    sequence = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: CloseClock = {
    now: () => time,
    set(run, ms) {
      const id = ++sequence;
      timers.set(id, { at: time + ms, run });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear(id) {
      timers.delete(id as unknown as number);
    },
  };
  const client = Reflect.construct(Client, [
    port1,
    () => port2.close(),
    undefined,
    clock,
  ]) as Client;
  cleanups.push(() => client.close());
  const sent = vi.spyOn(client, "send");
  const received: UiToHost[] = [],
    queued: UiToHost[] = [];
  let waiting: ((message: UiToHost) => void) | undefined;
  port2.onmessage = ({ data }: MessageEvent<UiToHost>) => {
    received.push(data);
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve(data);
    } else queued.push(data);
  };
  port2.start();
  const next = () =>
    queued.length
      ? Promise.resolve(queued.shift() as UiToHost)
      : new Promise<UiToHost>((resolve) => {
          waiting = resolve;
        });
  return {
    client,
    received,
    sent,
    next,
    timers,
    post: (message: HostToUi) => port2.postMessage(message),
    elapseWithoutTimers(ms: number) {
      time += ms;
    },
    advance(ms: number) {
      time += ms;
      for (const [id, timer] of timers)
        if (timer.at <= time) {
          timers.delete(id);
          timer.run();
        }
    },
  };
}
function complete(h: ReturnType<typeof setup>, message: UiToHost) {
  if (message.kind !== "request" || message.request.method !== "draft.save")
    throw Error("Expected closed draft save");
  h.post({
    kind: "response",
    id: message.id,
    result: {
      method: "draft.save",
      value: {
        fields,
        exists: true,
        screenshots: [],
        message: "",
        legacy: "none",
      },
    },
  });
}
it("saves through the real port while ordinary requests stay busy, without duplicating a second X", async () => {
  const h = setup(),
    failed = vi.fn();
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  const request = await h.next();
  expect(request).toMatchObject({
    kind: "request",
    request: { method: "draft.save", fields },
  });
  await expect(h.client.request({ method: "core.get" })).rejects.toEqual(
    new HostFailure({ kind: "busy" }),
  );
  h.post({ kind: "closeRequested", reason: "window" });
  complete(h, request);
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: true });
  expect(h.received.filter((m) => m.kind === "request")).toHaveLength(1);
  expect(failed).not.toHaveBeenCalled();
  expect(h.timers.size).toBe(0);
});
it("vetoes a failed save and offers recovery through the registered failure handler", async () => {
  const h = setup(),
    failed = vi.fn();
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  const request = await h.next();
  if (request.kind !== "request") throw Error("Expected request");
  h.post({ kind: "failure", id: request.id, error: { kind: "io" } });
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: false });
  expect(failed).toHaveBeenCalledOnce();
  expect(h.timers.size).toBe(0);
});
it("uses one injected five-second deadline and ignores a late successful save after the veto", async () => {
  const h = setup(),
    failed = vi.fn();
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  const request = await h.next();
  h.advance(4999);
  expect(h.received.some((m) => m.kind === "closeAnswer")).toBe(false);
  h.advance(1);
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: false });
  expect(failed).toHaveBeenCalledOnce();
  complete(h, request);
  // A subsequent correlated response is a real port barrier after the late save.
  const pending = h.client
    .request({ method: "testing.refresh" })
    .catch(() => {});
  const barrier = await h.next();
  if (barrier.kind !== "request") throw Error("Expected barrier");
  h.post({
    kind: "failure",
    id: barrier.id,
    error: { kind: "coreUnavailable" },
  });
  await pending;
  expect(h.received.filter((m) => m.kind === "closeAnswer")).toHaveLength(1);
});
it.each(["live", "restart", "controlEof"] as const)(
  "%s interrupts preparation immediately without a dialog or a late close",
  async (reason: CloseReason) => {
    const h = setup(),
      failed = vi.fn(),
      guard = vi.fn(() => false);
    h.client.addCloseGuard(guard);
    h.client.setReportClosePreparation({
      prepare: async (save) => {
        await save(fields);
        return "saved";
      },
      failed,
    });
    h.post({ kind: "closeRequested", reason: "window" });
    const request = await h.next();
    h.post({ kind: "closeRequested", reason });
    expect(await h.next()).toEqual({ kind: "closeAnswer", allow: true });
    complete(h, request);
    await new Promise<void>((resolve) => {
      const stop = h.client.listen((message) => {
        if (message.kind === "closeRequested" && message.reason === "window") {
          stop();
          resolve();
        }
      });
      h.post({ kind: "closeRequested", reason: "window" });
    });
    expect(
      h.sent.mock.calls.filter(([message]) => message.kind === "closeAnswer"),
    ).toHaveLength(1);
    expect(h.timers.size).toBe(0);
    expect(failed).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  },
);
it.each(["live", "restart", "controlEof"] as const)(
  "%s never starts a draft preparation",
  async (reason: CloseReason) => {
    const h = setup(),
      prepare = vi.fn(async () => "saved" as const);
    h.client.setReportClosePreparation({ prepare, failed: vi.fn() });
    h.post({ kind: "closeRequested", reason });
    expect(await h.next()).toEqual({ kind: "closeAnswer", allow: true });
    expect(prepare).not.toHaveBeenCalled();
    expect(h.timers.size).toBe(0);
  },
);

it("counts waiting for an in-flight edit inside the same total deadline", async () => {
  const h = setup(),
    failed = vi.fn();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      entered();
      await gate;
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  await started;
  h.advance(5000);
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: false });
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(h.sent.mock.calls.some(([m]) => m.kind === "request")).toBe(false);
  expect(failed).toHaveBeenCalledOnce();
});
it("does not send an old-session save when invalidation happens while waiting", async () => {
  const h = setup(),
    session = new AbortController();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      entered();
      await gate;
      await save(fields, session.signal);
      return "saved";
    },
    failed: vi.fn(),
  });
  h.post({ kind: "closeRequested", reason: "window" });
  await started;
  session.abort();
  release();
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: false });
  expect(h.received.some((m) => m.kind === "request")).toBe(false);
});
it("owner shutdown cancels preparation without a failure dialog", async () => {
  const h = setup(),
    failed = vi.fn();
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  await h.next();
  h.client.close();
  await Promise.resolve();
  await Promise.resolve();
  expect(h.timers.size).toBe(0);
  expect(failed).not.toHaveBeenCalled();
});

it("rejects a success after the deadline even if the event loop delayed its timer", async () => {
  const h = setup(),
    failed = vi.fn();
  h.client.setReportClosePreparation({
    prepare: async (save) => {
      await save(fields);
      return "saved";
    },
    failed,
  });
  h.post({ kind: "closeRequested", reason: "window" });
  const request = await h.next();
  h.elapseWithoutTimers(5001);
  complete(h, request);
  expect(await h.next()).toEqual({ kind: "closeAnswer", allow: false });
  expect(failed).toHaveBeenCalledOnce();
});
