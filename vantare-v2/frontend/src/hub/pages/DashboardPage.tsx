import { ActiveOverlayCard } from "../components/ActiveOverlayCard";
import { PlanStatusCard } from "../components/PlanStatusCard";
import { QuickActions } from "../components/QuickActions";
import { EmptyActivity } from "../components/EmptyActivity";
import { EmptyNextRace } from "../components/EmptyNextRace";
import { EmptyLauncher } from "../components/EmptyLauncher";

type DashboardPageProps = {
  onNavigate?: (section: string) => void;
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const handleNavigate = onNavigate ?? (() => {});

  return (
    <div className="max-w-[1920px] mx-auto px-6 py-6 relative z-20">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <PlanStatusCard onNavigate={handleNavigate} />
          <ActiveOverlayCard onNavigate={handleNavigate} />
          <QuickActions onNavigate={handleNavigate} />
          <EmptyActivity />
        </div>
        <div className="xl:col-span-4 flex flex-col gap-6">
          <EmptyNextRace />
          <EmptyLauncher />
        </div>
      </div>
    </div>
  );
}
