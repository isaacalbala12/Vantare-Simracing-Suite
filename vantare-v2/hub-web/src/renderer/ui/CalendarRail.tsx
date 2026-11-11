import type {
  CalendarAlerts,
  CalendarSchedule,
  CalendarView,
} from "../../contract/generated/calendar";
import { Icon, type IconName } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import { upcomingAlerts } from "../screens/calendar/rows";
import { Button } from "./Button";
import {
  civilDay,
  clock,
  datePart,
  weekLongTitle,
  weekTitle,
} from "./calendarDate";
import { zoneLabel } from "./calendarZone";
import { Segmented } from "./Forms";
import "../design/generated/calendar-tokens.css";
import "./calendar-layout.css";
export type CalendarHealth =
  | "ok"
  | "fallback"
  | "offline"
  | "expired"
  | "missing"
  | "loading";
function Caption({ name, icon }: { name: string; icon: IconName }) {
  return (
    <h2>
      <Icon name={icon} />
      {name}
    </h2>
  );
}
export function CalendarRail({
  view,
  schedule,
  health,
  now,
  alerts,
  limit,
  nextPublication,
  onUtc,
  utcDisabled = false,
  onAlerts,
  onExport,
}: {
  view: CalendarView;
  schedule: CalendarSchedule | null;
  health: CalendarHealth;
  now: number;
  alerts?: CalendarAlerts;
  limit: number;
  nextPublication: number;
  onUtc: (utc: boolean) => void;
  utcDisabled?: boolean;
  onAlerts?: () => void;
  onExport?: () => void;
}) {
  const labels: Record<CalendarHealth, string> = {
    ok: text.upToDate,
    fallback: text.backup,
    offline: text.offline,
    expired: text.waiting,
    missing: text.withoutSchedule,
    loading: text.loading,
  };
  const at = schedule
    ? Date.parse(
        health === "expired" ? schedule.validUntil : schedule.validFrom,
      )
    : now;
  const local = zoneLabel(now);
  const pending =
    schedule && alerts
      ? upcomingAlerts(schedule, now, alerts, limit).slice(0, 4)
      : [];
  const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const relative = (at: number) =>
    civilDay(at, 0, view.utc) === civilDay(now, 0, view.utc)
      ? text.today
      : civilDay(at, 0, view.utc) === civilDay(now, 1, view.utc)
        ? text.tomorrowRelative
        : `${datePart(at, "weekday", view.utc)} ${datePart(at, "day", view.utc)}`;
  const ago = (stamp: number) => {
    const minutes = Math.max(0, Math.floor((now - stamp) / 60000));
    return minutes === 0
      ? text.checkedNow
      : minutes < 60
        ? text.agoMinutes(minutes)
        : minutes < 1440
          ? text.agoHours(Math.floor(minutes / 60))
          : text.agoOnlyDays(Math.floor(minutes / 1440));
  };
  const updatedLabel =
    view.updated === 0
      ? text.never
      : civilDay(view.updated * 1000, 0, view.utc) ===
          civilDay(now, 0, view.utc)
        ? `${text.today} ${clock(view.updated * 1000, view.utc)}${text.separator}${ago(view.updated * 1000)}`
        : `${relative(view.updated * 1000)}${text.separator}${clock(view.updated * 1000, view.utc)}`;
  return (
    <div className="v-calendar-rail">
      <section>
        <div className="v-calendar-rail-heading">
          <Caption name={text.schedule} icon="clock" />
          <span className="v-calendar-status" data-health={health}>
            {labels[health]}
          </span>
        </div>
        <dl>
          <div>
            <dt>{text.week}</dt>
            <dd>
              {health === "expired" ? weekTitle(at, true) : weekLongTitle(at)}
              {health === "expired"
                ? `${text.separator}${text.notPublished}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>{text.source}</dt>
            <dd>{text.official}</dd>
          </div>
          <div>
            <dt>{text.updated}</dt>
            <dd>{updatedLabel}</dd>
          </div>
          <div>
            <dt>{health === "expired" ? text.checked : text.nextWeek}</dt>
            <dd>
              {health === "expired"
                ? `${view.checked ? ago(view.checked * 1000) : text.never}${text.pollSuffix}`
                : text.approximate(
                    `${datePart(nextPublication, "weekday", view.utc)} ${datePart(nextPublication, "day", view.utc)} ${datePart(nextPublication, "month", view.utc)}`,
                  )}
            </dd>
          </div>
          <div>
            <dt>{text.hours}</dt>
            <dd>
              <Segmented
                disabled={utcDisabled}
                label={text.hours}
                value={view.utc ? "utc" : "local"}
                onChange={(value) => onUtc(value === "utc")}
                options={[
                  { value: "local", label: local },
                  { value: "utc", label: text.utc },
                ]}
              />
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <div className="v-calendar-rail-heading">
          <Caption name={text.yours} icon="bell" />
          <span>{alerts ? text.leadBefore(alerts.leadMin) : text.before}</span>
        </div>
        {pending.length ? (
          pending.map((item) => (
            <div
              className="v-calendar-alert-item"
              key={`${item.series.id}:${item.at}`}
            >
              <i
                data-class={
                  item.series.classes[0]?.name ?? item.series.vehicleClass
                }
              />
              <div>
                <strong>{item.series.name}</strong>
                <span>
                  {item.band
                    ? text.bandRange(
                        hhmm(item.band.from),
                        hhmm(item.band.to),
                        item.band.mode === "each",
                      )
                    : item.series.track.split(" (")[0]}
                </span>
              </div>
              <div>
                <b>{clock(item.at, view.utc)}</b>
                <span>{item.band ? text.nextAlert : relative(item.at)}</span>
              </div>
            </div>
          ))
        ) : (
          <p>
            {schedule &&
            !view.following.length &&
            alerts &&
            !alerts.bands.length &&
            !alerts.slots.length
              ? text.noAlertsYet
              : text.noAlerts}
          </p>
        )}
        <Button onClick={onAlerts} disabled={!onAlerts}>
          <Icon name="v-sliders" />
          {text.configure}
        </Button>
      </section>
      <section>
        <Caption name={text.inCalendar} icon="v-calendar" />
        <p>{text.exportHelp}</p>
        <div className="v-calendar-export-providers">
          {[text.google, text.apple, text.outlook].map((provider) => (
            <Button key={provider} onClick={onExport} disabled={!onExport}>
              {provider}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
