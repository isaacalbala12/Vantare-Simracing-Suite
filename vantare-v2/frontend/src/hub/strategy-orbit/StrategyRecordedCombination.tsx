import { useState } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import type { StrategySessionCombinationV1 } from "../../strategy/strategy-application-client";
import { Icon } from "../../ui/orbit";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedCalendarCombinations } from "./strategy-recorded-wizard";
import "./strategy-recorded-combination.css";

type Props = {
  readonly draft: RecordedWizardDraft;
  readonly catalog: readonly StrategySessionCombinationV1[];
  readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null;
  readonly onCombination: (id: string | undefined) => void;
  readonly onCalendar: (seriesId: string | undefined) => void;
  readonly onDiscover: () => void;
  readonly t: (key: string) => string;
};

const carKey = (car: Pick<StrategySessionCombinationV1, "carClass" | "carName">) => JSON.stringify([car.carClass, car.carName]);

/** Canonical metadata only. File ownership, selection and persistence stay outside. */
export function StrategyRecordedCombination({ draft, catalog, catalogState, calendar, onCombination, onCalendar, onDiscover, t }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(Boolean(draft.calendar));
  const [carFilter, setCarFilter] = useState("");
  const compatible = draft.calendar ? recordedCalendarCombinations(draft.calendar, catalog) : catalog.filter(item => item.simId === "lmu");
  const cars = [...new Map(compatible.map(item => [carKey(item), item])).entries()];
  const chosenCar = draft.combination ? carKey(draft.combination) : carFilter;
  const selectedCar = cars.some(([key]) => key === chosenCar) ? chosenCar : "";
  const tracks = compatible.filter(item => carKey(item) === selectedCar);
  const series = calendar?.series ?? [];
  const selectedSeries = draft.calendar?.series;
  const seriesOptions = selectedSeries && !series.some(item => item.id === selectedSeries.id) ? [selectedSeries, ...series] : series;
  return <div className="strategy-recorded-combination">
    <section className="strategy-recorded-combination__event" aria-label={t("strategy.journey.event")}>
      <span className="strategy-recorded-frame__eyebrow">{t("strategy.journey.event")}</span>
      <div className="strategy-recorded-combination__sources">
        <button type="button" aria-pressed={!draft.calendar} onClick={() => { setCalendarOpen(false); onCalendar(undefined); }}>
          <Icon name="i-ajustes" size={22} /><span>{t("strategy.journey.custom")}<small>{t("strategy.journey.custom.description")}</small></span>
        </button>
        <button type="button" aria-expanded={calendarOpen} onClick={() => setCalendarOpen(value => !value)}>
          <Icon name="i-carreras" size={22} /><span>{t("strategy.journey.calendar")}<small>{selectedSeries?.name ?? t("strategy.journey.calendar.description")}</small></span>
        </button>
      </div>
      {calendarOpen ? <div className="strategy-recorded-combination__calendar">
        {seriesOptions.length > 0 ? <label><span>{t("strategy.journey.calendar.event")}</span>
          <select value={selectedSeries?.id ?? ""} onChange={event => onCalendar(event.target.value || undefined)}>
            <option value="">{t("strategy.journey.choose")}</option>
            {seriesOptions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.track}</option>)}
          </select>
        </label> : <p role="status">{t(calendar ? "strategy.journey.calendar.empty" : "strategy.journey.calendar.unavailable")}</p>}
        {draft.calendar ? <p>{t("strategy.journey.calendar.snapshot")} · {draft.calendar.version} · {draft.calendar.updated}</p> : null}
      </div> : null}
    </section>
    <div className="strategy-recorded-combination__fields">
      <label><span>{t("strategy.journey.simulator")}</span><div className="strategy-recorded-combination__sim"><b>LMU</b><strong>Le Mans Ultimate</strong></div></label>
      <label><span>{t("strategy.journey.car")}</span><select value={selectedCar} disabled={catalogState !== "available" || cars.length === 0} onChange={event => { setCarFilter(event.target.value); onCombination(undefined); }}>
        <option value="">{t("strategy.journey.choose")}</option>
        {cars.map(([key, item]) => <option key={key} value={key}>{item.carClass} · {item.carName}</option>)}
      </select></label>
      <label><span>{t("strategy.journey.track")}</span><select value={draft.combination?.combinationId ?? ""} disabled={catalogState !== "available" || tracks.length === 0} onChange={event => onCombination(event.target.value || undefined)}>
        <option value="">{t("strategy.journey.choose")}</option>
        {tracks.map(item => <option key={item.combinationId} value={item.combinationId}>{item.trackName}{item.trackLayout && item.trackLayout !== item.trackName ? ` · ${item.trackLayout}` : ""}</option>)}
      </select></label>
    </div>
    {catalogState !== "available" || compatible.length === 0 ? <div className="strategy-recorded-combination__notice" role="status">
      <p>{t(catalogState === "loading" ? "strategy.journey.catalog.loading" : catalogState === "unavailable" ? "strategy.journey.catalog.unavailable" : "strategy.journey.catalog.empty")}</p>
      <button type="button" className="orbit-btn orbit-btn--ghost" disabled={catalogState === "loading"} onClick={onDiscover}>{t("strategy.recorded.discover")}</button>
    </div> : null}
    {draft.combination ? <section className="strategy-recorded-combination__identity" aria-label={t("strategy.journey.selected")}>
      <span className="strategy-recorded-frame__eyebrow">{t("strategy.journey.selected")}</span>
      <h3>{draft.combination.trackName}</h3><p>{draft.combination.trackLayout}</p>
      <small>{draft.combination.carClass} · {draft.combination.carName}</small>
    </section> : null}
    {draft.invalidatedSessionCount > 0 ? <p role="status">{t("strategy.journey.sessions.invalidated")} ({draft.invalidatedSessionCount})</p> : null}
  </div>;
}
