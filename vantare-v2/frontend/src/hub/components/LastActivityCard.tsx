import { useEffect, useState } from "react";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import {
  eventEnd,
  formatEventDate,
  type Calendar,
  type RaceEvent,
} from "../../calendar/calendar-types";

type LastActivityCardProps = {
  // now is injected so tests can pin the clock.
  now?: () => Date;
};

type ViewModel =
  | { kind: "no-calendar" }
  | { kind: "empty" }
  | { kind: "loaded"; event: RaceEvent };

function pickPast(calendar: Calendar, now: Date): RaceEvent | null {
  if (calendar.events.length === 0) return null;
  // Past: the most recent event whose end time has already passed. We do NOT
  // consider an active event (start <= now < end) as past: that belongs to
  // NextRaceCard.
  const sorted = [...calendar.events].sort((a, b) =>
    b.startTime.localeCompare(a.startTime),
  );
  for (const ev of sorted) {
    const end = eventEnd(ev);
    if (end.getTime() <= now.getTime()) {
      return ev;
    }
  }
  return null;
}

export function LastActivityCard({ now }: LastActivityCardProps) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);

  useEffect(() => {
    requestCalendar();
    const unsub = subscribeToCalendar((state) => {
      if (state.kind === "loaded") {
        setCalendar(state.calendar);
      }
    });
    return unsub;
  }, []);

  const viewModel: ViewModel = (() => {
    if (!calendar) return { kind: "no-calendar" };
    const nowDate = now ? now() : new Date();
    const past = pickPast(calendar, nowDate);
    if (!past) return { kind: "empty" };
    return { kind: "loaded", event: past };
  })();

  if (viewModel.kind === "no-calendar") {
    return (
      <section
        className="glass-panel rounded-xl p-6 border border-white/5"
        data-testid="last-activity-empty"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Última actividad
        </h2>
        <p className="text-sm text-vantare-textMuted">
          Sin carreras registradas todavía.
        </p>
        <p className="text-xs text-vantare-textDim mt-2">
          Cuando importes un calendario, aquí aparecerá la última sesión pasada.
        </p>
      </section>
    );
  }

  if (viewModel.kind === "empty") {
    return (
      <section
        className="glass-panel rounded-xl p-6 border border-white/5"
        data-testid="last-activity-empty"
      >
        <h2 className="font-display font-semibold text-lg text-white mb-2">
          Última actividad
        </h2>
        <p className="text-sm text-vantare-textMuted">
          Sin carreras registradas todavía.
        </p>
        <p className="text-xs text-vantare-textDim mt-2">
          El calendario importado todavía no tiene carreras pasadas.
        </p>
      </section>
    );
  }

  const { event } = viewModel;
  return (
    <section
      className="glass-panel rounded-xl p-6 border border-white/5"
      data-testid="last-activity-card"
    >
      <h2 className="font-display font-semibold text-lg text-white mb-2">
        Última actividad
      </h2>
      <p
        className="font-display font-semibold text-white"
        data-testid="last-activity-title"
      >
        {event.title}
      </p>
      {event.track ? (
        <p
          className="text-xs text-vantare-textMuted mt-1"
          data-testid="last-activity-track"
        >
          {event.track}
        </p>
      ) : null}
      <p
        className="text-xs text-vantare-textDim mt-2"
        data-testid="last-activity-date"
      >
        {formatEventDate(event)}
      </p>
      <p
        className="text-[10px] text-vantare-textDim mt-3"
        data-testid="last-activity-disclaimer"
      >
        Basado en el calendario importado. Resultados oficiales no verificados.
      </p>
    </section>
  );
}
