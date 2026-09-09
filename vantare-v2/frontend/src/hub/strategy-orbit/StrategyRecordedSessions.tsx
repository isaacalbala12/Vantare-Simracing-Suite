import { useEffect, useRef, useState } from "react";
import { createAnalysisClient, type AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisCandidate } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";
import { Button, Chip, Note } from "../../ui/orbit";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";

type Props = {
  combinationId: string;
  revisions: readonly StrategyAnalysisRevisionRef[];
  t: (key: string) => string;
  client?: AnalysisClient;
  onApply: (sessions: readonly RecordedSession[], signal: AbortSignal) => Promise<void>;
  onCleanupError: () => void;
};

// Mounted across tab changes so Strategy retains authorized handles while
// calculating. The parent keys this owner by event and combination.
export function StrategyRecordedSessions({ combinationId, revisions, t, client: supplied, onApply, onCleanupError }: Props) {
  const [client] = useState(() => supplied ?? createAnalysisClient());
  const [candidates, setCandidates] = useState<readonly AnalysisCandidate[] | null>(null);
  const [sessions, setSessions] = useState<readonly RecordedSession[]>([]);
  const owned = useRef<readonly RecordedSession[]>([]);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const cleanupError = useRef(onCleanupError);
  cleanupError.current = onCleanupError;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      const releasing = owned.current;
      owned.current = [];
      void Promise.allSettled(releasing.map((session) => client.close(session.opened.sessionId)))
        .then((results) => { if (results.some((result) => result.status === "rejected")) cleanupError.current(); });
    };
  }, [client]);
  function update(next: readonly RecordedSession[]) {
    owned.current = next;
    setSessions(next);
    setApplied(false);
  }
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      await operation(controller.signal);
    } catch (failure) {
      if (alive.current && (!controller.signal.aborted || failure instanceof AggregateError)) {
        setError(failure instanceof Error ? failure.message : "unavailable");
      } else if (failure instanceof AggregateError) cleanupError.current();
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  async function open(candidate: AnalysisCandidate, signal: AbortSignal) {
    const session = await openRecordedSession(client, candidate.id, combinationId, revisions, signal);
    if (signal.aborted || !alive.current || owned.current.some((item) => item.revision.sessionId === session.revision.sessionId)) {
      await client.close(session.opened.sessionId);
      return;
    }
    update([...owned.current, session]);
  }
  return <section className="orbit-strategy__sessions" aria-label={t("strategy.recorded.title")}>
    <div className="orbit-strategy__sessions-head"><b>{t("strategy.recorded.title")}</b><Chip>{sessions.length}/4</Chip></div>
    <p>{t("strategy.recorded.hint")}</p>
    <Button disabled={busy} onClick={() => void run(async (signal) => {
      const found = await client.discover(signal);
      signal.throwIfAborted();
      setCandidates(found);
    })} variant="ghost">{t("strategy.recorded.discover")}</Button>
    {busy ? <p role="status">{t("strategy.recorded.busy")} <Button variant="ghost" onClick={() => pending.current?.abort()}>{t("strategy.recorded.cancel")}</Button></p> : null}
    {error ? <Note title={t("strategy.recorded.error")}><span role="alert">{error}</span></Note> : null}
    {candidates?.length === 0 ? <p role="status">{t("strategy.recorded.empty")}</p> : null}
    {candidates?.map((candidate) => <div className="orbit-strategy__session-row" key={candidate.id}>
      <span><b>{new Date(candidate.modifiedAt).toLocaleString()}</b><small>{(candidate.size / 1048576).toFixed(1)} MB · {candidate.state}</small></span>
      <Button size="sm" disabled={busy || sessions.length >= 4 || candidate.state !== "ready" || candidate.walPresent || sessions.some((session) => session.candidateId === candidate.id)} onClick={() => void run((signal) => open(candidate, signal))}>{t("strategy.recorded.open")}</Button>
    </div>)}
    {sessions.length ? <>
      <h3>{t("strategy.recorded.prepared")}</h3>
      {sessions.map((session) => <div className="orbit-strategy__session-row" key={session.opened.sessionId}>
        <span><b>{session.opened.session.metadata.filter((item) => ["TrackName", "CarName"].includes(item.key) && item.present && !item.redacted).map((item) => item.value).join(" · ") || session.base.sessionId.slice(0, 12)}</b><small>{t("strategy.recorded.revision")} {session.revision.revisionId.slice(0, 12)}</small></span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => {
          await client.close(session.opened.sessionId);
          if (alive.current) update(owned.current.filter((item) => item !== session));
        })}>{t("strategy.recorded.close")}</Button>
      </div>)}
      <p>{t("strategy.recorded.replace")}</p>
      <Button disabled={busy} onClick={() => void run(async (signal) => {
        await onApply(owned.current, signal);
        signal.throwIfAborted();
        if (alive.current) setApplied(true);
      })}>{t("strategy.recorded.apply")}</Button>
    </> : null}
    {applied ? <p role="status">{t("strategy.recorded.applied")}</p> : null}
  </section>;
}
