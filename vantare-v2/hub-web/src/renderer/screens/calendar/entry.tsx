import {
  calendarDefaultAlerts,
  calendarSeriesLimit,
  calendarStartsLimit,
} from "../../../contract/generated/calendar";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { calendarText as text } from "../../i18n/calendar";
import { Button } from "../../ui/Button";
import { CalendarFrame } from "../../ui/CalendarFrame";
import { CalendarLiveView } from "../../ui/CalendarLiveView";
import { type CalendarHealth, CalendarRail } from "../../ui/CalendarRail";
import { CalendarUpcomingView } from "../../ui/CalendarUpcomingView";
import { weekLongTitle, weekTitle } from "../../ui/calendarDate";
import { useCalendarLauncher } from "./CalendarLauncher";
import { useCalendarPreferences } from "./CalendarPreferences";
import { useCalendar } from "./CalendarState";
import { publication } from "./schedule";

function nextPublication(now: number) {
  const date = new Date(now);
  date.setUTCHours(8, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7));
  if (date.getTime() <= now) date.setUTCDate(date.getUTCDate() + 7);
  return date.getTime();
}

export default function CalendarEntry() {
  const state = useCalendar(),
    preferences = useCalendarPreferences(state.allowed),
    launcher = useCalendarLauncher(state.allowed);
  const raw = state.view;
  const view = raw && {
    ...raw,
    utc: preferences.config?.utc ?? raw.utc,
    following: preferences.config?.following ?? raw.following,
  };
  const { schedule, previous } = view
    ? publication(view, state.now, calendarSeriesLimit)
    : { schedule: null, previous: null };
  const alerts = preferences.config?.alerts ?? {
    ...calendarDefaultAlerts,
    bands: [],
    slots: [],
    channels: { ...calendarDefaultAlerts.channels },
  };
  const health: CalendarHealth = !state.loaded
    ? "loading"
    : schedule
      ? !state.connected
        ? "offline"
        : !view?.official || Date.parse(view.official.validUntil) <= state.now
          ? "fallback"
          : "ok"
      : previous
        ? "expired"
        : "missing";
  const subtitle = schedule
    ? text.scheduleSubtitle(
        weekLongTitle(Date.parse(schedule.validFrom)),
        schedule.series.length,
        Math.round(
          schedule.series.reduce(
            (sum, series) =>
              sum +
              (series.recurrence.kind === "interval"
                ? 60 / series.recurrence.intervalMinutes
                : 0),
            0,
          ),
        ),
      )
    : previous
      ? text.expiredSubtitle(weekTitle(Date.parse(previous.validFrom), true))
      : state.loaded
        ? text.defaultSubtitle
        : text.loadingHelp;
  return (
    <>
      <SectionChrome
        title={text.section}
        tabs={[
          { id: "upcoming", etiqueta: text.upcoming, visible: state.allowed },
        ]}
        activeTab="upcoming"
        rail={
          state.allowed && view ? (
            <CalendarRail
              view={view}
              schedule={schedule ?? previous}
              health={health}
              now={state.now}
              alerts={alerts}
              limit={calendarStartsLimit}
              nextPublication={nextPublication(state.now)}
              onUtc={(utc) => void preferences.utc(utc)}
              utcDisabled={!preferences.canUtc}
            />
          ) : undefined
        }
      />
      <SectionPanel activeTab="upcoming">
        {!state.allowed ? (
          <p role="status">{text.noAccess}</p>
        ) : (
          <CalendarFrame
            subtitle={subtitle}
            count={alerts.bands.length + alerts.slots.length}
            busy={state.busy}
            onRefresh={() => void state.refresh()}
          >
            {state.failure && (
              <div role="alert">
                <p>{text.failed}</p>
                <Button onClick={() => void state.refresh()}>
                  {text.retry}
                </Button>
              </div>
            )}
            {view?.invalidCache && <p role="status">{text.corrupted}</p>}
            {preferences.failure && (
              <div role="alert">
                <p>
                  {preferences.failure === "calendarScheduleUnavailable"
                    ? text.scheduleRequired
                    : text.preferencesFailed}
                </p>
                <Button onClick={() => void preferences.retry()}>
                  {text.retry}
                </Button>
                <Button onClick={preferences.discard}>
                  {text.discardChange}
                </Button>
              </div>
            )}
            {launcher.failure && <p role="alert">{text.launchFailed}</p>}
            {!state.loaded && !view ? (
              <p role="status">{text.loading}</p>
            ) : schedule && view ? (
              <CalendarLiveView
                schedule={schedule}
                alerts={alerts}
                following={view.following}
                utc={view.utc}
                now={state.now}
                limit={calendarStartsLimit}
                profile={launcher.profile?.name}
                canLaunch={launcher.canLaunch}
                canFollow={preferences.canFollow}
                onFollow={(id, followed) =>
                  void preferences.follow(id, followed)
                }
                onLaunch={() => void launcher.launch()}
              />
            ) : (
              <CalendarUpcomingView
                previous={previous}
                utc={view?.utc ?? false}
                following={view?.following.length ?? 0}
                limit={calendarStartsLimit}
                notifyWeek={alerts.notifyWeek}
                notifyDisabled={!preferences.canNotifyWeek}
                onNotifyWeek={() =>
                  void preferences.notifyWeek(!alerts.notifyWeek)
                }
                onRefresh={() => void state.refresh()}
                busy={state.busy}
              />
            )}
          </CalendarFrame>
        )}
      </SectionPanel>
    </>
  );
}
