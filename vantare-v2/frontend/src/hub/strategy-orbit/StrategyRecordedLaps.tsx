import { Fragment } from "react";
import { analysisCorrectableFamilies, analysisLapInstant, type AnalysisCorrectableFamily, type AnalysisFamilyCorrection, type AnalysisLapInspection, type AnalysisLapPage } from "../../strategy/analysis-contract";
import { Button } from "../../ui/orbit";

type Translate = (key: string) => string;
export type RecordedFamilyForm = Readonly<{ row: AnalysisLapInspection; family: AnalysisCorrectableFamily; choice: "automatic" | "include" | "exclude"; reason: string }>;
function lapFamilyProposal(row: AnalysisLapInspection, family: AnalysisCorrectableFamily, proposals: readonly AnalysisFamilyCorrection[]) {
  const target = row.target;
  return target ? proposals.find(item => item.family === family && item.target.number === target.number && analysisLapInstant(item.target.start) === analysisLapInstant(target.start) && analysisLapInstant(item.target.end) === analysisLapInstant(target.end)) : undefined;
}
function familyUsageLabel(value: boolean | undefined, t: Translate) { return t(value === undefined ? "strategy.laps.unresolved" : value ? "strategy.laps.included" : "strategy.laps.excluded"); }
export function RecordedLapList({ page, family, proposals, selected, locked, onFamily, onSelect, onPage, t }: {
  readonly page?: AnalysisLapPage; readonly family: AnalysisCorrectableFamily; readonly proposals: readonly AnalysisFamilyCorrection[];
  readonly selected?: AnalysisLapInspection; readonly locked: boolean; readonly onFamily: (family: AnalysisCorrectableFamily) => void;
  readonly onSelect: (row: AnalysisLapInspection, proposal: AnalysisFamilyCorrection | undefined) => void; readonly onPage: (start: number) => void; readonly t: Translate;
}) {
  return <>
    <div className="strategy-recorded-laps__families" aria-label={t("strategy.laps.families")}>{analysisCorrectableFamilies.map(item => <button key={item} type="button" aria-pressed={family === item} disabled={locked} onClick={() => onFamily(item)}>{t(`strategy.laps.family.${item}`)}</button>)}</div>
    {!page ? <div className="strategy-recorded-data__empty"><strong>{t("strategy.laps.loadTitle")}</strong><p>{t("strategy.laps.loadHint")}</p><Button disabled={locked} onClick={() => onPage(0)}>{t("strategy.laps.load")}</Button></div> : <>
      <p className="strategy-recorded-data__muted">{t("strategy.laps.rulesHint")}</p>
      <div className="strategy-recorded-data__table strategy-recorded-laps__table"><table><thead><tr><th>{t("strategy.laps.lap")}</th><th>{t("strategy.laps.time")}</th><th>{t("strategy.laps.automatic")}</th><th>{t("strategy.laps.saved")}</th><th>{t("strategy.laps.proposal")}</th></tr></thead><tbody>{page.page.laps.map((row, index) => {
        const cap = row.capabilities.find(item => item.family === family), proposal = lapFamilyProposal(row, family, proposals);
        const previous = page.page.laps[index - 1]?.stintBoundary;
        const boundary = row.stintBoundary;
        const newStint = index === 0 || boundary?.timestamp !== previous?.timestamp || boundary?.stintNumber !== previous?.stintNumber;
        return <Fragment key={`${page.page.start + index}`}>
          {newStint ? <tr className="strategy-recorded-laps__stint"><td colSpan={5}>{boundary ? <>{t("strategy.laps.stint")} {boundary.stintNumber} · {t(`strategy.laps.boundary.${boundary.presence}`)}</> : t("strategy.laps.noBoundary")}</td></tr> : null}
          <tr aria-selected={selected === row}><td><button type="button" disabled={locked} onClick={() => onSelect(row, proposal)}>{t("strategy.laps.lap")} {row.original.number}</button>{!row.original.complete ? <small>{t("strategy.laps.incomplete")}</small> : null}</td>
            <td>{row.original.lapTimeSeconds === undefined ? t("strategy.data.absent") : `${row.original.lapTimeSeconds.toFixed(3)} s`}</td><td>{familyUsageLabel(cap?.automaticIncluded, t)}</td><td>{familyUsageLabel(cap?.effectiveIncluded, t)}</td><td>{proposal ? familyUsageLabel(proposal.included, t) : t("strategy.laps.automatic")}</td></tr>
        </Fragment>;
      })}</tbody></table></div>
      {page.page.laps.length === 0 ? <p role="status">{t("strategy.laps.empty")}</p> : null}
      <div className="strategy-recorded-data__pages"><Button size="sm" variant="ghost" disabled={locked || page.page.start === 0} onClick={() => onPage(Math.max(0, page.page.start - 25))}>{t("strategy.recorded.previous")}</Button><span>{page.page.start + (page.page.laps.length ? 1 : 0)}–{page.page.start + page.page.laps.length} / {page.page.total}</span><Button size="sm" variant="ghost" disabled={locked || page.page.start + page.page.laps.length >= page.page.total} onClick={() => onPage(page.page.start + 25)}>{t("strategy.recorded.next")}</Button></div>
    </>}
  </>;
}

