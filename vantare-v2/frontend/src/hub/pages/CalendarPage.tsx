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

export function CalendarPage() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [timezone, setTimezone] = useState("Europe/Madrid");
  const [source, setSource] = useState("discord-lmu-week");
  const [localError, setLocalError] = useState<string | null>(null);

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

  const handleImport = useCallback(() => {
    setLocalError(null);
    const text = importText.trim();
    if (!text) {
      setLocalError("Pega el texto del calendario antes de importar.");
      return;
    }
    Events.Emit("calendar:import", { text, timezone, source });
  }, [importText, timezone, source]);

  const handleClear = useCallback(() => {
    if (!window.confirm("¿Borrar el calendario? Los datos importados se perderán.")) return;
    Events.Emit("calendar:clear", null);
  }, []);

  const now = new Date();
  const upcoming = calendar ? pickUpcoming(calendar, now) : [];
  const past = calendar ? pickPast(calendar, now) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="opacity-0 animate-fade-in-up">
        <span className="v52-eyebrow">Calendario</span>
        <h1 className="font-sans font-bold text-3xl text-white tracking-tight mt-2">
          Calendario LMU
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
          Importa horarios semanales de LMU desde Discord usando texto normalizado.
        </p>
      </header>

      {/* Import section */}
      <section className="card-sleek rounded-xl p-5 opacity-0 animate-fade-in-up delay-75">
        <span className="v52-eyebrow">Importar calendario</span>
        <div className="mt-3 space-y-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Pega aquí el texto con los horarios..."
            rows={5}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white font-mono placeholder:text-vantare-textDim resize-y focus:outline-none focus:border-vantare-red-500/50"
            data-testid="calendar-import-textarea"
          />
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="calendar-tz" className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                Zona horaria
              </label>
              <input
                id="calendar-tz"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-vantare-red-500/50"
                data-testid="calendar-timezone-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="calendar-source" className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                Fuente
              </label>
              <input
                id="calendar-source"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-vantare-red-500/50"
                data-testid="calendar-source-input"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleImport}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-vantare-red-600 hover:bg-vantare-red-500 text-white transition-colors"
              data-testid="calendar-import-btn"
            >
              Importar calendario
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 rounded-lg text-xs font-bold text-vantare-textMuted bg-white/5 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
              data-testid="calendar-clear-btn"
            >
              Borrar calendario
            </button>
          </div>
          {localError && (
            <p className="text-xs text-red-400" data-testid="calendar-local-error">
              {localError}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400" data-testid="calendar-error">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Upcoming races */}
      <section className="opacity-0 animate-fade-in-up delay-100">
        <span className="v52-eyebrow">Próximas carreras</span>
        {upcoming.length === 0 ? (
          <div className="card-sleek rounded-xl p-5 mt-3" data-testid="calendar-no-upcoming">
            <p className="text-sm text-vantare-textMuted">
              {calendar
                ? "No hay carreras próximas en el calendario importado."
                : "Importa un calendario para ver las próximas carreras."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {upcoming.map((ev) => (
              <div
                key={ev.id}
                className="card-sleek rounded-xl p-4"
                data-testid="calendar-upcoming-event"
              >
                <p className="font-semibold text-sm text-white">{ev.title}</p>
                {ev.track ? (
                  <p className="text-xs text-vantare-textMuted mt-0.5">{ev.track}</p>
                ) : null}
                <p className="text-[10px] text-vantare-textDim mt-1 font-mono">
                  {formatEventDate(ev)}
                </p>
                {ev.source ? (
                  <p className="text-[9px] text-vantare-textDim mt-2 font-mono">
                    Fuente: {ev.source}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past races */}
      <section className="opacity-0 animate-fade-in-up delay-150">
        <span className="v52-eyebrow">Carreras pasadas</span>
        {past.length === 0 ? (
          <div className="card-sleek rounded-xl p-5 mt-3" data-testid="calendar-no-past">
            <p className="text-sm text-vantare-textMuted">
              {calendar
                ? "No hay carreras pasadas en el calendario importado."
                : "Importa un calendario para ver las carreras pasadas."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {past.map((ev) => (
              <div
                key={ev.id}
                className="card-sleek rounded-xl p-4"
                data-testid="calendar-past-event"
              >
                <p className="font-semibold text-sm text-white">{ev.title}</p>
                {ev.track ? (
                  <p className="text-xs text-vantare-textMuted mt-0.5">{ev.track}</p>
                ) : null}
                <p className="text-[10px] text-vantare-textDim mt-1 font-mono">
                  {formatEventDate(ev)}
                </p>
                {ev.source ? (
                  <p className="text-[9px] text-vantare-textDim mt-2 font-mono">
                    Fuente: {ev.source}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
