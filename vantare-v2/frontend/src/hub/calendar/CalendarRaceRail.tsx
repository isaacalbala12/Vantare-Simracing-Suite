import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";

type CalendarRaceRailProps = {
  now?: () => Date;
};

function formatRailTime(dateStr: string | null, now: Date): string {
  if (!dateStr) return "N/A";
  const start = new Date(dateStr).getTime();
  const diff = start - now.getTime();
  if (diff <= 0) return "En curso";
  const diffMins = Math.floor(diff / 60000);
  if (diffMins < 60) return `en ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) {
    if (remainingMins === 0) return `en ${diffHours}h`;
    return `en ${diffHours}h ${remainingMins}m`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `en ${diffDays}d`;
}

function formatWeeklyTime(dateStr: string | null, now: Date): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoy ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return `Mañana ${time}`;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
}

const TIER_STYLES: Record<string, { label: string; border: string; bgClass: string }> = {
  beginner: {
    label: "Bronce",
    border: "rgba(205,127,50,1)",
    bgClass: "bg-[rgba(205,127,50,.1)]",
  },
  intermediate: {
    label: "Plata",
    border: "rgba(184,191,200,1)",
    bgClass: "bg-[rgba(184,191,200,.1)]",
  },
  advanced: {
    label: "Oro",
    border: "rgba(212,160,23,1)",
    bgClass: "bg-[rgba(212,160,23,.1)]",
  },
};

function RailCard({ item, tierKey, now, isFollowed, onFollow, onUnfollow }: { item: UpcomingRaceItem | null; tierKey: string; now: Date; isFollowed: boolean; onFollow: (item: UpcomingRaceItem) => void; onUnfollow: (item: UpcomingRaceItem) => void }) {
  const styles = TIER_STYLES[tierKey] || TIER_STYLES.beginner;

  if (!item) return null;

  const timeStr = formatRailTime(item.nextStart, now);

  return (
    <div
      className="card-sleek rounded-xl p-3 relative overflow-hidden group"
      data-testid={`rail-card-${tierKey}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: styles.border, boxShadow: `0 0 10px ${styles.border}` }} />
      <div className="flex flex-col gap-1.5 pl-2">
        <div className="flex items-center justify-between">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] ${styles.bgClass}`} style={{ color: styles.border, border: `1px solid ${styles.border}` }}>
            {styles.label}
          </span>
          {item.isActive ? (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.22em] text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-indicator"></span>
              Live
            </span>
          ) : (
            <span className="font-mono font-bold text-xs text-white" style={{ fontFeatureSettings: "'tnum'" }}>
              {timeStr}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-xs text-white truncate" title={item.track}>{item.track}</p>
            <p className="text-[10px] text-[#f5f5f5]/60 truncate mt-0.5" title={item.name}>{item.name}</p>
          </div>
          {item.id && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (isFollowed) { onUnfollow(item); } else { onFollow(item); } }}
              className={`shrink-0 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[.1em] transition-colors group/btn ${
                isFollowed
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-vantare-red-500/10 hover:text-vantare-red-400 hover:border-vantare-red-500/20"
                  : "bg-white/5 text-[#f5f5f5]/60 border border-white/10 hover:text-white hover:border-white/20"
              }`}
              aria-label={isFollowed ? `Dejar de seguir ${item.name}` : `Seguir ${item.name}`}
              aria-pressed={isFollowed}
              title={isFollowed ? "Dejar de seguir" : "Seguir serie"}
              data-testid={`rail-follow-btn-${item.id}`}
            >
              {isFollowed ? (
                <span>Siguiendo · Dejar</span>
              ) : (
                <span>Seguir</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CalendarRaceRail({ now }: CalendarRaceRailProps) {
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

  useEffect(() => {
    const interval = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const nowDate = now ? now() : new Date();
  void tick;

  if (!calendar) {
    return (
      <div className="glass-panel rounded-xl p-4 opacity-0 animate-fade-in-up delay-200">
        <div className="px-2 py-1.5 mb-2 flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: "9px" }}>Próximas carreras</span>
        </div>
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-4 text-center">
          <p className="text-xs font-semibold text-white">Cargando...</p>
        </div>
      </div>
    );
  }

  const summary = buildUpcomingRaceItems(calendar, nowDate);

  const handleFollow = (item: UpcomingRaceItem) => {
    if (item.kind === "series") {
      Events.Emit("calendar:series:follow", { seriesId: item.id });
    } else {
      Events.Emit("calendar:follow", { eventId: item.id });
    }
  };

  const handleUnfollow = (item: UpcomingRaceItem) => {
    if (item.kind === "series") {
      Events.Emit("calendar:series:unfollow", { seriesId: item.id });
    } else {
      Events.Emit("calendar:unfollow", { eventId: item.id });
    }
  };

  const hasItems = summary.weekly || summary.bronce || summary.plata || summary.oro;

  return (
    <div className="glass-panel rounded-xl p-4 opacity-0 animate-fade-in-up delay-200" data-testid="calendar-race-rail">
      <div className="px-2 py-1.5 mb-2 flex items-center justify-between">
        <span className="eyebrow" style={{ fontSize: "9px" }}>Próximas carreras</span>
      </div>

      {!hasItems ? (
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-4 text-center">
          <p className="text-xs font-semibold text-white">No hay carreras</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {summary.weekly && (
            <div
              className="card-sleek rounded-xl p-3 relative overflow-hidden group"
              data-testid="rail-card-weekly"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" style={{ boxShadow: "0 0 10px #ff3b3b" }} />
              <div className="flex flex-col gap-1.5 pl-2">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em]" style={{ background: "rgba(255,59,59,.15)", color: "#ff3b3b", border: "1px solid rgba(255,59,59,.4)" }}>
                    Weekly
                  </span>
                  {summary.weekly.isActive ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.22em] text-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent live-indicator"></span>
                      Live
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-xs text-white" style={{ fontFeatureSettings: "'tnum'" }}>
                      {formatWeeklyTime(summary.weekly.nextStart, nowDate)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-white truncate" title={summary.weekly.name}>WEC Weekly</p>
                    <p className="text-[10px] text-[#f5f5f5]/60 truncate mt-0.5" title={summary.weekly.track}>{summary.weekly.track}</p>
                  </div>
                  {summary.weekly.id && (() => {
                    const followed = summary.weekly.kind === "series" ? (calendar.followedSeriesIds?.includes(summary.weekly.id) ?? false) : (calendar.followedEventIds?.includes(summary.weekly.id) ?? false);
                    return (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (followed) { handleUnfollow(summary.weekly!); } else { handleFollow(summary.weekly!); } }}
                        className={`shrink-0 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[.1em] transition-colors group/btn ${
                          followed
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-vantare-red-500/10 hover:text-vantare-red-400 hover:border-vantare-red-500/20"
                            : "bg-white/5 text-[#f5f5f5]/60 border border-white/10 hover:text-white hover:border-white/20"
                        }`}
                        title={followed ? "Dejar de seguir" : "Seguir serie"}
                        aria-label={followed ? `Dejar de seguir ${summary.weekly.name}` : `Seguir ${summary.weekly.name}`}
                        aria-pressed={followed}
                        data-testid={`rail-follow-btn-${summary.weekly.id}`}
                      >
                        {followed ? (
                          <span>Siguiendo · Dejar</span>
                        ) : (
                          <span>Seguir</span>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          <RailCard item={summary.bronce} tierKey="beginner" now={nowDate} isFollowed={summary.bronce ? (summary.bronce.kind === "series" ? (calendar.followedSeriesIds?.includes(summary.bronce.id) ?? false) : (calendar.followedEventIds?.includes(summary.bronce.id) ?? false)) : false} onFollow={handleFollow} onUnfollow={handleUnfollow} />
          <RailCard item={summary.plata} tierKey="intermediate" now={nowDate} isFollowed={summary.plata ? (summary.plata.kind === "series" ? (calendar.followedSeriesIds?.includes(summary.plata.id) ?? false) : (calendar.followedEventIds?.includes(summary.plata.id) ?? false)) : false} onFollow={handleFollow} onUnfollow={handleUnfollow} />
          <RailCard item={summary.oro} tierKey="advanced" now={nowDate} isFollowed={summary.oro ? (summary.oro.kind === "series" ? (calendar.followedSeriesIds?.includes(summary.oro.id) ?? false) : (calendar.followedEventIds?.includes(summary.oro.id) ?? false)) : false} onFollow={handleFollow} onUnfollow={handleUnfollow} />
        </div>
      )}
    </div>
  );
}
