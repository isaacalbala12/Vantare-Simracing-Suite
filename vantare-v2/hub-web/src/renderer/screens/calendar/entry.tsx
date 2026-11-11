import { useState } from "react";
import {
  calendarDefaultAlerts,
  calendarSeriesLimit,
  calendarStartsLimit,
} from "../../../contract/generated/calendar";
import { useHost } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { calendarText as text } from "../../i18n/calendar";
import { Button } from "../../ui/Button";
import { CalendarDayView } from "../../ui/CalendarDayView";
import { CalendarEventsView } from "../../ui/CalendarEventsView";
import { CalendarFrame } from "../../ui/CalendarFrame";
import { CalendarLiveView } from "../../ui/CalendarLiveView";
import { CalendarMineView } from "../../ui/CalendarMineView";
import { CalendarMonthView } from "../../ui/CalendarMonthView";
import { type CalendarHealth, CalendarRail } from "../../ui/CalendarRail";
import { CalendarUpcomingView } from "../../ui/CalendarUpcomingView";
import { CalendarWeekView } from "../../ui/CalendarWeekView";
import { weekLongTitle, weekTitle } from "../../ui/calendarDate";
import { useCalendarLauncher } from "./CalendarLauncher";
import { useCalendarPreferences } from "./CalendarPreferences";
import { useCalendarQARuns } from "./CalendarQARuns";
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
  const [activeTab, setActiveTab] = useState("upcoming");
  const [calendarSpan, setCalendarSpan] = useState("week");
  const state = useCalendar(),
    preferences = useCalendarPreferences(state.allowed),
    launcher = useCalendarLauncher(state.allowed);
  const { hello } = useHost();
  const runs = useCalendarQARuns(state.allowed && hello?.demo === true);
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
          { id: "mine", etiqueta: text.mine, visible: state.allowed },
          { id: "calendar", etiqueta: text.calendar, visible: state.allowed },
          {
            id: "events",
            etiqueta: text.eventsTab(
              schedule?.series.filter((s) => s.recurrence.kind !== "interval")
                .length ?? 0,
            ),
            visible: state.allowed,
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
      <SectionPanel activeTab={activeTab}>
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
            {(view?.invalidCache ||
              (preferences.config &&
                Object.values(preferences.config.documents).some(
                  (status) => status !== "ready",
                ))) && (
              <div role="status">
                <p>{text.corrupted}</p>
                <Button
                  onClick={() => void preferences.reload()}
                  disabled={preferences.busy}
                >
                  {text.retry}
                </Button>
              </div>
            )}
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
            ) : activeTab === "mine" && schedule && view ? (
              <CalendarMineView
                schedule={schedule}
                alerts={alerts}
                following={view.following}
                utc={view.utc}
                now={state.now}
                limit={calendarStartsLimit}
                runs={runs}
                canLaunch={launcher.canLaunch}
                onUpcoming={() => setActiveTab("upcoming")}
                onSeries={() => setActiveTab("calendar")}
                onLaunch={() => void launcher.launch()}
              />
            ) : activeTab === "events" && schedule && view ? (
              <CalendarEventsView
                schedule={schedule}
                alerts={alerts}
                following={view.following}
                now={state.now}
                utc={view.utc}
                limit={calendarStartsLimit}
                profile={launcher.profile?.name}
                canLaunch={launcher.canLaunch}
                canFollow={preferences.canFollow}
                onFollow={(id, followed) =>
                  void preferences.follow(id, followed)
                }
                onLaunch={() => void launcher.launch()}
              />
            ) : activeTab === "calendar" &&
              schedule &&
              view &&
              calendarSpan === "day" ? (
              <CalendarDayView
                spans={["day", "week", "month"]}
                schedule={schedule}
                alerts={alerts}
                following={view.following}
                now={state.now}
                utc={view.utc}
                limit={calendarStartsLimit}
                onSpan={setCalendarSpan}
              />
            ) : activeTab === "calendar" && view && calendarSpan === "month" ? (
              <CalendarMonthView
                view={{ ...view, official: schedule ?? view.official }}
                alerts={alerts}
                now={state.now}
                limit={calendarStartsLimit}
                runs={runs}
                onSpan={setCalendarSpan}
              />
            ) : activeTab === "calendar" && view ? (
              <CalendarWeekView
                onSpan={setCalendarSpan}
                spans={["day", "week", "month"]}
                view={{ ...view, official: schedule ?? view.official }}
                alerts={alerts}
                now={state.now}
                limit={calendarStartsLimit}
                canFollow={preferences.canFollow}
                onFollow={(id, followed) =>
                  void preferences.follow(id, followed)
                }
              />
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
