import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { useFeatureGate } from "../feature-gate";
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
  clampZoom,
  dayAnchor,
  dayRows,
  filterByTier,
  fitZoom,
  groupByHour,
  monthAnchor,
  monthDays,
  pxPerHourOf,
  readTimelinePrefs,
  tickEveryMinFor,
  TIER_COLOR,
  TIER_FILTERS,
  TIER_INK,
  tierCounts,
  timelineRows,
  timelineStart,
  TIMELINE_RANGES,
  upcomingRows,
  weekAnchor,
  weekRows,
  writeTimelinePrefs,
  type RaceSeriesEntry,
  type TierFilter,
  type TimelineRange,
} from "./races-orbit-model";
import "../../styles/orbit-races.css";

/** Huecos que la shell reserva para Carreras (briefing 06). */
import {
  RACES_CONTEXT_SLOT_ID,
  RACES_TOPBAR_SLOT_ID,
} from "../components/orbit/orbit-slot-ids";

export { RACES_CONTEXT_SLOT_ID, RACES_TOPBAR_SLOT_ID };

export type RacesView = "next" | "day" | "week" | "month" | "timeline";

/** Vistas con navegación ‹ Hoy ›. */
const NAVIGABLE: RacesView[] = ["day", "week", "month"];

/** `06 § Carreras`: la lista de Próximas muestra 24 salidas. */
const NEXT_ROWS = 24;

/** El detalle enseña las cuatro próximas horas de la serie (`13.3`). */
const DETAIL_STARTS = 4;

/** El eje del timeline siempre cubre 24 h; el zoom decide cuántas se ven. */
const TIMELINE_SPAN_MIN = 1440;

/** Ancho de eje asumido hasta que el kit mide el suyo (SSR y jsdom). */
const AXIS_FALLBACK = 1100;

/** Cuántos eventos con nombre caben en una celda de Mes antes del +n. */
const MONTH_CHIPS = 2;

/**
 * Un bloque solo rotula su serie si tiene sitio para leerse; el seleccionado
 * rotula siempre. Lo que no cabe se recorta con elipsis dentro del bloque
 * (nunca se pinta por encima del vecino) y el nombre completo sigue en el
 * `data-tip`.
 */
const BLOCK_LABEL_PX = 58;

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

