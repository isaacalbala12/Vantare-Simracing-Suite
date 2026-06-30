import { ActiveOverlayCard } from "../components/ActiveOverlayCard";
import { PlanStatusCard } from "../components/PlanStatusCard";
import { QuickActions } from "../components/QuickActions";
import { EmptyActivity } from "../components/EmptyActivity";
import { EmptyNextRace } from "../components/EmptyNextRace";
import { EmptyLauncher } from "../components/EmptyLauncher";
import { RecommendedQuickStart } from "../components/RecommendedQuickStart";

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
    <div className="max-w-[1920px] mx-auto px-6 py-6 relative z-20">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <PlanStatusCard onNavigate={handleNavigate} />
          <ActiveOverlayCard
            onNavigate={handleNavigate}
            onUseRecommended={onUseRecommended}
          />
          <QuickActions onNavigate={handleNavigate} />
          <EmptyActivity />
        </div>
        <div className="xl:col-span-4 flex flex-col gap-6">
          <EmptyNextRace />
          <EmptyLauncher />
          <RecommendedQuickStart
            hasActiveProfile={hasActiveProfile}
            onUseRecommended={onUseRecommended ?? (() => {})}
            onGoToObsSetup={handleNavigate}
          />
        </div>
      </div>
    </div>
  );
}
