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
} from "../../calendar/calendar-types";

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

  const now = new Date();
  const upcoming = calendar ? pickUpcoming(calendar, now) : [];
  const past = calendar ? pickPast(calendar, now) : [];
  const followedIds = calendar?.followedEventIds;

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

      {/* Upcoming races */}
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