/** Días enteros entre dos fechas locales (para saltar a Día desde Mes). */
function dayOffsetBetween(now: Date, day: Date): number {
  return Math.round((dayAnchor(day, 0).getTime() - dayAnchor(now, 0).getTime()) / 86_400_000);
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
 *
 * Toda la altura la manda la Surface del calendario: la página no crece, el
 * desplazamiento vive dentro de cada vista y del detalle.
 */
export function RacesOrbitPage({ calendar, target, now }: RacesOrbitPageProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const reminders = useFeatureGate("calendar.followReminders");
  const contextSlot = useOrbitSlot(RACES_CONTEXT_SLOT_ID);
  const topbarSlot = useOrbitSlot(RACES_TOPBAR_SLOT_ID);

  const clock = useClock(now, TICK_MS);
  // Rendimiento: solo las cuentas atras consumen segundos; el resto de la
  // pagina se recalcula con el reloj de 30 s (columnClock).
  const columnClock = useClock(now, COLUMN_MS);

  const [view, setView] = useState<RacesView>("next");
  const [tier, setTier] = useState<TierFilter>("all");
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  /** Hora concreta elegida en Semana/Mes/Día/Timeline (manda en el detalle). */
  const [pickedAt, setPickedAt] = useState<Date | null>(null);

  // Rango y zoom persistidos: se leen una sola vez, al montar.
  const [range, setRange] = useState<TimelineRange>(() => readTimelinePrefs().range);
  const [zoom, setZoom] = useState(() => readTimelinePrefs().zoom);
  const [axisWidth, setAxisWidth] = useState(AXIS_FALLBACK);

  const entries = useMemo(() => buildSeriesEntries(calendar), [calendar]);
  const counts = useMemo(() => tierCounts(entries), [entries]);
  const visible = useMemo(() => filterByTier(entries, tier), [entries, tier]);

  // El `target` de la navegación preselecciona la serie mientras el usuario no
  // haya elegido otra: llegar desde el dial de Inicio abre ya su detalle.
  const selectedId =
    picked ?? (target && entries.some((entry) => entry.id === target) ? target : null);
  const selected: RaceSeriesEntry | null =
    visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  const select = useCallback((id: string, at?: Date) => {
    setPicked(id);
    setPickedAt(at ?? null);
  }, []);

  const changeView = useCallback((next: RacesView) => {
    setView(next);
    setOffset(0);
  }, []);

  /** Abre Día en una fecha concreta (cabecera de Semana, celda de Mes). */
  const openDay = useCallback(
    (day: Date) => {
      setView("day");
      setOffset(dayOffsetBetween(columnClock, day));
    },
    [columnClock],
  );

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
  const nextGroups = useMemo(
    () => (view === "next" ? groupByHour(upcomingRows(visible, columnClock, NEXT_ROWS)) : []),
    [columnClock, view, visible],
  );
  const dayBase = useMemo(() => dayAnchor(columnClock, offset), [columnClock, offset]);
  const hours = useMemo(
    () => (view === "day" ? dayRows(visible, dayBase, columnClock) : []),
    [columnClock, dayBase, view, visible],
  );
  const monday = useMemo(() => weekAnchor(columnClock, offset), [columnClock, offset]);
  const week = useMemo(
    () => (view === "week" ? weekRows(visible, monday, columnClock) : []),
    [columnClock, monday, view, visible],
  );
  const first = useMemo(() => monthAnchor(columnClock, offset), [columnClock, offset]);
  const month = useMemo(
    () => (view === "month" ? monthDays(visible, first, columnClock, calendar?.events ?? []) : []),
    [calendar?.events, columnClock, first, view, visible],
  );
  const tlStart = useMemo(() => timelineStart(columnClock), [columnClock]);
  const tlRows = useMemo(
    () => (view === "timeline" ? timelineRows(visible, tlStart) : []),
    [tlStart, view, visible],
  );

  // ── timeline · rango y zoom ────────────────────────────────────────────
  const pxPerHour = pxPerHourOf(axisWidth, zoom);
  const minPxPerHour = pxPerHourOf(axisWidth, 1);
  const maxPxPerHour = pxPerHourOf(axisWidth, 4);
  const tickEveryMin = tickEveryMinFor(pxPerHour);

  const applyZoom = useCallback(
    (next: number) => {
      const value = clampZoom(next);
      setZoom(value);
      writeTimelinePrefs({ range, zoom: value });
    },
    [range],
  );

  const applyRange = useCallback((next: TimelineRange) => {
    const value = fitZoom(next);
    setRange(next);
    setZoom(value);
    writeTimelinePrefs({ range: next, zoom: value });
  }, []);

  const onAxisWidth = useCallback((px: number) => {
    if (px > 0) setAxisWidth(px);
  }, []);

  const onTimelineZoom = useCallback(
    (nextPx: number) => applyZoom((nextPx / Math.max(1, minPxPerHour)) * 1),
    [applyZoom, minPxPerHour],
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
    () => (selected ? nextStarts(selected.engine, columnClock, DETAIL_STARTS) : []),
    [columnClock, selected],
  );
  /** Salida que manda en el detalle: la elegida a mano o la próxima. */
  const detailAt = pickedAt ?? detailStarts[0] ?? null;
  /** Bloque marcado en el timeline: rotula siempre, aunque no le quepa. */
  const selectedBlockId =
    selected && detailAt ? `${selected.id}-${detailAt.getTime()}` : undefined;

  const tierLabel = (value: TierFilter) =>
    value === "all" ? t("races.context.all") : t(`races.tier.${value}`);

  // Sin hora elegida se marca solo la primera salida de la serie: si no, la
  // barra carmín se repetía en todas sus filas de la lista.
  const firstAtOfSelected = useMemo(() => {
    if (!selected) return null;
    for (const group of nextGroups) {
      const row = group.rows.find((item) => item.entry.id === selected.id);
      if (row) return row.at.getTime();
    }
    return null;
  }, [nextGroups, selected]);

  /** Fila de Próximas seleccionada: la serie y, si la hay, la hora elegida. */
  const isPickedRow = (id: string, at: Date) =>
    id === selected?.id &&
    (pickedAt === null ? firstAtOfSelected === at.getTime() : pickedAt.getTime() === at.getTime());

  const timelineActions = (
    <span className="orbit-races__tl-controls" data-testid="orbit-races-tl-controls">
      <Seg
        className="orbit-races__tl-range"
        label={t("races.timeline.rangeLabel")}
        onChange={(value) => applyRange(Number(value) as TimelineRange)}
        options={TIMELINE_RANGES.map((hours) => ({
          value: String(hours),
          label: formatMessage(t("races.timeline.hours"), { n: hours }),
        }))}
        value={String(range)}
      />
      <button
        aria-label={t("races.timeline.zoomOut")}
        className="orbit-icon-btn orbit-icon-btn--28"
        data-testid="orbit-races-zoom-out"
        data-tip={t("races.timeline.zoomOut")}
        onClick={() => applyZoom(zoom / 1.25)}
        type="button"
      >
        −
      </button>
      <button
        aria-label={t("races.timeline.zoomIn")}
        className="orbit-icon-btn orbit-icon-btn--28"
        data-testid="orbit-races-zoom-in"
        data-tip={t("races.timeline.zoomIn")}
        onClick={() => applyZoom(zoom * 1.25)}
        type="button"
      >
        +
      </button>
      <Button
        data-testid="orbit-races-zoom-fit"
        onClick={() => applyZoom(fitZoom(range))}
        size="sm"
      >
        {t("races.timeline.fit")}
      </Button>
    </span>
  );

  const navActions = (
    <span className="orbit-races__nav">
      <button
        aria-label={t("races.nav.previous")}
        className="orbit-icon-btn orbit-icon-btn--28"
        data-testid="orbit-races-prev"
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
        data-testid="orbit-races-next-page"
        onClick={() => setOffset((value) => value + 1)}
        type="button"
      >
        ›
      </button>
    </span>
  );

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
                        onClick={() => select(row.entry.id, row.at)}
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
            view === "timeline"
              ? timelineActions
              : NAVIGABLE.includes(view)
                ? navActions
                : undefined
          }
          aria-label={t("races.calendar.label")}
          className="orbit-races__calendar"
          fill
          meta={
            <span className="orbit-races__clock">
              {pad2(columnClock.getHours())}:{pad2(columnClock.getMinutes())} · {timeZone}
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
              {nextGroups.map((group, groupIndex) => (
                <div className="orbit-races__group" key={group.hour.getTime()} role="presentation">
                  <div className="orbit-races__group-head">
                    <b data-first={groupIndex === 0 ? "true" : undefined}>
                      {formatStartTime(group.hour)}
                    </b>
                    <span>
                      {formatMessage(t("races.row.in"), {
                        time: formatCountdown(
                          Math.max(0, group.rows[0].at.getTime() - clock.getTime()),
                        ),
                      })}
                    </span>
                    <i aria-hidden="true" />
                    <span className="orbit-races__group-count">{group.rows.length}</span>
                  </div>
                  {group.rows.map((row) => (
                    <button
                      aria-selected={isPickedRow(row.entry.id, row.at)}
                      className="orbit-races__nrow"
                      data-followed={row.entry.followed ? "true" : undefined}
                      data-testid="orbit-races-next-row"
                      key={`${row.entry.id}-${row.at.getTime()}`}
                      onClick={() => select(row.entry.id, row.at)}
                      role="option"
                      type="button"
                    >
                      <i aria-hidden="true" className="orbit-tier-dot" data-tier={row.entry.tier} />
                      <span className="orbit-races__nrow-copy">
                        <b>
                          {row.entry.name}
                          {row.entry.followed ? (
                            <span className="orbit-races__follow-mark">
                              ✓<span className="orbit-sr-only">{t("races.followMark")}</span>
                            </span>
                          ) : null}
                        </b>
                        <span>{[row.entry.track, row.entry.cls].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="orbit-races__nrow-at">{formatStartTime(row.at)}</span>
                      <span className="orbit-races__dur">
                        {formatMessage(t("races.row.duration"), {
                          min: row.entry.raceMin,
                          setup: t(`races.setup.${row.entry.setup}`),
                        })}
                      </span>
                      {row.entry.licenseLabel ? (
                        <Chip tier={row.entry.licenseTier}>{row.entry.licenseLabel}</Chip>
                      ) : (
                        <span />
                      )}
                    </button>
                  ))}
                </div>
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
                        data-past={event.at < columnClock ? "true" : undefined}
                        data-testid="orbit-races-ev-chip"
                        key={`${event.entry.id}-${event.at.getTime()}`}
                        onClick={() => select(event.entry.id, event.at)}
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
                  <div className="orbit-races__week-head" key={cell.day.getTime()} role="columnheader">
                    <button
                      className="orbit-races__week-day"
                      data-testid="orbit-races-week-day"
                      data-today={cell.today ? "true" : undefined}
                      onClick={() => openDay(cell.day)}
                      type="button"
                    >
                      <span>{weekdayShort(cell.day)}</span>
                      <b>{cell.day.getDate()}</b>
                    </button>
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
                      data-off={cell.total === 0 ? "true" : undefined}
                      data-past={cell.past ? "true" : undefined}
                      data-today={cell.today ? "true" : undefined}
                      key={cell.day.getTime()}
                      role="gridcell"
                    >
                      {cell.slots.length === 0 ? (
                        <span className="orbit-races__week-none">{t("races.week.none")}</span>
                      ) : (
                        <>
                          {cell.slots.map((slot) => (
                            <button
                              className="orbit-races__slot"
                              data-followed={row.entry.followed ? "true" : undefined}
                              data-past={slot < columnClock ? "true" : undefined}
                              data-testid="orbit-races-week-slot"
                              key={slot.getTime()}
                              onClick={() => select(row.entry.id, slot)}
                              type="button"
                            >
                              {formatStartTime(slot)}
                            </button>
                          ))}
                          {cell.more > 0 ? (
                            <button
                              className="orbit-races__slot orbit-races__slot--more"
                              data-testid="orbit-races-week-more"
                              onClick={() => openDay(cell.day)}
                              type="button"
                            >
                              {formatMessage(t("races.week.more"), { n: cell.more })}
                            </button>
                          ) : null}
                        </>
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
                      <button
                        className="orbit-races__month-num"
                        data-testid="orbit-races-month-day"
                        onClick={() => openDay(cell.day)}
                        type="button"
                      >
                        {cell.day.getDate()}
                      </button>
                      {cell.daily > 0 ? (
                        <button
                          className="orbit-races__mev"
                          data-kind="daily"
                          data-testid="orbit-races-month-daily"
                          onClick={() => openDay(cell.day)}
                          type="button"
                        >
                          {formatMessage(t("races.month.daily"), { n: cell.daily })}
                        </button>
                      ) : null}
                      {cell.weekly.slice(0, MONTH_CHIPS).map((series) => (
                        <button
                          className="orbit-races__mev"
                          data-kind="weekly"
                          data-testid="orbit-races-month-weekly"
                          key={series.id}
                          onClick={() => select(series.id)}
                          type="button"
                        >
                          {formatMessage(t("races.month.weekly"), {
                            name: series.name,
                            n: series.slots,
                          })}
                        </button>
                      ))}
                      {cell.specials
                        .slice(0, Math.max(0, MONTH_CHIPS - cell.weekly.length))
                        .map((special) => (
                          <button
                            className="orbit-races__mev"
                            data-kind="special"
                            key={special.id}
                            onClick={() => openDay(cell.day)}
                            type="button"
                          >
                            {special.title}
                          </button>
                        ))}
                      {cell.weekly.length + cell.specials.length > MONTH_CHIPS ? (
                        <button
                          className="orbit-races__mev"
                          data-kind="more"
                          data-testid="orbit-races-month-more"
                          onClick={() => openDay(cell.day)}
                          type="button"
                        >
                          {formatMessage(t("races.week.more"), {
                            n: cell.weekly.length + cell.specials.length - MONTH_CHIPS,
                          })}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="orbit-races__timeline" data-testid="orbit-races-timeline">
              <HorizontalTimeline
                blocks={(row): TimelineBlock[] =>
                  row.starts.map((at) => {
                    const id = `${row.entry.id}-${at.getTime()}`;
                    const fits = (row.blockMin / 60) * pxPerHour >= BLOCK_LABEL_PX;
                    return {
                      id,
                      start: at,
                      durationMin: row.blockMin,
                      color: TIER_COLOR[row.entry.tier],
                      done: row.entry.followed,
                      ink: TIER_INK[row.entry.tier],
                      label: fits || id === selectedBlockId ? row.entry.name : undefined,
                      tip: `${row.entry.name} · ${formatStartTime(at)}`,
                    };
                  })
                }
                headWidth={210}
                label={t("races.timelineTitle")}
                maxPxPerHour={maxPxPerHour}
                minPxPerHour={minPxPerHour}
                now={columnClock}
                onAxisWidth={onAxisWidth}
                onBlock={(id) => {
                  const cut = id.lastIndexOf("-");
                  select(id.slice(0, cut), new Date(Number(id.slice(cut + 1))));
                }}
                onZoom={onTimelineZoom}
                pan
                pxPerHour={pxPerHour}
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
                selected={selectedBlockId}
                spanMin={TIMELINE_SPAN_MIN}
                start={tlStart}
                tickEveryMin={tickEveryMin}
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
                  <dt>{pickedAt ? t("races.detail.picked") : t("races.detail.next")}</dt>
                  <dd data-testid="orbit-races-detail-at">
                    {detailAt
                      ? formatMessage(t("races.detail.nextValue"), {
                          time: formatStartTime(detailAt),
                          left: formatCountdown(detailAt.getTime() - clock.getTime()),
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

              <div className="orbit-races__detail-links">
                <Button
                  data-testid="orbit-races-see-timeline"
                  onClick={() => setView("timeline")}
                  size="sm"
                >
                  {t("races.detail.seeTimeline")}
                </Button>
                <Button
                  data-testid="orbit-races-see-day"
                  onClick={() => openDay(detailAt ?? columnClock)}
                  size="sm"
                >
                  {t("races.detail.seeDay")}
                </Button>
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
