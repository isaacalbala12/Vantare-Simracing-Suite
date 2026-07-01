import { useEffect, useState } from "react";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import {
  formatCountdown,
  formatEventDate,
  isEventActive,
  type Calendar,
  type RaceEvent,
} from "../../calendar/calendar-types";

type NextRaceCardProps = {
  // now is injected so tests can pin the clock. The component uses
  // `new Date()` when not provided.
  now?: () => Date;
  // onImport is the CTA callback for the empty state. The integration with
  // ImportCalendarDrawer is the responsibility of the consumer (CALENDAR-02).
  onImport?: () => void;
};

type ViewModel =
  | { kind: "no-calendar" }
  | { kind: "loaded"; event: RaceEvent; countdown: string }
  | { kind: "loaded-no-upcoming" };

function pickUpcoming(calendar: Calendar, now: Date): RaceEvent | null {
  if (calendar.events.length === 0) return null;
  // Upcoming: the active event (if any) or the next future event.
  const sorted = [...calendar.events].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (const ev of sorted) {
    if (isEventActive(ev, now)) return ev;
    const start = new Date(ev.startTime);
    if (start.getTime() > now.getTime()) return ev;
  }
  return null;
}

export function NextRaceCard({ now, onImport }: NextRaceCardProps) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    requestCalendar();
    const unsub = subscribeToCalendar((state) => {
      if (state.kind === "loaded") {
        setCalendar(state.calendar);
      }
    });
    return unsub;
  }, []);

  // Re-render once a minute to refresh the countdown. The cadence is loose on
  // purpose: the underlying service emits a fresh "calendar:loaded" whenever
  // the user reimports, which is the only moment the displayed time actually
  // changes meaningfully.
  useEffect(() => {
    const interval = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const viewModel: ViewModel = (() => {
    if (!calendar) return { kind: "no-calendar" };
    const nowDate = now ? now() : new Date();
    const upcoming = pickUpcoming(calendar, nowDate);
    if (!upcoming) return { kind: "loaded-no-upcoming" };
    const countdown = formatCountdown(upcoming, nowDate);
    return { kind: "loaded", event: upcoming, countdown };
  })();
  // Reference `tick` so React does not tree-shake the interval when the view
  // model alone is enough to drive the rendering; the tick is the safety net
  // for long sessions where the user keeps the card open.
  void tick;

  if (viewModel.kind === "no-calendar") {
    return (
      <section
        className="glass-panel rounded-xl p-6 border border-white/5"
        data-testid="next-race-empty"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Próxima carrera
        </h2>
        <p className="text-sm text-vantare-textMuted">
          Calendario LMU no cargado todavía.
        </p>
        <button
          type="button"
          onClick={onImport}
          title="Próximamente"
          className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textDim bg-vantare-surface border border-white/5"
        >
          Importar calendario LMU
        </button>
      </section>
    );
  }

  if (viewModel.kind === "loaded-no-upcoming") {
    return (
      <section
        className="glass-panel rounded-xl p-6 border border-white/5"
        data-testid="next-race-no-upcoming"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Próxima carrera
        </h2>
        <p className="text-sm text-vantare-textMuted">
          Sin carreras próximas en el calendario importado.
        </p>
        <p className="text-xs text-vantare-textDim mt-2">
          Cuando importes un calendario nuevo, aquí aparecerá la próxima sesión.
        </p>
        <button
          type="button"
          onClick={onImport}
          className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold text-vantare-textDim bg-vantare-surface border border-white/5"
        >
          Importar nuevo calendario
        </button>
      </section>
    );
  }

  const { event, countdown } = viewModel;
  return (
    <section
      className="glass-panel rounded-xl p-6 border border-white/5"
      data-testid="next-race-card"
    >
      <h2 className="font-display font-semibold text-lg text-white mb-2">
        Próxima carrera
      </h2>
      <p className="font-display font-semibold text-white" data-testid="next-race-title">
        {event.title}
      </p>
      {event.track ? (
        <p className="text-xs text-vantare-textMuted mt-1" data-testid="next-race-track">
          {event.track}
        </p>
      ) : null}
      <p className="text-xs text-vantare-textDim mt-2" data-testid="next-race-date">
        {formatEventDate(event)}
      </p>
      {countdown ? (
        <p
          className="text-sm font-semibold text-vantare-accent mt-3"
          data-testid="next-race-countdown"
        >
          {countdown}
        </p>
      ) : null}
      {event.source ? (
        <p className="text-[10px] text-vantare-textDim mt-3" data-testid="next-race-source">
          Fuente: {event.source}
        </p>
      ) : null}
    </section>
  );
}
