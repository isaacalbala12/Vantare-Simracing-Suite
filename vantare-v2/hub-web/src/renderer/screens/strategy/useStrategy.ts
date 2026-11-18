import { useEffect, useRef, useState } from "react";
import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyReply,
  StrategyRequest,
  StrategyView,
} from "../../../contract/generated/strategy";
import { type Client, HostFailure } from "../../bridge/client";

export type StrategyClient = Pick<Client, "request">;
type Operation = Extract<StrategyRequest, { revision: string }>;
export type StrategyAction = Operation extends infer T
  ? T extends Operation
    ? Omit<T, "revision">
    : never
  : never;
type Result = { value: StrategyView } | { error: HostError };

async function send(
  client: StrategyClient,
  request: StrategyRequest,
): Promise<Result> {
  try {
    const reply = await client.request(request);
    if (reply.method !== request.method) return { error: { kind: "rejected" } };
    return { value: (reply as StrategyReply).value };
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
  const current = useRef<StrategyView | undefined>(undefined);
  const running = useRef<object | undefined>(undefined);
  const session = useRef<object | undefined>(undefined);
  useEffect(() => {
    const token = {};
    session.current = token;
    current.current = undefined;
    running.current = undefined;
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
  }, [client]);

  async function act(action: StrategyAction): Promise<Result | undefined> {
    if (!current.current || running.current || !session.current) return;
    const token = session.current;
    const request = {
      ...action,
      revision: current.current.revision,
    } satisfies Operation;
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
    return result;
  }
  return { view, error, pending, act };
}
