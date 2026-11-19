import { useCallback, useEffect, useRef, useState } from "react";
import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyExportTarget,
  StrategyReply,
  StrategyRequest,
  StrategyView,
} from "../../../contract/generated/strategy";
import { type Client, HostFailure } from "../../bridge/client";

export type StrategyClient = Pick<Client, "request">;
// The export requests answer with a text or a file name, not a view: they go
// through `exportPlan`, not through `act`.
type Operation = Extract<
  Exclude<
    StrategyRequest,
    { method: "strategy.export" | "strategy.exportFile" }
  >,
  { revision: string }
>;
type Cancel = Extract<StrategyRequest, { method: "strategy.cancel" }>;
// Every action but a cancellation carries the revision of the view it acts on;
// the hook adds it. A cancellation names the calculation instead.
export type StrategyAction =
  | (Operation extends infer T
      ? T extends Operation
        ? Omit<T, "revision">
        : never
      : never)
  | Cancel;
// How often the screen asks the host for the end of a calculation. The host
// only moves a calculation on when asked, and never pushes the result.
export const calculationPollMs = 250;
// Read errors in a row the screen puts up with while it asks; then it stops
// and lets the person retry or cancel.
export const calculationPollFailures = 3;
type Result = { value: StrategyView } | { error: HostError };
// What an export came to. The plan is copied by the main process (the screen only
// asks), and a file is saved by it (the screen only learns the NAME).
export type ExportMethod = "strategy.export" | "strategy.exportFile";
export type ExportOutcome =
  | { copied: true }
  | { saved: string }
  | { cancelled: true }
  | { error: HostError };

async function send(
  client: StrategyClient,
  request: StrategyRequest,
): Promise<Result> {
  try {
    const reply = await client.request(request);
    if (reply.method !== request.method) return { error: { kind: "rejected" } };
    const { value } = reply as StrategyReply;
    // only the replies that carry a view belong here
    if (!("revision" in value)) return { error: { kind: "rejected" } };
    return { value };
  } catch (error) {
    return {
      error: error instanceof HostFailure ? error.detail : { kind: "io" },
    };
  }
}

export function fileActions(view: StrategyView, unconfirmed = false) {
  const protectedFile = view.state === "protected";
  const hasDocument = view.events.length > 0 || view.dirty;
  return {
    status: protectedFile
      ? "protected"
      : unconfirmed
        ? "pending"
        : view.dirty
          ? "dirty"
          : hasDocument
            ? "saved"
            : "empty",
    save: view.dirty && !unconfirmed && !protectedFile,
    saveAs: hasDocument && !protectedFile,
    open: true,
    discard: view.dirty && !protectedFile,
  } as const;
}

