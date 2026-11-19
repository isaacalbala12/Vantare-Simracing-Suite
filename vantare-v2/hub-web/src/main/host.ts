import { connect } from "node:net";
import { app } from "electron";
import type { HostToUi, UiToHost } from "../contract/generated/contract";
import {
  invalidResponseFailure,
  readReplyEnvelope,
} from "../contract/local-failure";
import {
  bounded,
  FRAME_LIMIT,
  isHostMessage,
  isUiMessage,
} from "../contract/validation";
import { record } from "../contract/validation-common";
import { createMockHostWithTrustedReview, helloForScene } from "./mock-host";
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
    const mockReply = createMockHostWithTrustedReview(
      process.env.VANTARE_HUB_SCENE,
      (message) => queueMicrotask(() => emit(message)),
    );
    return {
      hello: Promise.resolve(helloForScene(process.env.VANTARE_HUB_SCENE)),
      send: (message, flushed) => {
        const reply =
          message.kind === "reviewContentRequest" ||
          message.kind === "reviewDecision"
            ? mockReply.trusted(message)
            : mockReply(message);
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
        // Well-formed frame and JSON but the content breaks the contract: a
        // fault of this one reply, not of the connection (#2697).
        const kind = record(value) ? value.kind : undefined;
        if (kind === "hello" && !settled) {
          socket.destroy(new Error("Invalid host message"));
          return;
        }
        const envelope = readReplyEnvelope(value);
        // Only the envelope kind and id are logged, never the content.
        console.error(
          "Host reply failed validation:",
          envelope ? `${envelope.kind} id=${envelope.id}` : "unreadable",
        );
        if (envelope) emit(invalidResponseFailure(envelope.id));
        continue;
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
