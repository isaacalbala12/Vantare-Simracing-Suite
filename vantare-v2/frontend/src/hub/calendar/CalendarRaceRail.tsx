import { Events } from "@wailsio/runtime";
import type { Calendar } from "../../calendar/calendar-types";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";
import { tierStyle } from "./calendar-shared";
import type { CalendarFilter } from "./CalendarToolbar";
import { useAccess } from "../../lib/access";
import { canUseFeature } from "../../lib/access-policy";

type CalendarRaceRailProps = {
  calendar: Calendar | null;
  now?: () => Date;
  activeFilter?: CalendarFilter;
  onSelectTier?: (filter: CalendarFilter) => void;
};

function formatRailTime(dateStr: string | null, now: Date, _timeZone: string): string {
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
function tierKeyToFilter(key: string): CalendarFilter {
  switch (key) {
    case "beginner": return "beginner";
    case "intermediate": return "intermediate";
    case "advanced": return "advanced";
    case "weekly": return "weekly";
    case "special": return "special";
    default: return "all";
  }
}

function RailCard({ item, tierKey, now, isFollowed, onFollow, onUnfollow, onSelectTier, canFollow, timeZone }: {
  item: UpcomingRaceItem | null;
  tierKey: string;
  now: Date;
  isFollowed: boolean;
  onFollow: (item: UpcomingRaceItem) => void;
  onUnfollow: (item: UpcomingRaceItem) => void;
  onSelectTier?: (filter: CalendarFilter) => void;
  canFollow: boolean;
  timeZone: string;
}) {
  const styles = tierStyle(tierKey);

  if (!item) return null;

  const timeStr = formatRailTime(item.nextStart, now, timeZone);

  return (
    <div
      className="card-sleek rounded-xl p-3 relative overflow-hidden group cursor-pointer"
      data-testid={`rail-card-${tierKey}`}
      onClick={() => onSelectTier?.(tierKeyToFilter(tierKey))}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: styles.accent, boxShadow: `0 0 10px ${styles.accent}` }} />
      <div className="flex flex-col gap-1.5 pl-2">
        <div className="flex items-center justify-between">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em]"
            style={{ color: styles.text, background: styles.bg, border: `1px solid ${styles.border}` }}
          >
            {styles.text === "#f5f5f5" ? tierKey : ""}
            {tierLabelShort(tierKey)}
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
          {item.id && canFollow && (
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
          {item.id && !canFollow && (
            <span
              className="shrink-0 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[.1em] bg-white/5 text-vantare-textMuted border border-white/10 cursor-not-allowed"
              title="Disponible para testers y planes de pago"
              data-testid={`rail-follow-locked-${item.id}`}
            >
              Bloqueado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function tierLabelShort(tier: string): string {
  switch (tier) {
    case "beginner": return "Bronce";
    case "intermediate": return "Plata";
    case "advanced": return "Oro";
    case "weekly": return "Semanal";
    case "special": return "Especial";
    default: return tier;
  }
}

export function CalendarRaceRail({ calendar, now, activeFilter = "all", onSelectTier }: CalendarRaceRailProps) {
  const access = useAccess();
  const canFollow = canUseFeature(access, "calendar.followReminders");
  const nowDate = now ? now() : new Date();
  const timeZone = calendar?.timezone ?? "UTC";

  if (!calendar) {
    return (
      <div className="glass-panel rounded-xl p-4 opacity-0 animate-fade-in-up delay-200">
        <div className="py-1.5 mb-2 text-center">
          <span className="v52-eyebrow" style={{ fontSize: "9px" }}>Próximas carreras</span>
        </div>
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-4 text-center">
          <p className="text-xs font-semibold text-white">Cargando...</p>
        </div>
      </div>
    );
  }
  const allItems = buildUpcomingRaceItems(calendar, nowDate);

  const filter = activeFilter ?? "all";
  const filteredItems = allItems.filter((item) => {
    if (filter === "all") return true;
    if (item.tier === "event") return filter === "special";
    return item.tier === filter;
  });

  const handleFollow = (item: UpcomingRaceItem) => {
    if (!canFollow) return;
    if (item.kind === "series") {
      Events.Emit("calendar:series:follow", { seriesId: item.id });
    } else {
      Events.Emit("calendar:follow", { eventId: item.id });
    }
  };

  const handleUnfollow = (item: UpcomingRaceItem) => {
    if (!canFollow) return;
    if (item.kind === "series") {
      Events.Emit("calendar:series:unfollow", { seriesId: item.id });
    } else {
      Events.Emit("calendar:unfollow", { eventId: item.id });
    }
  };

  return (
    <div className="glass-panel rounded-xl p-4 opacity-0 animate-fade-in-up delay-200" data-testid="calendar-race-rail">
      <div className="py-1.5 mb-2 text-center">
        <span className="v52-eyebrow" style={{ fontSize: "9px" }}>Próximas carreras</span>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-4 text-center">
          <p className="text-xs font-semibold text-white">No hay carreras</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredItems.map((item) => (
            <RailCard
              key={item.id}
              item={item}
              tierKey={item.tier}
              now={nowDate}
              isFollowed={item.kind === "series"
                ? (calendar.followedSeriesIds?.includes(item.id) ?? false)
                : (calendar.followedEventIds?.includes(item.id) ?? false)}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onSelectTier={onSelectTier}
              canFollow={canFollow}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}
    </div>
  );
}
