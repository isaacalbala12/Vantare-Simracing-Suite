import { useState } from "react";
import { STRATEGY_COMPOUNDS, type StrategyCompound } from "../../strategy/strategy-tyre";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import "./strategy-recorded-fields.css";

type EventRules = NonNullable<RecordedWizardDraft["rules"]>;
type PitWindow = NonNullable<EventRules["requiredWindows"]>[number];
type MutableRules = { -readonly [Key in keyof EventRules]: EventRules[Key] };

function rulesWithWindows(rules: RecordedWizardDraft["rules"], windows: readonly PitWindow[]): RecordedWizardDraft["rules"] {
  const next: MutableRules = { ...rules };
  if (windows.length > 0) next.requiredWindows = windows;
  else delete next.requiredWindows;
  return Object.keys(next).length > 0 ? next : undefined;
}

function rulesWithCompounds(rules: RecordedWizardDraft["rules"], compounds: readonly StrategyCompound[]): RecordedWizardDraft["rules"] {
  const next: MutableRules = { ...rules };
  if (compounds.length > 0) next.mandatoryCompounds = compounds;
  else delete next.mandatoryCompounds;
  return Object.keys(next).length > 0 ? next : undefined;
}

function NumberField({ label, value, onChange, min = 0, max, integer = false, placeholder }: {
  readonly label: string; readonly value?: number; readonly onChange: (value: number | undefined) => void;
  readonly min?: number; readonly max?: number; readonly integer?: boolean; readonly placeholder: string;
}) {
  return <label className="strategy-recorded-field"><span>{label}</span><input type="number" min={min} max={max} step={integer ? 1 : "any"}
    value={value ?? ""} placeholder={placeholder} onChange={event => onChange(event.target.value === "" ? undefined : event.target.valueAsNumber)} /></label>;
}

