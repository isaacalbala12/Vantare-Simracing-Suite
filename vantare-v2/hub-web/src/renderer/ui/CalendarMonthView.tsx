import { useMemo, useState } from "react";
import type {
  CalendarAlerts,
  CalendarView,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarMonthText as text } from "../i18n/calendarMonth";
import { monthWeeks } from "../screens/calendar/month";
import { Button } from "./Button";
import { civilDay, datePart } from "./calendarDate";
import { Segmented } from "./Forms";
import "./calendar-month.css";
export function CalendarMonthView({
  view,
  alerts,
  now,
  limit,
  runs,
  onSpan,
  onFull,
  onDetail,
}: {
  view: CalendarView;
  alerts: CalendarAlerts;
  now: number;
  limit: number;
  runs?: readonly { at: number }[];
  onSpan: (span: string) => void;
  onFull: () => void;
  onDetail: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0),
    minute = Math.floor(now / 60000);
  const model = useMemo(
    () => monthWeeks(view, minute * 60000, offset, view.utc, alerts, limit),
    [view, minute, offset, alerts, limit],
  );
  const first = new Date(model.first),
    today = civilDay(now, 0, view.utc);
  return (
    <section className="v-calendar-month">
      <header>
        <Button
          variant="ghost"
          aria-label={text.previous}
          onClick={() => setOffset((n) => n - 1)}
        >
          <Icon name="chevron-left" />
        </Button>
        <h2>{`${text.months[first.getUTCMonth()]} ${first.getUTCFullYear()}`}</h2>
        <Button
          variant="ghost"
          aria-label={text.next}
          onClick={() => setOffset((n) => n + 1)}
        >
          <Icon name="right" />
        </Button>
        <Button onClick={() => setOffset(0)}>{text.today}</Button>
        <p>{text.weeks}</p>
        <Button variant="ghost" aria-label={text.full} onClick={onFull}>
          <Icon name="expand" />
        </Button>
        <Segmented
          label={text.calendar}
          value="month"
          onChange={onSpan}
          options={[
            { value: "day", label: text.day },
            { value: "week", label: text.week },
            { value: "month", label: text.month },
          ]}
        />
      </header>
      <div className="v-calendar-month-days">
        <span />
        {text.weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="v-calendar-month-grid">
        {model.weeks.map((week, index) => (
          <div
            className="v-calendar-month-week"
            key={week.start}
            style={{ flexGrow: index < 2 ? 1 : 0.6 }}
          >
            <div className="v-calendar-month-meta" data-state={week.state}>
              <strong>{`${datePart(week.start, "day", true)} ${datePart(week.start, "month", true)} – ${datePart(week.start + 6 * 86400000, "day", true)} ${datePart(week.start + 6 * 86400000, "month", true)}`}</strong>
              <b>{text.states[week.state as keyof typeof text.states]}</b>
              {week.state === "past" ? (
                <small>{text.cache}</small>
              ) : week.state === "unpublished" ? (
                <small>{text.publishes}</small>
              ) : null}
            </div>
            {week.days.map((at, day) => {
              const facts = week.facts?.[day],
                until = civilDay(at, 1, view.utc),
                ran =
                  runs?.filter((run) => run.at >= at && run.at < until)
                    .length ?? 0;
              return (
                <div
                  className="v-calendar-month-day"
                  key={at}
                  data-today={today === at || undefined}
                  data-missing={!week.schedule || undefined}
                >
                  <div className="v-calendar-month-date">
                    <strong
                      data-outside={
                        Number(
                          datePart(at, "month", view.utc) !==
                            datePart(model.first, "month", true),
                        ) || undefined
                      }
                    >
                      {today === at && <small>{text.today}</small>}
                      {datePart(at, "day", view.utc)}
                    </strong>
                    {ran > 0 && (
                      <span data-ran>
                        <Icon name="check" />
                        {ran}
                      </span>
                    )}
                    {!!facts?.alerts && (
                      <span>
                        <Icon name="bell-fill" />
                        {facts.alerts}
                      </span>
                    )}
                  </div>
                  {facts && (
                    <>
                      <div style={{ height: `${23 * week.reserved[day]}px` }} />
                      <div
                        className="v-calendar-month-density"
                        data-past={until <= now || undefined}
                      >
                        {facts.density.map(({ count, hour, event }) => (
                          <i
                            key={`${at}:${hour}`}
                            data-event={event || undefined}
                            style={{
                              height: `${Math.max(1, Math.min(100, (100 * count) / 40))}%`,
                            }}
                          />
                        ))}
                      </div>
                      <p className="v-calendar-month-count">
                        {text.departures(facts.total)}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
            {week.schedule &&
              week.bars.map((bar) => {
                const series = week.schedule?.series[bar.series];
                if (!series) return null;
                return (
                  <button
                    type="button"
                    className="v-calendar-month-event"
                    key={`${series.id}:${bar.from}`}
                    data-special={series.eventKind === "special" || undefined}
                    data-past={week.state === "past" || undefined}
                    style={{
                      left: `calc(132px + (100% - 132px) * ${bar.from / 7} + 6px)`,
                      width: `calc((100% - 132px) * ${(bar.to - bar.from + 1) / 7} - 12px)`,
                      top: `${31 + bar.lane * 23}px`,
                    }}
                    onClick={() => onDetail(series.id)}
                  >
                    {series.name}
                    {series.eventKind !== "special"
                      ? ` · ${series.track.split(" (")[0]}`
                      : ""}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <footer>
        <span>{text.weekly}</span>
        <span>{text.special}</span>
        <span>{text.density}</span>
        <span>{text.ran}</span>
        <span>{text.alerts}</span>
      </footer>
    </section>
  );
}
