import { Button, Chip, Note } from "../../ui/orbit";
import { useRecordedSessions, type RecordedSessionsController, type RecordedSessionsOptions } from "./use-recorded-sessions";

type Props = RecordedSessionsOptions & { readonly t: (key: string) => string };

// Existing callers retain their owner; the recorded workflow can keep the hook
// mounted while showing this same view in either wizard or editor.
export function StrategyRecordedSessions(props: Props) {
  const controller = useRecordedSessions(props);
  return <StrategyRecordedSessionsView controller={controller} t={props.t} />;
}

export function StrategyRecordedSessionsView({ controller, t }: { readonly controller: RecordedSessionsController; readonly t: (key: string) => string }) {
  const { candidates, sessions, busy, error, applied } = controller;
  return <section className="orbit-strategy__sessions" aria-label={t("strategy.recorded.title")}>
    <div className="orbit-strategy__sessions-head"><b>{t("strategy.recorded.title")}</b><Chip>{sessions.length}/4</Chip></div>
    <p>{t("strategy.recorded.hint")}</p>
    <Button disabled={busy} onClick={() => void controller.discover()} variant="ghost">{t("strategy.recorded.discover")}</Button>
    {busy ? <p role="status">{t("strategy.recorded.busy")} <Button variant="ghost" onClick={controller.cancel}>{t("strategy.recorded.cancel")}</Button></p> : null}
    {error ? <Note title={t("strategy.recorded.error")}><span role="alert">{error}</span></Note> : null}
    {candidates?.length === 0 ? <p role="status">{t("strategy.recorded.empty")}</p> : null}
    {candidates?.map(candidate => <div className="orbit-strategy__session-row" key={candidate.id}>
      <span><b>{new Date(candidate.modifiedAt).toLocaleString()}</b><small>{(candidate.size / 1048576).toFixed(1)} MB · {candidate.state}</small></span>
      <Button size="sm" disabled={busy || sessions.length >= 4 || candidate.state !== "ready" || candidate.walPresent || sessions.some(session => session.candidateId === candidate.id)} onClick={() => void controller.open(candidate)}>{t("strategy.recorded.open")}</Button>
    </div>)}
    {sessions.length ? <>
      <h3>{t("strategy.recorded.prepared")}</h3>
      {sessions.map(session => <div className="orbit-strategy__session-row" key={session.opened.sessionId}>
        <span><b>{session.opened.session.metadata.filter(item => ["TrackName", "CarName"].includes(item.key) && item.present && !item.redacted).map(item => item.value).join(" · ") || session.base.sessionId.slice(0, 12)}</b><small>{t("strategy.recorded.revision")} {session.revision.revisionId.slice(0, 12)}</small></span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void controller.close(session)}>{t("strategy.recorded.close")}</Button>
      </div>)}
      <p>{t("strategy.recorded.replace")}</p>
      <Button disabled={busy} onClick={() => void controller.apply()}>{t("strategy.recorded.apply")}</Button>
    </> : null}
    {applied ? <p role="status">{t("strategy.recorded.applied")}</p> : null}
  </section>;
}