export function StrategyRecordedRules({ draft, onChange, t }: {
  readonly draft: RecordedWizardDraft; readonly onChange: (draft: RecordedWizardDraft) => void; readonly t: (key: string) => string;
}) {
  const [newWindow, setNewWindow] = useState<Partial<PitWindow>>({});
  const placeholder = t("strategy.journey.unconfirmed");
  const number = (key: "tankLiters" | "initialFuelLiters" | "fuelReserveLiters" | "pitLossSeconds", label: string, min = 0) =>
    <NumberField label={t(label)} value={draft[key]} min={min} placeholder={placeholder} onChange={value => onChange({ ...draft, [key]: value })} />;
  const energy = draft.virtualEnergy ?? { applicability: "unknown" as const };
  const publishedDuration = draft.calendar?.series.raceDurationMin ?? draft.calendar?.series.durationMin;
  const windows = draft.rules?.requiredWindows ?? [];
  const mandatoryCompounds = draft.rules?.mandatoryCompounds ?? [];
  const updateWindows = (next: readonly PitWindow[]) => onChange({ ...draft, rules: rulesWithWindows(draft.rules, next) });
  const updateWindow = (index: number, key: keyof PitWindow, value: number | undefined) => {
    if (value === undefined) return;
    updateWindows(windows.map((window, position) => position === index ? { ...window, [key]: value } : window));
  };
  const toggleCompound = (compound: StrategyCompound) => {
    const selected = mandatoryCompounds.includes(compound);
    const next = STRATEGY_COMPOUNDS.filter(item => item === compound ? !selected : mandatoryCompounds.includes(item));
    onChange({ ...draft, rules: rulesWithCompounds(draft.rules, next) });
  };
  return <div className="strategy-recorded-fields">
    <p className="strategy-recorded-fields__provenance">{t("strategy.journey.rules.configuration")}</p>
    <label className="strategy-recorded-field"><span>{t("strategy.journey.race.name")}</span><input value={draft.name} maxLength={120} placeholder={placeholder} onChange={event => onChange({ ...draft, name: event.target.value })} /></label>
    {draft.calendar && publishedDuration !== undefined && Number.isFinite(publishedDuration) && publishedDuration > 0 ? <div className="strategy-recorded-fields__proposal">
      <p>{draft.calendar.series.name} · {publishedDuration} {t("strategy.journey.minutes")}</p>
      <button type="button" className="orbit-btn orbit-btn--ghost" onClick={() => onChange({ ...draft, name: draft.name || draft.calendar!.series.name, race: { format: "timed", durationMin: publishedDuration } })}>{t("strategy.journey.rules.applyCalendar")}</button>
    </div> : null}
    <label className="strategy-recorded-field"><span>{t("strategy.journey.race.format")}</span><select value={draft.race.format} onChange={event => onChange({ ...draft, race: event.target.value === "laps" ? { format: "laps" } : { format: "timed" } })}>
      <option value="timed">{t("strategy.journey.minutes")}</option><option value="laps">{t("strategy.journey.laps")}</option>
    </select></label>
    <NumberField label={t(draft.race.format === "timed" ? "strategy.journey.race.duration" : "strategy.journey.race.laps")}
      value={draft.race.format === "timed" ? draft.race.durationMin : draft.race.laps} placeholder={placeholder} min={1} integer={draft.race.format === "laps"}
      onChange={value => onChange({ ...draft, race: draft.race.format === "timed" ? { format: "timed", durationMin: value } : { format: "laps", laps: value } })} />
    <details className="strategy-recorded-fields__group" open><summary>{t("strategy.journey.rules.resources")}</summary>
      {number("tankLiters", "strategy.journey.fuel.capacity", 0.001)}
      {number("initialFuelLiters", "strategy.journey.fuel.initial")}
      {number("fuelReserveLiters", "strategy.journey.fuel.reserve")}
      <label className="strategy-recorded-field"><span>{t("strategy.journey.energy")}</span><select value={energy.applicability} onChange={event => {
        const applicability = event.target.value as typeof energy.applicability;
        onChange({ ...draft, virtualEnergy: { ...energy, applicability } });
      }}>
        <option value="unknown">{placeholder}</option><option value="applicable">{t("strategy.journey.applicable")}</option><option value="not_applicable">{t("strategy.journey.notApplicable")}</option>
      </select></label>
      {energy.applicability === "applicable" ? (["capacityPercent", "initialPercent", "reservePercent"] as const).map(key => <NumberField key={key} label={t(`strategy.journey.energy.${key}`)} value={energy[key]} min={key === "capacityPercent" ? 0.001 : 0} max={100} placeholder={placeholder}
        onChange={value => onChange({ ...draft, virtualEnergy: { ...energy, [key]: value } })} />) : null}
    </details>
    <details className="strategy-recorded-fields__group"><summary>{t("strategy.journey.rules.stops")}</summary>
      {number("pitLossSeconds", "strategy.journey.pit.loss")}
      <NumberField label={t("strategy.journey.pit.min")} value={draft.rules?.minPitStops} integer placeholder={placeholder} onChange={value => onChange({ ...draft, rules: { ...draft.rules, minPitStops: value } })} />
      <NumberField label={t("strategy.journey.pit.max")} value={draft.rules?.maxPitStops} integer placeholder={placeholder} onChange={value => onChange({ ...draft, rules: { ...draft.rules, maxPitStops: value } })} />
      <div className="strategy-recorded-fields__windows">
        {windows.map((window, index) => <div key={index} role="group" aria-label={`${t("strategy.journey.pit.window.label")} ${index + 1}`} className="strategy-recorded-fields__window">
          <NumberField label={t("strategy.journey.pit.window.fromLap")} value={window.fromLap} min={1} integer placeholder={placeholder} onChange={value => updateWindow(index, "fromLap", value)} />
          <NumberField label={t("strategy.journey.pit.window.toLap")} value={window.toLap} min={1} integer placeholder={placeholder} onChange={value => updateWindow(index, "toLap", value)} />
          <button type="button" className="orbit-btn orbit-btn--ghost" aria-label={`${t("strategy.journey.pit.window.remove")} ${index + 1}`} onClick={() => updateWindows(windows.filter((_, position) => position !== index))}>{t("strategy.journey.pit.window.remove")}</button>
        </div>)}
        <div className="strategy-recorded-fields__window strategy-recorded-fields__window--new">
          <NumberField label={t("strategy.journey.pit.window.newFromLap")} value={newWindow.fromLap} min={1} integer placeholder={placeholder} onChange={value => setNewWindow(current => ({ ...current, fromLap: value }))} />
          <NumberField label={t("strategy.journey.pit.window.newToLap")} value={newWindow.toLap} min={1} integer placeholder={placeholder} onChange={value => setNewWindow(current => ({ ...current, toLap: value }))} />
          <button type="button" className="orbit-btn orbit-btn--ghost" disabled={newWindow.fromLap === undefined || newWindow.toLap === undefined} onClick={() => {
            if (newWindow.fromLap === undefined || newWindow.toLap === undefined) return;
            updateWindows([...windows, { fromLap: newWindow.fromLap, toLap: newWindow.toLap }]);
            setNewWindow({});
          }}>{t("strategy.journey.pit.window.add")}</button>
        </div>
      </div>
      <div className="strategy-recorded-fields__compounds" role="group" aria-label={t("strategy.journey.compounds.mandatory")}>
        <strong>{t("strategy.journey.compounds.mandatory")}</strong>
        <p>{t("strategy.journey.compounds.hint")}</p>
        <div>
          {STRATEGY_COMPOUNDS.map(compound => <label key={compound} className="strategy-recorded-fields__compound">
            <input type="checkbox" checked={mandatoryCompounds.includes(compound)} onChange={() => toggleCompound(compound)} />
            <span>{t(`strategy.journey.compound.${compound}`)}</span>
          </label>)}
        </div>
      </div>
    </details>
  </div>;
}
