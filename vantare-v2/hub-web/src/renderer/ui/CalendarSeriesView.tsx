import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
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
import "../design/generated/calendar-tokens.css";
import "./calendar-layout.css";
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
  notice,
  rotation = [],
  runs = [],
  updated = 0,
  onBack,
  onMissing = onBack,
  onSeries,
  canFollow = false,
  canLaunch = false,
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
  notice?: ReactNode;
  rotation?: readonly { from: number; track: string }[];
  runs?: readonly CalendarRun[];
  updated?: number;
  onBack: () => void;
  onMissing?: () => void;
  onSeries: (id: string) => void;
  canFollow?: boolean;
  canLaunch?: boolean;
  onFollow?: (followed: boolean) => void;
  onLaunch?: () => void;
  onDetail?: (id: string, at: number) => void;
  onSlot?: (id: string, at: number) => void;
}) {
  const series = useMemo(
    () => schedule.series.find((s) => s.id === seriesId),
    [schedule, seriesId],
  );
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (seriesId) title.current?.focus({ preventScroll: true });
  }, [seriesId]);
  const compact = useSyncExternalStore(
    (notify) => {
      window.addEventListener("resize", notify);
      return () => window.removeEventListener("resize", notify);
    },
    () => window.innerWidth < 1400,
  );
  const from = Date.parse(schedule.validFrom),
    until = Date.parse(schedule.validUntil),
    today = civilDay(now, 0, utc);
  const all = useMemo(
    () => (series ? starts(schedule, series, from, until, limit) : []),
    [schedule, series, from, until, limit],
  );
  const groups = useMemo(() => slotGroups(all, today, utc), [all, today, utc]);
  const grid = useMemo(
    () =>
      weekDays(from, utc).map((day) => ({
        day,
        columns: hourColumns(day, utc),
      })),
    [from, utc],
  );
  if (!series)
    return (
      <div className="v-calendar-serie-missing">
        <h2>{text.missing}</h2>
        <p>{text.missingHelp}</p>
        <Button onClick={onMissing}>{text.back}</Button>
      </div>
    );
  const isDaily = daily(series),
    upcoming = all.filter((at) => at >= now);
  const first = upcoming[0],
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
    { from, track: series.track.split(" (")[0], current: true },
    { from: until, track: text.unpublished, current: false },
  ];
  return (
    <div className="v-calendar v-calendar-serie">
      {notice}
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
            <span
              className="v-calendar-tier"
              data-tier={series.eventKind === "special" ? "event" : series.tier}
            >
              {series.eventKind === "special"
                ? calendarText.specialty
                : (calendarText.tiers[
                    series.tier as keyof typeof calendarText.tiers
                  ] ?? series.tier)}
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
          <h2 ref={title} tabIndex={-1}>
            {series.name}
          </h2>
          <div>
            <strong>{series.track.split(" (")[0]}</strong>
            <span>{series.track.split(" (")[1]?.replace(/\)$/u, "")}</span>
            <span className="v-calendar-serie-classes">
              {(series.classes.length
                ? series.classes.map((item) => item.name)
                : [series.vehicleClass]
              ).map((name) => (
                <span key={name}>
                  <i
                    aria-hidden="true"
                    data-class={["Hypercar", "LMP2", "LMP3", "LMGT3", "GTE"]
                      .find((kind) => name.includes(kind))
                      ?.toLowerCase()}
                  />
                  {name.replace(" Class", "")}
                </span>
              ))}
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
            onChange={(id) => {
              if (
                id &&
                id !== seriesId &&
                schedule.series.some((series) => series.id === id)
              )
                onSeries(id);
            }}
          />
          <Button
            disabled={!canFollow || !onFollow}
            onClick={() => onFollow?.(!favorite)}
            data-followed={favorite || undefined}
          >
            <Icon name="star" />
            {favorite ? text.followed : text.favorite}
          </Button>
          <Button
            variant="primary"
            disabled={!profile || !canLaunch || !onLaunch}
            onClick={onLaunch}
          >
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
                <span>
                  {minutes.length ? text.minutes : text.everyMinutes(every)}
                </span>
                {minutes.map((m) => (
                  <b key={m}>{`:${String(m).padStart(2, "0")}`}</b>
                ))}
                {minutes.length > 0 && <span>{text.everyHour}</span>}
              </div>
              <div
                className="v-calendar-serie-map"
                role="img"
                aria-label={text.mapSummary(
                  series.name,
                  utc ? "UTC" : zoneLabel(now, true),
                )}
              >
                <div className="v-calendar-serie-map-row">
                  <span />
                  {hours.map((hour) => (
                    <small key={hour}>
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                    </small>
                  ))}
                </div>
                {grid.map(({ day, columns }) => (
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
                        {columns[hour].map((cell) => (
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
                {upcoming.slice(0, compact ? 9 : 12).map((at) => (
                  <Departure
                    key={at}
                    next={at === first}
                    alert={alertAt(schedule, series, at, alerts, limit)}
                    onClick={
                      onDetail ? () => onDetail(seriesId, at) : undefined
                    }
                  >
                    {alertAt(schedule, series, at, alerts, limit) && (
                      <Icon name="bell-fill" />
                    )}
                    {clock(at, utc)}
                  </Departure>
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
                      <Departure
                        key={at}
                        past={at < now}
                        alert={alertAt(schedule, series, at, alerts, limit)}
                        next={at === first}
                        onClick={
                          onSlot && at >= now
                            ? () => onSlot(seriesId, at)
                            : undefined
                        }
                      >
                        {clock(at, utc)}
                      </Departure>
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
                style={{
                  flexGrow:
                    i === 0
                      ? Math.max(4, practice)
                      : i === 2
                        ? Math.min(60, race)
                        : lead - practice,
                }}
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

function Departure({
  children,
  next,
  alert,
  past,
  onClick,
}: {
  children: ReactNode;
  next: boolean;
  alert: boolean;
  past?: boolean;
  onClick?: () => void;
}) {
  const attrs = {
    "data-next": next || undefined,
    "data-alert": alert || undefined,
    "data-past": past || undefined,
  };
  return onClick ? (
    <Button {...attrs} onClick={onClick}>
      {children}
    </Button>
  ) : (
    <span className="v-calendar-serie-info" {...attrs}>
      {children}
    </span>
  );
}
