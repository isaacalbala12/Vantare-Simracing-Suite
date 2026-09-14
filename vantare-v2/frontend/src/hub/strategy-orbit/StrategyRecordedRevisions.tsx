import { useEffect, useState } from "react";
import { analysisValue, type AnalysisValue } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";
import { Button, Icon } from "../../ui/orbit";
import type { RecordedSession } from "./strategy-recorded-session";
import { recordedClassificationOriginal } from "./strategy-recorded-corrections";
import type { RecordedCorrectionsController } from "./use-recorded-corrections";
import "./strategy-recorded-revisions.css";

function recordedStintTime(timestamp: string): string {
  return timestamp.slice(timestamp.indexOf("T") + 1);
}

/** Source revision inspection never adopts a different revision into the race. */
export function StrategyRecordedRevisions({ controller, sessions, sessionLabels, selectedRevisions = [], busy, configurationSaved, configurationDirty, onSources, onPendingChange, t }: {
  readonly controller: RecordedCorrectionsController; readonly sessions: readonly RecordedSession[];
  readonly sessionLabels: Readonly<Record<string, string>>; readonly busy: boolean;
  readonly selectedRevisions?: readonly StrategyAnalysisRevisionRef[];
  readonly configurationSaved: boolean; readonly configurationDirty: boolean;
  readonly onSources: () => void; readonly onPendingChange: (pending: boolean) => void; readonly t: (key: string) => string;
}) {
  const [reason, setReason] = useState("");
  const { editor } = controller;
  const revision = editor?.current.revision;
  const familyUses = revision?.snapshot.familyUses ?? [];
  const classUses = revision?.snapshot.classifications ?? [];
  const stintBoundaries = revision?.snapshot.stintBoundaries ?? [];
  const correctionCount = (revision?.snapshot.corrections.length ?? 0) + familyUses.length + classUses.length + stintBoundaries.length;
  const locked = busy || controller.busy;
  const navigatingBlocked = locked || controller.unresolved || reason !== "";
  // The open session alone is never the race selection. Locate the race ref by
  // source identity; only a full revision/snapshot match counts as pinned.
  const selectedRef = editor ? selectedRevisions.find(ref => ref.sessionId === editor.session.revision.sessionId && ref.baseDigest === editor.session.revision.baseDigest) : undefined;
  const pinned = Boolean(selectedRef && revision && selectedRef.revisionId === revision.revisionId && selectedRef.snapshotId === revision.snapshot.snapshotId);
  const projectable = Boolean(editor && selectedRef && editor.session.combinationId && !editor.session.projectionUnavailableReason);
  const latest = revision?.revisionId === editor?.current.headId;
  useEffect(() => {
    // Once dispatched, the controller owns the reason inside its stable command.
    // Do not keep Data locked by a hidden form after confirmed absence/conflict.
    onPendingChange(reason !== "" && !controller.unresolved && !latest);
    return () => onPendingChange(false);
  }, [reason, controller.unresolved, latest, onPendingChange]);
  const display = (value: AnalysisValue) => {
    const scalar = analysisValue(value);
    return scalar === null ? t("strategy.data.absent") : typeof scalar === "boolean" ? t(scalar ? "strategy.data.true" : "strategy.data.false") : String(scalar);
  };
  const changeReason = (value: string) => setReason(value);
  const failureKey = controller.error === "recorded_revision_conflict" ? "conflict" : controller.error === "recorded_save_not_committed" ? "notCommitted" : controller.error === "recorded_operation_cancelled" ? "cancelled" : "error";
  return <section className="strategy-recorded-data strategy-recorded-revisions" aria-labelledby="recorded-revisions-title">
    <header className="strategy-recorded-data__heading"><h2 id="recorded-revisions-title">{t("strategy.data.tab.revisions")}</h2><p>{t("strategy.history.description")}</p></header>
    <div className="strategy-recorded-revisions__grid">
      <section className="strategy-recorded-data__observations">
        <div className="strategy-recorded-data__source"><label>{t("strategy.history.source")}<select value={editor?.session.opened.sessionId ?? ""} disabled={navigatingBlocked} onChange={event => { const session = sessions.find(item => item.opened.sessionId === event.target.value); if (session) void controller.load(session); }}>
          <option value="">{t("strategy.journey.choose")}</option>{sessions.map(session => <option key={session.opened.sessionId} value={session.opened.sessionId}>{sessionLabels[session.candidateId] || [session.combination?.trackName, session.combination?.carName].filter(Boolean).join(" · ") || t("strategy.recorded.unnamed")}</option>)}
        </select></label><Button disabled={navigatingBlocked} onClick={onSources}>{t("strategy.history.sources")}</Button></div>
        <h3>{t("strategy.history.sourceHistory")}</h3>
        {!editor || !revision ? <div className="strategy-recorded-revisions__empty"><Icon name="i-roadmap" size={58} /><strong>{t("strategy.history.chooseSource")}</strong><p>{t("strategy.history.chooseSourceHint")}</p></div> : <>
          <div className="strategy-recorded-revisions__navigation">
            <Button disabled={navigatingBlocked || !revision.parentRevisionId} onClick={() => void controller.parent()}>{t("strategy.history.parent")}</Button>
            <Button disabled={navigatingBlocked || latest} onClick={() => void controller.head()}>{t("strategy.data.reviewHead")}</Button>
            <Button disabled={navigatingBlocked || pinned || !selectedRef} onClick={() => { if (editor && selectedRef) void controller.load({ ...editor.session, revision: selectedRef }); }}>{t("strategy.history.reviewPinned")}</Button>
          </div>
          <article className="strategy-recorded-revisions__card">
            <Icon name="i-roadmap" size={26} /><div><div className="strategy-recorded-revisions__badges">{pinned ? <span>{t("strategy.history.pinned")}</span> : null}{latest ? <span>{t("strategy.history.latest")}</span> : null}</div>
              <h4>{revision.command.reason || t("strategy.history.original")}</h4>
              {revision.createdAt ? <time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time> : <p>{t("strategy.history.originalHint")}</p>}
              <p>{t("strategy.history.activeCorrections")} {correctionCount}</p>
            </div>
          </article>
          <p className="strategy-recorded-data__muted">{t("strategy.history.snapshotHint")}</p>
          <div className="strategy-recorded-revisions__changes">{revision.snapshot.corrections.map(correction => {
            const channel = editor.session.opened.session.channels.find(item => item.id === correction.request.target.channelId);
            return <article key={correction.correctionId} className="strategy-recorded-revisions__change">
              <strong>{channel?.source_name || t("strategy.data.channel")} · {t("strategy.data.sample")} {correction.request.target.sampleIndex}</strong>
              <dl><div><dt>{t("strategy.data.original")}</dt><dd>{display(correction.original)} {correction.request.unit.symbol}</dd></div><div><dt>{t("strategy.data.correction")}</dt><dd>{display(correction.corrected)} {correction.request.unit.symbol}</dd></div></dl>
              <p>{correction.request.reason}</p>
            </article>;
          })}{familyUses.map(correction => <article key={correction.correctionId} className="strategy-recorded-revisions__change">
            <strong>{t(`strategy.laps.family.${correction.request.family}`)} · {t("strategy.laps.lap")} {correction.request.target.number}</strong>
            <p><time dateTime={correction.request.target.start}>{new Date(correction.request.target.start).toLocaleString()}</time> → <time dateTime={correction.request.target.end}>{new Date(correction.request.target.end).toLocaleString()}</time></p>
            <dl><div><dt>{t("strategy.history.familyOriginal")}</dt><dd>{t(correction.original.included ? "strategy.laps.included" : "strategy.laps.excluded")}</dd></div><div><dt>{t("strategy.data.correction")}</dt><dd>{t(correction.corrected.included ? "strategy.laps.included" : "strategy.laps.excluded")}</dd></div></dl>
            <p>{correction.request.reason}</p><p>{t("strategy.history.familyHint")}</p>
          </article>)}{classUses.map(prepared => {
            // The guard only decides availability against the open source and
            // current base; values below always come from the consulted
            // snapshot and never replace its history. Local proposals and the
            // newer head are never consulted here.
            let available = true;
            try {
              recordedClassificationOriginal(editor.session, editor.current, prepared.request.field);
            }
            catch {
              available = false;
            }
            return <article key={prepared.correctionId} className="strategy-recorded-revisions__change">
              <strong>{t(`strategy.classification.field.${prepared.request.field}`)}</strong>
              {available ? <>
                <dl><div><dt>{t("strategy.data.original")}</dt><dd>{prepared.original}</dd></div><div><dt>{t("strategy.data.correction")}</dt><dd>{prepared.corrected}</dd></div></dl>
                <p>{prepared.request.reason}</p><p>{t("strategy.classification.manual")}</p>
                {prepared.request.field === "WeatherConditions" ? <p>{t("strategy.classification.weatherHint")}</p> : null}
              </> : <p>{t("strategy.classification.unavailable")}</p>}
            </article>;
          })}{stintBoundaries.map(prepared => <article key={prepared.correctionId} className="strategy-recorded-revisions__change">
            <strong>{t("strategy.stints.stint")} {prepared.original.stintNumber}</strong>
            <dl><div><dt>{t("strategy.data.original")}</dt><dd><time dateTime={prepared.original.timestamp}>{recordedStintTime(prepared.original.timestamp)}</time> · {t(`strategy.stints.cause.${prepared.original.cause}`)}</dd></div><div><dt>{t("strategy.data.correction")}</dt><dd>{prepared.request.operation === "remove_stint_boundary" ? t("strategy.stints.remove") : <><time dateTime={prepared.request.replacement!.anchor.timestamp}>{recordedStintTime(prepared.request.replacement!.anchor.timestamp)}</time> · {t(`strategy.stints.cause.${prepared.request.replacement!.cause}`)}</>}</dd></div></dl>
            <p>{prepared.request.reason}</p><p>{t("strategy.stints.pitIndependent")}</p>
          </article>)}</div>
          {correctionCount === 0 ? <p className="strategy-recorded-data__muted">{t("strategy.history.noCorrections")}</p> : null}
        </>}
      </section>
      <aside className="strategy-recorded-data__detail">
        <h3>{t("strategy.history.raceState")}</h3>
        <div className="strategy-recorded-revisions__info"><Icon name="i-ajustes" size={32} /><div><strong>{t(configurationSaved ? "strategy.history.configurationSaved" : "strategy.history.configurationDraft")}</strong><p>{t(configurationDirty ? "strategy.history.configurationDirty" : "strategy.history.configurationHint")}</p></div></div>
        <div className="strategy-recorded-revisions__info"><Icon name="i-estrategia" size={32} /><div><strong>{t("strategy.workspace.notCalculated")}</strong><p>{t("strategy.history.planHint")}</p></div></div>
        {editor && revision ? <div className="strategy-recorded-data__revision">
          <h4>{t("strategy.history.restoreTitle")}</h4><p>{t("strategy.history.restoreHint")}</p>
          {editor && !selectedRef ? <p role="status">{t("strategy.recorded.notSelected")}</p> : null}
          {editor && (editor.session.projectionUnavailableReason || !editor.session.combinationId) ? <p role="status">{t("strategy.recorded.metadataUnavailable")}</p> : null}
          {!latest && !controller.unresolved ? <form onSubmit={event => { event.preventDefault(); if (!locked && reason.trim()) void controller.restore(reason); }}>
            <label>{t("strategy.history.restoreReason")}<textarea value={reason} maxLength={1024} disabled={locked} onChange={event => changeReason(event.target.value)} /></label>
            <div className="strategy-recorded-data__actions"><Button disabled={locked || !reason} onClick={() => changeReason("")}>{t("strategy.recorded.cancel")}</Button><Button type="submit" variant="primary" disabled={locked || !reason.trim()}>{t("strategy.history.restore")}</Button></div>
          </form> : <p>{t("strategy.history.restoreChoose")}</p>}
          {controller.unresolved && !editor.request ? <p role="status">{t("strategy.history.finishData")}</p> : null}
          {editor.request ? <><p role="status">{t("strategy.data.uncertain")}</p><div className="strategy-recorded-data__actions"><Button disabled={locked} onClick={() => void controller.resolveSave()}>{t("strategy.data.resolve")}</Button><Button disabled={locked} onClick={() => void controller.retrySave()}>{t("strategy.data.retry")}</Button></div></> : null}
          {editor.saved ? <p>{t("strategy.data.savedSeparately")}</p> : null}
          {!controller.unresolved ? <Button disabled={locked || reason !== "" || pinned || !projectable} onClick={() => void (editor.projected ? controller.adopt() : controller.project())}>{t(editor.projected ? "strategy.data.adopt" : "strategy.data.prepare")}</Button> : null}
        </div> : null}
      </aside>
    </div>
    {controller.error ? <p role="alert" className="strategy-recorded-data__error">{t(`strategy.data.${failureKey}`)}</p> : null}
    <footer className="strategy-recorded-data__footer"><span><Icon name="i-lock" size={19} />{t("strategy.recorded.originals")}</span>{controller.busy ? <span role="status">{t("strategy.data.working")} <Button onClick={controller.cancel}>{t("strategy.recorded.cancel")}</Button></span> : null}</footer>
  </section>;
}
