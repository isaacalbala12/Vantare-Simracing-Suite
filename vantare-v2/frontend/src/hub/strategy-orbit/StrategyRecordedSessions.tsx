import { useState } from "react";
import { Button, Chip, Note } from "../../ui/orbit";
import { useRecordedSessions, type RecordedSessionsController, type RecordedSessionsOptions } from "./use-recorded-sessions";
import "./strategy-recorded-library.css";

type Props = RecordedSessionsOptions & { readonly t: (key: string) => string };

// Existing callers retain their owner; the recorded workflow can keep the hook
// mounted while showing this same view in either wizard or editor.
export function StrategyRecordedSessions(props: Props) {
  const controller = useRecordedSessions(props);
  return <StrategyRecordedSessionsView controller={controller} t={props.t} />;
}

export function StrategyRecordedSessionsView({ controller, t }: { readonly controller: RecordedSessionsController; readonly t: (key: string) => string }) {
  const { candidates, sessions, busy, error, applied } = controller;
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [order, setOrder] = useState("recent");
  const [page, setPage] = useState(0);
  const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const needle = fold(query.trim());
  const filtered = (candidates ?? []).filter(candidate => {
    const ready = candidate.state === "ready" && !candidate.walPresent;
    return (!needle || fold(candidate.displayName ?? "").includes(needle)) &&
      (availability === "all" || (availability === "ready" ? ready : !ready));
  }).sort((a, b) => (Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt)) * (order === "recent" ? 1 : -1) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 25, (currentPage + 1) * 25);
  return <section className="orbit-strategy__sessions" aria-label={t("strategy.recorded.title")}>
    <div className="orbit-strategy__sessions-head"><b>{t("strategy.recorded.title")}</b><Chip>{sessions.length}/4</Chip></div>
    <p>{t("strategy.recorded.hint")}</p>
    <Button disabled={busy} onClick={() => void controller.discover()} variant="ghost">{t("strategy.recorded.discover")}</Button>
    {busy ? <p role="status">{t("strategy.recorded.busy")} <Button variant="ghost" onClick={controller.cancel}>{t("strategy.recorded.cancel")}</Button></p> : null}
    {error ? <Note title={t("strategy.recorded.error")}><span role="alert">{error}</span></Note> : null}
    {candidates?.length === 0 ? <p role="status">{t("strategy.recorded.empty")}</p> : null}
    {candidates && candidates.length > 0 ? <div className="strategy-recorded-library">
      <div className="strategy-recorded-library__filters">
        <label>{t("strategy.recorded.search")}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <label>{t("strategy.recorded.availability")}<select value={availability} onChange={event => { setAvailability(event.target.value); setPage(0); }}>
          <option value="all">{t("strategy.recorded.all")}</option><option value="ready">{t("strategy.recorded.ready")}</option><option value="waiting">{t("strategy.recorded.waiting")}</option>
        </select></label>
        <label>{t("strategy.recorded.order")}<select value={order} onChange={event => { setOrder(event.target.value); setPage(0); }}>
          <option value="recent">{t("strategy.recorded.recent")}</option><option value="oldest">{t("strategy.recorded.oldest")}</option>
        </select></label>
      </div>
      <p className="strategy-recorded-library__hint">{t("strategy.recorded.filenameHint")}</p>
      <p role="status">{t("strategy.recorded.matches")} {filtered.length} / {candidates.length}</p>
      {filtered.length === 0 ? <p>{t("strategy.recorded.noMatches")}</p> : null}
      <ul className="strategy-recorded-library__list" aria-label={t("strategy.recorded.files")}>
        {visible.map(candidate => <li className="orbit-strategy__session-row" key={candidate.id}>
          <span><b>{candidate.displayName || t("strategy.recorded.unnamed")}</b><small>{new Date(candidate.modifiedAt).toLocaleString()} · {(candidate.size / 1048576).toFixed(1)} MB</small><small>{t(candidate.state === "ready" && !candidate.walPresent ? "strategy.recorded.ready" : "strategy.recorded.waiting")}</small></span>
          <Button size="sm" disabled={busy || sessions.length >= 4 || candidate.state !== "ready" || candidate.walPresent || sessions.some(session => session.candidateId === candidate.id)} onClick={() => void controller.open(candidate)}>{t("strategy.recorded.open")}</Button>
        </li>)}
      </ul>
      {pages > 1 ? <nav className="strategy-recorded-library__pages" aria-label={t("strategy.recorded.pages")}>
        <Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("strategy.recorded.previous")}</Button>
        <span>{currentPage + 1} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>{t("strategy.recorded.next")}</Button>
      </nav> : null}
    </div> : null}
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
