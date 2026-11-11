import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  let maximized = false;
  return (message) => {
    if (message.kind === "subscribe" && message.topic === "windowState")
      return { kind: "event", event: { topic: "windowState", maximized } };
    if (message.kind !== "request") return undefined;
    const { id, request } = message;
    if (request.method === "window.minimize")
      return {
        kind: "response",
        id,
        result: { method: request.method, accepted: true },
      };
    if (request.method !== "window.toggleMaximize") return undefined;
    maximized = !maximized;
    const value = maximized;
    queueMicrotask(() =>
      context.emit?.({
        kind: "event",
        event: { topic: "windowState", maximized: value },
      }),
    );
    return {
      kind: "response",
      id,
      result: { method: request.method, accepted: true },
    };
  };
}
