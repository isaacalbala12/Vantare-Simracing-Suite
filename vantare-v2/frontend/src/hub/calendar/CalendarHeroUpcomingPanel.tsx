import { useEffect, useState } from "react";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";

type CalendarHeroUpcomingPanelProps = {
  now?: () => Date;
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

const TIER_STYLES: Record<string, { label: string; bg: string; border: string; shadow: string; barGrad: string }> = {
  beginner: {
    label: "Bronce",
    bg: "rgba(205,127,50,.5)",
    border: "rgba(205,127,50,.5)",
    shadow: "rgba(205,127,50,.7)",
    barGrad: "linear-gradient(90deg,#6B3F1C 0%,#CD7F32 50%,#F5C889 100%)",
  },
  intermediate: {
    label: "Plata",
    bg: "rgba(184,191,200,.5)",
    border: "rgba(184,191,200,.5)",
    shadow: "rgba(184,191,200,.65)",
    barGrad: "linear-gradient(90deg,#3D4654 0%,#B8BFC8 50%,#F0F4F8 100%)",
  },
  advanced: {
    label: "Oro",
    bg: "rgba(212,160,23,.5)",
    border: "rgba(212,160,23,.5)",
    shadow: "rgba(212,160,23,.6)",
    barGrad: "linear-gradient(90deg,#7A5C08 0%,#D4A017 50%,#EBB945 100%)",
  },
};

function TierCard({ item, tierKey, now }: { item: UpcomingRaceItem | null; tierKey: string; now: Date }) {
  const styles = TIER_STYLES[tierKey] || TIER_STYLES.beginner;

  if (!item) {
    return (
      <div
        className="group rounded-xl bg-[rgba(20,20,20,.6)] border border-line overflow-hidden relative"
        style={{ borderTopColor: styles.border }}
        data-testid={`upcoming-card-${tierKey}-empty`}
      >
        <div className="cal-bar h-2" style={{ background: styles.barGrad, boxShadow: `0 0 18px ${styles.shadow}` }} />
        <div className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[.22em]" style={{ color: styles.border.replace("rgba", "rgb").replace(",.5)", ")").replace("0.5", "1") }}>
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
  const colorBase = styles.border.replace("rgba", "rgb").replace(",.5)", ")").replace("0.5", "1");

  return (
    <div
      className="group rounded-xl bg-[rgba(20,20,20,.6)] border border-line overflow-hidden transition-all hover:-translate-y-1 relative"
      style={{ borderTopColor: styles.border }}
      data-testid={`upcoming-card-${tierKey}`}
    >
      <div className="cal-bar h-2" style={{ background: styles.barGrad, boxShadow: `0 0 18px ${styles.shadow}` }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: `radial-gradient(ellipse 100% 45% at 50% 0%,${styles.border.replace(".5)", ".12)")},transparent 70%)` }} />
      <div className="p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[.22em]" style={{ color: colorBase }}>{styles.label}</span>
          {item.isActive && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.22em] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,59,59,.15)", color: "#ff3b3b", border: "1px solid rgba(255,59,59,.4)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent live-indicator"></span>
              Live
            </span>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[.28em] text-accent mb-1.5">Green flag</p>
        <p className="font-mono font-bold text-2xl text-white tracking-tight leading-none" style={{ fontFeatureSettings: "'tnum'" }}>{timeStr}</p>
        <div className="mt-4 pt-3 border-t border-line">
          <p className="font-semibold text-sm text-white truncate" title={item.track}>{item.track}</p>
          <p className="text-xs text-[#f5f5f5]/60 truncate mt-0.5" title={item.name}>{item.name}</p>
        </div>
      </div>
    </div>
  );
}

export function CalendarHeroUpcomingPanel({ now }: CalendarHeroUpcomingPanelProps) {
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
          <span className="eyebrow" style={{ fontSize: "10px" }}>Próximas carreras</span>
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

  const summary = buildUpcomingRaceItems(calendar, nowDate);
  void tick; // Ensure React rerenders on tick

  return (
    <section className="glass-panel rounded-xl p-5 opacity-0 animate-fade-in-up delay-150" data-testid="calendar-hero-upcoming-panel">
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow" style={{ fontSize: "10px" }}>Próximas carreras</span>
        <span className="text-[10px] font-bold text-[#f5f5f5]/35 uppercase tracking-[.22em]">LMU · Bronce · Plata · Oro</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TierCard item={summary.bronce} tierKey="beginner" now={nowDate} />
        <TierCard item={summary.plata} tierKey="intermediate" now={nowDate} />
        <TierCard item={summary.oro} tierKey="advanced" now={nowDate} />
      </div>

      {summary.weekly && (
        <div
          className="group mt-4 card-sleek rounded-xl p-4 flex items-center justify-between gap-4 relative overflow-hidden"
          data-testid="upcoming-card-weekly"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" style={{ boxShadow: "0 0 10px #ff3b3b" }} />
          <div className="flex items-center gap-4 pl-3 min-w-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[.22em]" style={{ background: "rgba(255,59,59,.15)", color: "#ff3b3b", border: "1px solid rgba(255,59,59,.4)" }}>
              Weekly
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate" title={summary.weekly.name}>
                WEC Weekly · {summary.weekly.track}
              </p>
              <p className="text-xs text-[#f5f5f5]/60 truncate mt-0.5" title={summary.weekly.name}>
                {summary.weekly.durationMin ? `${summary.weekly.durationMin}m races · ` : ""}{summary.weekly.vehicleClass}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#f5f5f5]/40">Próxima</p>
              <p className="font-mono font-bold text-sm text-white" style={{ fontFeatureSettings: "'tnum'" }}>
                {formatWeeklyTime(summary.weekly.nextStart, nowDate)}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
