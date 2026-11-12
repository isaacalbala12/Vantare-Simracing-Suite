import type { Reply, ReportFields } from "../../contract/generated/contract";
// Closed exception, not a generic facility for requests during close.
export const reportCloseMethods = ["draft.save"] as const;
export const reportCloseTimeoutMs = 5000;
export type CloseDraftSave = (
  fields: ReportFields,
  session?: AbortSignal,
) => Promise<Extract<Reply, { method: "draft.save" }>>;
export type ReportCloseVerdict = "saved" | "discard" | false;
export type ReportCloseHandler = {
  prepare: (
    save: CloseDraftSave,
    signal: AbortSignal,
  ) => Promise<ReportCloseVerdict>;
  failed: () => void;
};
export type CloseClock = {
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
};
const systemClock: CloseClock = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (timer) => clearTimeout(timer),
};
export class ReportClosePreparation {
  private handler?: ReportCloseHandler;
  private active?: {
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
    settle: (allow: ReportCloseVerdict) => void;
  };
  constructor(private clock: CloseClock = systemClock) {}
  register(handler: ReportCloseHandler) {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = undefined;
        this.cancel(true);
      }
    };
  }
  cancel(veto = false) {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    this.clock.clear(active.timer);
    active.controller.abort();
    if (veto) active.settle(false);
  }
  start(send: CloseDraftSave, settle: (allow: ReportCloseVerdict) => void) {
    const handler = this.handler;
    if (!handler) return false;
    if (this.active) return true;
    const controller = new AbortController();
    const finish = (allow: ReportCloseVerdict) => {
      if (this.active?.controller !== controller) return;
      this.cancel();
      settle(allow);
      if (!allow) handler.failed();
    };
    const timer = this.clock.set(() => finish(false), reportCloseTimeoutMs);
    this.active = { controller, timer, settle };
    const save: CloseDraftSave = (fields, session) => {
      if (
        this.active?.controller !== controller ||
        controller.signal.aborted ||
        session?.aborted
      )
        return Promise.reject(new Error("report close preparation cancelled"));
      return send(
        fields,
        session
          ? AbortSignal.any([controller.signal, session])
          : controller.signal,
      );
    };
    void Promise.resolve()
      .then(() => handler.prepare(save, controller.signal))
      .then(finish, () => finish(false));
    return true;
  }
}
