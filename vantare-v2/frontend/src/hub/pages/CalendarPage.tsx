import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  requestCalendar,
  subscribeToCalendar,
  subscribeToCalendarErrors,
} from "../../calendar/calendar-store";
import {
  formatEventDate,
  isEventActive,
  type Calendar,
  type RaceEvent,
  type RaceSeries,
  type RaceSeriesPreview,
} from "../../calendar/calendar-types";
import { CalendarSeriesCard } from "../calendar/CalendarSeriesCard";
import { tierLabel } from "../calendar/calendar-tier";

function pickUpcoming(calendar: Calendar, now: Date): RaceEvent[] {
  const sorted = [...calendar.events].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  return sorted.filter((ev) => {
    if (isEventActive(ev, now)) return true;
    const start = new Date(ev.startTime);
    return start.getTime() >= now.getTime();
  });
}

function pickPast(calendar: Calendar, now: Date): RaceEvent[] {
  const sorted = [...calendar.events].sort((a, b) =>
    b.startTime.localeCompare(a.startTime),
  );
  return sorted.filter((ev) => {
    if (isEventActive(ev, now)) return false;
    const end = new Date(new Date(ev.startTime).getTime() + (ev.durationMin > 0 ? ev.durationMin * 60_000 : 0));
    return end.getTime() < now.getTime();
  });
}

function isFollowed(eventId: string, followedIds: string[] | undefined): boolean {
  if (!followedIds) return false;
  return followedIds.includes(eventId);
}

const TIER_ORDER = ["beginner", "intermediate", "advanced", "weekly"];

function groupSeriesByTier(
  series: RaceSeries[],
  previews: RaceSeriesPreview[] | undefined,
): Array<{ tier: string; series: RaceSeries[] }> {
  const previewMap = new Map<string, RaceSeriesPreview>();
  if (previews) {
    for (const p of previews) {
      previewMap.set(p.seriesId, p);
    }
  }
  const groups = new Map<string, RaceSeries[]>();
  for (const s of series) {
    const list = groups.get(s.tier) ?? [];
    list.push(s);
    groups.set(s.tier, list);
  }
  const result: Array<{ tier: string; series: RaceSeries[] }> = [];
  for (const t of TIER_ORDER) {
    const list = groups.get(t);
    if (list && list.length > 0) {
      result.push({ tier: t, series: list });
    }
  }
  return result;
}

