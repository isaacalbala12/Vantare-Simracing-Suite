import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useState } from "react";
import type {
  CalendarAlerts,
  CalendarSeries,
  CalendarView,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarWeekText as text } from "../i18n/calendarWeek";
import { bandSegments, weekDates } from "../screens/calendar/grid";
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
  spans = ["week"],
  canFollow = true,
  onFull,
  onFollow,
  onDetail,
}: {
  view: CalendarView;
  alerts: CalendarAlerts;
  now: number;
  limit: number;
  onSpan?: (span: string) => void;
  spans?: readonly string[];
  canFollow?: boolean;
  onFull?: () => void;
  onFollow: (id: string, followed: boolean) => void;
  onDetail?: (id: string, at?: number) => void;
}) {
  const [full, setFull] = useState(false);
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
  const rangeFrom = Math.max(
    dates[0],
    schedule ? Date.parse(schedule.validFrom) : dates[0],
  );
  const rangeUntil = Math.min(
    end,
    schedule ? Date.parse(schedule.validUntil) : end,
  );
  const rangeMs = Math.max(1, rangeUntil - rangeFrom);
  const identity = (s: CalendarSeries) => (
    <div className="v-calendar-week-live-identity">
      <Button
        variant="ghost"
        aria-label={text.favorite(s.name)}
        disabled={!canFollow}
        onClick={() => onFollow(s.id, !view.following.includes(s.id))}
      >
        <Icon name={view.following.includes(s.id) ? "star" : "star-line"} />
      </Button>
      <button
        type="button"
        disabled={!onDetail}
        onClick={() => onDetail?.(s.id)}
      >
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
  const body = (
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
        <Button
          variant="ghost"
          className="v-calendar-week-full-toggle"
          aria-label={text.full}
          aria-pressed={full}
          onClick={() => {
            setFull(!full);
            onFull?.();
          }}
        >
          <Icon name="expand" />
        </Button>
        <Segmented
          label={text.calendar}
          value="week"
          onChange={(span) => onSpan?.(span)}
          options={[
            {
              value: "day",
              label: text.day,
              disabled: !onSpan || !spans.includes("day"),
            },
            { value: "week", label: text.weekTab },
            {
              value: "month",
              label: text.month,
              disabled: !onSpan || !spans.includes("month"),
            },
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
                <div
                  className="v-calendar-week-live-event"
                  data-favorite={view.following.includes(s.id) || undefined}
                  key={s.id}
                >
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
                        <div
                          className="v-calendar-event-track"
                          hidden={slots.length === 0}
                        >
                          {slots.map((slot) => (
                            <i
                              key={slot}
                              data-gone={slot < now || undefined}
                              data-highlight={
                                slot === next ||
                                alertAt(schedule, s, slot, alerts, limit) ||
                                undefined
                              }
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
                            disabled={!onDetail}
                            onClick={() => onDetail?.(s.id, chosen)}
                          >
                            {alertAt(schedule, s, chosen, alerts, limit) && (
                              <Icon name="bell-fill" />
                            )}
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
            {series
              .filter(daily)
              .sort((a, b) => {
                const tiers = ["beginner", "intermediate", "advanced"];
                const rank = (s: CalendarSeries) =>
                  tiers.includes(s.tier) ? tiers.indexOf(s.tier) : 3;
                return (
                  rank(a) - rank(b) ||
                  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
                );
              })
              .map((s) => {
                const next = nextStart(schedule, s, now, limit);
                return (
                  <div
                    className="v-calendar-week-live-daily"
                    data-favorite={view.following.includes(s.id) || undefined}
                    key={s.id}
                  >
                    {identity(s)}
                    <div
                      className="v-calendar-week-daily-days"
                      aria-hidden="true"
                    >
                      {dates.map((at) => (
                        <span key={at} data-today={at === today || undefined} />
                      ))}
                    </div>
                    <button
                      type="button"
                      style={{
                        flex: "none",
                        marginLeft: `calc((100% - 240px) * ${(rangeFrom - dates[0]) / (end - dates[0])})`,
                        width: `calc((100% - 240px) * ${(rangeUntil - rangeFrom) / (end - dates[0])})`,
                      }}
                      disabled={!onDetail}
                      onClick={() => onDetail?.(s.id, next)}
                    >
                      {alerts.bands
                        .filter((band) => band.seriesId === s.id)
                        .slice(0, 1)
                        .flatMap((band) => bandSegments(dates, band, view.utc))
                        .map((segment) => ({
                          from: Math.max(segment.from, rangeFrom),
                          until: Math.min(segment.until, rangeUntil),
                        }))
                        .filter((segment) => segment.until > segment.from)
                        .map((segment) => (
                          <span
                            key={segment.from}
                            className="v-calendar-week-band"
                            style={{
                              left: `${(100 * (segment.from - rangeFrom)) / rangeMs}%`,
                              width: `${(100 * (segment.until - segment.from)) / rangeMs}%`,
                            }}
                          />
                        ))}
                      <span
                        className="v-calendar-week-live-past"
                        style={{
                          width: `${Math.max(0, Math.min(100, (100 * (now - rangeFrom)) / rangeMs))}%`,
                        }}
                      />
                      {next !== undefined && view.following.includes(s.id) && (
                        <b
                          style={{
                            left: `${(100 * (next - rangeFrom)) / rangeMs}%`,
                          }}
                        >
                          {alertAt(schedule, s, next, alerts, limit) && (
                            <Icon name="bell-fill" />
                          )}
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
            <span>
              <b className="v-calendar-week-legend-time">
                {text.legendDeparture}
              </b>
              {text.nextDeparture}
            </span>
            <span>
              <b className="v-calendar-week-legend-time">
                <Icon name="bell-fill" />
                {text.legendAlert}
              </b>
              {text.alert}
            </span>
            <span>
              <i className="v-calendar-week-legend-band" />
              {text.band}
            </span>
            <span>
              <i className="v-calendar-week-legend-now" />
              {text.now}
            </span>
            <p>{text.hint}</p>
          </footer>
        </>
      )}
    </section>
  );
  return (
    <BaseDialog.Root open={full} onOpenChange={setFull}>
      {full ? (
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="v-calendar-week-full-backdrop" />
          <BaseDialog.Popup className="v-calendar v-calendar-week-full">
            <BaseDialog.Title className="v-sr-only">
              {text.calendar}
            </BaseDialog.Title>
            {body}
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      ) : (
        body
      )}
    </BaseDialog.Root>
  );
}
