import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createSocketPullPost} from "./overlay-socket-pull";
import {readFileSync} from "node:fs";

class Socket extends EventTarget {
  static instances: Socket[] = [];
  readyState = 0;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.dispatchEvent(new Event("close")); });
  constructor(readonly url: string, readonly protocol: string) { super(); Socket.instances.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  message(data: string) { this.dispatchEvent(new MessageEvent("message", {data})); }
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, json: async () => ({url: "ws://127.0.0.1:40001", token: "a".repeat(52)})}));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("negotiates sections and rebuilds a complete update across a socket reconnect", async () => {
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({url:"ws://127.0.0.1:40001",token:"a".repeat(52),sections:1})} as Response);
 const post=createSocketPullPost();
 const original=JSON.parse(readFileSync("../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json","utf8")); original.revision=1;
 const first=post("/pull",{sessionId:"s",ack:0});
 await vi.advanceTimersByTimeAsync(0); const socket=Socket.instances[0]!;socket.open();await vi.advanceTimersByTimeAsync(0);
 expect(JSON.parse(socket.send.mock.calls[0]![0]).sections).toBe(1);
 socket.message(JSON.stringify({sessionId:"s",delivery:1,events:[{name:"telemetry:overlay-v2:snapshot",data:original}]})); await first;
 socket.close();
 const second=post("/pull",{sessionId:"s",ack:1});
 await vi.advanceTimersByTimeAsync(0);const reopened=Socket.instances[1]!;reopened.open();await vi.advanceTimersByTimeAsync(0);
 reopened.message(JSON.stringify({sessionId:"s",delivery:2,events:[{name:"telemetry:overlay-v2:snapshot",baseRevision:1,data:{revision:2,source:original.source,frame:{standings:[]}}}]}));
 await expect(second).resolves.toMatchObject({events:[{data:{revision:2,frame:{weather:original.frame.weather,standings:[]}}}]});
 await post("/close",{sessionId:"s",ack:2});
 expect(vi.getTimerCount()).toBe(0);
});

it("reuses one socket, preserves responses and cancels a pending pull on stop", async () => {
  const post = createSocketPullPost();
  const first = post("/pull", {sessionId: "s", ack: 0});
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances[0]!;
  expect(socket.url).toBe("ws://127.0.0.1:40001");
  expect(socket.protocol).toHaveLength(52);
  socket.open();
  await vi.advanceTimersByTimeAsync(0);
  expect(JSON.parse(socket.send.mock.calls[0]![0])).toEqual({route: "pull", sessionId: "s", ack: 0});
  socket.message('{"sessionId":"s","delivery":1,"events":[]}');
  await expect(first).resolves.toEqual({sessionId: "s", delivery: 1, events: []});
  const second = post("/pull", {sessionId: "s", ack: 1});
  await vi.advanceTimersByTimeAsync(0);
  socket.message("null");
  await expect(second).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  const pending = post("/pull", {sessionId: "s", ack: 1});
  const stopped = expect(pending).rejects.toThrow("stopped");
  await post("/close", {sessionId: "s", ack: 1});
  await stopped;
  expect(socket.close).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds bootstrap and connection time and refuses non-loopback endpoints", async () => {
  const post = createSocketPullPost();
  vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
  const first = expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(5_000);
  await first;
  vi.mocked(fetch).mockResolvedValueOnce({ok: true, json: async () => ({url: "ws://outside.invalid", token: "x".repeat(52)})} as Response);
  await expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("endpoint");
  expect(Socket.instances).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not create a late socket after stop while bootstrapping", async () => {
  const post = createSocketPullPost();
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = expect(post("/pull", {sessionId: "old", ack: 0})).rejects.toThrow("stopped");
  await post("/close", {sessionId: "old", ack: 0});
  await pending;
  finish({ok: true, json: async () => ({url: "ws://127.0.0.1:40001", token: "x".repeat(52)})} as Response);
  await vi.advanceTimersByTimeAsync(0);
  expect(Socket.instances).toHaveLength(0);
});

it("rejects malformed responses and a connection that never opens", async () => {
  const post = createSocketPullPost();
  const noOpen = expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(5_000);
  await noOpen;
  expect(Socket.instances[0]!.close).toHaveBeenCalled();
  const invalid = expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("response");
  await vi.advanceTimersByTimeAsync(0);
  const next = Socket.instances[1]!;
  next.open();
  await vi.advanceTimersByTimeAsync(0);
  next.message("not-json");
  await invalid;
  expect(next.close).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans pending work even when sending the close message fails", async () => {
  const post = createSocketPullPost();
  const pending = expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("stopped");
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances[0]!;
  socket.open();
  await vi.advanceTimersByTimeAsync(0);
  socket.send.mockImplementationOnce(() => { throw new Error("send failed"); });
  expect(() => post("/close", {sessionId: "s", ack: 0})).toThrow("send failed");
  await pending;
  expect(socket.close).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves contract errors from owned parsing for the V2 failure boundary", async () => {
  const post = createSocketPullPost();
  const failed = expect(post("/pull", {sessionId: "s", ack: 0})).rejects.toThrow("overlay-frame-v2:invalid-contract:revision");
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances[0]!;
  socket.open();
  await vi.advanceTimersByTimeAsync(0);
  socket.message(JSON.stringify({sessionId: "s", delivery: 1, events: [{name: "telemetry:overlay-v2:snapshot", data: {revision: 0, source: {state: "live"}, frame: null}}]}));
  await failed;
  expect(socket.close).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
