import { Icon, type IconName } from "../../ui/orbit/Icon";
import { formatMessage } from "../orbit/format-message";
import { StrategyRecordedCircuit } from "./StrategyRecordedCircuit";
import type { RecordedSession } from "./strategy-recorded-session";
import type { RecordedWizardDraft, RecordedWizardStep } from "./strategy-recorded-wizard";
import type { RecordedCalculationState } from "./use-recorded-calculation";
import { currentRecordedPlan } from "./strategy-recorded-result";
import "./strategy-recorded-overview.css";

/** The same verified context remains visible while switching editor tabs. */
export function StrategyRecordedRaceContext({ draft, manualOnly, sessions, sessionLabels, busy, onSources, onManualReferences, t }: {
  readonly draft: RecordedWizardDraft; readonly sessions: readonly RecordedSession[];
  readonly manualOnly: boolean;
  readonly sessionLabels: Readonly<Record<string, string>>; readonly busy: boolean;
  readonly onSources: () => void; readonly onManualReferences: () => void; readonly t: (key: string) => string;
}) {
  const pending = t("strategy.workspace.pending");
  const selected = draft.sessions[0];
  const opened = selected && sessions.find(item => item.revision.sessionId === selected.sessionId && item.revision.baseDigest === selected.baseDigest);
  const sourceName = opened ? sessionLabels[opened.candidateId] : undefined;
  const trackDetail = draft.combination?.trackLayout && draft.combination.trackLayout !== draft.combination.trackName
    ? draft.combination.trackLayout : draft.combination?.simId.toUpperCase() || pending;
  return <aside className="strategy-recorded-editor-context" aria-label={t("strategy.entry.circuitAndSource")}>
    <header><h3>{t("strategy.entry.circuitAndSource")}</h3><Icon name="i-carreras" size={16} /></header>
    <div className="strategy-recorded-overview__context-body"><span>{t("strategy.journey.track")}</span><strong>{draft.combination?.trackName || pending}</strong><small>{trackDetail}</small><StrategyRecordedCircuit combination={draft.combination} t={t} /></div>
    <div className="strategy-recorded-overview__context-body"><span>{t("strategy.journey.car")}</span><strong>{draft.combination?.carName || pending}</strong><small>{draft.combination?.carClass || pending}</small></div>
    <div className="strategy-recorded-overview__context-body"><span>{t(manualOnly ? "strategy.workspace.manualReferences" : "strategy.workspace.sources")}</span><strong>{manualOnly ? t("strategy.workspace.manualEstimate") : sourceName || (draft.sessions.length ? t("strategy.entry.referenceOpenSources") : t("strategy.workspace.noSources"))}</strong><small>{!manualOnly && draft.sessions.length > 1 ? formatMessage(t("strategy.workspace.selectedSources"), { count: draft.sessions.length }) : null}</small><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={manualOnly ? onManualReferences : onSources}>{t("strategy.workspace.review")}</button></div>
  </aside>;
}

/** Compact race desk. Plan navigation uses the calculation already owned by Workflow. */
export function StrategyRecordedOverview({ draft, calculation, dirty, busy, error, onEdit, onPlan, onSave, t }: {
  readonly draft: RecordedWizardDraft; readonly calculation: RecordedCalculationState;
  readonly dirty: boolean; readonly busy: boolean; readonly error?: string;
  readonly onEdit: (step: RecordedWizardStep) => void; readonly onPlan: () => void;
  readonly onSave: () => void; readonly t: (key: string) => string;
}) {
  const pending = t("strategy.workspace.pending");
  const race = draft.race.format === "timed"
    ? draft.race.durationMin === undefined ? pending : formatMessage(t("strategy.workspace.minutes"), { value: draft.race.durationMin })
    : draft.race.laps === undefined ? pending : formatMessage(t("strategy.workspace.laps"), { value: draft.race.laps });
  const rows: { step: RecordedWizardStep; icon: IconName; title: string; value: string; detail: string }[] = [
    { step: "combination", icon: "i-carreras", title: t("strategy.workspace.event"), value: draft.calendar?.series.name || draft.name || pending, detail: draft.calendar ? draft.name && draft.name !== draft.calendar.series.name ? draft.name : t("strategy.journey.calendar") : t("strategy.workspace.custom") },
    { step: "rules", icon: "i-ajustes", title: t("strategy.journey.step.rules"), value: race, detail: draft.tankLiters === undefined ? pending : formatMessage(t("strategy.workspace.capacity"), { value: draft.tankLiters }) },
    { step: "drivers", icon: "i-cuenta", title: t("strategy.journey.step.drivers"), value: draft.drivers.map(driver => driver.name).filter(Boolean).join(" · ") || pending, detail: draft.drivers.length ? "" : t(draft.mode === "manual" ? "strategy.journey.driver.manualPace" : "strategy.journey.driver.pacePending") },
  ];
  const planStatus = calculation.status === "success" ? currentRecordedPlan(calculation) ? "strategy.calculation.ready" : "strategy.calculation.missing"
    : calculation.status === "partial" ? "strategy.calculation.partial"
      : calculation.status === "error" ? "strategy.calculation.error"
        : calculation.status === "cancelled" ? "strategy.calculation.cancelled"
          : calculation.status === "idle" ? "strategy.workspace.notCalculated" : "strategy.calculation.loading";
  const planHint = calculation.status === "partial" ? "strategy.calculation.partialHint"
    : calculation.status === "error" ? "strategy.calculation.errorHint"
      : calculation.status === "idle" ? "strategy.workspace.calculateHint" : "strategy.entry.openPlanHint";
  return <section className="strategy-recorded-overview" aria-labelledby="recorded-overview-title">
    <div className="strategy-recorded-overview__work">
      <header className="strategy-recorded-overview__heading"><span>{t("strategy.data.tab.race")}</span><h2 id="recorded-overview-title">{draft.name || t("strategy.entry.yourRace")}</h2><p>{t("strategy.workspace.description")}</p></header>
      <div className="strategy-recorded-overview__rows">{rows.map(row => <article key={row.step}>
        <Icon name={row.icon} size={19} /><div><span>{row.title}</span><strong>{row.value}</strong><small>{row.detail}</small></div>
        <button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} aria-label={`${t("strategy.workspace.edit")} ${row.title}`} onClick={() => onEdit(row.step)}>{t("strategy.workspace.edit")}</button>
      </article>)}</div>
    </div>
    <aside className="strategy-recorded-overview__plan" aria-label={t("strategy.workspace.plan")}>
      <header><Icon name="i-estrategia" size={20} /><h3>{t("strategy.workspace.plan")}</h3></header>
      <div><span>{t("strategy.entry.planStatus")}</span><strong>{t(planStatus)}</strong><p>{t(planHint)}</p></div>
      <button type="button" className="orbit-btn orbit-btn--primary" onClick={onPlan}>{t("strategy.entry.openPlan")}</button>
    </aside>
    {error ? <p role="alert" className="strategy-recorded-overview__error">{error}</p> : null}
    <footer className="strategy-recorded-overview__footer"><span>{t("strategy.recorded.originals")}</span>
      <p role="status">{t(busy ? "strategy.workspace.saving" : dirty ? "strategy.workspace.unsaved" : "strategy.workspace.saved")}</p>
      <button type="button" className="orbit-btn orbit-btn--primary" disabled={busy || !dirty} onClick={onSave}>{t("strategy.workspace.save")}</button>
    </footer>
  </section>;
}
