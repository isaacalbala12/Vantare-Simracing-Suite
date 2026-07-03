import { useMemo } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import {
  isSameLocalDay,
  expandWeeklySlots,
  startOfLocalDay,
  type CalendarOccurrence,
} from "../../calendar/calendar-view-math";
import { buildUpcomingRaceItems } from "./calendar-upcoming";
import type { CalendarFilter } from "./CalendarToolbar";

const TIER_INFO: Record<
  Exclude<CalendarFilter, "all">,
  { label: string; color: string; bg: string; border: string }
> = {
  beginner: { label: "Bronce", color: "#CD7F32", bg: "rgba(205,127,50,.12)", border: "rgba(205,127,50,.5)" },
  intermediate: { label: "Plata", color: "#B8BFC8", bg: "rgba(184,191,200,.12)", border: "rgba(184,191,200,.5)" },
  advanced: { label: "Oro", color: "#D4A017", bg: "rgba(212,160,23,.12)", border: "rgba(212,160,23,.5)" },
  weekly: { label: "Semanal", color: "#ff3b3b", bg: "rgba(255,59,59,.12)", border: "rgba(255,59,59,.5)" },
  special: { label: "Especial", color: "#f59e0b", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.5)" },
};

export type CalendarRaceDetailDrawerProps = {
  tier: CalendarFilter;
  calendar: Calendar;
  anchorDate: Date;
  onClose: () => void;
  onClearFilter: () => void;
};

type DrawerRaceItem = {
  id: string;
  name: string;
  track: string;
  startTime: Date;
  durationMin: number;
  type: "special" | "weekly" | "series";
};

