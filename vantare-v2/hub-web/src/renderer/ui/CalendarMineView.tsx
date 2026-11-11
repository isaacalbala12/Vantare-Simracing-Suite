import { useState } from "react";
import type {
  CalendarAlerts,
  CalendarSchedule,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarMineText as text } from "../i18n/calendarMine";
import { days } from "../screens/calendar/days";
import { alertAt, nextRace, raceMinutes } from "../screens/calendar/rows";
import { Button } from "./Button";
import { civilDay, clock, datePart } from "./calendarDate";
import { Segmented } from "./Forms";
import "./calendar-mine.css";

export function CalendarMineView({
  schedule,
  alerts,
  following,
  now,
  utc,
  limit,
  onUpcoming,
  onSeries,
  onExport,
  onLaunch,
  onDetail,
  onAlert,
}: {
  schedule: CalendarSchedule;
  alerts: CalendarAlerts;
  following: string[];
  now: number;
  utc: boolean;
  limit: number;
  onUpcoming: () => void;
  onSeries: () => void;
  onExport: () => void;
  onLaunch: () => void;
  onDetail: (id: string, at: number) => void;
  onAlert: (id: string, at: number) => void;
}) {
  const [filter, setFilter] = useState("all");
  const hero = nextRace(schedule, now, following, limit);
  const groups = days(schedule, now, utc, following, alerts, limit)
    .map((day) => ({
      ...day,
      entries: day.entries.filter(
        (entry) =>
          filter !== "alerted" ||
          entry.kind === "band" ||
          entry.starts.some((at) =>
            alertAt(schedule, entry.series, at, alerts, limit),
          ),
      ),
    }))
    .filter((day) => day.entries.length);
  if (!following.length && !alerts.bands.length && !alerts.slots.length)
    return (
      <section className="v-calendar-mine-empty">
        <Icon name="star-line" />
        <h2>{text.emptyTitle}</h2>
        <p>{text.emptyHelp}</p>
        <div>
          <Button variant="primary" onClick={onSeries}>
            {text.seeSeries}
          </Button>
          <Button onClick={onUpcoming}>{text.seeUpcoming}</Button>
        </div>
      </section>
    );
  const bandHints = alerts.bands.map(
    (b) =>
      `${schedule.series.find((s) => s.id === b.seriesId)?.name ?? b.seriesId} ${String(Math.floor(b.from / 60)).padStart(2, "0")}:${String(b.from % 60).padStart(2, "0")}–${String(Math.floor(b.to / 60)).padStart(2, "0")}:${String(b.to % 60).padStart(2, "0")}`,
  );
  const stats = [
    {
      label: text.yourNext,
      value: hero ? clock(hero.at, utc) : "—",
      hint: hero
        ? `${hero.series.name} · ${text.inMinutes(Math.ceil((hero.at - now) / 60000))}`
        : text.nonePending,
    },
    {
      label: text.activeBands,
      value: String(alerts.bands.length),
      hint: bandHints.join(" · ") || "—",
    },
    { label: text.ran, value: text.none, hint: text.noRecordings },
    { label: text.calendar, value: ".ics", hint: text.download },
  ];
  let first = true;
  return (
    <div className="v-calendar-mine">
      <div className="v-calendar-mine-stats">
        {stats.map((stat) => (
          <section key={stat.label}>
            <h2>{stat.label}</h2>
            <strong>{stat.value}</strong>
            <p>{stat.hint}</p>
          </section>
        ))}
      </div>
      <section className="v-calendar-mine-list">
        <header>
          <h2 className="v-calendar-mine-header-title">{text.week}</h2>
          <p className="v-calendar-mine-header-caption">{text.subtitle}</p>
          <Segmented
            label={text.week}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: text.all },
              { value: "alerted", label: text.alerted },
            ]}
          />
          <Button onClick={onExport}>
            <Icon name="v-calendar" />
            {text.export}
          </Button>
        </header>
        <div className="v-calendar-mine-days">
          {groups.map((day) => (
            <section key={day.at}>
              <h3>
                {day.at === civilDay(now, 0, utc)
                  ? text.today
                  : day.at === civilDay(now, 1, utc)
                    ? text.tomorrow
                    : `${datePart(day.at, "weekday", utc)} ${datePart(day.at, "day", utc)}`}
                <span>{text.entries(day.entries.length)}</span>
              </h3>
              {day.entries.map((entry) => {
                const launch = first;
                first = false;
                const s = entry.series,
                  at = entry.starts[0];
                return (
                  <div className="v-calendar-mine-row" key={s.id}>
                    <div className="v-calendar-mine-at">
                      <strong>{clock(at, utc)}</strong>
                      {launch && (
                        <small>
                          {text.inMinutes(Math.ceil((at - now) / 60000))}
                        </small>
                      )}
                    </div>
                    <div className="v-calendar-mine-series" data-tier={s.tier}>
                      <strong>{s.name}</strong>
                      <p>
                        {s.track.split(" (")[0]}
                        {text.separator}
                        {text.race(raceMinutes(s))}
                      </p>
                    </div>
                    <div className="v-calendar-mine-slots">
                      {entry.kind === "band" ? (
                        <>
                          <span className="v-calendar-mine-band">
                            <Icon name="bell-fill" />
                            {text.bandLabel(
                              `${String(Math.floor(entry.from / 60)).padStart(2, "0")}:${String(entry.from % 60).padStart(2, "0")}`,
                              `${String(Math.floor(entry.to / 60)).padStart(2, "0")}:${String(entry.to % 60).padStart(2, "0")}`,
                            )}
                          </span>
                          <small>{text.departures(entry.starts.length)}</small>
                        </>
                      ) : (
                        <>
                          <span className="v-calendar-mine-favorite">
                            <Icon name="star" />
                            {text.favorite}
                          </span>
                          {entry.starts.map((time) => (
                            <button
                              key={time}
                              type="button"
                              data-alert={
                                alertAt(schedule, s, time, alerts, limit) ||
                                undefined
                              }
                              onClick={() => onDetail(s.id, time)}
                            >
                              {clock(time, utc)}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    {launch ? (
                      <Button variant="primary" onClick={onLaunch}>
                        <Icon name="play" />
                        {text.launch}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        aria-label={text.alert}
                        onClick={() => onAlert(s.id, at)}
                      >
                        <Icon name="clock" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={text.detail}
                      onClick={() => onDetail(s.id, at)}
                    >
                      <Icon name="info" />
                    </Button>
                  </div>
                );
              })}
            </section>
          ))}
          {!groups.length && (
            <p className="v-calendar-mine-no-departures">{text.noDepartures}</p>
          )}
        </div>
      </section>
    </div>
  );
}