export function useStrategy(client: StrategyClient) {
  const [view, setView] = useState<StrategyView>();
  const [error, setError] = useState<HostError>();
  const [pending, setPending] = useState(false);
  // the reads of a running calculation failed too often in a row
  const [pollFailed, setPollFailed] = useState(false);
  const current = useRef<StrategyView | undefined>(undefined);
  const running = useRef<object | undefined>(undefined);
  const session = useRef<object | undefined>(undefined);
  // who waits for the running action to end
  const waiting = useRef<(() => void)[]>([]);
  const wake = useCallback(() => {
    for (const resume of waiting.current.splice(0)) resume();
  }, []);
  useEffect(() => {
    const token = {};
    session.current = token;
    current.current = undefined;
    running.current = undefined;
    wake();
    setPending(false);
    setView(undefined);
    setError(undefined);
    void (async () => {
      // View also lets a reopened screen resume an already-open dirty document.
      const read = await send(client, { method: "strategy.view" });
      const result =
        "error" in read && read.error.kind === "denied"
          ? await send(client, { method: "strategy.open" })
          : read;
      if (session.current !== token) return;
      if ("value" in result) {
        current.current = result.value;
        setView(result.value);
      } else setError(result.error);
    })();
    return () => {
      session.current = undefined;
    };
  }, [client, wake]);

  // While the host calculates, ask for the view until it says otherwise. An
  // answer is used only if nothing else replaced the view meanwhile.
  const calculating = view?.plan.state === "calculating";
  const computeId = view?.plan.computeId;
  // a failure to read belongs to the calculation it happened in
  useEffect(() => {
    if (!calculating) setPollFailed(false);
  }, [calculating]);
  useEffect(() => {
    // a calculation always has its id; a new one restarts the loop
    if (!calculating || computeId == null || pollFailed) return;
    const token = session.current;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function poll() {
      const asked = current.current;
      if (!running.current) {
        const read = await send(client, { method: "strategy.view" });
        if (stopped || session.current !== token) return;
        if (current.current === asked) {
          if ("error" in read) {
            // a transient error is asked again at the usual pace, up to the limit
            if (++failures >= calculationPollFailures) {
              setPollFailed(true);
              return;
            }
          } else {
            failures = 0;
            const fresh = read.value;
            if (
              fresh.revision !== asked?.revision ||
              fresh.plan.state !== "calculating" ||
              fresh.plan.computeId !== asked.plan.computeId
            ) {
              current.current = fresh;
              setView(fresh);
            }
          }
        }
      }
      timer = setTimeout(poll, calculationPollMs);
    }
    timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [calculating, computeId, client, pollFailed]);

  // Resolves when no action is running: what is pressed meanwhile can follow it.
  function whenIdle(): Promise<void> {
    return running.current
      ? new Promise((resume) => {
          waiting.current.push(resume);
        })
      : Promise.resolve();
  }

  async function act(action: StrategyAction): Promise<Result | undefined> {
    if (!current.current || running.current || !session.current) return;
    const token = session.current;
    const request: StrategyRequest =
      action.method === "strategy.cancel"
        ? action
        : { ...action, revision: current.current.revision };
    running.current = token;
    setPending(true);
    setError(undefined);
    let result = await send(client, request);
    if (session.current !== token) return;
    if ("error" in result && result.error.kind === "busy") {
      const fresh = await send(client, { method: "strategy.view" });
      if (session.current !== token) return;
      if ("value" in fresh) {
        current.current = fresh.value;
        setView(fresh.value);
        result = await send(client, request);
      }
    }
    if (session.current !== token) return;
    running.current = undefined;
    setPending(false);
    if ("value" in result) {
      current.current = result.value;
      setView(result.value);
    } else if (result.error.kind === "strategyConflict") {
      current.current = result.error.current;
      setView(result.error.current);
      setError(result.error);
    } else if (result.error.kind !== "strategyPickExpired")
      setError(result.error);
    wake();
    return result;
  }
  // Asks the host for the text or the file of a plan, with the revision of the view
  // on screen. It takes the same turn as every action (the dialog of the file and the
  // ticket of the pickers are one at a time). A `strategyConflict` brings the host's
  // view, which replaces ours; every other error is the caller's to say.
  async function exportPlan(
    method: ExportMethod,
    target: StrategyExportTarget,
  ): Promise<ExportOutcome | undefined> {
    const base = current.current;
    if (!base || running.current || !session.current) return;
    const token = session.current;
    running.current = token;
    setPending(true);
    setError(undefined);
    let outcome: ExportOutcome;
    try {
      const reply = (await client.request({
        method,
        revision: base.revision,
        target,
      })) as StrategyReply;
      if (reply.method !== method) outcome = { error: { kind: "rejected" } };
      else if (reply.method === "strategy.export") outcome = { copied: true };
      else if (reply.value.kind === "saved")
        outcome = { saved: reply.value.file.name };
      else if (reply.value.kind === "cancelled") outcome = { cancelled: true };
      // the ticket is the main process's: it never reaches the screen
      else outcome = { error: { kind: "rejected" } };
    } catch (error) {
      outcome = {
        error: error instanceof HostFailure ? error.detail : { kind: "io" },
      };
    }
    if (session.current !== token) return;
    running.current = undefined;
    setPending(false);
    if ("error" in outcome && outcome.error.kind === "strategyConflict") {
      current.current = outcome.error.current;
      setView(outcome.error.current);
      setError(outcome.error);
    }
    wake();
    return outcome;
  }
  return {
    view,
    error,
    pending,
    pollFailed,
    retryPoll: () => setPollFailed(false),
    whenIdle,
    // the last view the host sent, before the screen has drawn it
    peek: () => current.current,
    act,
    exportPlan,
    clearError: () => setError(undefined),
  };
}
