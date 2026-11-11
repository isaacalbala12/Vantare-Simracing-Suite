import type { ReactNode } from "react";
import type {
  CalendarAlerts,
  CalendarSchedule,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarSeriesText as text } from "../i18n/calendarSeries";
import { bandCovers } from "../screens/calendar/bands";
import {
  alertAt,
  daily,
  leadMinutes,
  raceMinutes,
} from "../screens/calendar/rows";
import { starts } from "../screens/calendar/schedule";
import {
  type CalendarRun,
  relativeDay,
  seriesHistory,
  seriesRules,
  slotGroups,
} from "../screens/calendar/series";
import { Button } from "./Button";
import {
  civilDay,
  clock,
  datePart,
  hourColumns,
  weekDays,
  weekTitle,
} from "./calendarDate";
import { zoneLabel } from "./calendarZone";
import { Select } from "./Forms";
import "./calendar-series.css";

const hours = Array.from({ length: 24 }, (_, hour) => hour);

function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="v-calendar-serie-heading">
      <h3>{title}</h3>
      {detail && <span>{detail}</span>}
    </div>
  );
}
export function CalendarSeriesView({
  schedule,
  seriesId,
  alerts,
  utc,
  now,
  limit,
  favorite,
  profile,
  backLabel,
  alertControls,
  rotation = [],
  runs = [],
  updated = 0,
  onBack,
  onSeries,
  onFollow,
  onLaunch,
  onDetail,
  onSlot,
}: {
  schedule: CalendarSchedule;
  seriesId: string;
  alerts: CalendarAlerts;
  utc: boolean;
  now: number;
  limit: number;
  favorite: boolean;
  profile?: string;
  backLabel: string;
  alertControls: ReactNode;
  rotation?: readonly { from: number; track: string }[];
  runs?: readonly CalendarRun[];
  updated?: number;
  onBack: () => void;
  onSeries: (id: string) => void;
  onFollow: (followed: boolean) => void;
  onLaunch: () => void;
  onDetail: (id: string, at: number) => void;
  onSlot: (id: string, at: number) => void;
}) {
  const series = schedule.series.find((s) => s.id === seriesId);
  if (!series)
    return (
      <div className="v-calendar-serie-missing">
        <h2>{text.missing}</h2>
        <p>{text.missingHelp}</p>
        <Button onClick={onBack}>{text.back}</Button>
      </div>
    );
  const from = Date.parse(schedule.validFrom),
    until = Date.parse(schedule.validUntil),
    isDaily = daily(series);
  const upcoming = starts(schedule, series, now, until, limit),
    all = starts(schedule, series, from, until, limit);
  const groups = slotGroups(all, now, utc);
  const first = upcoming[0] ?? all[0],
    band = alerts.bands.find((b) => b.seriesId === seriesId);
  const every = series.recurrence.intervalMinutes,
    minutes =
      every > 0 && every <= 60 && 60 % every === 0
        ? Array.from(
            { length: 60 / every },
            (_, i) =>
              i * every +
              (((series.startOffsetMinute % every) + every) % every),
          )
        : [];
  const practice =
      series.sessions.find((s) => s.name === "practice")?.durationMin ?? 3,
    lead = leadMinutes(series),
    race = raceMinutes(series);
  const history = seriesHistory(runs, seriesId, from, until);
  const weeks = [
    ...rotation
      .filter((w) => w.from < from)
      .sort((a, b) => a.from - b.from)
      .slice(-2)
      .map((w) => ({ ...w, current: false })),
    { from, track: series.track, current: true },
    { from: until, track: text.unpublished, current: false },
  ];
  return (
    <div className="v-calendar-serie">
      <header className="v-calendar-serie-header">
        <Button
          className="v-calendar-serie-back"
          variant="ghost"
          size="sm"
          onClick={onBack}
        >
          <Icon name="chevron-left" />
          {backLabel}
        </Button>
        <div className="v-calendar-serie-name">
          <div>
            <span className="v-calendar-tier" data-tier={series.tier}>
              {calendarText.tiers[
                series.tier as keyof typeof calendarText.tiers
              ] ?? series.tier}
            </span>
            <span>
              {isDaily
                ? text.daily(every)
                : series.eventKind === "special"
                  ? text.special
                  : groups.length
                    ? text.weeklyRange(
                        datePart(groups[0].day, "weekday", utc),
                        datePart(groups[groups.length - 1].day, "weekday", utc),
                      )
                    : text.weekly}
            </span>
          </div>
          <h2>{series.name}</h2>
          <div>
            <strong>{series.track.split(" (")[0]}</strong>
            <span>{series.track.split(" (")[1]?.replace(/\)$/u, "")}</span>
            <span>
              {series.classes.map((c) => c.name).join(" · ") ||
                series.vehicleClass}
            </span>
          </div>
        </div>
        <div className="v-calendar-serie-actions">
          <Select
            label={text.change}
            hideLabel
            value=""
            options={[
              { value: "", label: text.change },
              ...schedule.series.map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={onSeries}
          />
          <Button
            onClick={() => onFollow(!favorite)}
            data-followed={favorite || undefined}
          >
            <Icon name="star" />
            {favorite ? text.followed : text.favorite}
          </Button>
          <Button variant="primary" disabled={!profile} onClick={onLaunch}>
            <Icon name="play" />
            {calendarText.launch(profile ?? "—")}
          </Button>
        </div>
      </header>
      <div className="v-calendar-serie-columns">
        <section className="v-calendar-serie-card v-calendar-serie-outings">
          <Heading
            title={isDaily ? text.outings : text.slots}
            detail={`${isDaily ? "" : `${text.slotHint}${calendarText.separator}`}${utc ? "UTC" : zoneLabel(now, true)}`}
          />
          {isDaily ? (
            <>
              <div className="v-calendar-serie-minutes">
                <span>{text.minutes}</span>
                {minutes.map((m) => (
                  <b key={m}>{`:${String(m).padStart(2, "0")}`}</b>
                ))}
                <span>{text.everyHour}</span>
              </div>
              <div className="v-calendar-serie-map">
                <div className="v-calendar-serie-map-row">
                  <span />
                  {hours.map((hour) => (
                    <small key={hour}>
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                    </small>
                  ))}
                </div>
                {weekDays(from, utc).map((day) => (
                  <div
                    key={day}
                    className="v-calendar-serie-map-row"
                    data-today={civilDay(now, 0, utc) === day || undefined}
                  >
                    <span>
                      {civilDay(now, 0, utc) === day
                        ? text.today
                        : `${datePart(day, "weekday", utc)} ${datePart(day, "day", utc)}`}
                    </span>
                    {hours.map((hour) => (
                      <div
                        className="v-calendar-serie-map-hour"
                        key={`${day}-${hour}`}
                      >
                        {hourColumns(day, utc)[hour].map((cell) => (
                          <div
                            key={cell.from}
                            className="v-calendar-serie-map-cell"
                            data-past={cell.until <= now || undefined}
                            data-band={
                              (!!band && bandCovers(band, cell.from)) ||
                              undefined
                            }
                            data-current={
                              (now >= cell.from && now < cell.until) ||
                              undefined
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="v-calendar-serie-legend">
                <span>
                  <i data-past />
                  {text.past}
                </span>
                <span>
                  <i data-band />
                  {text.band}
                </span>
                <span>
                  <i data-current />
                  {text.now}
                </span>
              </div>
              <Heading title={text.next} />
              <div className="v-calendar-serie-chips">
                {upcoming.slice(0, 12).map((at) => (
                  <Button
                    key={at}
                    data-next={at === first || undefined}
                    data-alert={
                      alertAt(schedule, series, at, alerts, limit) || undefined
                    }
                    onClick={() => onDetail(seriesId, at)}
                  >
                    {alertAt(schedule, series, at, alerts, limit) && (
                      <Icon name="bell-fill" />
                    )}
                    {clock(at, utc)}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <div className="v-calendar-serie-fixed">
              {groups.map((group) => (
                <div key={group.day} className="v-calendar-serie-fixed-day">
                  <strong>{group.label}</strong>
                  <div>
                    {group.starts.map((at) => (
                      <Button
                        key={at}
                        data-past={at < now || undefined}
                        data-alert={
                          alertAt(schedule, series, at, alerts, limit) ||
                          undefined
                        }
                        data-next={at === first || undefined}
                        onClick={() => onSlot(seriesId, at)}
                      >
                        {clock(at, utc)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Heading
            title={text.phase}
            detail={
              first === undefined ? undefined : text.at(clock(first, utc))
            }
          />
          <div className="v-calendar-serie-phases">
            {[
              { name: text.practice, duration: practice },
              { name: text.qualifying, duration: lead - practice },
              { name: text.race, duration: race },
            ].map((phase, i) => (
              <div
                key={phase.name}
                style={{ flexGrow: Math.max(1, phase.duration) }}
                data-race={i === 2 || undefined}
              >
                <b>{phase.name}</b>
                <span>
                  {phase.duration}
                  {i === 2 ? " min" : "′"}
                </span>
              </div>
            ))}
          </div>
          {first !== undefined && (
            <div className="v-calendar-serie-phase-times">
              <span>
                {clock(first, utc)} {text.enter}
              </span>
              <span>
                {clock(first + lead * 60000, utc)} {text.race.toLowerCase()}
              </span>
              <span>
                {"~"}
                {clock(first + (lead + race) * 60000, utc)} {text.end}
              </span>
            </div>
          )}
          <Heading title={text.history} detail={text.local} />
          <div className="v-calendar-serie-facts">
            {[
              [text.week, history.count],
              [text.best, history.best],
              [text.mean, history.mean],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <footer>
            {series.source === "racecontrol" ? text.fallback : text.official}
            {calendarText.separator}
            {updated > 0 && (
              <>
                {text.updated(
                  relativeDay(civilDay(updated * 1000, 0, utc), now, utc),
                  clock(updated * 1000, utc),
                )}
                {calendarText.separator}
              </>
            )}
            {text.simulator}{" "}
            <strong>
              {text.multiplayer}
              {text.breadcrumb}
              {isDaily ? text.dailyRaces : text.events}
              {text.breadcrumb} {series.name}
            </strong>
          </footer>
        </section>
        <div className="v-calendar-serie-right">
          <section className="v-calendar-serie-card">
            <Heading title={text.alerts} />
            {isDaily ? (
              alertControls
            ) : (
              <div className="v-calendar-serie-slot-help">
                <Icon name="bell-fill" />
                <div>
                  <strong>
                    {text.slotCount(
                      alerts.slots.filter((s) => s.seriesId === seriesId)
                        .length,
                    )}
                  </strong>
                  <p>{text.slotHelp}</p>
                </div>
              </div>
            )}
          </section>
          <section className="v-calendar-serie-card">
            <Heading title={text.rules} />
            <dl className="v-calendar-serie-rules">
              {seriesRules(series).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="v-calendar-serie-card">
            <Heading title={text.rotation} />
            <div className="v-calendar-serie-rotation">
              {weeks.map((week) => (
                <div
                  key={week.from}
                  data-current={week.current || undefined}
                  data-future={week.from >= until || undefined}
                >
                  <small>{weekTitle(week.from, true)}</small>
                  <strong>{week.track}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
