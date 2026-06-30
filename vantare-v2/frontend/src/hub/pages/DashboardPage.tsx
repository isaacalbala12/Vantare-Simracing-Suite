import { ActiveOverlayCard } from "../components/ActiveOverlayCard";
import { PlanStatusCard } from "../components/PlanStatusCard";
import { QuickActions } from "../components/QuickActions";
import { LastActivityCard } from "../components/LastActivityCard";
import { LauncherCard } from "../components/LauncherCard";
import { RecommendedQuickStart } from "../components/RecommendedQuickStart";
import { V52CalendarStrip } from "../components/V52CalendarStrip";
import { V52InfoCard } from "../components/V52InfoCard";

type DashboardPageProps = {
  onNavigate?: (section: string) => void;
  hasActiveProfile?: boolean;
  onUseRecommended?: () => void;
};

export function DashboardPage({
  onNavigate,
  hasActiveProfile = false,
  onUseRecommended,
}: DashboardPageProps) {
  const handleNavigate = onNavigate ?? (() => {});

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 flex flex-col gap-5">
          <PlanStatusCard onNavigate={handleNavigate} />
          <V52CalendarStrip />
          <ActiveOverlayCard
            onNavigate={handleNavigate}
            onUseRecommended={onUseRecommended}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LastActivityCard />
            <QuickActions onNavigate={handleNavigate} />
          </div>
        </div>
        <div className="xl:col-span-1 flex flex-col gap-5">
          <LauncherCard />
          <RecommendedQuickStart
            hasActiveProfile={hasActiveProfile}
            onUseRecommended={onUseRecommended ?? (() => {})}
            onGoToObsSetup={handleNavigate}
          />
          <section className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="v52-eyebrow">Novedades</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <V52InfoCard
                label="Beta"
                title="Hub v5.2 en progreso"
                body="Estamos migrando el Hub por cortes pequeños para no romper el flujo de beta."
                tone="blue"
              />
              <V52InfoCard
                label="Launcher"
                title="LMU disponible"
                body="Configura Steam o ejecutable local desde la pestaña Launcher."
                tone="green"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
