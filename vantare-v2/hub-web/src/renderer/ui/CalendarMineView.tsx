import { useState } from "react";
import type {
  CalendarAlerts,
  CalendarSchedule,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarMineText as text } from "../i18n/calendarMine";
import type { CalendarRun } from "../screens/calendar/CalendarRun";
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
  runs = [],
  canLaunch = true,
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
  runs?: readonly CalendarRun[];
  canLaunch?: boolean;
  onUpcoming: () => void;
  onSeries: () => void;
  onExport?: () => void;
  onLaunch: () => void;
  onDetail?: (id: string, at: number) => void;
  onAlert?: (id: string, at: number) => void;
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
  const date = new Date(now);
  const weekFrom = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - ((date.getUTCDay() + 5) % 7),
  );
  const ran = runs
    .filter((run) => run.at >= weekFrom)
    .sort((a, b) => b.at - a.at);
  const best = ran
    .filter((run) => run.bestLap !== null)
    .sort((a, b) =>
      (a.bestLap ?? "") < (b.bestLap ?? "")
        ? -1
        : (a.bestLap ?? "") > (b.bestLap ?? "")
          ? 1
          : 0,
    )[0];
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
    {
      label: text.ran,
      value: ran.length ? text.races(ran.length) : text.none,
      hint: best?.bestLap
        ? text.best(best.bestLap, best.circuit)
        : text.noRecordings,
    },
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
          <Button onClick={onExport} disabled={!onExport}>
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
                      {at - now < 6 * 60 * 60_000 && (
                        <small>
                          {text.inMinutes(Math.ceil((at - now) / 60000))}
                        </small>
                      )}
                    </div>
                    <div
                      className="v-calendar-mine-series"
                      data-tier={s.tier}
                      data-class={(
                        s.classes[0]?.name ?? s.vehicleClass
                      ).toLowerCase()}
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
                          <small>
                            {text.bandDepartures(
                              entry.starts.length,
                              s.recurrence.intervalMinutes,
                              clock(entry.starts[0], utc),
                              clock(
                                entry.starts.at(-1) ?? entry.starts[0],
                                utc,
                              ),
                            )}
                          </small>
                        </>
                      ) : entry.kind === "open" ? (
                        <>
                          <span className="v-calendar-mine-favorite">
                            <Icon name="star" />
                            {text.favoriteWithoutAlert}
                          </span>
                          <small>
                            {text.every(s.recurrence.intervalMinutes)}
                          </small>
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
                              disabled={!onDetail}
                              onClick={() => onDetail?.(s.id, time)}
                            >
                              {alertAt(schedule, s, time, alerts, limit) && (
                                <Icon name="bell-fill" />
                              )}
                              {clock(time, utc)}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    {launch ? (
                      <Button
                        variant="primary"
                        onClick={onLaunch}
                        disabled={!canLaunch}
                      >
                        <Icon name="play" />
                        {text.launch}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        aria-label={text.alert}
                        disabled={!onAlert}
                        onClick={() => onAlert?.(s.id, at)}
                      >
                        <Icon name="clock" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={text.detail}
                      disabled={!onDetail}
                      onClick={() => onDetail?.(s.id, at)}
                    >
                      <Icon name="info" />
                    </Button>
                  </div>
                );
              })}
            </section>
          ))}
          {filter !== "alerted" && ran.length > 0 && (
            <section>
              <h3>{text.alreadyRan}</h3>
              {ran.map((run) => (
                <div
                  key={`${run.seriesId}:${run.at}`}
                  className="v-calendar-mine-row v-calendar-mine-done"
                >
                  <div className="v-calendar-mine-at">
                    <strong>{clock(run.at, utc)}</strong>
                    <small>
                      {civilDay(run.at, 0, utc) === civilDay(now, -1, utc)
                        ? text.yesterday
                        : datePart(run.at, "weekday", utc)}
                    </small>
                  </div>
                  <div className="v-calendar-mine-series">
                    <strong>
                      {schedule.series.find((s) => s.id === run.seriesId)
                        ?.name ?? run.seriesId}
                    </strong>
                    <p>{text.fromTelemetry(run.circuit)}</p>
                  </div>
                  <span className="v-calendar-mine-result">
                    <Icon name="check" />
                    {text.runSummary(
                      run.position,
                      run.safetyTenths,
                      run.bestLap,
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={text.openSession}
                    disabled
                  >
                    <Icon name="right" />
                  </Button>
                </div>
              ))}
            </section>
          )}
          {!groups.length && ran.length === 0 && (
            <p className="v-calendar-mine-no-departures">{text.noDepartures}</p>
          )}
        </div>
      </section>
    </div>
  );
}
