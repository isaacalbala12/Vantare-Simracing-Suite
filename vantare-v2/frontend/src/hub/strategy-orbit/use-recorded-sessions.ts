import { useEffect, useRef, useState } from "react";
import { createAnalysisClient, type AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisCandidate } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { useRecordedCorrections } from "./use-recorded-corrections";

export type RecordedSessionsOptions = {
  readonly combinationId?: string;
  readonly revisions: readonly StrategyAnalysisRevisionRef[];
  readonly client?: AnalysisClient;
  readonly onApply: (sessions: readonly RecordedSession[], signal: AbortSignal) => Promise<void>;
  readonly onRevision?: (session: RecordedSession, signal: AbortSignal) => Promise<void>;
  readonly onCleanupError: () => void;
};

/** Keep this owner mounted across views and the initial combination proposal. */
export function useRecordedSessions({ combinationId, revisions, client: supplied, onApply, onRevision, onCleanupError }: RecordedSessionsOptions) {
  const [client] = useState(() => supplied ?? createAnalysisClient());
  const [candidates, setCandidates] = useState<readonly AnalysisCandidate[] | null>(null);
  const [sessions, setSessions] = useState<readonly RecordedSession[]>([]);
  const owned = useRef<readonly RecordedSession[]>([]);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const cleanupError = useRef(onCleanupError);
  useEffect(() => { cleanupError.current = onCleanupError; }, [onCleanupError]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const corrections = useRecordedCorrections(client, async (next, signal) => {
    signal.throwIfAborted();
    const previous = owned.current.find(item => item.opened.sessionId === next.opened.sessionId);
    if (pending.current || !previous || previous.revision.sessionId !== next.revision.sessionId || previous.revision.baseDigest !== next.revision.baseDigest) throw new Error("recorded_source_unavailable");
    await onRevision?.(next, signal);
    signal.throwIfAborted();
    if (alive.current) update(owned.current.map(item => item === previous ? next : item));
  }, () => pending.current !== null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      const releasing = owned.current;
      owned.current = [];
      void Promise.allSettled(releasing.map(session => client.close(session.opened.sessionId)))
        .then(results => { if (results.some(result => result.status === "rejected")) cleanupError.current(); });
    };
  }, [client]);

  function update(next: readonly RecordedSession[]) {
    owned.current = next;
    setSessions(next);
    setApplied(false);
  }
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current || corrections.isBusy()) return;
    if (corrections.unresolved) { setError("recorded_pending_corrections"); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try { await operation(controller.signal); } catch (failure) {
      if (alive.current && (!controller.signal.aborted || failure instanceof AggregateError)) {
        setError(failure instanceof Error ? failure.message : "unavailable");
      } else if (failure instanceof AggregateError) cleanupError.current();
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  return {
    candidates, sessions, busy: busy || corrections.busy, error, applied, corrections,
    locked: corrections.unresolved,
    cancel: () => { pending.current?.abort(); corrections.cancel(); },
    discover: () => run(async signal => {
      const found = await client.discover(signal);
      signal.throwIfAborted();
      if (alive.current) setCandidates(found);
    }),
    open: (candidate: AnalysisCandidate) => run(async signal => {
      if (owned.current.length >= 4 || candidate.state !== "ready" || candidate.walPresent || owned.current.some(item => item.candidateId === candidate.id)) return;
      const session = await openRecordedSession(client, candidate.id, combinationId, revisions, signal);
      if (signal.aborted || !alive.current || owned.current.some(item => item.revision.sessionId === session.revision.sessionId)) {
        await client.close(session.opened.sessionId);
        return;
      }
      update([...owned.current, session]);
    }),
    close: (session: RecordedSession) => run(async () => {
      await client.close(session.opened.sessionId);
      if (alive.current) { corrections.clear(session.opened.sessionId); update(owned.current.filter(item => item !== session)); }
    }),
    apply: () => run(async signal => {
      await onApply(owned.current, signal);
      signal.throwIfAborted();
      if (alive.current) setApplied(true);
    }),
  };
}

export type RecordedSessionsController = Pick<ReturnType<typeof useRecordedSessions>, "candidates" | "sessions" | "busy" | "error" | "applied" | "cancel" | "discover" | "open" | "close" | "apply"> & { readonly locked?: boolean };
