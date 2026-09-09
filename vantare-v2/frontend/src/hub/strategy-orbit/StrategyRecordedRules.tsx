import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import "./strategy-recorded-fields.css";

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
  const placeholder = t("strategy.journey.unconfirmed");
  const number = (key: "tankLiters" | "initialFuelLiters" | "fuelReserveLiters" | "pitLossSeconds", label: string, min = 0) =>
    <NumberField label={t(label)} value={draft[key]} min={min} placeholder={placeholder} onChange={value => onChange({ ...draft, [key]: value })} />;
  const energy = draft.virtualEnergy ?? { applicability: "unknown" as const };
  const publishedDuration = draft.calendar?.series.raceDurationMin ?? draft.calendar?.series.durationMin;
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
    </details>
  </div>;
}
