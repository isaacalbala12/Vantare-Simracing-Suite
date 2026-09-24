import { Fragment, useState } from "react";
import { Dialogs } from "@wailsio/runtime";
import { Button, Chip, Note } from "../../ui/orbit";
import type { RecordedSession } from "./strategy-recorded-session";
import { useRecordedSessions, type RecordedSessionsController, type RecordedSessionsOptions } from "./use-recorded-sessions";
import "./strategy-recorded-library.css";

type Props = RecordedSessionsOptions & { readonly t: (key: string) => string };

// Existing callers retain their owner; the recorded workflow can keep the hook
// mounted while showing this same view in either wizard or editor.
export function StrategyRecordedSessions(props: Props) {
  const controller = useRecordedSessions(props);
  return <StrategyRecordedSessionsView controller={controller} t={props.t} />;
}

export function StrategyRecordedSessionsView({ controller, onInspect, onChoose, t }: { readonly controller: RecordedSessionsController; readonly onInspect?: (session: RecordedSession) => void; readonly onChoose?: (candidate: NonNullable<RecordedSessionsController["candidates"]>[number]) => void; readonly t: (key: string) => string }) {
  const { candidates, sessions, busy, error, applied } = controller;
  const locked = busy || controller.locked;
  const projectable = (session: RecordedSession) => Boolean(session.combinationId && !session.projectionUnavailableReason);
  const nameFor = (session: RecordedSession) => {
    // A partial source has no verified combination: name it from the candidate
    // first, never from metadata that cannot be verified nor from a base id.
    if (!projectable(session)) return candidates?.find(item => item.id === session.candidateId)?.displayName || t("strategy.recorded.unnamed");
    return session.opened.session.metadata.filter(item => ["TrackName", "CarName"].includes(item.key) && item.present && item.quality === "valid" && item.sensitive === false && !item.redacted).map(item => item.value).join(" · ") || session.base.sessionId.slice(0, 12);
  };
  // New inspection errors speak human language with existing keys. Native
  // messages keep their text so their callers stay recognizable.
  const errorMessage = !error ? null
    : error === "recorded_combination_unavailable" ? t("strategy.recorded.metadataUnavailable")
    : error === "recorded_pending_corrections" ? t("strategy.data.finishPending")
    : error === "recorded_source_mismatch" ? t("strategy.recorded.sourceMismatch")
    : error === "recorded_revision_mismatch" ? t("strategy.recorded.revisionMismatch")
    : error.startsWith("recorded_") ? t("strategy.recorded.error")
    : error;
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [order, setOrder] = useState("recent");
  const [page, setPage] = useState(0);
  const [choosingCopy, setChoosingCopy] = useState(false);
  const [choosingFile, setChoosingFile] = useState(false);
  const [copyError, setCopyError] = useState("");
  async function chooseCopy(session: RecordedSession) {
    if (!controller.saveCopy || choosingCopy) return;
    setChoosingCopy(true);
    setCopyError("");
    try {
      const directory = await Dialogs.OpenFile({ CanChooseDirectories: true, CanChooseFiles: false, CanCreateDirectories: true, Title: t("strategy.recorded.copyChooseFolder") });
      if (directory) await controller.saveCopy(session, directory);
    } catch {
      setCopyError(t("strategy.recorded.copyChooseFailed"));
    } finally {
      setChoosingCopy(false);
    }
  }
  async function chooseFile() {
    if (!controller.selectFile || choosingFile) return;
    setChoosingFile(true);
    setCopyError("");
    try {
      const path = await Dialogs.OpenFile({ CanChooseFiles: true, CanChooseDirectories: false, Filters: [{ DisplayName: "LMU DuckDB", Pattern: "*.duckdb" }], Title: t("strategy.recorded.selectFileTitle") });
      if (path) await controller.selectFile(path);
    } catch {
      setCopyError(t("strategy.recorded.selectFileFailed"));
    } finally {
      setChoosingFile(false);
    }
  }
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
  const breakableName = (name: string) => name.split("_").map((part, index, parts) => <Fragment key={`${part}:${index}`}>{part}{index < parts.length - 1 ? <>_<wbr /></> : null}</Fragment>);
  return <section className="orbit-strategy__sessions" aria-label={t("strategy.recorded.title")}>
    <div className="orbit-strategy__sessions-head"><b>{t("strategy.recorded.title")}</b><Chip>{sessions.length}/4</Chip></div>
    <p>{t("strategy.recorded.hint")}</p>
    <Button disabled={locked} onClick={() => void controller.discover()} variant="primary">{t("strategy.recorded.discover")}</Button>
    {controller.selectFile ? <Button disabled={locked || choosingFile} onClick={() => void chooseFile()} variant="ghost">{t("strategy.recorded.selectFile")}</Button> : null}
    {controller.locked ? <p role="status">{t("strategy.data.finishPending")}</p> : null}
    {busy ? <p role="status">{t("strategy.recorded.busy")} <Button variant="ghost" onClick={controller.cancel}>{t("strategy.recorded.cancel")}</Button></p> : null}
    {errorMessage ? <Note title={t("strategy.recorded.error")}><span role="alert">{errorMessage}</span></Note> : null}
    {copyError ? <Note title={t("strategy.recorded.error")}><span role="alert">{copyError}</span></Note> : null}
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
          <span><b>{candidate.displayName ? breakableName(candidate.displayName) : t("strategy.recorded.unnamed")}</b><small>{new Date(candidate.modifiedAt).toLocaleString()} · {(candidate.size / 1048576).toFixed(1)} MB</small><small>{t(candidate.state === "ready" && !candidate.walPresent ? "strategy.recorded.ready" : "strategy.recorded.waiting")}</small></span>
          <Button size="sm" disabled={locked || candidate.state !== "ready" || candidate.walPresent || (onChoose ? sessions.length >= 4 && !sessions.some(session => session.candidateId === candidate.id) : sessions.length >= 4 || sessions.some(session => session.candidateId === candidate.id))} onClick={() => onChoose ? onChoose(candidate) : void controller.open(candidate)}>{t(onChoose ? "strategy.entry.useSession" : "strategy.recorded.open")}</Button>
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
      {sessions.map(session => {
        const partial = !projectable(session);
        return <div className="orbit-strategy__session-row" key={session.opened.sessionId}>
          <span><b>{nameFor(session)}</b><small>{t("strategy.recorded.revision")} {session.revision.revisionId.slice(0, 12)}</small>{partial ? <small>{t("strategy.recorded.inspectionOnly")}</small> : null}{partial ? <small>{t("strategy.recorded.metadataUnavailable")}</small> : null}{controller.savedCopies?.[session.opened.sessionId] ? <small role="status">{t("strategy.recorded.copySaved")} · {controller.savedCopies[session.opened.sessionId]}</small> : null}</span>
          {controller.saveCopy ? <Button size="sm" variant="ghost" disabled={locked || choosingCopy} onClick={() => void chooseCopy(session)}>{t("strategy.recorded.copySave")}</Button> : null}
          {onInspect ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => onInspect(session)}>{t("strategy.recorded.inspect")}</Button> : null}
          <Button size="sm" variant="ghost" disabled={locked} onClick={() => void controller.close(session)}>{t("strategy.recorded.close")}</Button>
        </div>;
      })}
      <p>{t("strategy.recorded.replace")}</p>
      <Button disabled={locked || sessions.some(session => !projectable(session))} onClick={() => void controller.apply()}>{t("strategy.recorded.apply")}</Button>
    </> : null}
    {applied ? <p role="status">{t("strategy.recorded.applied")}</p> : null}
  </section>;
}
