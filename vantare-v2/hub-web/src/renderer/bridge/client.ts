import type {
  CloseReason,
  HostError,
  HostToUi,
  Reply,
  Request,
  Topic,
  UiToHost,
} from "../../contract/generated/contract";
import { bounded, isHostMessage } from "../../contract/validation";
import {
  type CloseClock,
  type ReportCloseHandler,
  ReportClosePreparation,
  reportCloseMethods,
} from "./report-close";
import { requestDeadline } from "./request-deadlines";

declare const __VANTARE_RENDERER_MOCK__: boolean;
export class HostFailure extends Error {
  constructor(readonly detail: HostError) {
    super(detail.kind);
  }
}
// Local cancellation of a clean Testing request during Window close, not a core failure.
export class ReportCloseDiscarded extends HostFailure {
  constructor() {
    super({ kind: "busy" });
  }
}
export type RequestObservation = {
  id: number;
  method: Request["method"];
} & ({ phase: "start" } | { phase: "done"; reply?: Reply; error?: HostError });
export class Client {
  private requestListeners = new Set<(event: RequestObservation) => void>();
  private subscriptions = new Map<Topic, number>();
  observeRequests(receive: (event: RequestObservation) => void) {
    this.requestListeners.add(receive);
    return () => {
      this.requestListeners.delete(receive);
    };
  }
  private observed(event: RequestObservation) {
    for (const receive of this.requestListeners) {
      try {
        receive(event);
      } catch {
        /* Observers must never own request settlement. */
      }
    }
  }
  private sequence = 0;
  private closing = false;
  private closeAnswered = false;
  private closeSequence = 0;
  private closeReason: CloseReason = "window";
  private reportClose: ReportClosePreparation;
  private extraGuards = new Set<
    (reason: CloseReason) => boolean | Promise<boolean>
  >();
  private vetoListeners = new Set<(reason: CloseReason) => void>();
  private closeListeners = new Set<
    (reason: CloseReason, allow: boolean) => void
  >();
  private closeGuard?: (reason: CloseReason) => boolean | Promise<boolean>;
  private pending = new Map<
    number,
    {
      method: Request["method"];
      resolve: (reply: Reply) => void;
      reject: (error: HostFailure) => void;
      timer: ReturnType<typeof setTimeout> | undefined;
      dispose?: () => void;
    }
  >();
  private listeners = new Set<(message: HostToUi) => void>();
  private constructor(
    private port: MessagePort,
    private cleanup: () => void = () => {},
    private bootstrap?: () => void,
    clock?: CloseClock,
  ) {
    this.reportClose = new ReportClosePreparation(clock);
    port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isHostMessage(data) || !bounded(data)) return;
      if (data.kind === "closeRequested") {
        this.beginClose(data.reason);
        for (const receive of this.listeners) receive(data);
        return;
      }
      if (data.kind === "response" || data.kind === "failure") {
        const request = this.pending.get(data.id);
        if (request) {
          clearTimeout(request.timer);
          request.dispose?.();
          this.pending.delete(data.id);
          this.observed({
            id: data.id,
            method: request.method,
            phase: "done",
            ...(data.kind === "response"
              ? { reply: data.result }
              : { error: data.error }),
          });
          if (data.kind === "response") request.resolve(data.result);
          else request.reject(new HostFailure(data.error));
        }
      }
      this.answerWhenIdle();
      for (const receive of this.listeners) receive(data);
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
  onCloseSettled(receive: (reason: CloseReason, allow: boolean) => void) {
    this.closeListeners.add(receive);
    return () => {
      this.closeListeners.delete(receive);
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
  setReportClosePreparation(handler: ReportCloseHandler) {
    return this.reportClose.register(handler);
  }
  private beginClose(reason: CloseReason) {
    const rank = (reason: CloseReason) =>
      reason === "window" ? 0 : reason === "restart" ? 1 : 2;
    if (this.closing && rank(reason) <= rank(this.closeReason)) return;
    this.closing = true;
    this.closeAnswered = true;
    this.closeReason = reason;
    const sequence = ++this.closeSequence;
    this.reportClose.cancel();
    if (reason === "live" || reason === "controlEof") {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.dispose?.();
        this.observed({
          id,
          method: pending.method,
          phase: "done",
          error: { kind: "busy" },
        });
        pending.reject(new HostFailure({ kind: "busy" }));
      }
      this.pending.clear();
      this.finishClose(true, sequence, reason);
      return;
    }
    if (reason === "restart") {
      this.closeAnswered = false;
      this.answerWhenIdle();
      return;
    }
    const started = this.reportClose.start(
      async (fields, signal) => {
        const reply = await this.issue(
          { method: reportCloseMethods[0], fields },
          undefined,
          signal,
        );
        if (reply.method !== "draft.save")
          throw new HostFailure({ kind: "rejected" });
        return reply;
      },
      (allow) => {
        if (sequence !== this.closeSequence) return;
        if (!allow) this.finishClose(false, sequence, reason);
        else {
          if (allow === "discard") {
            for (const [id, pending] of this.pending) {
              if (
                ["draft.", "report.", "testing.", "triage."].some((prefix) =>
                  pending.method.startsWith(prefix),
                )
              ) {
                clearTimeout(pending.timer);
                pending.dispose?.();
                this.pending.delete(id);
                this.observed({
                  id,
                  method: pending.method,
                  phase: "done",
                  error: { kind: "busy" },
                });
                pending.reject(new ReportCloseDiscarded());
              }
            }
          }
          this.closeAnswered = false;
          this.answerWhenIdle();
        }
      },
    );
    if (!started) {
      this.closeAnswered = false;
      this.answerWhenIdle();
    }
  }
  private finishClose(allow: boolean, sequence: number, reason: CloseReason) {
    if (sequence !== this.closeSequence) return;
    if (!allow) {
      this.closeSequence++;
      this.closing = false;
      this.closeAnswered = false;
    }
    try {
      this.send({ kind: "closeAnswer", allow });
    } finally {
      for (const receive of this.closeListeners) receive(reason, allow);
    }
    if (!allow) for (const receive of this.vetoListeners) receive(reason);
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
      .then((allow) => this.finishClose(allow, sequence, reason));
  }

  request(
    request: Exclude<Request, { method: "window.close" }>,
    onSent?: () => void,
  ): Promise<Reply> {
    if (this.closing) return Promise.reject(new HostFailure({ kind: "busy" }));
    return this.issue(request, onSent);
  }
  private issue(
    request: Exclude<Request, { method: "window.close" }>,
    onSent?: () => void,
    signal?: AbortSignal,
  ): Promise<Reply> {
    if (signal?.aborted)
      return Promise.reject(new HostFailure({ kind: "coreUnavailable" }));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const deadline = requestDeadline(request.method);
      const timer =
        deadline === undefined
          ? undefined
          : setTimeout(() => {
              this.pending.get(id)?.dispose?.();
              this.pending.delete(id);
              this.observed({
                id,
                method: request.method,
                phase: "done",
                error: { kind: "coreUnavailable" },
              });
              this.answerWhenIdle();
              reject(new HostFailure({ kind: "coreUnavailable" }));
            }, deadline);
      const abort = () => {
        const entry = this.pending.get(id);
        if (!entry) return;
        clearTimeout(timer);
        entry.dispose?.();
        this.pending.delete(id);
        this.observed({
          id,
          method: request.method,
          phase: "done",
          error: { kind: "coreUnavailable" },
        });
        reject(new HostFailure({ kind: "coreUnavailable" }));
        this.answerWhenIdle();
      };
      const dispose = () => signal?.removeEventListener("abort", abort);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        dispose,
        method: request.method,
      });
      signal?.addEventListener("abort", abort, { once: true });
      this.observed({ id, method: request.method, phase: "start" });
      try {
        this.send({ kind: "request", id, request });
        onSent?.();
      } catch {
        clearTimeout(timer);
        dispose();
        this.pending.delete(id);
        this.observed({
          id,
          method: request.method,
          phase: "done",
          error: { kind: "coreUnavailable" },
        });
        reject(new HostFailure({ kind: "coreUnavailable" }));
      }
    });
  }
  closeWindow() {
    this.send({ kind: "request", id: 0, request: { method: "window.close" } });
  }
  subscribe(topic: Topic) {
    const count = this.subscriptions.get(topic) ?? 0;
    this.subscriptions.set(topic, count + 1);
    if (count === 0) this.send({ kind: "subscribe", topic });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const remaining = (this.subscriptions.get(topic) ?? 1) - 1;
      if (remaining > 0) this.subscriptions.set(topic, remaining);
      else {
        this.subscriptions.delete(topic);
        this.send({ kind: "unsubscribe", topic });
      }
    };
  }
  start() {
    this.bootstrap?.();
    this.bootstrap = undefined;
  }
  close() {
    this.closeSequence++;
    this.closing = true;
    this.closeAnswered = true;
    this.reportClose.cancel();
    for (const value of this.pending.values()) {
      clearTimeout(value.timer);
      value.dispose?.();
      value.reject(new HostFailure({ kind: "coreUnavailable" }));
    }
    this.pending.clear();
    this.listeners.clear();
    this.requestListeners.clear();
    this.subscriptions.clear();
    this.extraGuards.clear();
    this.vetoListeners.clear();
    this.closeListeners.clear();
    this.port.close();
    this.cleanup();
  }
}
