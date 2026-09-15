import { useState } from "react";
import { effectiveRecordedDriverOrder, reconcileRecordedDriverOrder, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import "./strategy-recorded-drivers.css";

type DriverLimit = NonNullable<NonNullable<RecordedWizardDraft["rules"]>["driverLimits"]>[string];
type DriverLimits = Readonly<Record<string, DriverLimit>>;
type DriverLimitKey = "minLaps" | "maxLaps" | "maxContinuousTimeSeconds" | "maxTotalTimeSeconds";
type LapWindow = NonNullable<DriverLimit["unavailable"]>[number];
type MutableDriverLimit = { -readonly [Key in keyof DriverLimit]: DriverLimit[Key] };
type MutableRules = { -readonly [Key in keyof NonNullable<RecordedWizardDraft["rules"]>]: NonNullable<RecordedWizardDraft["rules"]>[Key] };
const minutesFromSeconds = (seconds: number | undefined) => seconds === undefined ? "" : seconds / 60;

function rulesWithDriverLimits(rules: RecordedWizardDraft["rules"], limits: DriverLimits): RecordedWizardDraft["rules"] {
  const next: MutableRules = { ...rules };
  if (Object.keys(limits).length > 0) next.driverLimits = limits;
  else delete next.driverLimits;
  return Object.keys(next).length > 0 ? next : undefined;
}

function DriverUnavailableWindows({ windows, onChange, t }: {
  readonly windows: readonly LapWindow[];
  readonly onChange: (windows: readonly LapWindow[]) => void;
  readonly t: (key: string) => string;
}) {
  const [fromLap, setFromLap] = useState<number>();
  const [toLap, setToLap] = useState<number>();
  const update = (index: number, key: keyof LapWindow, value: number | undefined) => {
    if (value === undefined) return;
    onChange(windows.map((window, current) => current === index ? { ...window, [key]: value } : window));
  };
  const add = () => {
    if (fromLap === undefined || toLap === undefined) return;
    onChange([...windows, { fromLap, toLap }]);
    setFromLap(undefined);
    setToLap(undefined);
  };
  return <details className="strategy-recorded-fields__windows" aria-label={t("strategy.journey.driver.unavailable")} open={windows.length > 0 ? true : undefined}>
    <summary>{t("strategy.journey.driver.unavailable")}</summary>
    <p>{t("strategy.journey.driver.unavailable.hint")}</p>
    {windows.length === 0 ? <p>{t("strategy.journey.driver.unavailable.empty")}</p> : null}
    {windows.map((window, index) => <div key={index} className="strategy-recorded-fields__window" role="group" aria-label={`${t("strategy.journey.driver.unavailable.window.label")} ${index + 1}`}>
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.unavailable.fromLap")}</span><input type="number" min="1" step="1" value={window.fromLap} onChange={event => update(index, "fromLap", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.unavailable.toLap")}</span><input type="number" min="1" step="1" value={window.toLap} onChange={event => update(index, "toLap", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
      <button type="button" className="orbit-btn orbit-btn--ghost" aria-label={`${t("strategy.journey.driver.unavailable.remove")} ${index + 1}`} onClick={() => onChange(windows.filter((_, current) => current !== index))}>{t("strategy.journey.driver.unavailable.remove")}</button>
    </div>)}
    <div className="strategy-recorded-fields__window strategy-recorded-fields__window--new">
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.unavailable.newFromLap")}</span><input type="number" min="1" step="1" value={fromLap ?? ""} onChange={event => setFromLap(event.target.value === "" ? undefined : Number(event.target.value))} /></label>
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.unavailable.newToLap")}</span><input type="number" min="1" step="1" value={toLap ?? ""} onChange={event => setToLap(event.target.value === "" ? undefined : Number(event.target.value))} /></label>
      <button type="button" className="orbit-btn orbit-btn--ghost" disabled={fromLap === undefined || toLap === undefined} onClick={add}>{t("strategy.journey.driver.unavailable.add")}</button>
    </div>
  </details>;
}

export function StrategyRecordedDrivers({ draft, onChange, onAdd, t }: {
  readonly draft: RecordedWizardDraft;
  readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly onAdd: () => void;
  readonly t: (key: string) => string;
}) {
  const drivers = draft.drivers;
  const driverLimits = draft.rules?.driverLimits ?? {};
  const driverOrder = effectiveRecordedDriverOrder(draft);
  const principal = drivers[0];
  const change = (nextDrivers: RecordedWizardDraft["drivers"], nextLimits: DriverLimits = driverLimits) => onChange({
    ...draft, drivers: nextDrivers, driverOrder: reconcileRecordedDriverOrder(draft, nextDrivers), rules: rulesWithDriverLimits(draft.rules, nextLimits),
  });
  const setOrder = (mode: "fixed" | "free", ids = driverOrder.ids) => onChange({
    ...draft,
    driverOrder: { mode, ids: [...ids] },
  });
  const moveDriver = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= driverOrder.ids.length || driverOrder.mode !== "fixed") return;
    const ids = [...driverOrder.ids];
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrder("fixed", ids);
  };
  const update = (id: string, patch: Partial<RecordedWizardDraft["drivers"][number]>) => change(drivers.map(driver => driver.id === id ? { ...driver, ...patch } : driver));
  const changeDriverLimit = (id: string, nextLimit: MutableDriverLimit) => {
    const nextLimits: Record<string, DriverLimit> = { ...driverLimits };
    if (Object.keys(nextLimit).length > 0) nextLimits[id] = nextLimit;
    else delete nextLimits[id];
    change(drivers, nextLimits);
  };
  const updateDriverLimit = (id: string, key: DriverLimitKey, value: number | undefined) => {
    const nextLimit: MutableDriverLimit = { ...driverLimits[id] };
    if (value === undefined) delete nextLimit[key];
    else nextLimit[key] = value;
    changeDriverLimit(id, nextLimit);
  };
  const updateUnavailable = (id: string, unavailable: readonly LapWindow[]) => {
    const nextLimit: MutableDriverLimit = { ...driverLimits[id] };
    if (unavailable.length > 0) nextLimit.unavailable = unavailable;
    else delete nextLimit.unavailable;
    changeDriverLimit(id, nextLimit);
  };
  const remove = (id: string) => {
    const nextLimits: Record<string, DriverLimit> = { ...driverLimits };
    delete nextLimits[id];
    change(drivers.filter(item => item.id !== id).map(item => item.referenceDriverId === id ? { ...item, referenceDriverId: undefined, paceDeltaSeconds: undefined } : item), nextLimits);
  };
  return <div className="strategy-recorded-drivers">
    <section className="strategy-recorded-drivers__order" aria-label={t("strategy.journey.driver.order.title")}>
      <div>
        <strong>{t("strategy.journey.driver.order.title")}</strong>
        <p>{t(driverOrder.mode === "fixed" ? "strategy.journey.driver.order.fixedHint" : "strategy.journey.driver.order.freeHint")}</p>
      </div>
      <label className="strategy-recorded-field">
        <span>{t("strategy.journey.driver.order.mode")}</span>
        <select aria-label={t("strategy.journey.driver.order.mode")} value={driverOrder.mode} onChange={event => setOrder(event.target.value as "fixed" | "free")}>
          <option value="fixed">{t("strategy.journey.driver.order.fixed")}</option>
          <option value="free">{t("strategy.journey.driver.order.free")}</option>
        </select>
      </label>
      <ol>{driverOrder.ids.map((id, index) => {
        const driver = drivers.find(candidate => candidate.id === id);
        const name = driver?.name || t("strategy.journey.unconfirmed");
        return <li key={id}><span>{index + 1}</span><strong>{name}</strong>{driverOrder.mode === "fixed" ? <span>
          <button type="button" className="orbit-btn orbit-btn--ghost" disabled={index === 0} aria-label={`${t("strategy.journey.driver.order.up")} ${name}`} onClick={() => moveDriver(index, -1)}>↑</button>
          <button type="button" className="orbit-btn orbit-btn--ghost" disabled={index === driverOrder.ids.length - 1} aria-label={`${t("strategy.journey.driver.order.down")} ${name}`} onClick={() => moveDriver(index, 1)}>↓</button>
        </span> : null}</li>;
      })}</ol>
    </section>
    {drivers.length === 0 ? <section className="strategy-recorded-drivers__card"><h3>{t("strategy.journey.driver.primary")}</h3><p role="status">{t("strategy.journey.driver.empty")}</p></section> : null}
    {drivers.map((driver, index) => <section key={driver.id} className="strategy-recorded-drivers__card" aria-label={`${t("strategy.journey.driver.label")} ${index + 1}`}>
      <header><span className="strategy-recorded-frame__eyebrow">{t(index === 0 ? "strategy.journey.driver.primary" : "strategy.journey.driver.relay")} {index > 0 ? index : ""}</span>
        <button type="button" className="orbit-btn orbit-btn--ghost" aria-label={`${t("strategy.journey.driver.remove")} ${driver.name || index + 1}`} onClick={() => remove(driver.id)}>{t("strategy.journey.driver.remove")}</button>
      </header>
      <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.name")}</span><input value={driver.name} maxLength={120} placeholder={t("strategy.journey.unconfirmed")} onChange={event => update(driver.id, { name: event.target.value })} /></label>
      <div className="strategy-recorded-drivers__limits">
        <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.minLaps")}</span><input type="number" min="0" step="1" value={driverLimits[driver.id]?.minLaps ?? ""} placeholder={t("strategy.journey.unconfirmed")} onChange={event => updateDriverLimit(driver.id, "minLaps", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
        <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.maxLaps")}</span><input type="number" min="0" step="1" value={driverLimits[driver.id]?.maxLaps ?? ""} placeholder={t("strategy.journey.unconfirmed")} onChange={event => updateDriverLimit(driver.id, "maxLaps", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
        <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.maxContinuousMinutes")}</span><input type="number" min="0.01" step="any" value={minutesFromSeconds(driverLimits[driver.id]?.maxContinuousTimeSeconds)} placeholder={t("strategy.journey.unconfirmed")} onChange={event => updateDriverLimit(driver.id, "maxContinuousTimeSeconds", event.target.value === "" ? undefined : Number(event.target.value) * 60)} /></label>
        <label className="strategy-recorded-field"><span>{t("strategy.journey.driver.maxTotalMinutes")}</span><input type="number" min="0.01" step="any" value={minutesFromSeconds(driverLimits[driver.id]?.maxTotalTimeSeconds)} placeholder={t("strategy.journey.unconfirmed")} onChange={event => updateDriverLimit(driver.id, "maxTotalTimeSeconds", event.target.value === "" ? undefined : Number(event.target.value) * 60)} /></label>
      </div>
      <DriverUnavailableWindows windows={driverLimits[driver.id]?.unavailable ?? []} onChange={windows => updateUnavailable(driver.id, windows)} t={t} />
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
