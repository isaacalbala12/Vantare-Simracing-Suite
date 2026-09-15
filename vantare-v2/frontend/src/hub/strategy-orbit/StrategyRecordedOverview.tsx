import { Icon, type IconName } from "../../ui/orbit/Icon";
import { formatMessage } from "../orbit/format-message";
import type { RecordedWizardDraft, RecordedWizardStep } from "./strategy-recorded-wizard";
import "./strategy-recorded-overview.css";

/** Configuration summary only; selected sources are not evidence of a calculated plan. */
export function StrategyRecordedOverview({ draft, dirty, busy, error, onEdit, onSources, onSave, t }: {
  readonly draft: RecordedWizardDraft; readonly dirty: boolean; readonly busy: boolean; readonly error?: string;
  readonly onEdit: (step: RecordedWizardStep) => void; readonly onSources: () => void;
  readonly onSave: () => void; readonly t: (key: string) => string;
}) {
  const pending = t("strategy.workspace.pending");
  const race = draft.race.format === "timed"
    ? draft.race.durationMin === undefined ? pending : formatMessage(t("strategy.workspace.minutes"), { value: draft.race.durationMin })
    : draft.race.laps === undefined ? pending : formatMessage(t("strategy.workspace.laps"), { value: draft.race.laps });
  const rows: { step: RecordedWizardStep; icon: IconName; title: string; value: string; detail: string }[] = [
    { step: "combination", icon: "i-carreras", title: t("strategy.workspace.event"), value: draft.calendar?.series.name ?? t("strategy.workspace.custom"), detail: [draft.combination?.trackName, draft.combination?.trackLayout].filter(Boolean).join(" · ") || pending },
    { step: "rules", icon: "i-ajustes", title: t("strategy.journey.step.rules"), value: race, detail: draft.tankLiters === undefined ? pending : formatMessage(t("strategy.workspace.capacity"), { value: draft.tankLiters }) },
    { step: "drivers", icon: "i-cuenta", title: t("strategy.journey.step.drivers"), value: draft.drivers.map(driver => driver.name).join(" · ") || pending, detail: t("strategy.journey.driver.pacePending") },
  ];
  return <section className="strategy-recorded-overview" aria-labelledby="recorded-overview-title">
    <header className="strategy-recorded-overview__heading">
      <h2 id="recorded-overview-title">{formatMessage(t("strategy.workspace.title"), { name: draft.name || draft.combination?.trackName || pending })}</h2>
      <p>{t("strategy.workspace.description")}</p>
    </header>
    <div className="strategy-recorded-overview__grid">
      <div className="strategy-recorded-overview__configuration">
        <div className="strategy-recorded-overview__rows">{rows.map(row => <article key={row.step}>
          <Icon name={row.icon} size={24} /><span>{row.title}</span>
          <div><strong>{row.value}</strong><small>{row.detail}</small></div>
          <button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} aria-label={`${t("strategy.workspace.edit")} ${row.title}`} onClick={() => onEdit(row.step)}>{t("strategy.workspace.edit")}</button>
        </article>)}</div>
        <section className="strategy-recorded-overview__sources" aria-label={t("strategy.workspace.sources")}>
          <h3>{t("strategy.workspace.sources")}</h3>
          <div className="strategy-recorded-overview__source-row"><Icon name="i-telemetria" size={32} />
            <div><strong>{draft.sessions.length === 0 ? t("strategy.workspace.noSources") : formatMessage(t(draft.sessions.length === 1 ? "strategy.workspace.selectedSource" : "strategy.workspace.selectedSources"), { count: draft.sessions.length })}</strong><p>{t("strategy.workspace.sourceStatus")}</p></div>
            <button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onSources}>{t("strategy.workspace.review")}</button>
          </div>
          <div className="strategy-recorded-overview__observations"><h3>{t("strategy.workspace.observations")}</h3><strong>{t("strategy.workspace.validationPending")}</strong><p>{t("strategy.workspace.validationHint")}</p></div>
        </section>
      </div>
      <section className="strategy-recorded-overview__plan" aria-label={t("strategy.workspace.plan")}>
        <h3><Icon name="i-estrategia" size={25} />{t("strategy.workspace.plan")}</h3>
        <div><div><strong>{t("strategy.workspace.notCalculated")}</strong><p>{t("strategy.workspace.calculateHint")}</p></div><button type="button" className="orbit-btn orbit-btn--primary" disabled>{t("strategy.workspace.calculate")}</button></div>
      </section>
    </div>
    {error ? <p role="alert" className="strategy-recorded-wizard__errors">{error}</p> : null}
    <footer className="strategy-recorded-overview__footer"><span>{t("strategy.recorded.originals")}</span>
      <p role="status">{t(busy ? "strategy.workspace.saving" : dirty ? "strategy.workspace.unsaved" : "strategy.workspace.saved")}</p>
      <button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={() => onEdit("start")}>{t("strategy.workspace.preparation")}</button>
      <button type="button" className="orbit-btn orbit-btn--primary" disabled={busy || !dirty} onClick={onSave}>{t("strategy.workspace.save")}</button>
    </footer>
  </section>;
}
