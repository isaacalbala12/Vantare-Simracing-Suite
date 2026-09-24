import { useEffect, useRef, useState } from "react";
import { createAnalysisClient, type AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisCandidate } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { useRecordedCorrections } from "./use-recorded-corrections";

const STABILITY_RECHECK_MS = 5_500;

function waitForStability(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, STABILITY_RECHECK_MS);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export type RecordedSessionsOptions = {
  readonly combinationId?: string;
  readonly revisions: readonly StrategyAnalysisRevisionRef[];
  readonly client?: AnalysisClient;
  readonly onApply: (sessions: readonly RecordedSession[], signal: AbortSignal, replace?: boolean) => Promise<void>;
  readonly onRevision?: (session: RecordedSession, signal: AbortSignal) => Promise<void>;
  readonly onCleanupError: () => void;
};

/** Keep this owner mounted across views and the initial combination proposal. */
export function useRecordedSessions({ combinationId, revisions, client: supplied, onApply, onRevision, onCleanupError }: RecordedSessionsOptions) {
  const [client] = useState(() => supplied ?? createAnalysisClient());
  const [candidates, setCandidates] = useState<readonly AnalysisCandidate[] | null>(null);
  const [sessions, setSessions] = useState<readonly RecordedSession[]>([]);
  const owned = useRef<readonly RecordedSession[]>([]);
  const selectedFileIDs = useRef(new Set<string>());
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const cleanupError = useRef(onCleanupError);
  useEffect(() => { cleanupError.current = onCleanupError; }, [onCleanupError]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedCopies, setSavedCopies] = useState<Readonly<Record<string, string>>>({});
  const [applied, setApplied] = useState(false);
  const corrections = useRecordedCorrections(client, async (next, signal) => {
    signal.throwIfAborted();
    const previous = owned.current.find(item => item.opened.sessionId === next.opened.sessionId);
    if (pending.current || !previous || previous.revision.sessionId !== next.revision.sessionId || previous.revision.baseDigest !== next.revision.baseDigest) throw new Error("recorded_source_unavailable");
    if (!next.combinationId || next.projectionUnavailableReason) throw new Error("recorded_combination_unavailable");
    if (!previous.combinationId || previous.projectionUnavailableReason) throw new Error("recorded_combination_unavailable");
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
  async function run(operation: (signal: AbortSignal) => Promise<void>): Promise<boolean> {
    if (pending.current || corrections.isBusy()) return false;
    if (corrections.unresolved) { setError("recorded_pending_corrections"); return false; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try { await operation(controller.signal); return true; } catch (failure) {
      if (alive.current && (!controller.signal.aborted || failure instanceof AggregateError)) {
        setError(failure instanceof Error ? failure.message : "unavailable");
      } else if (failure instanceof AggregateError) cleanupError.current();
      return false;
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  async function verifySelectedSource(candidate: AnalysisCandidate, session: RecordedSession) {
    if (!selectedFileIDs.current.has(candidate.id) || revisions.length === 0 || revisions.some(ref => ref.sessionId === session.revision.sessionId)) return;
    try {
      await client.close(session.opened.sessionId);
    } catch (cleanupFailure) {
      throw new AggregateError([new Error("recorded_source_mismatch"), cleanupFailure], "recorded_cleanup_failed", { cause: cleanupFailure });
    }
    throw new Error("recorded_source_mismatch");
  }
  return {
    candidates, sessions, busy: busy || corrections.busy, error, applied, savedCopies, recoverableSources: [...new Set(revisions.map(ref => ref.sessionId))].filter(id => !owned.current.some(item => item.revision.sessionId === id)), corrections,
    locked: corrections.unresolved,
    cancel: () => { pending.current?.abort(); corrections.cancel(); },
    discover: () => run(async signal => {
      let found = await client.discover(signal);
      signal.throwIfAborted();
      if (alive.current) { selectedFileIDs.current.clear(); setCandidates(found); }
      if (found.some(candidate => candidate.state === "stabilizing" && !candidate.walPresent)) {
        await waitForStability(signal);
        found = await client.discover(signal);
        signal.throwIfAborted();
        if (alive.current) setCandidates(found);
      }
    }),
    selectFile: (path: string) => run(async signal => {
      const selected = await client.selectFile(path, signal);
      selectedFileIDs.current.add(selected.id);
      if (alive.current) setCandidates(previous => [selected, ...(previous ?? []).filter(item => item.id !== selected.id)]);
    }),
    recoverCopy: (sourceId: string) => run(async signal => {
      if (!revisions.some(ref => ref.sessionId === sourceId)) throw new Error("recorded_source_unavailable");
      const recovery = await client.recoverCopy(sourceId, signal);
      if (recovery.code !== "ready") throw new Error(recovery.code === "registry_failure" ? "recorded_copy_registry_failure" : `recorded_${recovery.code}`);
      const selected = recovery.candidate;
      selectedFileIDs.current.add(selected.id);
      if (alive.current) setCandidates(previous => [selected, ...(previous ?? []).filter(item => item.id !== selected.id)]);
    }),
    open: (candidate: AnalysisCandidate) => run(async signal => {
      if (owned.current.length >= 4 || candidate.state !== "ready" || candidate.walPresent || owned.current.some(item => item.candidateId === candidate.id)) return;
      const session = await openRecordedSession(client, candidate.id, combinationId, revisions, signal);
      await verifySelectedSource(candidate, session);
      if (signal.aborted || !alive.current || owned.current.some(item => item.revision.sessionId === session.revision.sessionId)) {
        await client.close(session.opened.sessionId);
        return;
      }
      update([...owned.current, session]);
    }),
    // A deliberate source choice opens, validates and adopts in one operation.
    // A partial source stays owned for inspection, while the draft stays intact.
    openAndApply: (candidate: AnalysisCandidate) => run(async signal => {
      if (candidate.state !== "ready" || candidate.walPresent) throw new Error("recorded_source_unavailable");
      let session = owned.current.find(item => item.candidateId === candidate.id);
      if (!session) {
        if (owned.current.length >= 4) throw new Error("recorded_source_limit");
        const openedSession = await openRecordedSession(client, candidate.id, undefined, revisions, signal);
        await verifySelectedSource(candidate, openedSession);
        if (signal.aborted || !alive.current) { await client.close(openedSession.opened.sessionId); signal.throwIfAborted(); throw new Error("recorded_source_unavailable"); }
        if (owned.current.some(item => item.revision.sessionId === openedSession.revision.sessionId)) { await client.close(openedSession.opened.sessionId); throw new Error("recorded_source_unavailable"); }
        session = openedSession;
        update([...owned.current, openedSession]);
      }
      if (!session.combinationId || session.projectionUnavailableReason) throw new Error("recorded_combination_unavailable");
      await onApply([session], signal, true);
      signal.throwIfAborted();
      const selected = session;
      const other = owned.current.filter(item => item !== selected);
      const closed = await Promise.allSettled(other.map(item => client.close(item.opened.sessionId)));
      other.forEach((item, index) => { if (closed[index].status === "fulfilled") corrections.clear(item.opened.sessionId); });
      if (closed.some(item => item.status === "rejected")) cleanupError.current();
      if (alive.current) owned.current = [selected, ...other.filter((_, index) => closed[index].status === "rejected")];
      if (alive.current) setSessions(owned.current);
      if (alive.current) setApplied(true);
    }),
    clear: () => run(async () => {
      const old = owned.current;
      const closed = await Promise.allSettled(old.map(item => client.close(item.opened.sessionId)));
      old.forEach((item, index) => { if (closed[index].status === "fulfilled") corrections.clear(item.opened.sessionId); });
      if (alive.current) update(old.filter((_, index) => closed[index].status === "rejected"));
      if (closed.some(item => item.status === "rejected")) throw new Error("recorded_cleanup_failed");
    }),
    close: (session: RecordedSession) => run(async () => {
      await client.close(session.opened.sessionId);
      if (alive.current) { corrections.clear(session.opened.sessionId); update(owned.current.filter(item => item !== session)); }
    }),
    saveCopy: (session: RecordedSession, destinationDirectory: string) => run(async signal => {
      if (!owned.current.some(item => item.opened.sessionId === session.opened.sessionId)) throw new Error("recorded_source_unavailable");
      const copy = await client.saveVerifiedCopy(session.opened.sessionId, destinationDirectory, signal);
      if (copy.contentSha256 !== session.base.contentSha256 || copy.sizeBytes !== session.base.sizeBytes) throw new Error("recorded_copy_mismatch");
      if (alive.current) setSavedCopies(previous => ({ ...previous, [session.opened.sessionId]: copy.path }));
    }),
    // Acceptance of the inspect action, not success of the read. Resolves the
    // owned source by handle and wipes editor state before loading, so a
    // failed load never shows another source's data.
    inspect: (session: RecordedSession) => {
      const ownedSession = owned.current.find(item => item.opened.sessionId === session.opened.sessionId);
      if (!ownedSession) return false;
      if (pending.current || corrections.isBusy()) return false;
      if (corrections.unresolved) return false;
      if (!corrections.clear()) return false;
      void corrections.load(ownedSession);
      return true;
    },
    apply: () => run(async signal => {
      for (const session of owned.current) {
        if (!session.combinationId || session.projectionUnavailableReason) throw new Error("recorded_combination_unavailable");
      }
      await onApply(owned.current, signal);
      signal.throwIfAborted();
      if (alive.current) setApplied(true);
    }),
  };
}

export type RecordedSessionsController = Pick<ReturnType<typeof useRecordedSessions>, "candidates" | "sessions" | "busy" | "error" | "applied" | "cancel" | "discover" | "open" | "openAndApply" | "clear" | "close" | "apply"> & Partial<Pick<ReturnType<typeof useRecordedSessions>, "savedCopies" | "saveCopy" | "selectFile" | "recoverCopy" | "recoverableSources">> & { readonly locked?: boolean };
