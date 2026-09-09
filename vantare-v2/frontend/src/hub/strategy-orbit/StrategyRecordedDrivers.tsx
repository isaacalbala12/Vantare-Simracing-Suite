import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import "./strategy-recorded-drivers.css";

export function StrategyRecordedDrivers({ drivers, onChange, onAdd, t }: {
  readonly drivers: RecordedWizardDraft["drivers"];
  readonly onChange: (drivers: RecordedWizardDraft["drivers"]) => void;
  readonly onAdd: () => void;
  readonly t: (key: string) => string;
}) {
  const principal = drivers[0];
  const update = (id: string, patch: Partial<RecordedWizardDraft["drivers"][number]>) => onChange(drivers.map(driver => driver.id === id ? { ...driver, ...patch } : driver));
  return <div className="strategy-recorded-drivers">
    {drivers.length === 0 ? <section className="strategy-recorded-drivers__card"><h3>{t("strategy.journey.driver.primary")}</h3><p role="status">{t("strategy.journey.driver.empty")}</p></section> : null}
    {drivers.map((driver, index) => <section key={driver.id} className="strategy-recorded-drivers__card" aria-label={`${t("strategy.journey.driver.label")} ${index + 1}`}>
      <header><span className="strategy-recorded-frame__eyebrow">{t(index === 0 ? "strategy.journey.driver.primary" : "strategy.journey.driver.relay")} {index > 0 ? index : ""}</span>
        <button type="button" className="orbit-btn orbit-btn--ghost" aria-label={`${t("strategy.journey.driver.remove")} ${driver.name || index + 1}`} onClick={() => onChange(drivers.filter(item => item.id !== driver.id).map(item => item.referenceDriverId === driver.id ? { ...item, referenceDriverId: undefined, paceDeltaSeconds: undefined } : item))}>{t("strategy.journey.driver.remove")}</button>
      </header>
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.name")}</span><input value={driver.name} maxLength={120} placeholder={t("strategy.journey.unconfirmed")} onChange={event => update(driver.id, { name: event.target.value })} /></label>
      {index > 0 && principal ? <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.paceSource")}</span><select value={driver.referenceDriverId ?? ""} onChange={event => update(driver.id, event.target.value ? { referenceDriverId: event.target.value, paceDeltaSeconds: 0 } : { referenceDriverId: undefined, paceDeltaSeconds: undefined })}>
        <option value="">{t("strategy.journey.driver.ownSessions")}</option>
        <option value={principal.id}>{t("strategy.journey.driver.estimateFrom")} {principal.name || t("strategy.journey.driver.primary")}</option>
      </select></label> : null}
      {driver.referenceDriverId ? <div className="strategy-recorded-drivers__estimate">
        <strong>{t("strategy.journey.driver.estimated")}</strong>
        <p>{t("strategy.journey.driver.estimateNotice")}</p>
        <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.delta")}</span><input type="number" step="any" value={driver.paceDeltaSeconds ?? ""} placeholder={t("strategy.journey.unconfirmed")} onChange={event => update(driver.id, { paceDeltaSeconds: event.target.value === "" ? undefined : event.target.valueAsNumber })} /></label>
      </div> : <p className="strategy-recorded-drivers__status">{t("strategy.journey.driver.pacePending")}</p>}
    </section>)}
    <button type="button" className="orbit-btn orbit-btn--primary strategy-recorded-drivers__add" onClick={onAdd}>+ {t("strategy.journey.driver.add")}</button>
  </div>;
}
