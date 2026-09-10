import { analysisCanonicalSessionType, analysisClassificationFields, analysisSessionTypes, sameAnalysisClassificationCorrections, type AnalysisClassificationCorrection, type AnalysisClassificationField, type AnalysisStoreResult } from "../../strategy/analysis-contract";
import { Button } from "../../ui/orbit";
import type { RecordedSession } from "./strategy-recorded-session";
import { recordedClassificationOriginal } from "./strategy-recorded-corrections";

type Translate = (key: string) => string;

function savedDecision(current: AnalysisStoreResult, field: AnalysisClassificationField) {
  return current.revision.snapshot.classifications?.find(item => item.request.field === field);
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

export function RecordedClassificationList({ session, current, proposals, selected, locked, onSelect, t }: {
  readonly session: RecordedSession; readonly current: AnalysisStoreResult; readonly proposals: readonly AnalysisClassificationCorrection[];
  readonly selected?: AnalysisClassificationField; readonly locked: boolean; readonly onSelect: (field: AnalysisClassificationField) => void; readonly t: Translate;
}) {
  return <>
    <p className="strategy-recorded-data__muted">{t("strategy.classification.chooseField")}</p>
    <div className="strategy-recorded-data__table"><table><thead><tr><th>{t("strategy.classification.tab")}</th><th>{t("strategy.data.original")}</th><th>{t("strategy.laps.saved")}</th><th>{t("strategy.laps.proposal")}</th></tr></thead><tbody>{analysisClassificationFields.map(field => {
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
    })}</tbody></table></div>
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
