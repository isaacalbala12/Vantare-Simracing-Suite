import { useState } from "react";
import type {
  CalendarAlerts,
  CalendarSeries,
  CalendarView,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarWeekText as text } from "../i18n/calendarWeek";
import { weekDates } from "../screens/calendar/grid";
import {
  alertAt,
  daily,
  nextStart,
  raceMinutes,
} from "../screens/calendar/rows";
import { starts } from "../screens/calendar/schedule";
import { Button } from "./Button";
import { WeekBoard } from "./CalendarWeekBoard";
import { civilDay, clock, datePart, weekTitle } from "./calendarDate";
import { Segmented } from "./Forms";
import "./calendar-week-live.css";
export function CalendarWeekView({
  view,
  alerts,
  now,
  limit,
  onSpan,
  onFull,
  onFollow,
  onDetail,
}: {
  view: CalendarView;
  alerts: CalendarAlerts;
  now: number;
  limit: number;
  onSpan: (span: string) => void;
  onFull: () => void;
  onFollow: (id: string, followed: boolean) => void;
  onDetail: (id: string, at?: number) => void;
}) {
  const [offset, setOffset] = useState(0),
    [filter, setFilter] = useState("all");
  const date = new Date(now),
    base = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 5) % 7),
    ),
    start = base + offset * 7 * 86400000;
  const dates = weekDates(start, view.utc),
    end = civilDay(dates[0], 7, view.utc),
    today = civilDay(now, 0, view.utc);
  const schedule = [view.official, view.previous, view.fallback].find(
    (s) => s && Date.parse(s.validFrom) === start,
  );
  const series =
    schedule?.series.filter(
      (s) => filter !== "favorites" || view.following.includes(s.id),
    ) ?? [];
  const identity = (s: CalendarSeries) => (
    <div className="v-calendar-week-live-identity">
      <Button
        variant="ghost"
        aria-label={text.favorite(s.name)}
        onClick={() => onFollow(s.id, !view.following.includes(s.id))}
      >
        <Icon name={view.following.includes(s.id) ? "star" : "star-line"} />
      </Button>
      <button type="button" onClick={() => onDetail(s.id)}>
        <strong>{s.name}</strong>
        <p>
          <b data-tier={s.tier}>
            {s.eventKind === "special"
              ? calendarText.specialty
              : (calendarText.tiers[
                  s.tier as keyof typeof calendarText.tiers
                ] ?? s.tier)}
          </b>
          {s.track.split(" (")[0]}
          {text.separator}
          {calendarText.minutes(raceMinutes(s))}
        </p>
      </button>
    </div>
  );
  return (
    <section className="v-calendar-week-live">
      <header>
        <Button
          variant="ghost"
          aria-label={text.previous}
          onClick={() => setOffset((n) => n - 1)}
        >
          <Icon name="chevron-left" />
        </Button>
        <h2>{text.week(weekTitle(dates[0], view.utc))}</h2>
        <Button
          variant="ghost"
          aria-label={text.next}
          disabled={offset >= 1}
          onClick={() => setOffset((n) => Math.min(1, n + 1))}
        >
          <Icon name="right" />
        </Button>
        <Button onClick={() => setOffset(0)} disabled={offset === 0}>
          {text.today}
        </Button>
        <p className="v-calendar-week-live-caption">{text.publication}</p>
        <Button variant="ghost" aria-label={text.full} onClick={onFull}>
          <Icon name="expand" />
        </Button>
        <Segmented
          label={text.calendar}
          value="week"
          onChange={onSpan}
          options={[
            { value: "day", label: text.day },
            { value: "week", label: text.weekTab },
            { value: "month", label: text.month },
          ]}
        />
        <Segmented
          label={text.favorites}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: text.all },
            { value: "favorites", label: text.favorites },
          ]}
        />
      </header>
      {!schedule ? (
        <div className="v-calendar-week-live-empty">
          <Icon name="v-calendar" />
          <h2>
            {offset < 0
              ? text.missing(weekTitle(dates[0], view.utc))
              : text.unpublished(weekTitle(dates[0], view.utc))}
          </h2>
          <p>{offset < 0 ? text.missingHelp : text.unpublishedHelp}</p>
        </div>
      ) : offset < 0 ? (
        <WeekBoard schedule={schedule} utc={view.utc} limit={limit} />
      ) : !series.length ? (
        <div className="v-calendar-week-live-empty">
          <Icon name="star-line" />
          <h2>{text.empty}</h2>
          <p>{text.emptyHelp}</p>
        </div>
      ) : (
        <>
          <div className="v-calendar-week-live-days">
            <span>{text.series}</span>
            {dates.map((at) => (
              <div key={at} data-today={at === today || undefined}>
                <small>
                  {at === today
                    ? text.today
                    : datePart(at, "weekday", view.utc)}
                </small>
                <strong>{datePart(at, "day", view.utc)}</strong>
              </div>
            ))}
          </div>
          <div className="v-calendar-week-live-body">
            <div className="v-calendar-group">
              {text.events}
              <span>{text.fixed}</span>
            </div>
            {series
              .filter((s) => !daily(s))
              .map((s) => (
                <div className="v-calendar-week-live-event" key={s.id}>
                  {identity(s)}
                  {dates.map((at) => {
                    const until = civilDay(at, 1, view.utc),
                      slots = starts(schedule, s, at, until, limit),
                      next = nextStart(schedule, s, now, limit),
                      highlighted = slots.filter(
                        (slot) =>
                          slot === next ||
                          alertAt(schedule, s, slot, alerts, limit),
                      ),
                      chosen = highlighted[0];
                    return (
                      <div
                        className="v-calendar-week-live-event-day"
                        key={at}
                        data-today={at === today || undefined}
                      >
                        <div className="v-calendar-event-track">
                          {slots.map((slot) => (
                            <i
                              key={slot}
                              style={{
                                left: `${(100 * (slot - at)) / (until - at)}%`,
                              }}
                            />
                          ))}
                        </div>
                        {chosen !== undefined ? (
                          <button
                            type="button"
                            data-alert={
                              alertAt(schedule, s, chosen, alerts, limit) ||
                              undefined
                            }
                            onClick={() => onDetail(s.id, chosen)}
                          >
                            {clock(chosen, view.utc)}
                            {highlighted.length > 1 && (
                              <small>{`+${highlighted.length - 1}`}</small>
                            )}
                          </button>
                        ) : slots.length > 0 ? (
                          <small>{text.count(slots.length)}</small>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            <div className="v-calendar-group">
              {text.daily}
              <span>{text.dailyHint}</span>
            </div>
            {series.filter(daily).map((s) => {
              const next = nextStart(schedule, s, now, limit);
              return (
                <div className="v-calendar-week-live-daily" key={s.id}>
                  {identity(s)}
                  <button type="button" onClick={() => onDetail(s.id, next)}>
                    <span
                      className="v-calendar-week-live-past"
                      style={{
                        width: `${Math.max(0, Math.min(100, (100 * (now - dates[0])) / (end - dates[0])))}%`,
                      }}
                    />
                    {next !== undefined && (
                      <b
                        style={{
                          left: `${(100 * (next - dates[0])) / (end - dates[0])}%`,
                        }}
                      >
                        {clock(next, view.utc)}
                      </b>
                    )}
                    <span>{text.every(s.recurrence.intervalMinutes)}</span>
                  </button>
                </div>
              );
            })}
            {offset === 0 && (
              <i
                className="v-calendar-week-live-now"
                style={{
                  left: `calc(240px + (100% - 240px) * ${(now - dates[0]) / (end - dates[0])})`,
                }}
              />
            )}
          </div>
          <footer>
            <span>{text.nextDeparture}</span>
            <span>{text.alert}</span>
            <span>{text.band}</span>
            <span>{text.now}</span>
            <p>{text.hint}</p>
          </footer>
        </>
      )}
    </section>
  );
}
