import { useLayoutEffect, useRef, useState } from "react";
import type {
  CalendarAlerts,
  CalendarSchedule,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarDayText as text } from "../i18n/calendarDay";
import { weekDates } from "../screens/calendar/grid";
import { alertAt, daily, nextStart } from "../screens/calendar/rows";
import { starts } from "../screens/calendar/schedule";
import { Button } from "./Button";
import { civilDay, clock, datePart, dayHours } from "./calendarDate";
import { Segmented } from "./Forms";
import "./calendar-day.css";
export function CalendarDayView({
  schedule,
  alerts,
  following,
  now,
  utc,
  limit,
  onSpan,
  onFull,
  onDetail,
}: {
  schedule: CalendarSchedule;
  alerts: CalendarAlerts;
  following: string[];
  now: number;
  utc: boolean;
  limit: number;
  onSpan: (span: string) => void;
  onFull: () => void;
  onDetail: (id: string, at: number) => void;
}) {
  const dates = weekDates(now, utc),
    today = dates.indexOf(civilDay(now, 0, utc));
  const [chosen, setSelected] = useState<number | null>(null),
    [filter, setFilter] = useState("all");
  const selected = chosen ?? Math.max(today, 0);
  const scroll = useRef<HTMLDivElement>(null);
  const scrolled = useRef("");
  const at = dates[selected],
    hours = dayHours(at, utc),
    until = civilDay(at, 1, utc);
  const rank = (tier: string) => {
    const n = ["beginner", "intermediate", "advanced"].indexOf(tier);
    return n < 0 ? 3 : n;
  };
  const series = schedule.series
    .filter((s) => filter !== "favorites" || following.includes(s.id))
    .sort(
      (a, b) =>
        Number(following.includes(b.id)) - Number(following.includes(a.id)) ||
        rank(a.tier) - rank(b.tier) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  const slots = series.map((s) => starts(schedule, s, at, until, limit)),
    next = series.map((s) => nextStart(schedule, s, now, limit));
  useLayoutEffect(() => {
    const key = `${at}:${utc}:${filter}`;
    if (!scroll.current || scrolled.current === key) return;
    scrolled.current = key;
    scroll.current.scrollTop =
      (selected === today
        ? Math.max(
            0,
            (utc ? new Date(now).getUTCHours() : new Date(now).getHours()) - 6,
          )
        : 5) * 30;
  }, [selected, today, utc, now, at, filter]);
  return (
    <section className="v-calendar-day">
      <header className="v-calendar-day-tools">
        <div className="v-calendar-day-dates">
          {dates.map((date, index) => (
            <button
              key={date}
              type="button"
              data-selected={selected === index || undefined}
              data-today={today === index || undefined}
              onClick={() => setSelected(index)}
            >
              <span>
                {index === today ? text.today : datePart(date, "weekday", utc)}
              </span>
              <strong>{datePart(date, "day", utc)}</strong>
            </button>
          ))}
        </div>
        <p>{text.count(slots.reduce((n, all) => n + all.length, 0))}</p>
        <Button variant="ghost" aria-label={text.full} onClick={onFull}>
          <Icon name="expand" />
        </Button>
        <Segmented
          label={text.calendar}
          value="day"
          onChange={onSpan}
          options={[
            { value: "day", label: text.day },
            { value: "week", label: text.week },
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
      {!series.length ? (
        <div className="v-calendar-day-empty">
          <Icon name="star-line" />
          <h2>{text.emptyTitle}</h2>
          <p>{text.emptyHelp}</p>
        </div>
      ) : (
        <>
          <div className="v-calendar-day-head">
            <div />
            {series.map((s) => (
              <div
                key={s.id}
                data-favorite={following.includes(s.id) || undefined}
              >
                <strong>{s.name}</strong>
                <span data-tier={s.tier}>
                  {s.eventKind === "special"
                    ? text.special
                    : (text.tiers[s.tier as keyof typeof text.tiers] ?? s.tier)}
                </span>
                <small>{s.track.split(" (")[0]}</small>
              </div>
            ))}
          </div>
          <div className="v-calendar-day-scroll" ref={scroll}>
            <div className="v-calendar-day-grid">
              {hours.map((h) => (
                <div
                  key={h.from}
                  className="v-calendar-day-hour"
                  data-past={h.until <= now || undefined}
                >
                  <strong
                    data-now={(now >= h.from && now < h.until) || undefined}
                  >{`${String(h.hour).padStart(2, "0")}h`}</strong>
                  {series.map((s, index) => (
                    <div key={s.id}>
                      {slots[index]
                        .filter((start) => start >= h.from && start < h.until)
                        .map((start) => (
                          <button
                            key={start}
                            type="button"
                            data-next={next[index] === start || undefined}
                            data-alert={
                              (!daily(s) &&
                                alertAt(schedule, s, start, alerts, limit)) ||
                              undefined
                            }
                            data-gone={start < now || undefined}
                            onClick={() => onDetail(s.id, start)}
                          >
                            {daily(s)
                              ? clock(start, utc).slice(-2)
                              : clock(start, utc)}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              ))}
              {selected === today && (
                <i
                  className="v-calendar-day-now"
                  style={{ top: `${((now - at) / 3600000) * 30}px` }}
                />
              )}
            </div>
          </div>
          <footer>
            <span>
              <code>{"15"}</code>
              {text.minute}
            </span>
            <span>
              <code className="v-calendar-day-next">{"00"}</code>
              {text.next}
            </span>
            <span>
              <i />
              {text.band}
            </span>
            <span>
              <code className="v-calendar-day-alert">{"22"}</code>
              {text.alert}
            </span>
            <p>{text.hint}</p>
          </footer>
        </>
      )}
    </section>
  );
}
