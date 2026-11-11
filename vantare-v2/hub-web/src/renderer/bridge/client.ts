import type {
  CloseReason,
  HostError,
  HostToUi,
  Reply,
  Request,
  Topic,
  UiToHost,
} from "../../contract/generated/contract";
import { requestTimeoutMs } from "../../contract/generated/contract";
import { bounded, isHostMessage } from "../../contract/validation";

declare const __VANTARE_RENDERER_MOCK__: boolean;
export class HostFailure extends Error {
  constructor(readonly detail: HostError) {
    super(detail.kind);
  }
}
export class Client {
  private sequence = 0;
  private closing = false;
  private closeAnswered = false;
  private closeSequence = 0;
  private closeReason: CloseReason = "window";
  private extraGuards = new Set<
    (reason: CloseReason) => boolean | Promise<boolean>
  >();
  private vetoListeners = new Set<(reason: CloseReason) => void>();
  private closeGuard?: (reason: CloseReason) => boolean | Promise<boolean>;
  private pending = new Map<
    number,
    {
      resolve: (reply: Reply) => void;
      reject: (error: HostFailure) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<(message: HostToUi) => void>();
  private constructor(
    private port: MessagePort,
    private cleanup: () => void = () => {},
    private bootstrap?: () => void,
  ) {
    port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isHostMessage(data) || !bounded(data)) return;
      if (data.kind === "response" || data.kind === "failure") {
        const request = this.pending.get(data.id);
        if (request) {
          clearTimeout(request.timer);
          this.pending.delete(data.id);
          if (data.kind === "response") request.resolve(data.result);
          else request.reject(new HostFailure(data.error));
        }
      }
      this.answerWhenIdle();
      for (const receive of this.listeners) receive(data);
      if (data.kind === "closeRequested") {
        this.closing = true;
        this.closeAnswered = false;
        this.closeReason = data.reason;
        if (data.reason === "live") {
          for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new HostFailure({ kind: "busy" }));
          }
          this.pending.clear();
        }
        this.closeSequence++;
        this.answerWhenIdle();
      }
    };
    port.start();
  }
  static async connect(): Promise<Client> {
    if (__VANTARE_RENDERER_MOCK__ && !window.vantare) {
      const { createMockHost, helloForScene } = await import("../../mock/host");
      const { port1, port2 } = new MessageChannel();
      const mockReply = createMockHost(
        new URLSearchParams(window.location.search).get("escena") ?? undefined,
        (message) => port2.postMessage(message),
      );
      port2.onmessage = ({ data }) => {
        const response = mockReply(data);
        if (response) port2.postMessage(response);
        if (
          response?.kind === "response" &&
          response.result.method === "updates.restart" &&
          response.result.accepted
        )
          port2.postMessage({
            kind: "closeRequested",
            reason: "restart",
          } satisfies HostToUi);
      };
      port2.start();
      return new Client(
        port1,
        () => port2.close(),
        () =>
          port2.postMessage(
            helloForScene(
              new URLSearchParams(window.location.search).get("escena") ??
                undefined,
            ),
          ),
      );
    }
    if (!window.vantare) throw new Error("Host preload unavailable");
    const port = await new Promise<MessagePort>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", receive);
        reject(new Error("Host port timeout"));
      }, 15000);
      const receive = (event: MessageEvent) => {
        if (
          event.source !== window ||
          event.data !== "vantare:port" ||
          !event.ports[0]
        )
          return;
        clearTimeout(timeout);
        window.removeEventListener("message", receive);
        resolve(event.ports[0]);
      };
      window.addEventListener("message", receive);
      void window.vantare?.connect().catch((error) => {
        clearTimeout(timeout);
        window.removeEventListener("message", receive);
        reject(error);
      });
    });
    return new Client(port);
  }
  send(value: UiToHost) {
    this.port.postMessage(value);
  }
  listen(receive: (message: HostToUi) => void) {
    this.listeners.add(receive);
    return () => this.listeners.delete(receive);
  }
  onCloseVeto(receive: (reason: CloseReason) => void) {
    this.vetoListeners.add(receive);
    return () => {
      this.vetoListeners.delete(receive);
    };
  }
  setCloseGuard(guard: (reason: CloseReason) => boolean | Promise<boolean>) {
    this.closeGuard = guard;
  }
  addCloseGuard(guard: (reason: CloseReason) => boolean | Promise<boolean>) {
    this.extraGuards.add(guard);
    return () => {
      this.extraGuards.delete(guard);
    };
  }
  private answerWhenIdle() {
    if (!this.closing || this.closeAnswered || this.pending.size > 0) return;
    this.closeAnswered = true;
    const sequence = this.closeSequence;
    const reason = this.closeReason;
    void Promise.resolve()
      .then(async () => {
        if (reason === "controlEof") return true;
        const guards = [
          ...(this.closeGuard ? [this.closeGuard] : []),
          ...this.extraGuards,
        ];
        const answers = await Promise.all(guards.map((guard) => guard(reason)));
        return reason === "live" || answers.every(Boolean);
      })
      .catch(() => reason === "live")
      .then((allow) => {
        if (sequence !== this.closeSequence) return;
        if (!allow && reason !== "controlEof") {
          this.closing = false;
          this.closeAnswered = false;
        }
        this.send({ kind: "closeAnswer", allow });
        if (!allow) for (const receive of this.vetoListeners) receive(reason);
      });
  }
  request(
    request: Exclude<Request, { method: "window.close" }>,
  ): Promise<Reply> {
    if (this.closing) return Promise.reject(new HostFailure({ kind: "busy" }));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.answerWhenIdle();
        reject(new HostFailure({ kind: "coreUnavailable" }));
      }, requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ kind: "request", id, request });
    });
  }
  closeWindow() {
    this.send({ kind: "request", id: 0, request: { method: "window.close" } });
  }
  subscribe(topic: Topic) {
    this.send({ kind: "subscribe", topic });
    return () => this.send({ kind: "unsubscribe", topic });
  }
  start() {
    this.bootstrap?.();
    this.bootstrap = undefined;
  }
  close() {
    this.closeSequence++;
    this.closing = true;
    for (const value of this.pending.values()) {
      clearTimeout(value.timer);
      value.reject(new HostFailure({ kind: "coreUnavailable" }));
    }
    this.pending.clear();
    this.listeners.clear();
    this.extraGuards.clear();
    this.vetoListeners.clear();
    this.port.close();
    this.cleanup();
  }
}
