import { analysisCanonicalSessionType, analysisIdentityClassificationFields, analysisIdentityCombinationKey, analysisLegacyClassificationFields, analysisSessionTypes, sameAnalysisClassificationCorrections, type AnalysisClassificationCorrection, type AnalysisClassificationField, type AnalysisCombination, type AnalysisIdentityClassificationField, type AnalysisStoreResult } from "../../strategy/analysis-contract";
import { Button } from "../../ui/orbit";
import type { RecordedSession } from "./strategy-recorded-session";
import { recordedClassificationOriginal } from "./strategy-recorded-corrections";
import type { RecordedCombination } from "./strategy-recorded-wizard";

type Translate = (key: string) => string;

function savedDecision(current: AnalysisStoreResult, field: AnalysisClassificationField) {
  return current.revision.snapshot.classifications?.find(item => item.request.field === field);
}

/** Identity corrections inside any parsed classification set. */
function recordedIdentityEntries(items: readonly AnalysisClassificationCorrection[]): (AnalysisClassificationCorrection & { field: AnalysisIdentityClassificationField })[] {
  return items.filter((item): item is AnalysisClassificationCorrection & { field: AnalysisIdentityClassificationField } => (analysisIdentityClassificationFields as readonly string[]).includes(item.field));
}

/** One line per combination: track · layout — class · car. */
function recordedCombinationLabel(item: Pick<AnalysisCombination, "trackName" | "trackLayout" | "carName" | "carClass">): string {
  const track = item.trackLayout && item.trackLayout !== item.trackName ? `${item.trackName} · ${item.trackLayout}` : item.trackName;
  return `${track} — ${item.carClass} · ${item.carName}`;
}

/** The proposed tuple overlays the active identity replacements on the
 * session's original; absent when the active set is semantically the stored
 * one, exactly like a per-field proposal cell. */
function proposedIdentityCombination(original: AnalysisCombination | undefined, active: readonly (AnalysisClassificationCorrection & { field: AnalysisIdentityClassificationField })[], saved: readonly (AnalysisClassificationCorrection & { field: AnalysisIdentityClassificationField })[]): AnalysisCombination | undefined {
  if (!original || sameAnalysisClassificationCorrections(active, saved)) return undefined;
  const next = { id: original.id, simId: original.simId, trackName: original.trackName, trackLayout: original.trackLayout, carName: original.carName, carClass: original.carClass };
  for (const item of active) next[analysisIdentityCombinationKey[item.field]] = item.replacement;
  return next;
}

/** Pending proposal for one field: a differing active decision, or the raw
 * original when a saved decision was withdrawn. Absent when active and saved
 * are semantically identical. */
function pendingReplacement(original: string, active: AnalysisClassificationCorrection | undefined, savedRequest: AnalysisClassificationCorrection | undefined): string | undefined {
  if (active && (!savedRequest || !sameAnalysisClassificationCorrections([active], [savedRequest]))) {
    return active.replacement;
  }
  if (!active && savedRequest) {
    return original;
  }
  return undefined;
}

export function RecordedClassificationList({ session, current, proposals, selected, selectedIdentity, locked, onSelect, onSelectIdentity, t }: {
  readonly session: RecordedSession; readonly current: AnalysisStoreResult; readonly proposals: readonly AnalysisClassificationCorrection[];
  readonly selected?: AnalysisClassificationField; readonly selectedIdentity?: boolean; readonly locked: boolean;
  readonly onSelect: (field: AnalysisClassificationField) => void; readonly onSelectIdentity?: () => void; readonly t: Translate;
}) {
  const original = session.combination;
  const savedTarget = current.revision.snapshot.canonicalCombination;
  const proposed = proposedIdentityCombination(original, recordedIdentityEntries(proposals), recordedIdentityEntries((current.revision.snapshot.classifications ?? []).map(item => item.request)));
  return <>
    <p className="strategy-recorded-data__muted">{t("strategy.classification.chooseField")}</p>
    <div className="strategy-recorded-data__table"><table><thead><tr><th>{t("strategy.classification.tab")}</th><th>{t("strategy.data.original")}</th><th>{t("strategy.laps.saved")}</th><th>{t("strategy.laps.proposal")}</th></tr></thead><tbody>{analysisLegacyClassificationFields.map(field => {
      let original: string | undefined;
      try {
        original = recordedClassificationOriginal(session, current, field);
      }
      catch {
        original = undefined;
      }
      if (original === undefined) {
        return <tr key={field}><td>{t(`strategy.classification.field.${field}`)}</td><td colSpan={3}>{t("strategy.classification.unavailable")}</td></tr>;
      }
      const saved = savedDecision(current, field);
      const active = proposals.find(item => item.field === field);
      const pending = pendingReplacement(original, active, saved?.request);
      return <tr key={field} aria-selected={selected === field}>
        <td><button type="button" disabled={locked} onClick={() => onSelect(field)}>{t(`strategy.classification.field.${field}`)}</button></td>
        <td>{original}</td>
        <td>{saved ? saved.corrected : original}</td>
        <td>{pending !== undefined ? pending : t("strategy.data.unchanged")}</td>
      </tr>;
    })}
      {original || savedTarget ? <tr aria-selected={selectedIdentity === true}>
        <td>{original && onSelectIdentity ? <button type="button" disabled={locked} onClick={onSelectIdentity}>{t("strategy.journey.step.combination")}</button> : t("strategy.journey.step.combination")}</td>
        <td>{original ? recordedCombinationLabel(original) : t("strategy.classification.unavailable")}</td>
        <td>{savedTarget ? recordedCombinationLabel(savedTarget) : original ? recordedCombinationLabel(original) : t("strategy.classification.unavailable")}</td>
        <td>{proposed ? recordedCombinationLabel(proposed) : t("strategy.data.unchanged")}</td>
      </tr> : null}
    </tbody></table></div>
  </>;
}

