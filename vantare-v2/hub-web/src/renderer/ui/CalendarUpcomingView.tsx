import type { CalendarSchedule } from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import { Button } from "./Button";
import { WeekBoard } from "./CalendarWeekBoard";
import { weekTitle } from "./calendarDate";
import { Switch } from "./Forms";
import "./calendar-layout.css";
export function CalendarUpcomingView({
  previous,
  utc,
  following,
  limit,
  notifyWeek,
  onNotifyWeek,
  onRefresh,
  busy,
}: {
  previous: CalendarSchedule | null;
  utc: boolean;
  following: number;
  limit: number;
  notifyWeek: boolean;
  onNotifyWeek: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  if (!previous)
    return (
      <section className="v-calendar-missing">
        <Icon name="wifi-off" />
        <h2>{text.missing}</h2>
        <p>{text.missingHelp}</p>
        <Button onClick={onRefresh} busy={busy}>
          {text.retry}
        </Button>
      </section>
    );
  const week = weekTitle(Date.parse(previous.validFrom), utc),
    next = weekTitle(Date.parse(previous.validUntil), utc);
  return (
    <div className="v-calendar-upcoming">
      <section className="v-calendar-expired">
        <div className="v-calendar-clock">
          <Icon name="clock" />
        </div>
        <div className="v-calendar-expired-copy">
          <h2>{text.expiredTitle(week, next)}</h2>
          <p>{text.expiredHelp(following)}</p>
        </div>
        <div className="v-calendar-expired-actions">
          <Button onClick={onRefresh} busy={busy}>
            {text.searchNow}
            <Icon name="refresh" />
          </Button>
          <div className="v-calendar-notify">
            <Switch
              label={text.notifyWeek}
              checked={notifyWeek}
              onCheckedChange={onNotifyWeek}
            />
          </div>
        </div>
      </section>
      <WeekBoard schedule={previous} utc={utc} limit={limit} />
    </div>
  );
}
