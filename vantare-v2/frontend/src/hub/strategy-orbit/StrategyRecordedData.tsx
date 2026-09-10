import { useState } from "react";
import { analysisCanonicalSessionType, analysisValue, type AnalysisClassificationField, type AnalysisCorrectableFamily, type AnalysisScalar, type AnalysisValue } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";
import { Button, Icon } from "../../ui/orbit";
import type { RecordedSession } from "./strategy-recorded-session";
import type { RecordedCorrectionsController } from "./use-recorded-corrections";
import { recordedClassificationOriginal } from "./strategy-recorded-corrections";
import { RecordedClassificationDetail, RecordedClassificationList, type RecordedClassificationForm } from "./StrategyRecordedClassification";
import { RecordedLapDetail, RecordedLapList, type RecordedFamilyForm } from "./StrategyRecordedLaps";
import "./strategy-recorded-data.css";

type Form = { sampleIndex: number; column: string; original: AnalysisValue; value: string; reason: string };
export function StrategyRecordedData({ controller, sessions, sessionLabels = {}, selectedRevisions = [], busy, onSources, onPendingChange, t }: {
  readonly controller: RecordedCorrectionsController; readonly sessions: readonly RecordedSession[]; readonly busy: boolean;
  readonly sessionLabels?: Readonly<Record<string, string>>;
  readonly selectedRevisions?: readonly StrategyAnalysisRevisionRef[];
  readonly onSources: () => void; readonly onPendingChange: (pending: boolean) => void; readonly t: (key: string) => string;
}) {
  const [view, setView] = useState<"laps" | "samples" | "classification">("laps");
  const [family, setFamily] = useState<AnalysisCorrectableFamily>("combined_stint_pace_curve");
  const [familyForm, setFamilyForm] = useState<RecordedFamilyForm | null>(null);
  const [classForm, setClassForm] = useState<RecordedClassificationForm | null>(null);
  const [column, setColumn] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [formError, setFormError] = useState(false);
  const [saveReason, setSaveReason] = useState("");
  const { editor } = controller;
  // An open session is not race-selected by itself. The race selection arrives
  // as explicit revision refs; locate it by source identity (session + base).
  const selectedRef = editor ? selectedRevisions.find(ref => ref.sessionId === editor.session.revision.sessionId && ref.baseDigest === editor.session.revision.baseDigest) : undefined;
  const sameSelection = (revision: StrategyAnalysisRevisionRef) => selectedRef !== undefined && revision.sessionId === selectedRef.sessionId && revision.baseDigest === selectedRef.baseDigest && revision.revisionId === selectedRef.revisionId && revision.snapshotId === selectedRef.snapshotId;
  // Preparing or adopting for the race needs a selected, projectable source.
  // A marked source stays blocked even when it carries a combination id.
  const projectable = Boolean(editor && selectedRef && editor.session.combinationId && !editor.session.projectionUnavailableReason);
  const adoptionMatchesSelection = Boolean(editor?.projected && selectedRef && sameSelection(editor.projected.revision));
  const page = editor?.page;
  const channel = editor?.session.opened.session.channels.find(item => item.id === page?.channel_id);
  const currentColumn = channel?.columns.find(item => item.name === column)?.name ?? channel?.columns[0]?.name ?? "";
  const locked = busy || controller.busy;
  const editable = Boolean(channel && editor?.session.editableChannelIds?.includes(channel.id));
  const display = (value: AnalysisValue) => { const scalar = analysisValue(value); return scalar === null ? t("strategy.data.absent") : typeof scalar === "boolean" ? t(scalar ? "strategy.data.true" : "strategy.data.false") : String(scalar); };
  function clearForm() { setFamilyForm(null); setClassForm(null); setForm(null); setFormDirty(false); setFormError(false); onPendingChange(false); }
  function openClassification(field: AnalysisClassificationField) {
    if (!editor || locked || formDirty || editor.request) return;
    let original: string;
    try {
      original = recordedClassificationOriginal(editor.session, editor.current, field);
    }
    catch {
      return;
    }
    clearForm();
    const active = editor.classifications.find(item => item.field === field);
    const saved = editor.current.revision.snapshot.classifications?.find(item => item.request.field === field);
    const candidate = active?.replacement ?? saved?.request.replacement ?? original;
    setClassForm({
      field, original, choice: active || !saved ? "correct" : "original",
      value: field === "SessionType" ? analysisCanonicalSessionType(candidate) : candidate,
      reason: active?.reason ?? saved?.request.reason ?? "",
    });
  }
  function applyClassification() {
    if (!classForm || locked) return;
    if (!classForm.reason.trim()) return;
    if (classForm.choice === "original") {
      if (controller.removeClassification(classForm.field)) { setSaveReason(classForm.reason); clearForm(); }
      return;
    }
    if (controller.editClassification(classForm.field, classForm.value, classForm.reason)) { setSaveReason(classForm.reason); clearForm(); }
  }
  function field(key: "value" | "reason", value: string) {
    if (!form) return;
    setForm({ ...form, [key]: value }); setFormDirty(true); setFormError(false); onPendingChange(true);
  }
  function apply() {
    if (locked) return;
    if (classForm) {
      applyClassification();
      return;
    }
    if (familyForm) {
      const { row, family, choice, reason } = familyForm;
      if (!row.target || !reason.trim()) return;
      const applied = choice === "automatic" ? controller.removeFamily(row.target, family) : controller.editFamily(row.target, family, choice === "include", reason);
      if (applied) { setSaveReason(reason); clearForm(); }
      return;
    }
    if (!form) return;
    const kind = form.original.scalar.kind;
    let replacement: AnalysisScalar;
    if (kind === "boolean" && ["true", "false"].includes(form.value)) replacement = { kind, boolean: form.value === "true" };
    else if (kind === "text") replacement = { kind, text: form.value };
    else if ((kind === "number" || kind === "integer") && form.value.trim() !== "" && Number.isFinite(Number(form.value)) && (kind !== "integer" || Number.isSafeInteger(Number(form.value)))) replacement = kind === "number" ? { kind, number: Number(form.value) } : { kind, integer: Number(form.value) };
    else { setFormError(true); return; }
    if (controller.edit(form.sampleIndex, form.column, replacement, form.reason)) { setSaveReason(form.reason); clearForm(); }
  }
  const failureKey = controller.error === "recorded_revision_conflict" ? "conflict" : controller.error === "recorded_save_not_committed" ? "notCommitted" : controller.error === "recorded_operation_cancelled" ? "cancelled" : "error";
  return <section className="strategy-recorded-data" aria-labelledby="recorded-data-title">
    <header className="strategy-recorded-data__heading"><h2 id="recorded-data-title">{t("strategy.data.title")}</h2><p>{t("strategy.data.description")}</p></header>
    <div className="strategy-recorded-data__grid">
      <section className="strategy-recorded-data__observations">
        <div className="strategy-recorded-data__source"><label>{t("strategy.data.source")}<select value={editor?.session.opened.sessionId ?? ""} disabled={locked || formDirty || controller.unresolved} onChange={event => { const session = sessions.find(item => item.opened.sessionId === event.target.value); if (session) { clearForm(); setColumn(""); void controller.load(session); } }}>
          <option value="">{t("strategy.journey.choose")}</option>{sessions.map(session => <option key={session.opened.sessionId} value={session.opened.sessionId}>{sessionLabels[session.candidateId] || [session.combination?.trackName, session.combination?.carName].filter(Boolean).join(" · ") || t("strategy.recorded.unnamed")}</option>)}
        </select></label><Button variant="ghost" disabled={locked || formDirty || controller.unresolved} onClick={onSources}>{t("strategy.data.sources")}</Button></div>
        <div className="strategy-recorded-laps__views"><h3>{t("strategy.data.observations")}</h3><span>{view !== "classification" ? <Button size="sm" variant="ghost" disabled={locked || formDirty || Boolean(editor?.request)} onClick={() => { clearForm(); setView("classification"); }}>{t("strategy.classification.tab")}</Button> : null}{view === "laps" ? <Button size="sm" variant="ghost" disabled={locked || formDirty || Boolean(editor?.request)} onClick={() => { clearForm(); setView("samples"); }}>{t("strategy.laps.advanced")}</Button> : <Button size="sm" variant="ghost" disabled={locked || formDirty || Boolean(editor?.request)} onClick={() => { clearForm(); setView("laps"); }}>{t("strategy.laps.back")}</Button>}{view === "classification" ? <Button size="sm" variant="ghost" disabled={locked || formDirty || Boolean(editor?.request)} onClick={() => { clearForm(); setView("samples"); }}>{t("strategy.laps.advanced")}</Button> : null}</span></div>
        {view === "samples" ? <p className="strategy-recorded-data__muted">{t("strategy.data.advancedHint")}</p> : null}
        {!editor ? <div className="strategy-recorded-data__empty"><Icon name="i-telemetria" size={44} /><strong>{t("strategy.data.chooseSource")}</strong><p>{t("strategy.data.chooseSourceHint")}</p></div> : view === "laps" ? <RecordedLapList page={editor.lapPage} family={family} proposals={editor.familyUses ?? []} selected={familyForm?.row} locked={locked || formDirty || Boolean(editor.request)} t={t}
          onFamily={next => { clearForm(); setFamily(next); }} onPage={start => { clearForm(); void controller.laps(start); }}
          onSelect={(row, proposal) => { clearForm(); setFamilyForm({ row, family, choice: proposal ? proposal.included ? "include" : "exclude" : "automatic", reason: proposal?.reason ?? "" }); }} /> : view === "samples" ? <>
          <div className="strategy-recorded-data__channels"><label>{t("strategy.data.channel")}<select value={page?.channel_id ?? ""} disabled={locked || formDirty} onChange={event => { clearForm(); setColumn(""); void controller.page(event.target.value, 0); }}><option value="" disabled>{t("strategy.journey.choose")}</option>{editor.session.opened.session.channels.map(item => <option key={item.id} value={item.id}>{item.source_name}{item.unit.symbol ? ` · ${item.unit.symbol}` : ""}</option>)}</select></label>
            {channel ? <label>{t("strategy.data.column")}<select value={currentColumn} disabled={locked || formDirty} onChange={event => { clearForm(); setColumn(event.target.value); }}>{channel.columns.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label> : null}</div>
          {channel && !editable ? <p role="status" className="strategy-recorded-data__muted">{t("strategy.data.readOnlyChannel")}</p> : null}
          {page ? <><div className="strategy-recorded-data__table"><table><thead><tr><th>{t("strategy.data.sample")}</th><th>{t("strategy.data.original")}</th><th>{t("strategy.data.correction")}</th><th>{t("strategy.data.quality")}</th></tr></thead><tbody>{page.samples.map(sample => {
            const value = sample.values.find(item => item.column === currentColumn);
            const correction = editor.corrections.find(item => item.target.channelId === page.channel_id && item.target.column === currentColumn && item.target.sampleIndex === sample.index);
            return <tr key={sample.index} aria-selected={form?.sampleIndex === sample.index && form.column === currentColumn}>
              <td><button type="button" disabled={locked || formDirty || !editable || Boolean(editor.request) || !value?.present || value.scalar.kind === "unknown" || channel?.unit.quality !== "valid"} onClick={() => { if (value) { setForm({ sampleIndex: sample.index, column: currentColumn, original: value, value: String(analysisValue(correction ? { ...value, scalar: correction.replacement } : value) ?? ""), reason: correction?.reason ?? "" }); setFormError(false); } }}>{t("strategy.data.sample")} {sample.index}</button></td>
              <td>{value ? display(value) : t("strategy.data.absent")}</td><td>{correction && value ? display({ ...value, scalar: correction.replacement }) : t("strategy.data.unchanged")}</td><td>{t(`strategy.data.quality.${value?.quality ?? "missing"}`)}</td>
            </tr>;
          })}</tbody></table></div>{page.samples.length === 0 ? <p role="status">{t("strategy.data.noSamples")}</p> : null}
          <div className="strategy-recorded-data__pages"><Button size="sm" variant="ghost" disabled={locked || formDirty || page.start === 0} onClick={() => { clearForm(); void controller.page(page.channel_id, Math.max(0, page.start - 50)); }}>{t("strategy.recorded.previous")}</Button><span>{t("strategy.data.samplesShown")} {page.samples.length}</span><Button size="sm" variant="ghost" disabled={locked || formDirty || page.samples.length < 50} onClick={() => { clearForm(); void controller.page(page.channel_id, page.start + 50); }}>{t("strategy.recorded.next")}</Button></div></> : <p className="strategy-recorded-data__empty">{t("strategy.data.chooseChannel")}</p>}
        </> : <RecordedClassificationList session={editor.session} current={editor.current} proposals={editor.classifications} selected={classForm?.field} locked={locked || formDirty || Boolean(editor.request)} onSelect={openClassification} t={t} />}
      </section>
      <aside className="strategy-recorded-data__detail"><h3>{t("strategy.data.review")}</h3><p className="strategy-recorded-data__muted">{t("strategy.data.reviewHint")}</p>
        {classForm ? <RecordedClassificationDetail form={classForm} dirty={formDirty} locked={locked || Boolean(editor?.request)} onChange={next => { setClassForm(next); setFormDirty(true); onPendingChange(true); }} onApply={apply} onCancel={clearForm} t={t} /> : familyForm ? <RecordedLapDetail form={familyForm} dirty={formDirty} locked={locked || Boolean(editor?.request)} t={t} onChange={next => { setFamilyForm(next); setFormDirty(true); onPendingChange(true); }} onApply={apply} onCancel={clearForm} /> : form ? <form onSubmit={event => { event.preventDefault(); apply(); }}>
          <label>{t("strategy.data.originalReadOnly")}<output>{display(form.original)} {channel?.unit.symbol ?? ""}</output></label>
          <label>{t("strategy.data.correctedValue")}{form.original.scalar.kind === "boolean" ? <select value={form.value} disabled={locked || Boolean(editor?.request)} onChange={event => field("value", event.target.value)}><option value="true">{t("strategy.data.true")}</option><option value="false">{t("strategy.data.false")}</option></select> : <input value={form.value} type={form.original.scalar.kind === "text" ? "text" : "number"} step="any" disabled={locked || Boolean(editor?.request)} onChange={event => field("value", event.target.value)} />}</label>
          <label>{t("strategy.data.reason")}<textarea value={form.reason} maxLength={1024} disabled={locked || Boolean(editor?.request)} onChange={event => field("reason", event.target.value)} /></label>
          {formError ? <p role="alert">{t("strategy.data.invalidValue")}</p> : null}
          <div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked} onClick={clearForm}>{t("strategy.recorded.cancel")}</Button><Button variant="primary" type="submit" disabled={locked || !formDirty || !form.reason.trim() || Boolean(editor?.request)}>{t("strategy.data.apply")}</Button></div>
        </form> : <div className="strategy-recorded-data__empty"><Icon name="i-ajustes" size={36} /><p>{t(view === "laps" ? "strategy.laps.chooseLap" : view === "samples" ? "strategy.data.chooseSample" : "strategy.classification.chooseField")}</p></div>}
        {editor ? <div className="strategy-recorded-data__revision">
          <strong>{t("strategy.data.pendingCount")} {editor.corrections.length + (editor.familyUses?.length ?? 0) + (editor.classifications?.length ?? 0)}</strong>
          {editor.dirty && !editor.request ? <><label>{t("strategy.data.revisionReason")}<input value={saveReason} disabled={locked || formDirty} onChange={event => setSaveReason(event.target.value)} /></label><div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked || formDirty} onClick={() => controller.discard()}>{t("strategy.data.discard")}</Button><Button disabled={locked || formDirty || !saveReason.trim()} onClick={() => void controller.save(saveReason)}>{t("strategy.data.save")}</Button></div></> : null}
          {editor.request ? <><p role="status">{t("strategy.data.uncertain")}</p><div className="strategy-recorded-data__actions"><Button disabled={locked} onClick={() => void controller.resolveSave()}>{t("strategy.data.resolve")}</Button><Button variant="ghost" disabled={locked} onClick={() => void controller.retrySave()}>{t("strategy.data.retry")}</Button></div></> : null}
          {editor.saved ? <p>{t("strategy.data.savedSeparately")}</p> : null}
          {editor && !selectedRef ? <p role="status">{t("strategy.recorded.notSelected")}</p> : null}
          {editor && (editor.session.projectionUnavailableReason || !editor.session.combinationId) ? <p role="status">{t("strategy.recorded.metadataUnavailable")}</p> : null}
          {!editor.dirty && !editor.request ? <Button disabled={locked || formDirty || !projectable || adoptionMatchesSelection} onClick={() => void (editor.projected ? controller.adopt() : controller.project())}>{t(editor.projected ? "strategy.data.adopt" : "strategy.data.prepare")}</Button> : null}
          {editor.current.headId !== editor.current.revision.revisionId ? <><p>{t("strategy.data.newerHead")}</p><Button variant="ghost" disabled={locked || formDirty || controller.unresolved} onClick={() => { clearForm(); void controller.head(); }}>{t("strategy.data.reviewHead")}</Button></> : null}
        </div> : null}
      </aside>
    </div>
    {controller.error ? <p role="alert" className="strategy-recorded-data__error">{t(`strategy.data.${failureKey}`)}</p> : null}
    <footer className="strategy-recorded-data__footer"><span><Icon name="i-lock" size={19} />{t("strategy.recorded.originals")}</span>{controller.busy ? <span role="status">{t("strategy.data.working")} <Button variant="ghost" onClick={controller.cancel}>{t("strategy.recorded.cancel")}</Button></span> : null}</footer>
  </section>;
}
