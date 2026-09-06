import {createOverlaySectionDecoder, OverlayFrameV2ContractError, parseOverlayPullJSON} from "./overlay-frame-v2-store";

/** E9: socket envelope only. The existing pull client still owns ACK and cadence. */
export function createSocketPullPost(): (route: string, data: unknown) => Promise<unknown> {
  let socket: WebSocket | null = null;
  const decodeSections = createOverlaySectionDecoder();
  let sections = false;
  type Pending = {request: unknown; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; controller: AbortController};
  let pending: Pending | null = null;

  const fail = (call: Pending, error: Error) => {
    if (pending !== call) return;
    pending = null;
    clearTimeout(call.timer);
    call.controller.abort();
    const failed = socket;
    socket = null;
    failed?.close();
    call.reject(error);
  };

  const connect = async (call: Pending, data: unknown): Promise<WebSocket> => {
    if (socket?.readyState === 1) return socket;
    const response = await fetch("/_vantare/overlay-telemetry/socket-endpoint", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(data), cache: "no-store", signal: call.controller.signal,
    });
    if (!response.ok) throw new Error("overlay socket bootstrap rejected");
    const endpoint: unknown = await response.json();
    if (pending !== call) throw new Error("overlay socket stopped");
    if (endpoint === null || typeof endpoint !== "object" ||
      !("url" in endpoint) || typeof endpoint.url !== "string" ||
      !/^ws:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(endpoint.url) ||
      !("token" in endpoint) || typeof endpoint.token !== "string" || !/^[A-Za-z0-9]{52}$/.test(endpoint.token)) {
      throw new Error("invalid overlay socket endpoint");
    }
    if ("sections" in endpoint && endpoint.sections !== 0 && endpoint.sections !== 1) throw new Error("invalid overlay socket section version");
    sections = "sections" in endpoint && endpoint.sections === 1;
    const opened = new WebSocket(endpoint.url, endpoint.token);
    socket = opened;
    opened.addEventListener("message", event => {
      const current = pending;
      if (socket !== opened || !current) return;
      try {
        if (typeof event.data !== "string" || event.data.length > 1_048_576) throw new Error("invalid overlay socket response");
        const value = sections ? decodeSections(event.data, current.request) : parseOverlayPullJSON(event.data);
        pending = null;
        clearTimeout(current.timer);
        current.resolve(value === null ? undefined : value);
      } catch (error) {
        fail(current, error instanceof OverlayFrameV2ContractError ? error : new Error("invalid overlay socket response"));
      }
    });
    const disconnected = () => {
      if (socket !== opened) return;
      const current = pending;
      if (current) fail(current, new Error("overlay socket disconnected"));
      else { socket = null; opened.close(); }
    };
    opened.addEventListener("error", disconnected);
    opened.addEventListener("close", disconnected);
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { cleanup(); reject(new Error("overlay socket stopped")); };
      const ready = () => { cleanup(); resolve(); };
      const cleanup = () => {
        opened.removeEventListener("open", ready);
        call.controller.signal.removeEventListener("abort", aborted);
      };
      opened.addEventListener("open", ready);
      call.controller.signal.addEventListener("abort", aborted, {once: true});
    });
    return opened;
  };

  return (route, data) => {
    if (route.endsWith("/close")) {
      const closing = socket;
      try {
        if (closing?.readyState === 1) closing.send(JSON.stringify({...data as object, route: "close"}));
      } finally {
        if (pending) fail(pending, new Error("overlay socket stopped"));
        socket = null;
        closing?.close();
      }
      return Promise.resolve(undefined);
    }
    if (!route.endsWith("/pull") || pending) return Promise.reject(new Error("overlay socket invalid concurrent request"));
    return new Promise((resolve, reject) => {
      const call: Pending = {
        request: data, resolve, reject, controller: new AbortController(),
        timer: setTimeout(() => fail(call, new Error("overlay socket timeout")), 5_000),
      };
      pending = call;
      void connect(call, data).then(opened => {
        if (pending === call) opened.send(JSON.stringify({...data as object, route: "pull", ...(sections ? {sections: 1} : {})}));
      }).catch(error => fail(call, error instanceof Error ? error : new Error("overlay socket failure")));
    });
  };
}