export function CalendarPage() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestCalendar();
    const unsubLoaded = subscribeToCalendar((state) => {
      if (state.kind === "loaded") {
        setCalendar(state.calendar);
        setError(null);
      }
    });
    const unsubErr = subscribeToCalendarErrors((msg) => {
      setError(msg);
    });
    return () => {
      unsubLoaded();
      unsubErr();
    };
  }, []);

  const handleFollow = useCallback((eventId: string) => {
    Events.Emit("calendar:follow", { eventId });
  }, []);

  const handleUnfollow = useCallback((eventId: string) => {
    Events.Emit("calendar:unfollow", { eventId });
  }, []);

  const handleSeriesFollow = useCallback((seriesId: string) => {
    Events.Emit("calendar:series:follow", { seriesId });
  }, []);

  const handleSeriesUnfollow = useCallback((seriesId: string) => {
    Events.Emit("calendar:series:unfollow", { seriesId });
  }, []);

  const now = new Date();
  const hasSeries = calendar ? calendar.series && calendar.series.length > 0 : false;
  const seriesGroups = calendar ? groupSeriesByTier(calendar.series ?? [], calendar.seriesPreviews) : [];
  const upcoming = calendar ? pickUpcoming(calendar, now) : [];
  const past = calendar ? pickPast(calendar, now) : [];
  const followedIds = calendar?.followedEventIds;
  const followedSeriesIds = calendar?.followedSeriesIds;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="opacity-0 animate-fade-in-up">
        <span className="v52-eyebrow">Carreras</span>
        <h1 className="font-sans font-bold text-3xl text-white tracking-tight mt-2">
          Carreras LMU
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
          Consulta las próximas carreras LMU publicadas por Vantare. Sigue una carrera para recibir avisos antes de la salida.
        </p>
      </header>

      {/* Informative block */}
      <section className="card-sleek rounded-xl p-5 opacity-0 animate-fade-in-up delay-75">
        <span className="v52-eyebrow">Calendario publicado por Vantare</span>
        <p className="text-sm text-vantare-textMuted mt-3 leading-relaxed">
          No necesitas importar nada manualmente. Cuando publiquemos una actualización semanal, las carreras aparecerán aquí.
        </p>
        <p className="text-[10px] font-mono text-vantare-textDim mt-3">
          Zona horaria: {calendar?.timezone || "local"}
        </p>
        {error && (
          <p className="text-xs text-red-400 mt-3" data-testid="calendar-error">
            {error}
          </p>
        )}
      </section>

      {/* Series (official schedule) or legacy upcoming races */}
      {hasSeries ? (
        <section className="opacity-0 animate-fade-in-up delay-100">
          <span className="v52-eyebrow">Series oficiales</span>
          {seriesGroups.map((group) => {
            const tierTier = group.tier;
            const groupLabel = tierLabel(tierTier);
            const subtitleMap: Record<string, string> = {
              beginner: "Carreras beginner · Bronze SR",
              intermediate: "Carreras intermediate · Silver SR",
              advanced: "Carreras advanced · Gold SR",
              weekly: "Eventos semanales · SR S2",
            };
            const subtitle = subtitleMap[tierTier] ?? "";
            const scheduleBadge =
              tierTier === "weekly"
                ? "Slots UTC"
                : tierTier === "advanced"
                  ? "Cada 30 min"
                  : tierTier === "intermediate"
                    ? "Cada 20 min"
                    : "Cada 15 min";
            const glowMap: Record<string, string> = {
              beginner: "border-amber-500/20 shadow-amber-500/5",
              intermediate: "border-slate-400/20 shadow-slate-400/5",
              advanced: "border-yellow-400/20 shadow-yellow-400/5",
              weekly: "border-cyan-400/20 shadow-cyan-400/5",
            };
            const glow = glowMap[tierTier] ?? "";
            return (
              <div
                key={tierTier}
                className={`mt-4 rounded-xl border bg-white/[0.03] backdrop-blur-sm p-4 ${glow}`}
                data-testid={`calendar-tier-${tierTier}`}
              >
                {/* Group header v5.2 */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="v52-eyebrow">{subtitle}</p>
                    <h2 className="text-base font-bold text-white mt-0.5">{groupLabel}</h2>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-white/5 text-vantare-textMuted border border-white/10 shrink-0 mt-1">
                    {scheduleBadge}
                  </span>
                </div>
                {/* Cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.series.map((s) => {
                    const preview = calendar?.seriesPreviews?.find((p) => p.seriesId === s.id);
                    const isSeriesFollowed = followedSeriesIds?.includes(s.id) ?? false;
                    return (
                      <CalendarSeriesCard
                        key={s.id}
                        series={s}
                        preview={preview}
                        isFollowed={isSeriesFollowed}
                        onFollow={handleSeriesFollow}
                        onUnfollow={handleSeriesUnfollow}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="opacity-0 animate-fade-in-up delay-100">
          <span className="v52-eyebrow">Próximas carreras</span>
          {upcoming.length === 0 ? (
            <div className="card-sleek rounded-xl p-5 mt-3" data-testid="calendar-no-upcoming">
              <p className="text-sm text-vantare-textMuted">
                No hay carreras próximas publicadas.
              </p>
              <p className="text-xs text-vantare-textDim mt-1">
                Vantare actualizará el calendario LMU desde nuevas versiones de la app.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {upcoming.map((ev) => {
                const followed = isFollowed(ev.id, followedIds);
                const active = isEventActive(ev, now);
                return (
                  <div
                    key={ev.id}
                    className={`card-sleek rounded-xl p-4${followed ? " border border-vantare-red-500/30" : ""}`}
                    data-testid="calendar-upcoming-event"
                  >
                    <p className="font-semibold text-sm text-white">{ev.title}</p>
                    {ev.track ? (
                      <p className="text-xs text-vantare-textMuted mt-0.5">{ev.track}</p>
                    ) : null}
                    <p className="text-[10px] text-vantare-textDim mt-1 font-mono">
                      {formatEventDate(ev)}
                      {ev.durationMin > 0 ? ` · ${ev.durationMin} min` : null}
                    </p>
                    <div className="mt-3 flex gap-2">
                      {active ? (
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-600/20 text-amber-400 border border-amber-600/30"
                          data-testid={`calendar-active-badge-${ev.id}`}
                        >
                          Activa ahora
                        </span>
                      ) : null}
                      {followed ? (
                        <>
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                            data-testid={`calendar-following-badge-${ev.id}`}
                          >
                            Siguiendo
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnfollow(ev.id)}
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold text-vantare-textMuted bg-white/5 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                            data-testid={`calendar-unfollow-btn-${ev.id}`}
                          >
                            Dejar de seguir
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleFollow(ev.id)}
                          className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-vantare-red-600 hover:bg-vantare-red-500 text-white transition-colors"
                          data-testid={`calendar-follow-btn-${ev.id}`}
                        >
                          Seguir carrera
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Past races */}
      <section className="opacity-0 animate-fade-in-up delay-150">
        <span className="v52-eyebrow">Carreras pasadas</span>
        {past.length === 0 ? (
          <div className="card-sleek rounded-xl p-5 mt-3" data-testid="calendar-no-past">
            <p className="text-sm text-vantare-textMuted">
              No hay carreras pasadas todavía.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {past.map((ev) => (
              <div
                key={ev.id}
                className="card-sleek rounded-xl p-4 opacity-70"
                data-testid="calendar-past-event"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-white">{ev.title}</p>
                  <span
                    className="bg-white/5 text-vantare-textDim border border-white/10 text-[10px] font-bold px-2.5 py-1 rounded-md"
                    data-testid={`calendar-finished-badge-${ev.id}`}
                  >
                    Finalizada
                  </span>
                </div>
                {ev.track ? (
                  <p className="text-xs text-vantare-textMuted mt-0.5">{ev.track}</p>
                ) : null}
                <p className="text-[10px] text-vantare-textDim mt-1 font-mono">
                  {formatEventDate(ev)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
