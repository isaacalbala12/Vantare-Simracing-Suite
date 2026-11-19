import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { createHost } from "../src/main/host";
import { helloForScene } from "../src/main/mock-host";

const sockets: FakeSocket[] = [];
class FakeSocket extends EventEmitter {
  destroyed = false;
  write = vi.fn();
  destroy(error?: Error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    if (error) this.emit("error", error);
    this.emit("close");
    return this;
  }
}
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("node:net", () => ({
  connect: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));
const frame = (value: unknown) => {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
};
const validFailure = { kind: "failure", id: 7, error: { kind: "busy" } };
// A reply whose payload breaks the contract; the secret must never reach logs.
const bs = String.fromCharCode(92);
const secret = ["C:", "Users", "isaac", "secreto.json"].join(bs);
const invalidReply = (id: unknown) => ({
  kind: "response",
  id,
  result: { method: "core.get", value: secret },
});
let seen: HostToUi[];
let log: ReturnType<typeof vi.spyOn>;
function start() {
  vi.stubEnv("VANTARE_HUB_PIPE", `vantare-hub-ui-${"a".repeat(64)}`);
  vi.stubEnv("VANTARE_HUB_TOKEN", "b".repeat(64));
  const host = createHost();
  host.hello.catch(() => {});
  seen = [];
  host.listen((message) => seen.push(message));
  return { host, socket: sockets[sockets.length - 1] as FakeSocket };
}
beforeEach(() => {
  sockets.length = 0;
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const logged = () => JSON.stringify(log.mock.calls);

it("answers an invalid reply with a local failure for that id, keeps the socket and delivers the next reply", () => {
  const { host, socket } = start();
  socket.emit("data", frame(invalidReply(3)));
  expect(socket.destroyed).toBe(false);
  expect(seen).toEqual([
    {
      kind: "failure",
      id: 3,
      error: { kind: "io" },
      local: "invalidResponse",
    },
  ]);
  socket.emit("data", frame(validFailure));
  expect(seen[1]).toEqual(validFailure);
  expect(seen.some((m) => JSON.stringify(m).includes("coreUnavailable"))).toBe(
    false,
  );
  host.close();
});
it("handles an invalid reply and a valid one arriving in the same chunk", () => {
  const { host, socket } = start();
  socket.emit(
    "data",
    Buffer.concat([frame(invalidReply(3)), frame(validFailure)]),
  );
  expect(socket.destroyed).toBe(false);
  expect(seen.map((m) => ("id" in m ? m.id : -1))).toEqual([3, 7]);
  host.close();
});
it("discards, logs and keeps the socket when the envelope cannot be read", () => {
  const { host, socket } = start();
  for (const bad of [
    { kind: "response", id: -1, result: secret },
    { kind: "response", id: 1.5, result: secret },
    { kind: "response", id: 0, result: secret },
    { kind: "response", id: "4", result: secret },
    { kind: "event", event: secret },
    { kind: secret },
    [secret],
    secret,
    null,
  ])
    socket.emit("data", frame(bad));
  expect(socket.destroyed).toBe(false);
  expect(seen).toEqual([]);
  expect(log).toHaveBeenCalledTimes(5); // capped per connection
  socket.emit("data", frame(validFailure));
  expect(seen).toEqual([validFailure]);
  host.close();
});
it("logs only the kind and the id, never the message content", () => {
  const { host, socket } = start();
  socket.emit("data", frame(invalidReply(3)));
  socket.emit("data", frame({ kind: "event", event: secret }));
  expect(log).toHaveBeenCalledTimes(2);
  for (const fragment of ["secreto", "Users", "isaac", "\\", "core.get"])
    expect(logged()).not.toContain(fragment);
  expect(logged()).toContain("response");
  expect(logged()).toContain("3");
  host.close();
});
it("an invalid hello before the handshake still fails the connection", () => {
  const { socket } = start();
  socket.emit("data", frame({ kind: "hello", version: "x" }));
  expect(socket.destroyed).toBe(true);
});
it("keeps closing on protocol failures: frame length, JSON and decoded stream", () => {
  for (const chunk of [
    Buffer.from([0, 0, 0, 0]),
    Buffer.from([0xff, 0xff, 0xff, 0x7f]),
    Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from("{{{")]),
    "texto" as never,
  ]) {
    const { socket } = start();
    socket.emit("data", chunk);
    expect(socket.destroyed).toBe(true);
    expect(seen).toEqual([
      { kind: "failure", id: 0, error: { kind: "coreUnavailable" } },
    ]);
  }
});
it("an invalid closeRequested still closes the connection, never lost silently", () => {
  const { socket } = start();
  socket.emit("data", frame({ kind: "closeRequested", reason: secret }));
  expect(socket.destroyed).toBe(true);
  expect(seen).toEqual([
    { kind: "failure", id: 0, error: { kind: "coreUnavailable" } },
  ]);
  expect(logged()).not.toContain("secreto");
});
it("an invalid event is discarded and logged without closing", () => {
  const { host, socket } = start();
  socket.emit("data", frame({ kind: "event", event: { topic: "nope" } }));
  expect(socket.destroyed).toBe(false);
  expect(seen).toEqual([]);
  expect(log).toHaveBeenCalledTimes(1);
  host.close();
});
it("an invalid hello after the handshake is discarded and logged without closing", async () => {
  const { host, socket } = start();
  socket.emit("data", frame(helloForScene(undefined)));
  await host.hello;
  socket.emit("data", frame({ kind: "hello", version: secret }));
  expect(socket.destroyed).toBe(false);
  expect(seen).toEqual([]);
  expect(log).toHaveBeenCalledTimes(1);
  host.close();
});
it("an invalid failure with a valid id gets the local failure too", () => {
  const { host, socket } = start();
  socket.emit(
    "data",
    frame({ kind: "failure", id: 5, error: { kind: secret } }),
  );
  expect(socket.destroyed).toBe(false);
  expect(seen).toEqual([
    { kind: "failure", id: 5, error: { kind: "io" }, local: "invalidResponse" },
  ]);
  host.close();
});
it("ids outside the contract range select nothing", () => {
  const { host, socket } = start();
  for (const id of [2 ** 32, 2 ** 53, 1e21, null])
    socket.emit("data", frame(invalidReply(id)));
  socket.emit("data", frame({ kind: "response", id: 1, result: [] }));
  expect(seen.map((m) => ("id" in m ? m.id : -1))).toEqual([1]);
  host.close();
});
it("the same id invalid twice gives two local failures and then the valid reply still flows", () => {
  const { host, socket } = start();
  socket.emit("data", frame(invalidReply(3)));
  socket.emit("data", frame(invalidReply(3)));
  socket.emit(
    "data",
    frame({ kind: "failure", id: 3, error: { kind: "busy" } }),
  );
  expect(seen.map((m) => JSON.stringify(m))).toHaveLength(3);
  expect(socket.destroyed).toBe(false);
  host.close();
});
it("the host cannot send the local marker itself", () => {
  expect(
    isHostMessage({
      kind: "failure",
      id: 1,
      error: { kind: "io" },
      local: "invalidResponse",
    }),
  ).toBe(false);
  const { host, socket } = start();
  socket.emit(
    "data",
    frame({ kind: "failure", id: 9, error: { kind: "busy" }, local: "x" }),
  );
  // Treated like any invalid reply: only the local failure for that id.
  expect(seen).toEqual([
    { kind: "failure", id: 9, error: { kind: "io" }, local: "invalidResponse" },
  ]);
  host.close();
});
it("logs the first invalid replies, then only an occasional count", () => {
  const { host, socket } = start();
  for (let i = 1; i <= 250; i++) socket.emit("data", frame(invalidReply(i)));
  expect(seen).toHaveLength(250);
  expect(log.mock.calls.length).toBeLessThanOrEqual(8);
  expect(log.mock.calls.length).toBeGreaterThanOrEqual(5);
  host.close();
});
