import { useEffect, useState } from "react";
import { CalendarHeroUpcomingPanel } from "../calendar/CalendarHeroUpcomingPanel";
import { CalendarRaceDetailPanel } from "../calendar/CalendarRaceDetailPanel";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { V52InfoCard } from "../components/V52InfoCard";
import { DashboardFeatureCarousel } from "../components/DashboardFeatureCarousel";
import { ROADMAP_CHANGELOG } from "../roadmap/roadmap-data";
import { useI18n } from "../../i18n/I18nProvider";

const CHANGELOG_TONE_MAP: Record<string, "green" | "blue" | "purple" | "amber" | "red"> = {
  v0102: "green",
  "hub-v52": "blue",
  "launcher-lmu": "green",
  "roadmap-public": "purple",
};

type DashboardPageProps = {
  onNavigate?: (section: string) => void;
};

export function DashboardPage({
  onNavigate,
}: DashboardPageProps) {
  const handleNavigate = onNavigate ?? (() => {});
  const { t } = useI18n();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
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

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Hero banner — full width, gradient red */}
      <div
        className="relative rounded-xl overflow-hidden border border-vantare-red-500/50 hover:border-vantare-red-500/70 transition-all hover:-translate-y-0.5"
        data-testid="dashboard-hero-banner"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#ff3b3b]/60 via-[#9a0606]/40 to-[#0a0a0a]" />
        <div className="absolute right-0 top-0 w-64 h-64 bg-vantare-red-500/20 blur-3xl rounded-full" />
        <div className="relative p-7 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="pro-badge">BETA</span>
              <span className="text-xs text-vantare-red-400 font-semibold bg-[#9a0606]/50 px-2 py-1 rounded-full border border-vantare-red-500/30 whitespace-nowrap">
                v0.1.0.2
              </span>
            </div>
            <h3 className="font-bold text-3xl text-white mb-2 tracking-tight">
              Vantare Beta
            </h3>
            <p className="text-sm text-vantare-textMuted leading-relaxed">
              Overlays para simulación, editor de widgets, Ingeniero de spotter y OBS local. Plan Free activo con acceso básico.
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0 gap-3">
            <button
              type="button"
              onClick={() => handleNavigate("setup")}
              className="btn-primary px-6 py-2.5 rounded-lg font-bold text-sm text-white whitespace-nowrap"
            >
              Gestionar cuenta
            </button>
          </div>
        </div>
      </div>

      {/* Próximas carreras — 3 cards + WEC Weekly row */}
      <CalendarHeroUpcomingPanel onNavigate={handleNavigate} onTierClick={setSelectedTier} />
      {/* Feature carousel — animación fade de áreas in-progress del roadmap */}
      <DashboardFeatureCarousel onNavigate={handleNavigate} />


      {/* Novedades Vantare — desde ROADMAP_CHANGELOG */}
      <section className="glass-panel rounded-xl p-4" data-testid="dashboard-novedades">
        <div className="flex items-center justify-between mb-3">
          <span className="v52-eyebrow">Novedades Vantare</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROADMAP_CHANGELOG.slice(0, 4).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleNavigate("roadmap")}
              className="text-left w-full"
            >
              <V52InfoCard
                label={entry.version}
                title={t(`roadmap.changelog.${entry.id}.title`)}
                body={t(`roadmap.changelog.${entry.id}.body`)}
                tone={CHANGELOG_TONE_MAP[entry.id] ?? "red"}
              />
            </button>
          ))}
        </div>
      </section>

      {/* Race detail panel — shown when a tier card is clicked */}
      {selectedTier && calendar && (
        <CalendarRaceDetailPanel
          tier={selectedTier as "beginner" | "intermediate" | "advanced" | "weekly" | "special"}
          calendar={calendar}
          timeZone="Europe/Madrid"
          onClose={() => setSelectedTier(null)}
        />
      )}
    </div>
  );
}
