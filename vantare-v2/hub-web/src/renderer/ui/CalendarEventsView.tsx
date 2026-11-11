import type {
  CalendarAlerts,
  CalendarSchedule,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarEventsText as text } from "../i18n/calendarEvents";
import { calendarEvents, eventDays, raceDay } from "../screens/calendar/events";
import { raceMinutes } from "../screens/calendar/rows";
import { Button } from "./Button";
import { civilDay, clock, datePart } from "./calendarDate";
import { zoneLabel } from "./calendarZone";
import "./calendar-events.css";
export function CalendarEventsView({
  schedule,
  alerts,
  following,
  now,
  utc,
  limit,
  profile,
  canLaunch = true,
  canFollow = true,
  onFollow,
  onSerie,
  onDetail,
  onToggleSlot,
  onLaunch,
  onExport,
}: {
  schedule: CalendarSchedule;
  alerts: CalendarAlerts;
  following: string[];
  now: number;
  utc: boolean;
  limit: number;
  profile?: string;
  canLaunch?: boolean;
  canFollow?: boolean;
  onFollow: (id: string, followed: boolean) => void;
  onSerie?: (id: string) => void;
  onDetail?: (id: string) => void;
  onToggleSlot?: (id: string, at: number) => void;
  onLaunch: () => void;
  onExport?: () => void;
}) {
  const events = calendarEvents(schedule, now, limit),
    today = civilDay(now, 0, utc),
    tomorrow = civilDay(now, 1, utc);
  if (!events.length)
    return (
      <section className="v-calendar-events-empty">
        <Icon name="star-line" />
        <h2>{text.empty}</h2>
        <p>{text.emptyHelp}</p>
      </section>
    );
  const dayLabel = (day: number) =>
    day === today
      ? text.today
      : day === tomorrow
        ? text.tomorrow
        : `${datePart(day, "weekday", utc)} ${datePart(day, "day", utc)}`;
  return (
    <div className="v-calendar-events">
      {events.map(({ series, next }) => {
        const special = series.eventKind === "special",
          favorite = following.includes(series.id),
          groups = eventDays(schedule, series, now, utc, limit),
          first = groups[0]?.day,
          last = groups.at(-1)?.day;
        const facts = [
          {
            label: text.format,
            value: series.format === "team" ? text.team : text.individual,
          },
          {
            label: text.race,
            value: calendarText.minutes(raceMinutes(series)),
          },
          {
            label: text.safety,
            value: series.safetyRating
              ? special
                ? series.safetyRating.replace("Player SR ", "SR ")
                : series.safetyRating
              : "—",
          },
          {
            label: text.splits,
            value: series.splits === null ? "—" : text.upTo(series.splits),
          },
        ];
        return (
          <article key={series.id} aria-label={series.name}>
            <div className="v-calendar-event-poster">
              <i aria-hidden="true">
                {special ? text.specialMark : text.wecMark}
              </i>
              <div className="v-calendar-event-range">
                <b>
                  {special ? calendarText.specialty : calendarText.tiers.weekly}
                </b>
                {first !== undefined && last !== undefined && (
                  <span>{`${datePart(first, "weekday", utc)} ${datePart(first, "day", utc)}${text.arrow}${datePart(last, "weekday", utc)} ${datePart(last, "day", utc)} ${datePart(last, "month", utc)}`}</span>
                )}
              </div>
              <h2>
                <button
                  className="v-calendar-event-title"
                  type="button"
                  disabled={!onSerie}
                  onClick={() => onSerie?.(series.id)}
                >
                  {series.name}
                </button>
              </h2>
              <p>
                <strong className="v-calendar-event-track-name">
                  {series.track.split(" (")[0]}
                </strong>
                {series.track.includes(" (") && (
                  <span>{series.track.split(" (")[1].replace(/\)$/u, "")}</span>
                )}
              </p>
              <div className="v-calendar-event-classes">
                {(series.classes.length
                  ? series.classes.map((c) => c.name)
                  : [series.vehicleClass]
                ).map((name) => (
                  <span key={name}>
                    <i data-class={name} />
                    {name}
                  </span>
                ))}
              </div>
              <div className="v-calendar-event-favorite">
                <Button
                  data-selected={favorite || undefined}
                  disabled={!canFollow}
                  onClick={() => onFollow(series.id, !favorite)}
                >
                  <Icon name={favorite ? "star" : "star-line"} />
                  {favorite ? text.inFavorites : text.favorite}
                </Button>
                {next === undefined ? (
                  <span>{text.finished}</span>
                ) : (
                  <span>
                    {text.next}
                    <b>{`${dayLabel(raceDay(next, utc)).toLowerCase()} ${clock(next, utc)}`}</b>
                    {text.separator}
                    {text.inMinutes(Math.ceil((next - now) / 60000))}
                  </span>
                )}
              </div>
            </div>
            <div className="v-calendar-event-detail">
              <header>
                <h3>{special ? text.choose : text.weekSlots}</h3>
                <p className="v-calendar-event-hint">
                  {text.hint(utc ? calendarText.utc : zoneLabel(now, true))}
                </p>
              </header>
              <div className="v-calendar-event-days">
                {groups.map((group) => (
                  <div className="v-calendar-event-day" key={group.day}>
                    <strong>{dayLabel(group.day)}</strong>
                    <div>
                      {group.hidden > 0 && (
                        <span className="v-calendar-event-gone">
                          {text.gone(group.hidden)}
                        </span>
                      )}
                      {group.slots.map((at) => {
                        const alerted = alerts.slots.some(
                          (slot) =>
                            slot.seriesId === series.id &&
                            slot.at * 1000 === at,
                        );
                        return (
                          <button
                            type="button"
                            key={at}
                            data-gone={at < now || undefined}
                            data-next={at === next || undefined}
                            data-alert={alerted || undefined}
                            aria-pressed={alerted}
                            disabled={!onToggleSlot}
                            onClick={() => onToggleSlot?.(series.id, at)}
                          >
                            {alerted && (
                              <span className="v-calendar-event-slot-icon">
                                <Icon name="bell-fill" />
                              </span>
                            )}
                            <b>{clock(at, utc)}</b>
                            {at === next && <small>{text.nextTag}</small>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="v-calendar-event-facts">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>
              {series.notes.some((note) => note.includes("tracerudp")) && (
                <div className="v-calendar-event-udp">
                  <Icon name="warn" />
                  <p>{text.udpRequired}</p>
                </div>
              )}
              <footer>
                <Button
                  variant="primary"
                  disabled={!profile || !canLaunch}
                  onClick={onLaunch}
                >
                  <Icon name="play" />
                  {text.launch(
                    profile
                      ? Array.from(profile).slice(0, 18).join("") +
                          (Array.from(profile).length > 18 ? "…" : "")
                      : "LMU",
                  )}
                </Button>
                <Button onClick={onExport} disabled={!onExport}>
                  <Icon name="v-calendar" />
                  {text.export}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!onDetail}
                  onClick={() => onDetail?.(series.id)}
                >
                  <Icon name="info" />
                  {text.detail}
                </Button>
              </footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}