export function RecordedLapDetail({ form, dirty, locked, onChange, onApply, onCancel, t }: {
  readonly form: RecordedFamilyForm; readonly dirty: boolean; readonly locked: boolean;
  readonly onChange: (form: RecordedFamilyForm) => void; readonly onApply: () => void; readonly onCancel: () => void; readonly t: Translate;
}) {
  const cap = form.row.capabilities.find(item => item.family === form.family);
  const original = form.row.original.familyUse?.find(item => item.family === form.family);
  const reasons = [...new Set([...(form.row.original.labels ?? []), ...(original?.exclusionReasons ?? [])])];
  const allowed = Boolean(form.row.target && (form.choice === "automatic" || (form.choice === "include" ? cap?.canInclude : cap?.canExclude)));
  return <form onSubmit={event => { event.preventDefault(); onApply(); }}>
    <strong>{t("strategy.laps.lap")} {form.row.original.number} · {t(`strategy.laps.family.${form.family}`)}</strong>
    <p className="strategy-recorded-data__muted">{form.row.original.start ? <time dateTime={form.row.original.start}>{new Date(form.row.original.start).toLocaleString()}</time> : t("strategy.data.absent")} → <time dateTime={form.row.original.end}>{new Date(form.row.original.end).toLocaleString()}</time></p>
    <div className="strategy-recorded-laps__summary"><label>{t("strategy.laps.automatic")}<output>{familyUsageLabel(cap?.automaticIncluded, t)}</output></label><label>{t("strategy.laps.saved")}<output>{familyUsageLabel(cap?.effectiveIncluded, t)}</output></label></div>
    {reasons.length ? <ul className="strategy-recorded-data__muted">{reasons.map(reason => <li key={reason}>{t(`strategy.laps.reason.${reason}`)}</li>)}</ul> : null}
    {cap?.reason ? <p className="strategy-recorded-data__muted">{t(`strategy.laps.reason.${cap.reason}`)}</p> : null}
    {!form.row.target ? <p role="status">{t("strategy.laps.reason.target_unresolved")}</p> : null}
    <label>{t("strategy.laps.proposal")}<select value={form.choice} disabled={locked || !form.row.target} onChange={event => onChange({ ...form, choice: event.target.value as RecordedFamilyForm["choice"] })}><option value="automatic">{t("strategy.laps.automatic")}</option><option value="include" disabled={!cap?.canInclude}>{t("strategy.laps.include")}</option><option value="exclude" disabled={!cap?.canExclude}>{t("strategy.laps.exclude")}</option></select></label>
    <label>{t("strategy.data.reason")}<textarea value={form.reason} maxLength={1024} disabled={locked || !form.row.target} onChange={event => onChange({ ...form, reason: event.target.value })} /></label>
    <p className="strategy-recorded-data__muted">{t("strategy.laps.pendingHint")}</p>
    <div className="strategy-recorded-data__actions"><Button variant="ghost" disabled={locked} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button><Button type="submit" disabled={locked || !dirty || !allowed || !form.reason.trim()}>{t("strategy.data.apply")}</Button></div>
  </form>;
}
