import { useEffect, useState } from "react";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { tierStyle, tierBadgeStyle } from "./calendar-shared";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";

type CalendarHeroUpcomingPanelProps = {
  now?: () => Date;
  onNavigate?: (section: string) => void;
  onTierClick?: (tier: string) => void;
};

function formatUpcomingTime(dateStr: string | null, now: Date): string {
  if (!dateStr) return "N/A";
  const start = new Date(dateStr).getTime();
  const diff = start - now.getTime();
  if (diff <= 0) return "En curso";
  const diffMins = Math.floor(diff / 60000);
  if (diffMins < 60) return `en ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) {
    if (remainingMins === 0) return `en ${diffHours} h`;
    return `en ${diffHours}h ${remainingMins}m`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `en ${diffDays} d`;
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

type TierCardStyle = { label: string; color: string; topBar: string; bgGrad: string };

const TIER_CARD_STYLES: Record<string, TierCardStyle> = {
  beginner: {
    label: "Bronce",
    color: tierStyle("beginner").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#6B3F1C 25%,#CD7F32 50%,#F5C889 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(205,127,50,.07) 0%,rgba(20,20,20,.65) 50%)",
  },
  intermediate: {
    label: "Plata",
    color: tierStyle("intermediate").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#3D4654 25%,#B8BFC8 50%,#F0F4F8 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(184,191,200,.06) 0%,rgba(20,20,20,.65) 50%)",
  },
  advanced: {
    label: "Oro",
    color: tierStyle("advanced").accent,
    topBar: "linear-gradient(90deg,transparent 5%,#7A5C08 25%,#D4A017 50%,#EBB945 75%,transparent 95%)",
    bgGrad: "linear-gradient(180deg,rgba(212,160,23,.07) 0%,rgba(20,20,20,.65) 50%)",
  },
};

function TierCard({ item, tierKey, now, onNavigate, onTierClick }: { item: UpcomingRaceItem | null; tierKey: string; now: Date; onNavigate?: (section: string) => void; onTierClick?: (tier: string) => void }) {
  const styles = TIER_CARD_STYLES[tierKey] || TIER_CARD_STYLES.beginner;

  if (!item) {
    return (
      <div
        className="group rounded-xl overflow-hidden relative"
        style={{ background: styles.bgGrad, border: "1px solid rgba(255,255,255,.06)" }}
        data-testid={`upcoming-card-${tierKey}-empty`}
      >
        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: styles.topBar }} />
        <div className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[.2em]" style={tierBadgeStyle(styles.color)}>
              {styles.label}
            </span>
          </div>
          <p className="font-mono font-bold text-lg text-vantare-textMuted tracking-tight leading-none">
            Sin carreras programadas
          </p>
        </div>
      </div>
    );
  }

  const timeStr = formatUpcomingTime(item.nextStart, now);

  const handleClick = () => {
    if (onTierClick) {
      onTierClick(tierKey);
    } else if (onNavigate) {
      onNavigate("carreras");
    }
  };

  return (
    <div
      className="group rounded-xl overflow-hidden transition-all hover:-translate-y-1 relative cursor-pointer"
      style={{ background: styles.bgGrad, border: "1px solid rgba(255,255,255,.06)" }}
      data-testid={`upcoming-card-${tierKey}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      aria-label={`Ver carreras ${styles.label}`}
    >
      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: styles.topBar }} />
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: `radial-gradient(ellipse 100% 60% at 50% 0%,${styles.color}22,transparent 70%)` }} />
      <div className="p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[.2em]" style={tierBadgeStyle(styles.color)}>
            {styles.label}
          </span>
          {item.isActive && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.22em] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,59,59,.15)", color: "#ff3b3b", border: "1px solid rgba(255,59,59,.4)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-indicator"></span>
              Live
            </span>
          )}
        </div>
        <p className={`text-[10px] font-bold uppercase tracking-[.28em] mb-1.5 ${item.isActive ? "text-accent" : "text-[#f5f5f5]/40"}`}>Green flag</p>
        <p className="font-mono font-bold text-2xl text-white tracking-tight leading-none" style={{ fontFeatureSettings: "'tnum'" }}>{timeStr}</p>
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="font-semibold text-sm text-white truncate" title={item.track}>{item.track}</p>
          <p className="text-xs text-[#f5f5f5]/60 truncate mt-0.5" title={item.name}>{item.name}</p>
        </div>
      </div>
    </div>
  );
}

export function CalendarHeroUpcomingPanel({ now, onNavigate, onTierClick }: CalendarHeroUpcomingPanelProps) {
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

  if (!calendar) {
    return (
      <section className="glass-panel rounded-xl p-5" data-testid="calendar-hero-upcoming-panel-empty">
        <div className="flex items-center justify-between mb-4">
          <span className="v52-eyebrow" style={{ fontSize: "10px" }}>Próximas carreras</span>
        </div>
        <div className="rounded-xl bg-[rgba(20,20,20,.55)] border border-white/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-vantare-red-400 mb-2">
            Sin datos
          </p>
          <p className="text-sm font-semibold text-white">Calendario LMU no cargado</p>
        </div>
      </section>
    );
  }

  const items = buildUpcomingRaceItems(calendar, nowDate);
  const findItem = (tier: string) => items.find((i) => i.tier === tier) ?? null;
  const weeklyItem = items.find((i) => i.tier === "weekly") ?? null;
  void tick;

  return (
    <section className="glass-panel rounded-xl p-5 opacity-0 animate-fade-in-up delay-150" data-testid="calendar-hero-upcoming-panel">
      <div className="flex items-center justify-between mb-4">
        <span className="v52-eyebrow" style={{ fontSize: "10px" }}>Próximas carreras</span>
        <span className="text-[10px] font-bold text-[#f5f5f5]/35 uppercase tracking-[.22em]">LMU · Bronce · Plata · Oro</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TierCard item={findItem("beginner")} tierKey="beginner" now={nowDate} onNavigate={onNavigate} onTierClick={onTierClick} />
        <TierCard item={findItem("intermediate")} tierKey="intermediate" now={nowDate} onNavigate={onNavigate} onTierClick={onTierClick} />
        <TierCard item={findItem("advanced")} tierKey="advanced" now={nowDate} onNavigate={onNavigate} onTierClick={onTierClick} />
      </div>

      {weeklyItem && (
        <div
          className="group mt-4 card-sleek rounded-xl p-4 pl-5 flex items-center justify-between gap-4 relative overflow-hidden cursor-pointer"
          data-testid="upcoming-card-weekly"
          onClick={() => onNavigate?.("carreras")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate?.("carreras"); }}
          aria-label="Ver carreras semanales"
        >
          <div className="flex items-center gap-4 pl-3 min-w-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[.22em]" style={{ background: "rgba(255,59,59,.15)", color: "#ff3b3b", border: "1px solid rgba(255,59,59,.4)" }}>
              Weekly
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate" title={weeklyItem.name}>
                {weeklyItem.name} · {weeklyItem.track}
              </p>
              <p className="text-xs text-[#f5f5f5]/60 truncate mt-0.5" title={weeklyItem.name}>
                {weeklyItem.durationMin ? `${weeklyItem.durationMin}m races · ` : ""}{weeklyItem.vehicleClass}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#f5f5f5]/40">Próxima</p>
              <p className="font-mono font-bold text-sm text-white" style={{ fontFeatureSettings: "'tnum'" }}>
                {formatWeeklyTime(weeklyItem.nextStart, nowDate)}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
