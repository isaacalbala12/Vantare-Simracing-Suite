import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { createHost } from "../src/main/host";

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
const secret = "C:Usersisaacsecreto.json";
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
  expect(log).toHaveBeenCalledTimes(9);
  socket.emit("data", frame(validFailure));
  expect(seen).toEqual([validFailure]);
  host.close();
});
it("logs only the kind and the id, never the message content", () => {
  const { host, socket } = start();
  socket.emit("data", frame(invalidReply(3)));
  socket.emit("data", frame({ kind: "event", event: secret }));
  expect(log).toHaveBeenCalledTimes(2);
  expect(logged()).not.toContain("secreto");
  expect(logged()).not.toContain("Users");
  expect(logged()).toContain("response");
  expect(logged()).toContain("3");
  host.close();
});
it("keeps closing on protocol failures (frame length, JSON)", () => {
  for (const chunk of [
    Buffer.from([0, 0, 0, 0]),
    Buffer.from([0xff, 0xff, 0xff, 0x7f]),
    Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from("{{{")]),
  ]) {
    const { socket } = start();
    socket.emit("data", chunk);
    expect(socket.destroyed).toBe(true);
    expect(seen).toEqual([
      { kind: "failure", id: 0, error: { kind: "coreUnavailable" } },
    ]);
  }
});
it("an invalid hello before the handshake still fails the connection", () => {
  const { socket } = start();
  socket.emit("data", frame({ kind: "hello", version: "x" }));
  expect(socket.destroyed).toBe(true);
});