export type RecordedClassificationForm = Readonly<{ field: AnalysisClassificationField; choice: "correct" | "original"; value: string; reason: string; original: string }>;

export function RecordedClassificationDetail({ form, dirty, locked, onChange, onApply, onCancel, t }: {
  readonly form: RecordedClassificationForm; readonly dirty: boolean; readonly locked: boolean;
  readonly onChange: (form: RecordedClassificationForm) => void; readonly onApply: () => void; readonly onCancel: () => void; readonly t: Translate;
}) {
  const selected = form.field === "SessionType" ? analysisCanonicalSessionType(form.value || form.original) : form.value;
  return <form onSubmit={event => { event.preventDefault(); onApply(); }}>
    <strong>{t(`strategy.classification.field.${form.field}`)}</strong>
    <label>{t("strategy.data.originalReadOnly")}<output>{form.original}</output></label>
    <label>{t("strategy.laps.proposal")}<select value={form.choice} disabled={locked} onChange={event => onChange({ ...form, choice: event.target.value as RecordedClassificationForm["choice"] })}><option value="correct">{t("strategy.classification.correctValue")}</option><option value="original">{t("strategy.classification.restoreOriginal")}</option></select></label>
    {form.field === "SessionType" ? <label>{t("strategy.data.correctedValue")}<select value={selected} disabled={locked || form.choice !== "correct"} onChange={event => onChange({ ...form, value: event.target.value })}>{analysisSessionTypes.map(token => <option key={token} value={token}>{t(`strategy.classification.type.${token}`)}</option>)}</select></label>
      : <><label>{t("strategy.data.correctedValue")}<input value={form.value} disabled={locked || form.choice !== "correct"} onChange={event => onChange({ ...form, value: event.target.value })} /></label>
        <p className="strategy-recorded-data__muted">{t("strategy.classification.weatherHint")}</p></>}
    <label>{t("strategy.data.reason")}<textarea value={form.reason} maxLength={1024} disabled={locked} onChange={event => onChange({ ...form, reason: event.target.value })} /></label>
    <div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button><Button variant="primary" type="submit" disabled={locked || !dirty || !form.reason.trim()}>{t("strategy.data.apply")}</Button></div>
  </form>;
}

export type RecordedIdentityForm = Readonly<{ choice: "correct" | "original"; targetId: string; reason: string }>;

/** Identity form: one whole combination per decision. The original is always
 * a coherent restore; destinations come only from the authoritative catalog —
 * a stored target absent from it stays readable but cannot be re-selected. */
export function RecordedIdentityDetail({ form, original, saved, catalog, dirty, locked, onChange, onApply, onCancel, t }: {
  readonly form: RecordedIdentityForm; readonly original: AnalysisCombination; readonly saved?: AnalysisCombination;
  readonly catalog: readonly RecordedCombination[]; readonly dirty: boolean; readonly locked: boolean;
  readonly onChange: (form: RecordedIdentityForm) => void; readonly onApply: () => void; readonly onCancel: () => void; readonly t: Translate;
}) {
  const historical = saved !== undefined && saved.id !== original.id && !catalog.some(item => item.combinationId === saved.id);
  return <form onSubmit={event => { event.preventDefault(); onApply(); }}>
    <strong>{t("strategy.journey.step.combination")}</strong>
    <label>{t("strategy.data.originalReadOnly")}<output>{recordedCombinationLabel(original)}</output></label>
    {historical ? <p className="strategy-recorded-data__muted">{t("strategy.laps.saved")}: {recordedCombinationLabel(saved)}</p> : null}
    <label>{t("strategy.laps.proposal")}<select value={form.choice} disabled={locked} onChange={event => onChange({ ...form, choice: event.target.value as RecordedIdentityForm["choice"] })}><option value="correct">{t("strategy.classification.correctValue")}</option><option value="original">{t("strategy.classification.restoreOriginal")}</option></select></label>
    {form.choice === "correct" ? <label>{t("strategy.journey.step.combination")}<select value={form.targetId} disabled={locked || catalog.length === 0} onChange={event => onChange({ ...form, targetId: event.target.value })}>
      <option value="">{t("strategy.journey.choose")}</option>
      {catalog.map(item => <option key={item.combinationId} value={item.combinationId}>{recordedCombinationLabel(item)}</option>)}
    </select></label> : null}
    {catalog.length === 0 ? <p role="status" className="strategy-recorded-data__muted">{t("strategy.journey.catalog.empty")}</p> : null}
    <label>{t("strategy.data.reason")}<textarea value={form.reason} maxLength={1024} disabled={locked} onChange={event => onChange({ ...form, reason: event.target.value })} /></label>
    <div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button><Button variant="primary" type="submit" disabled={locked || !dirty || !form.reason.trim() || (form.choice === "correct" && !form.targetId)}>{t("strategy.data.apply")}</Button></div>
  </form>;
}
