import type {
  CalendarSchedule,
  CalendarView,
} from "../../contract/generated/calendar";
import { Icon, type IconName } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import { Button } from "./Button";
import { elapsedDays, weekTitle } from "./calendarDate";
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
  onUtc,
  onAlerts,
  onExport,
}: {
  view: CalendarView;
  schedule: CalendarSchedule | null;
  health: CalendarHealth;
  now: number;
  onUtc: (utc: boolean) => void;
  onAlerts: () => void;
  onExport: () => void;
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
              {weekTitle(at, view.utc)}
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
            <dd>
              {view.updated
                ? text
                    .agoDays(elapsedDays(view.updated * 1000, now))
                    .split(text.separator)[0]
                : text.never}
            </dd>
          </div>
          <div>
            <dt>{text.checked}</dt>
            <dd>{text.agoDays(elapsedDays(view.checked * 1000, now))}</dd>
          </div>
          <div>
            <dt>{text.hours}</dt>
            <dd>
              <Segmented
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
          <span>{text.before}</span>
        </div>
        <p>{text.noAlerts}</p>
        <Button onClick={onAlerts}>
          <Icon name="v-sliders" />
          {text.configure}
        </Button>
      </section>
      <section>
        <Caption name={text.inCalendar} icon="v-calendar" />
        <p>{text.exportHelp}</p>
        <div className="v-calendar-export-providers">
          {[text.google, text.apple, text.outlook].map((provider) => (
            <Button key={provider} onClick={onExport}>
              {provider}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