export function CalendarRaceDetailDrawer({
  tier,
  calendar,
  anchorDate,
  onClose,
  onClearFilter,
}: CalendarRaceDetailDrawerProps) {
  const info = TIER_INFO[tier as Exclude<CalendarFilter, "all">] ?? TIER_INFO.special;

  const upcoming = useMemo(() => buildUpcomingRaceItems(calendar, new Date()), [calendar]);

  const upcomingItems: DrawerRaceItem[] = useMemo(() => {
    const items: DrawerRaceItem[] = [];
    if (tier === "beginner" && upcoming.bronce) {
      items.push({
        id: upcoming.bronce.id,
        name: upcoming.bronce.name,
        track: upcoming.bronce.track,
        durationMin: upcoming.bronce.durationMin,
        startTime: upcoming.bronce.nextStart ? new Date(upcoming.bronce.nextStart) : new Date(),
        type: upcoming.bronce.kind === "event" ? "special" : "series",
      });
    } else if (tier === "intermediate" && upcoming.plata) {
      items.push({
        id: upcoming.plata.id,
        name: upcoming.plata.name,
        track: upcoming.plata.track,
        durationMin: upcoming.plata.durationMin,
        startTime: upcoming.plata.nextStart ? new Date(upcoming.plata.nextStart) : new Date(),
        type: upcoming.plata.kind === "event" ? "special" : "series",
      });
    } else if (tier === "advanced" && upcoming.oro) {
      items.push({
        id: upcoming.oro.id,
        name: upcoming.oro.name,
        track: upcoming.oro.track,
        durationMin: upcoming.oro.durationMin,
        startTime: upcoming.oro.nextStart ? new Date(upcoming.oro.nextStart) : new Date(),
        type: upcoming.oro.kind === "event" ? "special" : "series",
      });
    } else if (tier === "weekly" && upcoming.weekly) {
      items.push({
        id: upcoming.weekly.id,
        name: upcoming.weekly.name,
        track: upcoming.weekly.track,
        durationMin: upcoming.weekly.durationMin,
        startTime: upcoming.weekly.nextStart ? new Date(upcoming.weekly.nextStart) : new Date(),
        type: upcoming.weekly.kind === "event" ? "special" : "series",
      });
    } else if (tier === "special") {
      for (const ev of upcoming.events) {
        items.push({
          id: ev.id,
          name: ev.name,
          track: ev.track,
          durationMin: ev.durationMin,
          startTime: ev.nextStart ? new Date(ev.nextStart) : new Date(),
          type: ev.kind === "event" ? "special" : "series",
        });
      }
    }
    return items;
  }, [upcoming, tier]);

  const dayItems: DrawerRaceItem[] = useMemo(() => {
    const dayStart = startOfLocalDay(anchorDate);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const items: DrawerRaceItem[] = [];

    if (tier === "special") {
      for (const ev of calendar.events || []) {
        if (!isSameLocalDay(new Date(ev.startTime), anchorDate)) continue;
        const series = (calendar.series || []).find((s) => s.id === ev.series);
        if (series && series.recurrence?.kind === "interval") continue;
        items.push({
          id: ev.id,
          name: ev.title,
          track: ev.track,
          startTime: new Date(ev.startTime),
          durationMin: ev.durationMin,
          type: "special",
        });
      }
      // Also include weekly-slots occurrences from special-tier series
      const weeklyOcc = (calendar.series || []).flatMap((s) =>
        s.tier === "special" && s.recurrence?.kind === "weekly-slots"
          ? expandWeeklySlots(s, dayStart, dayEnd)
          : [],
      );
      for (const occ of weeklyOcc) {
        const series = (calendar.series || []).find((s) => s.id === occ.seriesId);
        if (!series) continue;
        items.push({
          id: occ.seriesId,
          name: series.name,
          track: series.track,
          startTime: new Date(occ.startTime),
          durationMin: series.durationMin,
          type: "special",
        });
      }
    } else {
      // For beginner / intermediate / advanced / weekly: use weekly-slots occurrences
      const weeklyOccurrences: CalendarOccurrence[] = (calendar.series || []).flatMap((s) =>
        expandWeeklySlots(s, dayStart, dayEnd)
      );
      for (const occ of weeklyOccurrences) {
        const series = (calendar.series || []).find((s) => s.id === occ.seriesId);
        if (!series) continue;
        const matches =
          (tier === "weekly" && series.tier === "weekly") ||
          (tier === "beginner" && series.tier === "beginner") ||
          (tier === "intermediate" && series.tier === "intermediate") ||
          (tier === "advanced" && series.tier === "advanced");
        if (!matches) continue;
        items.push({
          id: `${occ.seriesId}-${occ.startTime.getTime()}`,
          name: occ.title,
          track: series.track,
          startTime: occ.startTime,
          durationMin: occ.durationMin,
          type: "weekly",
        });
      }
      // Also include any concrete events from series of the selected tier, if present
      for (const ev of calendar.events || []) {
        if (!isSameLocalDay(new Date(ev.startTime), anchorDate)) continue;
        const series = (calendar.series || []).find((s) => s.id === ev.series);
        if (series && series.recurrence?.kind === "interval") continue;
        if (series?.tier === tier) {
          items.push({
            id: ev.id,
            name: ev.title,
            track: ev.track,
            startTime: new Date(ev.startTime),
            durationMin: ev.durationMin,
            type: "special",
          });
        }
      }
    }

    return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [calendar, anchorDate, tier]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="calendar-race-detail-drawer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <aside
        className="relative w-full max-w-md bg-[#0a0a0a] border-l border-white/10 shadow-2xl shadow-black flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b border-white/10"
          style={{ borderBottomColor: info.border }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: info.color }}
            />
            <h2 className="text-lg font-bold text-white" data-testid="calendar-detail-drawer-title">
              {info.label}
            </h2>
          </div>
          <button
            data-testid="calendar-detail-drawer-close"
            onClick={onClose}
            className="text-vantare-textDim hover:text-white text-xl leading-none px-2"
            aria-label="Cerrar panel"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Upcoming races */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted mb-2">
              Próximas carreras
            </h3>
            {upcomingItems.length === 0 ? (
              <p className="text-xs text-vantare-textDim italic">
                No hay próximas carreras para este tipo.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingItems.map((item) => (
                  <li
                    key={item.id}
                    data-testid="calendar-detail-drawer-upcoming-item"
                    className="rounded border border-white/10 bg-white/[0.03] p-2.5 text-sm"
                  >
                    <div className="font-semibold text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-vantare-textDim font-mono mt-0.5">
                      {item.track} · {formatTime(item.startTime)} · {item.durationMin}m
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Filtered day schedule */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted mb-2">
              Calendario del día filtrado
            </h3>
            {dayItems.length === 0 ? (
              <p className="text-xs text-vantare-textDim italic">
                No hay carreras de este tipo en el día seleccionado.
              </p>
            ) : (
              <ul className="space-y-2">
                {dayItems.map((item) => (
                  <li
                    key={item.id}
                    data-testid="calendar-detail-drawer-day-item"
                    className="rounded border-l-2 pl-3 py-2 bg-white/[0.02] text-sm"
                    style={{ borderLeftColor: info.color }}
                  >
                    <div className="font-semibold text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-vantare-textDim font-mono mt-0.5">
                      {formatTime(item.startTime)} · {item.durationMin}m{item.track ? ` · ${item.track}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02]">
          <button
            data-testid="calendar-detail-drawer-clear-filter"
            onClick={onClearFilter}
            className="w-full py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors"
            style={{
              color: info.color,
              background: info.bg,
              border: `1px solid ${info.border}`,
            }}
          >
            Quitar filtro
          </button>
        </div>
      </aside>
    </div>
  );
}
