import { Events } from "@wailsio/runtime";
import type { Calendar } from "../../calendar/calendar-types";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";
import { tierStyle, tierLabel, tierBadgeStyle } from "./calendar-shared";
import type { CalendarFilter } from "./CalendarToolbar";
import { useAccess } from "../../lib/access";
import { canUseFeature } from "../../lib/access-policy";

type CalendarRaceRailProps = {
  calendar: Calendar | null;
  now?: () => Date;
  activeFilter?: CalendarFilter;
  onSelectTier?: (filter: CalendarFilter) => void;
};

type TierRailStyle = { color: string; topBar: string; bgGrad: string };

const TIER_RAIL_STYLES: Record<string, TierRailStyle> = {
  beginner: {
    color: tierStyle("beginner").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#6B3F1C 25%,#CD7F32 50%,#F5C889 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(205,127,50,.05) 0%,rgba(20,20,20,.65) 50%)",
  },
  intermediate: {
    color: tierStyle("intermediate").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#3D4654 25%,#B8BFC8 50%,#F0F4F8 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(184,191,200,.04) 0%,rgba(20,20,20,.65) 50%)",
  },
  advanced: {
    color: tierStyle("advanced").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#7A5C08 25%,#D4A017 50%,#EBB945 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(212,160,23,.05) 0%,rgba(20,20,20,.65) 50%)",
  },
  weekly: {
    color: tierStyle("weekly").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#991b1b 25%,#ff3b3b 50%,#ff6b6b 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(255,59,59,.05) 0%,rgba(20,20,20,.65) 50%)",
  },
  special: {
    color: tierStyle("special").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#92400e 25%,#f59e0b 50%,#fbbf24 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(245,158,11,.05) 0%,rgba(20,20,20,.65) 50%)",
  },
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
    case "special":
    case "event": return "special";
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
  const rail = TIER_RAIL_STYLES[tierKey] || TIER_RAIL_STYLES.beginner;

  if (!item) return null;

  const timeStr = formatRailTime(item.nextStart, now, timeZone);

  return (
    <div
      className="rounded-xl overflow-hidden group cursor-pointer transition-all hover:-translate-y-0.5 relative"
      style={{ background: rail.bgGrad, border: "1px solid rgba(255,255,255,.06)" }}
      data-testid={`rail-card-${tierKey}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelectTier?.(tierKeyToFilter(tierKey))}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectTier?.(tierKeyToFilter(tierKey)); }}
    >
      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: rail.topBar }} />
      <div className="px-3 py-2.5 relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-xs text-white truncate" title={item.track}>{item.track}</p>
          <p className="text-[10px] text-[#f5f5f5]/60 truncate mt-0.5" title={item.name}>{item.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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


/** Group race items by tier in display order (beginner → advanced, then weekly → special). */
function groupItemsByTier(items: UpcomingRaceItem[]): { tier: string; items: UpcomingRaceItem[] }[] {
  const order = ["beginner", "intermediate", "advanced", "weekly", "special"];
  const map = new Map<string, UpcomingRaceItem[]>();
  for (const item of items) {
    const key = item.tier === "event" ? "special" : item.tier;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return order.filter((t) => map.has(t)).map((t) => ({ tier: t, items: map.get(t)! }));
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
      <div className="py-1.5 mb-3 text-center">
        <span className="v52-eyebrow" style={{ fontSize: "9px" }}>Próximas carreras</span>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-4 text-center">
          <p className="text-xs font-semibold text-white">No hay carreras</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupItemsByTier(filteredItems).map(({ tier, items: tierItems }) => {
            const rail = TIER_RAIL_STYLES[tier] || TIER_RAIL_STYLES.beginner;
            return (
              <div key={tier}>
                {/* Tier section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[.2em]" style={tierBadgeStyle(rail.color)}>
                    {tierLabel(tier)}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg,${rail.color}4d,transparent)` }} />
                </div>
                {/* Tier cards */}
                <div className="flex flex-col gap-2">
                  {tierItems.map((item) => (
                    <RailCard
                      key={item.id}
                      item={item}
                      tierKey={tier}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
