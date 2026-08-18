import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { useFeatureGate } from "../components/AccessGate";
import { requestCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import {
  Button,
  Chip,
  HorizontalTimeline,
  Kbd,
  ListRow,
  Note,
  Seg,
  Surface,
  useToast,
  type TimelineBlock,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { formatCountdown, formatStartTime, nextStarts } from "../orbit/next-starts";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import {
  buildSeriesEntries,
  dayAnchor,
  dayRows,
  filterByTier,
  monthAnchor,
  monthDays,
  TIER_COLOR,
  TIER_FILTERS,
  tierCounts,
  timelineRows,
  timelineStart,
  upcomingRows,
  weekAnchor,
  weekRows,
  type RaceSeriesEntry,
  type TierFilter,
} from "./races-orbit-model";
import "../../styles/orbit-races.css";

/** Huecos que la shell reserva para Carreras (briefing 06). */
export const RACES_CONTEXT_SLOT_ID = "orbit-races-context-slot";
export const RACES_TOPBAR_SLOT_ID = "orbit-races-topbar-slot";

export type RacesView = "next" | "day" | "week" | "month" | "timeline";

/** Vistas con navegación ‹ Hoy ›. */
const NAVIGABLE: RacesView[] = ["day", "week", "month"];

/** `06 § Carreras`: la lista de Próximas muestra 24 salidas. */
const NEXT_ROWS = 24;

/** El detalle enseña las cuatro próximas horas de la serie (`13.3`). */
const DETAIL_STARTS = 4;

/** Cuenta atrás a un segundo; listas de la columna cada 30 s (briefing 06). */
const TICK_MS = 1_000;
const COLUMN_MS = 30_000;

function useClock(now: Date | undefined, everyMs: number): Date {
  const [tick, setTick] = useState(() => (now ?? new Date()).getTime());
  useEffect(() => {
    if (now) return;
    const id = window.setInterval(() => setTick(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs, now]);
  return now ?? new Date(tick);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export interface RacesOrbitPageProps {
  /** Calendario real del hub; `null` mientras no ha llegado. */
  calendar: Calendar | null;
  /** Serie preseleccionada por la navegación (`navigate("carreras", seriesId)`). */
  target?: string;
  /** Reloj inyectable: sin él corre el reloj local real. */
  now?: Date;
}

/**
 * Carreras de Command Orbit (`15-briefings/06-carreras.md`).
 *
 * Cinco vistas sobre el mismo motor de salidas (`13.3`) y el calendario real
 * del hub: seguir una serie despacha `calendar:series:follow` por el mismo
 * puente que el calendario clásico, así que el dial de Inicio y el bloque
 * persistente de la columna se mueven sin ninguna copia intermedia.
 */
export function RacesOrbitPage({ calendar, target, now }: RacesOrbitPageProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const reminders = useFeatureGate("calendar.followReminders");
  const contextSlot = useOrbitSlot(RACES_CONTEXT_SLOT_ID);
  const topbarSlot = useOrbitSlot(RACES_TOPBAR_SLOT_ID);

  const clock = useClock(now, TICK_MS);
  const columnClock = useClock(now, COLUMN_MS);

  const [view, setView] = useState<RacesView>("next");
  const [tier, setTier] = useState<TierFilter>("all");
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const entries = useMemo(() => buildSeriesEntries(calendar), [calendar]);
  const counts = useMemo(() => tierCounts(entries), [entries]);
  const visible = useMemo(() => filterByTier(entries, tier), [entries, tier]);

  // El `target` de la navegación preselecciona la serie mientras el usuario no
  // haya elegido otra: llegar desde el dial de Inicio abre ya su detalle.
  const selectedId =
    picked ?? (target && entries.some((entry) => entry.id === target) ? target : null);
  const selected: RaceSeriesEntry | null =
    visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  const select = useCallback((id: string) => setPicked(id), []);

  const changeView = useCallback((next: RacesView) => {
    setView(next);
    setOffset(0);
  }, []);

  const refresh = useCallback(() => {
    Events.Emit("calendar:schedule:refresh");
    requestCalendar();
    toast.show(t("races.refreshed"), t("races.refreshedHint"));
  }, [t, toast]);

  const reminderMinutes = (calendar?.reminderMinutes ?? []).join(" · ");

  const toggleFollow = useCallback(() => {
    if (!selected || !reminders.allowed) return;
    if (selected.followed) {
      Events.Emit("calendar:series:unfollow", { seriesId: selected.id });
      toast.show(
        t("races.toasts.unfollowed"),
        formatMessage(t("races.toasts.unfollowedHint"), { name: selected.name }),
      );
      return;
    }
    Events.Emit("calendar:series:follow", { seriesId: selected.id });
    toast.show(
      t("races.toasts.followed"),
      formatMessage(t("races.toasts.followedHint"), {
        minutes: reminderMinutes,
        name: selected.name,
      }),
    );
  }, [reminderMinutes, reminders.allowed, selected, t, toast]);

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  const weekdayShort = useCallback(
    (date: Date) => date.toLocaleDateString(locale, { weekday: "short" }),
    [locale],
  );
  const monthLong = useCallback(
    (date: Date) => date.toLocaleDateString(locale, { month: "long", year: "numeric" }),
    [locale],
  );

  // ── vistas ─────────────────────────────────────────────────────────────
  const nextRows = useMemo(
    () => (view === "next" ? upcomingRows(visible, clock, NEXT_ROWS) : []),
    [clock, view, visible],
  );
  const dayBase = useMemo(() => dayAnchor(clock, offset), [clock, offset]);
  const hours = useMemo(
    () => (view === "day" ? dayRows(visible, dayBase, clock) : []),
    [clock, dayBase, view, visible],
  );
  const monday = useMemo(() => weekAnchor(clock, offset), [clock, offset]);
  const week = useMemo(
    () => (view === "week" ? weekRows(visible, monday, clock) : []),
    [clock, monday, view, visible],
  );
  const first = useMemo(() => monthAnchor(clock, offset), [clock, offset]);
  const month = useMemo(
    () => (view === "month" ? monthDays(visible, first, clock, calendar?.events ?? []) : []),
    [calendar?.events, clock, first, view, visible],
  );
  const tlStart = useMemo(() => timelineStart(clock), [clock]);
  const tlRows = useMemo(
    () => (view === "timeline" ? timelineRows(visible, tlStart) : []),
    [tlStart, view, visible],
  );

  const calendarTitle = (() => {
    if (view === "next") return t("races.nextTitle");
    if (view === "timeline") return t("races.timelineTitle");
    if (view === "day") {
      const label = dayBase.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
      return offset === 0 ? `${label} · ${t("races.today")}` : label;
    }
    if (view === "week") {
      const end = new Date(monday.getTime() + 6 * 86_400_000);
      return `${monday.getDate()} – ${end.toLocaleDateString(locale, { day: "numeric", month: "long" })}`;
    }
    return monthLong(first);
  })();

  const followedEntries = useMemo(
    () => entries.filter((entry) => entry.followed),
    [entries],
  );
  const followedRows = useMemo(
    () => upcomingRows(followedEntries, columnClock, followedEntries.length),
    [columnClock, followedEntries],
  );

  // El detalle pide las salidas directamente al motor: `upcoming` toma solo dos
  // por serie antes de ordenar (`13.3`) y aquí hacen falta las cuatro próximas.
  const detailStarts = useMemo(
    () => (selected ? nextStarts(selected.engine, clock, DETAIL_STARTS) : []),
    [clock, selected],
  );

  const tierLabel = (value: TierFilter) =>
    value === "all" ? t("races.context.all") : t(`races.tier.${value}`);

  return (
    <div className="orbit-races" data-testid="orbit-races">
      {topbarSlot
        ? createPortal(
            <div className="orbit-races__topbar">
              <Button data-testid="orbit-races-refresh" onClick={refresh}>
                {t("races.refresh")}
              </Button>
            </div>,
            topbarSlot,
          )
        : null}

      {contextSlot
        ? createPortal(
            <div className="orbit-races__context">
              <section aria-label={t("races.context.category")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("races.context.category")}</span>
                </div>
                <div
                  aria-label={t("races.context.category")}
                  className="orbit-races__filters"
                  data-testid="orbit-races-filters"
                  role="group"
                >
                  {TIER_FILTERS.map((value) => (
                    <button
                      aria-pressed={tier === value}
                      className="orbit-races__filter"
                      data-testid={`orbit-races-filter-${value}`}
                      key={value}
                      onClick={() => setTier(value)}
                      type="button"
                    >
                      <span>
                        {value === "all" ? null : (
                          <i aria-hidden="true" className="orbit-tier-dot" data-tier={value} />
                        )}
                        {tierLabel(value)}
                      </span>
                      <span>{counts[value]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-label={t("races.context.followed")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("races.context.followed")}</span>
                  <span className="orbit-races__count">{followedEntries.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-races-followed">
                  {followedRows.length === 0 ? (
                    <p className="orbit-row__copy">{t("races.context.noFollowed")}</p>
                  ) : (
                    followedRows.map((row) => (
                      <ListRow
                        key={row.entry.id}
                        leading={
                          <i aria-hidden="true" className="orbit-tier-dot" data-tier={row.entry.tier} />
                        }
                        onClick={() => select(row.entry.id)}
                        subtitle={row.entry.track}
                        title={row.entry.name}
                        trailing={
                          <span className="orbit-when">
                            <b>{formatStartTime(row.at)}</b>
                            <span>
                              {formatMessage(t("races.row.in"), {
                                time: formatCountdown(row.at.getTime() - columnClock.getTime()),
                              })}
                            </span>
                          </span>
                        }
                      />
                    ))
                  )}
                </div>
              </section>
            </div>,
            contextSlot,
          )
        : null}

      <header className="orbit-races__head">
        <div className="orbit-races__head-copy">
          <span className="orbit-eyebrow">{t("races.eyebrow")}</span>
          <h2>{t("races.title")}</h2>
          <p>{t("races.lead")}</p>
        </div>
        <Seg
          className="orbit-races__views"
          label={t("races.views.label")}
          onChange={changeView}
          options={[
            { value: "next", label: t("races.views.next") },
            { value: "day", label: t("races.views.day") },
            { value: "week", label: t("races.views.week") },
            { value: "month", label: t("races.views.month") },
            { value: "timeline", label: t("races.views.timeline") },
          ]}
          value={view}
        />
      </header>

      <div className="orbit-races__grid">
        <Surface
          actions={
            NAVIGABLE.includes(view) ? (
              <span className="orbit-races__nav">
                <button
                  aria-label={t("races.nav.previous")}
                  className="orbit-icon-btn orbit-icon-btn--28"
                  onClick={() => setOffset((value) => value - 1)}
                  type="button"
                >
                  ‹
                </button>
                <Button onClick={() => setOffset(0)} size="sm">
                  {t("races.nav.today")}
                </Button>
                <button
                  aria-label={t("races.nav.next")}
                  className="orbit-icon-btn orbit-icon-btn--28"
                  onClick={() => setOffset((value) => value + 1)}
                  type="button"
                >
                  ›
                </button>
              </span>
            ) : undefined
          }
          aria-label={t("races.calendar.label")}
          className="orbit-races__calendar"
          fill
          meta={
            <span className="orbit-races__clock">
              {pad2(clock.getHours())}:{pad2(clock.getMinutes())} · {timeZone}
            </span>
          }
          title={calendarTitle}
        >
          {visible.length === 0 ? (
            <p className="orbit-races__empty">
              {entries.length === 0 ? t("races.empty") : t("races.emptyFiltered")}
            </p>
          ) : view === "next" ? (
            <div
              aria-label={t("races.nextTitle")}
              className="orbit-races__next"
              data-testid="orbit-races-next"
              role="listbox"
            >
              {nextRows.map((row, index) => (
                <ListRow
                  ariaSelected={row.entry.id === selected?.id}
                  className="orbit-races__row"
                  key={`${row.entry.id}-${row.at.getTime()}`}
                  leading={
                    <span className="orbit-races__when">
                      <b>{formatStartTime(row.at)}</b>
                      <span>
                        {formatMessage(t("races.row.in"), {
                          time: formatCountdown(row.at.getTime() - clock.getTime()),
                        })}
                      </span>
                    </span>
                  }
                  next={index === 0}
                  onClick={() => select(row.entry.id)}
                  role="option"
                  subtitle={[row.entry.track, row.entry.cls].filter(Boolean).join(" · ")}
                  title={
                    <>
                      {row.entry.name}
                      {row.entry.followed ? (
                        <span className="orbit-races__follow-mark">
                          ✓<span className="orbit-sr-only">{t("races.followMark")}</span>
                        </span>
                      ) : null}
                    </>
                  }
                  trailing={
                    <>
                      <span className="orbit-races__dur">
                        {formatMessage(t("races.row.duration"), {
                          min: row.entry.raceMin,
                          setup: t(`races.setup.${row.entry.setup}`),
                        })}
                      </span>
                      {row.entry.licenseLabel ? (
                        <Chip tier={row.entry.licenseTier}>{row.entry.licenseLabel}</Chip>
                      ) : null}
                    </>
                  }
                />
              ))}
            </div>
          ) : view === "day" ? (
            <div className="orbit-races__day" data-testid="orbit-races-day" role="grid">
              {hours.map((hour) => (
                <div className="orbit-races__day-line" key={hour.hour} role="row">
                  <span
                    className="orbit-races__day-hour"
                    data-now={hour.now ? "true" : undefined}
                    role="rowheader"
                  >
                    {pad2(hour.hour)}:00
                  </span>
                  <span
                    className="orbit-races__day-cell"
                    data-now={hour.now ? "true" : undefined}
                    role="gridcell"
                  >
                    {hour.events.map((event) => (
                      <button
                        className="orbit-races__chip"
                        data-followed={event.entry.followed ? "true" : undefined}
                        data-past={event.at < clock ? "true" : undefined}
                        data-testid="orbit-races-ev-chip"
                        key={`${event.entry.id}-${event.at.getTime()}`}
                        onClick={() => select(event.entry.id)}
                        type="button"
                      >
                        <i aria-hidden="true" className="orbit-tier-dot" data-tier={event.entry.tier} />
                        <b>:{pad2(event.at.getMinutes())}</b>
                        {event.entry.name}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : view === "week" ? (
            <div className="orbit-races__week" data-testid="orbit-races-week" role="grid">
              <div className="orbit-races__week-row" role="row">
                <div className="orbit-races__week-head" role="columnheader" />
                {(week[0]?.cells ?? []).map((cell) => (
                  <div
                    className="orbit-races__week-head"
                    data-today={cell.today ? "true" : undefined}
                    key={cell.day.getTime()}
                    role="columnheader"
                  >
                    {weekdayShort(cell.day)} {cell.day.getDate()}
                  </div>
                ))}
              </div>
              {week.map((row) => (
                <div className="orbit-races__week-row" key={row.entry.id} role="row">
                  <button
                    className="orbit-races__week-series"
                    onClick={() => select(row.entry.id)}
                    role="rowheader"
                    type="button"
                  >
                    <i aria-hidden="true" className="orbit-tier-dot" data-tier={row.entry.tier} />
                    <b>{row.entry.name}</b>
                  </button>
                  {row.cells.map((cell) => (
                    <div
                      className="orbit-races__week-cell"
                      data-off={cell.every === undefined && cell.slots.length === 0 ? "true" : undefined}
                      data-today={cell.today ? "true" : undefined}
                      key={cell.day.getTime()}
                      role="gridcell"
                    >
                      {cell.every !== undefined ? (
                        <>
                          {formatMessage(t("races.week.every"), { n: cell.every })}
                          <br />
                          <span
                            className="orbit-races__slot"
                            data-followed={row.entry.followed ? "true" : undefined}
                          >
                            :{pad2(cell.offsetMinute ?? 0)}
                          </span>
                          +
                        </>
                      ) : cell.slots.length === 0 ? (
                        t("races.week.none")
                      ) : (
                        cell.slots.map((slot) => (
                          <span
                            className="orbit-races__slot"
                            data-followed={row.entry.followed ? "true" : undefined}
                            key={slot.getTime()}
                          >
                            {formatStartTime(slot)}
                          </span>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : view === "month" ? (
            <div className="orbit-races__month" data-testid="orbit-races-month" role="grid">
              <div className="orbit-races__month-row" role="row">
                {month.slice(0, 7).map((cell) => (
                  <div
                    className="orbit-races__month-head"
                    key={`h-${cell.day.getTime()}`}
                    role="columnheader"
                  >
                    {weekdayShort(cell.day)}
                  </div>
                ))}
              </div>
              {[0, 1, 2, 3, 4, 5].map((week7) => (
                <div className="orbit-races__month-row" key={week7} role="row">
                  {month.slice(week7 * 7, week7 * 7 + 7).map((cell) => (
                    <div
                      className="orbit-races__month-day"
                      data-other={cell.other ? "true" : undefined}
                      data-today={cell.today ? "true" : undefined}
                      key={cell.day.getTime()}
                      role="gridcell"
                    >
                      <span className="orbit-races__month-num">{cell.day.getDate()}</span>
                      {cell.daily > 0 ? (
                        <span className="orbit-races__mev" data-kind="daily">
                          {formatMessage(t("races.month.daily"), { n: cell.daily })}
                        </span>
                      ) : null}
                      {cell.weekly.map((series) => (
                        <span className="orbit-races__mev" data-kind="weekly" key={series.id}>
                          {formatMessage(t("races.month.weekly"), {
                            name: series.name,
                            n: series.slots,
                          })}
                        </span>
                      ))}
                      {cell.specials.map((special) => (
                        <span className="orbit-races__mev" data-kind="special" key={special.id}>
                          {special.title}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="orbit-races__timeline" data-testid="orbit-races-timeline">
              <HorizontalTimeline
                blocks={(row): TimelineBlock[] =>
                  row.starts.map((at) => ({
                    id: `${row.entry.id}-${at.getTime()}`,
                    start: at,
                    durationMin: row.blockMin,
                    color: TIER_COLOR[row.entry.tier],
                    done: row.entry.followed,
                  }))
                }
                headWidth={210}
                label={t("races.timelineTitle")}
                minWidth={1400}
                now={clock}
                onBlock={(id) => select(id.slice(0, id.lastIndexOf("-")))}
                rowLabel={(row) => (
                  <>
                    <i aria-hidden="true" className="orbit-tier-dot" data-tier={row.entry.tier} />
                    <span className="orbit-races__tl-copy">
                      <b>{row.entry.name}</b>
                      <span>
                        {[
                          row.entry.track,
                          formatMessage(t("races.detail.minutes"), { min: row.entry.raceMin }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </>
                )}
                rows={tlRows}
                spanMin={1440}
                start={tlStart}
                tickEveryMin={60}
              />
            </div>
          )}
        </Surface>

        <Surface
          aria-label={t("races.detail.title")}
          as="aside"
          className="orbit-races__detail"
          fill
          meta={selected?.licenseLabel}
          title={t("races.detail.title")}
        >
          {!selected ? (
            <p className="orbit-races__empty">{t("races.detail.empty")}</p>
          ) : (
            <div className="orbit-races__detail-body" data-testid="orbit-races-detail">
              <div>
                <span className="orbit-eyebrow">{t(`races.tier.${selected.tier}`)}</span>
                <h3>{selected.name}</h3>
                <p>{[selected.track, selected.cls].filter(Boolean).join(" · ")}</p>
              </div>

              <dl className="orbit-races__facts">
                <div>
                  <dt>{t("races.detail.setup")}</dt>
                  <dd>{t(`races.setup.${selected.setup}`)}</dd>
                </div>
                <div>
                  <dt>{t("races.detail.race")}</dt>
                  <dd>{formatMessage(t("races.detail.minutes"), { min: selected.raceMin })}</dd>
                </div>
                <div>
                  <dt>{t("races.detail.cadence")}</dt>
                  <dd>
                    {selected.engine.every !== undefined
                      ? formatMessage(t("races.detail.cadenceEvery"), { n: selected.engine.every })
                      : formatMessage(t("races.detail.cadenceWeekly"), {
                          n: selected.engine.weeklyUTC?.length ?? 0,
                        })}
                  </dd>
                </div>
                <div>
                  <dt>{t("races.detail.next")}</dt>
                  <dd>
                    {detailStarts[0]
                      ? formatMessage(t("races.detail.nextValue"), {
                          time: formatStartTime(detailStarts[0]),
                          left: formatCountdown(detailStarts[0].getTime() - clock.getTime()),
                        })
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("races.detail.sessions")}</dt>
                  <dd>{selected.sessions || "—"}</dd>
                </div>
              </dl>

              <div aria-label={t("races.detail.starts")} className="orbit-races__starts">
                {detailStarts.map((at, index) => (
                  <Kbd
                    className={index === 0 ? "orbit-races__start--first" : undefined}
                    key={at.getTime()}
                    keys={[formatStartTime(at)]}
                  />
                ))}
              </div>

              <Button
                aria-describedby={reminders.allowed ? undefined : "orbit-races-locked"}
                data-testid="orbit-races-follow"
                disabled={!reminders.allowed}
                onClick={toggleFollow}
                variant={selected.followed ? "ghost" : "primary"}
              >
                {selected.followed ? t("races.detail.following") : t("races.detail.follow")}
              </Button>

              {reminders.allowed ? (
                <Note className="orbit-races__note">
                  {formatMessage(t("races.detail.reminders"), { minutes: reminderMinutes })}
                </Note>
              ) : (
                <div id="orbit-races-locked">
                  <Note className="orbit-races__note">{t("races.detail.freeLocked")}</Note>
                </div>
              )}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
