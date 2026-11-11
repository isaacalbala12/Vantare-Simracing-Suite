import { connect } from "node:net";
import { app } from "electron";
import type { HostToUi, UiToHost } from "../contract/generated/contract";
import {
  bounded,
  FRAME_LIMIT,
  isHostMessage,
  isUiMessage,
} from "../contract/validation";
import { createMockHost, helloForScene } from "./mock-host";
import { mockAllowed } from "./security";
export type Hello = Extract<HostToUi, { kind: "hello" }>;
export interface HostLink {
  hello: Promise<Hello>;
  send: (value: UiToHost, flushed?: () => void) => void;
  listen: (receive: (value: HostToUi) => void) => () => void;
  close: () => void;
}
export function createHost(): HostLink {
  const listeners = new Set<(value: HostToUi) => void>();
  const emit = (value: HostToUi) => {
    for (const receive of listeners) receive(value);
  };
  if (process.env.VANTARE_HUB_HOST === "mock" && mockAllowed(app.isPackaged)) {
    const mockReply = createMockHost(process.env.VANTARE_HUB_SCENE, (message) =>
      queueMicrotask(() => emit(message)),
    );
    return {
      hello: Promise.resolve(helloForScene(process.env.VANTARE_HUB_SCENE)),
      send: (message, flushed) => {
        const reply = mockReply(message);
        if (reply) queueMicrotask(() => emit(reply));
        if (flushed) queueMicrotask(flushed);
      },
      listen: (receive) => {
        listeners.add(receive);
        return () => listeners.delete(receive);
      },
      close: () => listeners.clear(),
    };
  }
  const name = process.env.VANTARE_HUB_PIPE,
    token = process.env.VANTARE_HUB_TOKEN;
  delete process.env.VANTARE_HUB_PIPE;
  delete process.env.VANTARE_HUB_TOKEN;
  if (
    !name ||
    !/^vantare-hub-ui-[0-9a-f]{64}$/.test(name) ||
    !token ||
    !/^[0-9a-f]{64}$/.test(token)
  )
    throw new Error("Host bootstrap unavailable");
  const socket = connect(`\\\\.\\pipe\\${name}`);
  let pending = Buffer.alloc(0);
  let settled = false;
  let acceptHello: (value: Hello) => void = () => {};
  let rejectHello: (error: Error) => void = () => {};
  const hello = new Promise<Hello>((accept, reject) => {
    acceptHello = accept;
    rejectHello = reject;
  });
  const timer = setTimeout(() => {
    rejectHello(new Error("Host bootstrap timeout"));
    socket.destroy();
  }, 15000);
  const write = (value: unknown, flushed?: () => void) => {
    const data = Buffer.from(JSON.stringify(value));
    if (data.length > FRAME_LIMIT) throw new Error("Frame exceeds limit");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(data.length);
    socket.write(Buffer.concat([header, data]), flushed);
  };
  socket.once("connect", () => write({ kind: "authenticate", token }));
  socket.on("data", (chunk) => {
    if (typeof chunk === "string") {
      socket.destroy(new Error("Unexpected decoded host stream"));
      return;
    }
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const length = pending.readUInt32LE(0);
      if (length === 0 || length > FRAME_LIMIT) {
        socket.destroy(new Error("Invalid host frame"));
        return;
      }
      if (pending.length < length + 4) return;
      let value: unknown;
      try {
        value = JSON.parse(pending.subarray(4, length + 4).toString("utf8"));
      } catch {
        socket.destroy(new Error("Invalid host JSON"));
        return;
      }
      pending = pending.subarray(length + 4);
      if (!isHostMessage(value)) {
        socket.destroy(new Error("Invalid host message"));
        return;
      }
      if (value.kind === "hello" && !settled) {
        settled = true;
        clearTimeout(timer);
        acceptHello(value);
      } else emit(value);
    }
  });
  socket.on("error", () => {
    clearTimeout(timer);
    rejectHello(new Error("Host disconnected"));
  });
  socket.once("close", () => {
    clearTimeout(timer);
    rejectHello(new Error("Host disconnected"));
    emit({ kind: "failure", id: 0, error: { kind: "coreUnavailable" } });
  });
  return {
    hello,
    send: (message, flushed) => {
      if (isUiMessage(message) && bounded(message)) write(message, flushed);
    },
    listen: (receive) => {
      listeners.add(receive);
      return () => listeners.delete(receive);
    },
    close: () => {
      clearTimeout(timer);
      listeners.clear();
      socket.destroy();
    },
  };
}
