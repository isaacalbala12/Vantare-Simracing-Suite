import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isCalendarAlerts } from "../../../contract/calendar-config-validation";
import {
  calendarAlertLeads,
  calendarBandModes,
  calendarDayMinutes,
  calendarDays,
  calendarDefaultAlerts,
  calendarSeriesLimit,
  calendarStartsLimit,
} from "../../../contract/generated/calendar";
import { useHost } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { calendarText as text } from "../../i18n/calendar";
import { Button } from "../../ui/Button";
import { CalendarAlertsDialog } from "../../ui/CalendarAlertsDialog";
import { CalendarBandControls } from "../../ui/CalendarBandControls";
import { CalendarDayView } from "../../ui/CalendarDayView";
import { CalendarDetail } from "../../ui/CalendarDetail";
import { CalendarEventsView } from "../../ui/CalendarEventsView";
import { CalendarFrame } from "../../ui/CalendarFrame";
import { CalendarIcsDialog } from "../../ui/CalendarIcsDialog";
import {
  type CalendarLiveFilters,
  CalendarLiveView,
} from "../../ui/CalendarLiveView";
import { CalendarMineView } from "../../ui/CalendarMineView";
import { CalendarMonthView } from "../../ui/CalendarMonthView";
import { CalendarPreferencesFailure } from "../../ui/CalendarPreferencesFailure";
import { type CalendarHealth, CalendarRail } from "../../ui/CalendarRail";
import { CalendarSeriesView } from "../../ui/CalendarSeriesView";
import { CalendarUpcomingView } from "../../ui/CalendarUpcomingView";
import {
  type CalendarWeekState,
  CalendarWeekView,
} from "../../ui/CalendarWeekView";
import { weekLongTitle, weekTitle } from "../../ui/calendarDate";
import { useCalendarHistory } from "./CalendarHistory";
import { useCalendarIcs } from "./CalendarIcsState";
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
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsOrigin = useRef<HTMLElement | null>(null);
  const openAlerts = () => {
    alertsOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAlertsOpen(true);
  };
  const returnAlertsFocus = () =>
    alertsOrigin.current?.isConnected ? alertsOrigin.current : false;
  const [activeTab, setActiveTab] = useState("upcoming");
  const [calendarSpan, setCalendarSpan] = useState("week");
  const liveFilters = useRef<CalendarLiveFilters>({
    searchOpen: false,
    query: "",
    tier: "all",
    only: "all",
    vehicle: "all",
  });
  const weekState = useRef<CalendarWeekState>({ offset: 0, filter: "all" });
  const rememberLive = useCallback((filters: CalendarLiveFilters) => {
    liveFilters.current = filters;
  }, []);
  const rememberWeek = useCallback((value: CalendarWeekState) => {
    weekState.current = value;
  }, []);
  const [selectedSerie, setSelectedSerie] = useState<string>();
  const [detail, setDetail] = useState<{ id: string; at?: number }>();
  const detailOrigin = useRef<HTMLElement | null>(null);
  const openDetail = (id: string, at?: number) => {
    detailOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDetail({ id, at });
  };
  const returnDetailFocus = () =>
    detailOrigin.current?.isConnected ? detailOrigin.current : false;
  const closeDetail = useCallback(() => {
    setDetail(undefined);
    const target = detailOrigin.current?.isConnected
      ? detailOrigin.current
      : document.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]',
        );
    target?.focus({ preventScroll: true });
  }, []);
  const origin = useRef<
    { id: string; element: HTMLElement | null } | undefined
  >(undefined);
  const openSerie = (id: string) => {
    if (!selectedSerie)
      origin.current = {
        id,
        element:
          document.activeElement instanceof HTMLElement &&
          document.activeElement.dataset.calendarSeries === id
            ? document.activeElement
            : null,
      };
    setSelectedSerie(id);
  };
  useLayoutEffect(() => {
    if (selectedSerie || !origin.current) return;
    const previous = origin.current;
    origin.current = undefined;
    const target = previous.element?.isConnected
      ? previous.element
      : [
          ...document.querySelectorAll<HTMLElement>("[data-calendar-series]"),
        ].find((node) => node.dataset.calendarSeries === previous.id);
    (
      target ??
      document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    )?.focus({ preventScroll: true });
  }, [selectedSerie]);

  const [icsOpen, setIcsOpen] = useState(false);
  const state = useCalendar(),
    preferences = useCalendarPreferences(state.allowed),
    launcher = useCalendarLauncher(state.allowed);
  const ics = useCalendarIcs(icsOpen, state.allowed);
  useEffect(() => {
    if (!state.allowed) {
      setAlertsOpen(false);
      setIcsOpen(false);
      setSelectedSerie(undefined);
      setDetail(undefined);
      liveFilters.current = {
        searchOpen: false,
        query: "",
        tier: "all",
        only: "all",
        vehicle: "all",
      };
      weekState.current = { offset: 0, filter: "all" };
    }
  }, [state.allowed]);
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
  useEffect(() => {
    if (!schedule && detail) closeDetail();
  }, [schedule, detail, closeDetail]);
  const alerts = preferences.config?.alerts ?? {
    ...calendarDefaultAlerts,
    bands: [],
    slots: [],
    channels: { ...calendarDefaultAlerts.channels },
  };
  const alertsState =
    preferences.config?.documents.alerts ??
    (preferences.failure ? "unavailable" : "loading");
  const alertsValid = isCalendarAlerts(alerts);
  const preferencesFailure = preferences.failure ? (
    <CalendarPreferencesFailure
      failure={preferences.failure}
      canRetry={preferences.canRetry}
      onRetry={() => void preferences.retry()}
      onDiscard={preferences.discard}
    />
  ) : undefined;
  const toggleSlot = preferences.canAlerts
    ? (id: string, at: number) =>
        void preferences.alert({
          kind: "slot",
          id,
          at: Math.trunc(at / 1000),
          enabled: !alerts.slots.some(
            (slot) => slot.seriesId === id && slot.at * 1000 === at,
          ),
        })
    : undefined;
  const history = useCalendarHistory(
    state.allowed && !!selectedSerie,
    schedule?.validFrom ?? "",
  );
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
        onTabChange={(tab) => {
          setSelectedSerie(undefined);
          setActiveTab(tab);
        }}
        rail={
          selectedSerie && state.allowed && schedule && view ? (
            false
          ) : state.allowed && view ? (
            <CalendarRail
              view={view}
              schedule={schedule ?? previous}
              health={health}
              now={state.now}
              alerts={alerts}
              alertsState={alertsState}
              limit={calendarStartsLimit}
              nextPublication={nextPublication(state.now)}
              onAlerts={openAlerts}
              onUtc={(utc) => void preferences.utc(utc)}
              utcDisabled={!preferences.canUtc}
              onExport={() => setIcsOpen(true)}
            />
          ) : undefined
        }
      />
      <SectionPanel activeTab={activeTab}>
        {!state.allowed ? (
          <p role="status">{text.noAccess}</p>
        ) : selectedSerie && schedule && view ? (
          <CalendarSeriesView
            alertsBusy={preferences.busy}
            alertsState={alertsState}
            alertsValid={alertsValid}
            onDetail={openDetail}
            schedule={schedule}
            seriesId={selectedSerie}
            alerts={alerts}
            utc={view.utc}
            now={state.now}
            limit={calendarStartsLimit}
            favorite={view.following.includes(selectedSerie)}
            profile={launcher.profile?.name}
            updated={Math.max(view.updated, view.checked)}
            runs={runs}
            rotation={(history.view?.weeks ?? []).flatMap((week) =>
              week.tracks
                .filter((track) => track.seriesId === selectedSerie)
                .map((track) => ({
                  from: week.from * 1000,
                  track: track.track,
                })),
            )}
            backLabel={
              activeTab === "events"
                ? text.eventsTab(0)
                : activeTab === "calendar"
                  ? text.calendar
                  : text.upcoming
            }
            onBack={() => setSelectedSerie(undefined)}
            onMissing={() => {
              setActiveTab("upcoming");
              setSelectedSerie(undefined);
            }}
            onSeries={openSerie}
            onSlot={toggleSlot}
            canFollow={preferences.canFollow}
            canLaunch={launcher.canLaunch}
            onFollow={(followed) =>
              void preferences.follow(selectedSerie, followed)
            }
            onLaunch={() => void launcher.launch()}
            notice={
              <>
                {(history.failure || history.view?.invalidCache) && (
                  <div role="alert">
                    <p>{history.failure ? text.failed : text.corrupted}</p>
                    <Button onClick={history.reload}>{text.retry}</Button>
                  </div>
                )}
                {preferencesFailure}
                {launcher.failure && <p role="alert">{text.launchFailed}</p>}
              </>
            }
            alertControls={
              <CalendarBandControls
                seriesId={selectedSerie}
                band={alerts.bands.find(
                  (band) => band.seriesId === selectedSerie,
                )}
                defaultBand={{
                  seriesId: selectedSerie,
                  from: 1200,
                  to: 1380,
                  days: "all",
                  mode: "each",
                }}
                every={
                  schedule.series.find((series) => series.id === selectedSerie)
                    ?.recurrence.intervalMinutes ?? 15
                }
                lead={alerts.leadMin}
                leads={calendarAlertLeads.slice(0, 3)}
                days={calendarDays}
                modes={calendarBandModes}
                stepMinutes={30}
                dayMinutes={calendarDayMinutes}
                onBand={
                  preferences.canAlerts
                    ? (value) => void preferences.band(selectedSerie, value)
                    : undefined
                }
                onLead={
                  preferences.canAlerts
                    ? (value) => void preferences.alert({ kind: "lead", value })
                    : undefined
                }
                busy={preferences.busy}
                valid={alertsValid}
              />
            }
          />
        ) : (
          <CalendarFrame
            onAlerts={openAlerts}
            subtitle={subtitle}
            count={alerts.bands.length + alerts.slots.length}
            busy={state.busy}
            onExport={() => setIcsOpen(true)}
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
            {preferencesFailure}
            {launcher.failure && <p role="alert">{text.launchFailed}</p>}
            {!state.loaded && !view ? (
              <p role="status">{text.loading}</p>
            ) : activeTab === "mine" && schedule && view ? (
              <CalendarMineView
                onDetail={openDetail}
                onExport={() => setIcsOpen(true)}
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
                alertsBusy={preferences.busy}
                onExport={() => setIcsOpen(true)}
                onSerie={openSerie}
                onToggleSlot={toggleSlot}
                onDetail={openDetail}
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
                onDetail={openDetail}
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
                onDetail={openDetail}
                spans={["day", "week", "month"]}
                expired={health === "expired"}
                view={{ ...view, official: schedule ?? view.official }}
                alerts={alerts}
                now={state.now}
                limit={calendarStartsLimit}
                runs={runs}
                onSpan={setCalendarSpan}
              />
            ) : activeTab === "calendar" && view ? (
              <CalendarWeekView
                onDetail={openDetail}
                initialState={weekState.current}
                onViewStateChange={rememberWeek}
                onSpan={setCalendarSpan}
                spans={["day", "week", "month"]}
                onSerie={openSerie}
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
                onDetail={openDetail}
                initialFilters={liveFilters.current}
                onFiltersChange={rememberLive}
                onSerie={openSerie}
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
      {detail && state.allowed && schedule && view && (
        <CalendarDetail
          onExport={() => setIcsOpen(true)}
          schedule={schedule}
          seriesId={detail.id}
          initialAt={detail.at}
          now={state.now}
          utc={view.utc}
          limit={calendarStartsLimit}
          alerts={alerts}
          alertsState={alertsState}
          alertsValid={alertsValid}
          following={view.following}
          runs={runs}
          profile={launcher.profile?.name}
          canLaunch={launcher.canLaunch}
          canFollow={preferences.canFollow}
          busy={preferences.busy}
          onClose={closeDetail}
          returnFocus={returnDetailFocus}
          onSerie={(id) => {
            detailOrigin.current = null;
            setDetail(undefined);
            openSerie(id);
          }}
          onBand={
            preferences.canAlerts
              ? (id, value) => void preferences.band(id, value)
              : undefined
          }
          onLead={
            preferences.canAlerts
              ? (value) => void preferences.alert({ kind: "lead", value })
              : undefined
          }
          onSlot={
            preferences.canAlerts
              ? (id, at, enabled) =>
                  void preferences.alert({
                    kind: "slot",
                    id,
                    at: Math.trunc(at / 1000),
                    enabled,
                  })
              : undefined
          }
          onFollow={(id, enabled) => void preferences.follow(id, enabled)}
          onLaunch={() => void launcher.launch()}
          failure={
            launcher.failure ? (
              <p role="alert">{text.launchFailed}</p>
            ) : (
              preferencesFailure
            )
          }
        />
      )}
      {alertsOpen && state.allowed && (
        <CalendarAlertsDialog
          schedule={schedule}
          alerts={alerts}
          alertsState={alertsState}
          returnFocus={returnAlertsFocus}
          following={view?.following ?? []}
          now={state.now}
          utc={view?.utc ?? false}
          limit={calendarStartsLimit}
          profile={launcher.profile?.name}
          canEdit={preferences.canAlerts}
          busy={preferences.busy}
          onChange={(change) => void preferences.alert(change)}
          onClose={() => setAlertsOpen(false)}
          failure={
            preferences.failureIntent === "alerts"
              ? preferencesFailure
              : undefined
          }
        />
      )}
      {icsOpen && state.allowed && (
        <CalendarIcsDialog
          scope={ics.scope}
          alarm={ics.alarm}
          lead={alerts.leadMin}
          utc={view?.utc ?? false}
          view={ics.view}
          busy={ics.busy}
          failure={ics.failure}
          status={ics.status}
          onScope={ics.setScope}
          onAlarm={ics.setAlarm}
          onRetry={ics.retry}
          onClose={() => setIcsOpen(false)}
          onDownload={() => {
            void ics.download().then((saved) => {
              if (saved) setIcsOpen(false);
            });
          }}
        />
      )}
    </>
  );
}
