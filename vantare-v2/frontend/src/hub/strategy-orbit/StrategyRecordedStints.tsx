import { analysisLapInstant, type AnalysisStintBoundary, type AnalysisStintBoundaryAnchor, type AnalysisStintBoundaryCorrection } from "../../strategy/analysis-contract";
import { Button } from "../../ui/orbit";

type Translate = (key: string) => string;
export type RecordedStintForm = Readonly<{
  boundary: AnalysisStintBoundary;
  choice: "move" | "remove" | "original";
  anchorTimestamp: string;
  cause: AnalysisStintBoundary["cause"];
  reason: string;
}>;

function targetMatches(boundary: AnalysisStintBoundary, correction: AnalysisStintBoundaryCorrection): boolean {
  return boundary.stintNumber === correction.target.stintNumber && boundary.cause === correction.target.cause
    && analysisLapInstant(boundary.timestamp) === analysisLapInstant(correction.target.timestamp);
}

/** Source timestamps can be session-relative instants encoded from Unix zero.
 * Show their recorded clock without inventing a civil date or local timezone. */
function recordedStintTime(timestamp: string): string {
  return timestamp.slice(timestamp.indexOf("T") + 1);
}

export function RecordedStintList({ boundaries, proposals, selected, locked, onSelect, t }: {
  readonly boundaries: readonly AnalysisStintBoundary[];
  readonly proposals: readonly AnalysisStintBoundaryCorrection[];
  readonly selected?: AnalysisStintBoundary;
  readonly locked: boolean;
  readonly onSelect: (boundary: AnalysisStintBoundary, proposal?: AnalysisStintBoundaryCorrection) => void;
  readonly t: Translate;
}) {
  if (boundaries.length === 0) return <div className="strategy-recorded-data__empty"><strong>{t("strategy.stints.emptyTitle")}</strong><p>{t("strategy.stints.emptyHint")}</p></div>;
  return <><p className="strategy-recorded-data__muted">{t("strategy.stints.boundaryHint")}</p><div className="strategy-recorded-data__table"><table><thead><tr><th>{t("strategy.stints.boundary")}</th><th>{t("strategy.stints.original")}</th><th>{t("strategy.stints.proposal")}</th></tr></thead><tbody>{boundaries.map(boundary => {
    const proposal = proposals.find(item => targetMatches(boundary, item));
    const proposalLabel = proposal?.operation === "remove_stint_boundary" ? t("strategy.stints.remove") : proposal?.replacement ? `${t("strategy.stints.lap")} ${proposal.replacement.anchor.lapNumber} · ${t(`strategy.stints.cause.${proposal.replacement.cause}`)}` : t("strategy.stints.automatic");
    return <tr key={`${boundary.stintNumber}:${boundary.timestamp}:${boundary.cause}`} aria-selected={selected === boundary}><td><button type="button" disabled={locked} onClick={() => onSelect(boundary, proposal)}>{t("strategy.stints.stint")} {boundary.stintNumber}</button></td><td><time dateTime={boundary.timestamp}>{recordedStintTime(boundary.timestamp)}</time> · {t(`strategy.stints.cause.${boundary.cause}`)}</td><td>{proposalLabel}</td></tr>;
  })}</tbody></table></div></>;
}

export function RecordedStintDetail({ form, anchors, hasProposal, dirty, locked, onChange, onApply, onCancel, t }: {
  readonly form: RecordedStintForm;
  readonly anchors: readonly AnalysisStintBoundaryAnchor[];
  readonly hasProposal: boolean;
  readonly dirty: boolean;
  readonly locked: boolean;
  readonly onChange: (form: RecordedStintForm) => void;
  readonly onApply: () => void;
  readonly onCancel: () => void;
  readonly t: Translate;
}) {
  const valid = form.choice === "original" ? hasProposal : form.choice === "remove" || anchors.some(anchor => anchor.timestamp === form.anchorTimestamp);
  return <form onSubmit={event => { event.preventDefault(); onApply(); }}>
    <strong>{t("strategy.stints.stint")} {form.boundary.stintNumber}</strong>
    <p className="strategy-recorded-data__muted"><time dateTime={form.boundary.timestamp}>{recordedStintTime(form.boundary.timestamp)}</time> · {t(`strategy.stints.cause.${form.boundary.cause}`)}</p>
    <label>{t("strategy.stints.action")}<select value={form.choice} disabled={locked} onChange={event => onChange({ ...form, choice: event.target.value as RecordedStintForm["choice"] })}><option value="move">{t("strategy.stints.move")}</option><option value="remove">{t("strategy.stints.remove")}</option><option value="original" disabled={!hasProposal}>{t("strategy.stints.automatic")}</option></select></label>
    {form.choice === "move" ? <><label>{t("strategy.stints.anchor")}<select value={form.anchorTimestamp} disabled={locked} onChange={event => onChange({ ...form, anchorTimestamp: event.target.value })}><option value="">{t("strategy.journey.choose")}</option>{anchors.map(anchor => <option key={`${anchor.lapNumber}:${anchor.timestamp}`} value={anchor.timestamp}>{t("strategy.stints.lap")} {anchor.lapNumber}</option>)}</select></label><label>{t("strategy.stints.cause")}<select value={form.cause} disabled={locked} onChange={event => onChange({ ...form, cause: event.target.value as AnalysisStintBoundary["cause"] })}>{["pit", "fuel_jump", "tyre_change", "driver_change", "unknown"].map(cause => <option key={cause} value={cause}>{t(`strategy.stints.cause.${cause}`)}</option>)}</select></label></> : null}
    <label>{t("strategy.data.reason")}<textarea value={form.reason} maxLength={1024} disabled={locked} onChange={event => onChange({ ...form, reason: event.target.value })} /></label>
    <p className="strategy-recorded-data__muted">{t("strategy.stints.pitIndependent")}</p>
    <div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button><Button type="submit" disabled={locked || !dirty || !valid || !form.reason.trim()}>{t("strategy.data.apply")}</Button></div>
  </form>;
}
