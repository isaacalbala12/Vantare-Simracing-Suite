// Real MessageChannel; only the timers are faked, so no test sleeps.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UiToHost } from "../src/contract/generated/contract";
import {
  Client,
  HostFailure,
  InvalidHostResponse,
} from "../src/renderer/bridge/client";

const secret = "C:\\Users\\isaac\\secreto.json";
const cleanups: Array<() => void> = [];
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const logged = () => JSON.stringify(log.mock.calls);
function setup() {
  const { port1, port2 } = new MessageChannel();
  const client = Reflect.construct(Client, [
    port1,
    () => port2.close(),
  ]) as Client;
  cleanups.push(() => client.close());
  const sent: UiToHost[] = [];
  port2.onmessage = ({ data }) => sent.push(data);
  port2.start();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const requested = async (count: number) => {
    while (sent.length < count) await flush();
  };
  return { client, port2, sent, flush, requested };
}
const coreGet = { method: "core.get" } as const;
const settle = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok" as const,
    (error: unknown) => error,
  );

it("fails the request at once with a local error, leaves no timer, and the next request works", async () => {
  const { client, port2, sent, requested } = setup();
  const first = settle(client.request(coreGet));
  await requested(1);
  expect(vi.getTimerCount()).toBe(1);
  port2.postMessage({
    kind: "response",
    id: 1,
    result: { method: "core.get", value: secret },
  });
  const error = await first;
  expect(error).toBeInstanceOf(InvalidHostResponse);
  expect(error).toBeInstanceOf(HostFailure);
  expect((error as InvalidHostResponse).detail.kind).not.toBe(
    "coreUnavailable",
  );
  expect(vi.getTimerCount()).toBe(0);
  const second = client.request(coreGet);
  await requested(2);
  expect(sent[1]).toMatchObject({ kind: "request", id: 2 });
  port2.postMessage({ kind: "failure", id: 2, error: { kind: "busy" } });
  await expect(second).rejects.toMatchObject({ detail: { kind: "busy" } });
  expect(logged()).not.toContain("secreto");
});
it("turns the local failure from main into the local error for that request only", async () => {
  const { client, port2, requested } = setup();
  const one = settle(client.request(coreGet));
  const two = settle(client.request(coreGet));
  await requested(2);
  port2.postMessage({
    kind: "failure",
    id: 1,
    error: { kind: "io" },
    local: "invalidResponse",
  });
  expect(await one).toBeInstanceOf(InvalidHostResponse);
  expect(vi.getTimerCount()).toBe(1);
  port2.postMessage({ kind: "failure", id: 2, error: { kind: "denied" } });
  expect(await two).toMatchObject({ detail: { kind: "denied" } });
});
it("does not hang a method without deadline", async () => {
  const { client, port2, requested } = setup();
  const exported = settle(
    client.request({ method: "report.localExport" } as never),
  );
  await requested(1);
  expect(vi.getTimerCount()).toBe(0);
  port2.postMessage({ kind: "response", id: 1, result: { method: 5 } });
  expect(await exported).toBeInstanceOf(InvalidHostResponse);
});
it("ignores invalid replies that select no pending request and keeps the others alive", async () => {
  const { client, port2, flush, requested } = setup();
  const pending = settle(client.request(coreGet));
  await requested(1);
  for (const bad of [
    { kind: "response", id: 99, result: secret },
    { kind: "response", id: -1, result: secret },
    { kind: "response", id: 0, result: secret },
    { kind: "response", id: 1.5, result: secret },
    { kind: "response", id: "1", result: secret },
    { kind: "event", event: secret },
    secret,
    null,
  ]) {
    port2.postMessage(bad);
    await flush();
  }
  expect(vi.getTimerCount()).toBe(1);
  port2.postMessage({ kind: "failure", id: 1, error: { kind: "busy" } });
  expect(await pending).toMatchObject({ detail: { kind: "busy" } });
  expect(logged()).not.toContain("secreto");
  expect(logged()).not.toContain("Users");
});
it("settles the request exactly once for the observers; the old deadline never fires afterwards", async () => {
  const { client, port2, requested } = setup();
  const events: unknown[] = [];
  client.observeRequests((event) => events.push(event));
  const pending = settle(client.request(coreGet));
  await requested(1);
  port2.postMessage({ kind: "response", id: 1, result: { method: "x" } });
  await pending;
  vi.advanceTimersByTime(60_000);
  expect(events).toEqual([
    { id: 1, method: "core.get", phase: "start" },
    { id: 1, method: "core.get", phase: "done", error: { kind: "io" } },
  ]);
});
it("rejects on an invalid failure too, when its id is pending", async () => {
  const { client, port2, requested } = setup();
  const pending = settle(client.request(coreGet));
  await requested(1);
  port2.postMessage({ kind: "failure", id: 1, error: { kind: secret } });
  expect(await pending).toBeInstanceOf(InvalidHostResponse);
});
it("ignores a second reply for the same id, valid or not", async () => {
  const { client, port2, flush, requested } = setup();
  const first = settle(client.request(coreGet));
  const other = settle(client.request(coreGet));
  await requested(2);
  port2.postMessage({ kind: "response", id: 1, result: { method: "x" } });
  expect(await first).toBeInstanceOf(InvalidHostResponse);
  port2.postMessage({ kind: "failure", id: 1, error: { kind: "busy" } });
  port2.postMessage({ kind: "response", id: 1, result: { method: "y" } });
  await flush();
  expect(vi.getTimerCount()).toBe(1);
  port2.postMessage({ kind: "failure", id: 2, error: { kind: "busy" } });
  expect(await other).toMatchObject({ detail: { kind: "busy" } });
});
it("ids that are not safe ids select nothing", async () => {
  const { client, port2, flush, requested } = setup();
  const pending = settle(client.request(coreGet));
  await requested(1);
  for (const id of [Number.NaN, Infinity, -Infinity, 2 ** 32, 2 ** 53, 1e21]) {
    port2.postMessage({ kind: "response", id, result: secret });
    await flush();
  }
  expect(vi.getTimerCount()).toBe(1);
  port2.postMessage({ kind: "failure", id: 1, error: { kind: "busy" } });
  expect(await pending).toMatchObject({ detail: { kind: "busy" } });
});
it("logs the first invalid replies and then only an occasional count", async () => {
  const { port2, flush } = setup();
  for (let i = 0; i < 250; i++) port2.postMessage(secret);
  await flush();
  await flush();
  expect(log.mock.calls.length).toBeGreaterThanOrEqual(5);
  expect(log.mock.calls.length).toBeLessThanOrEqual(8);
  expect(logged()).not.toContain("secreto");
});
