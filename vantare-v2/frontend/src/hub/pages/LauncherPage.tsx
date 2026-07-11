import { V52SectionHeader } from "../components/V52SectionHeader";
import { AppsPanel } from "../launcher/AppsPanel";
import { ProfilesPanel } from "../launcher/ProfilesPanel";
import { LauncherSessionPanel } from "../launcher/LauncherSessionPanel";
import { LauncherOnboarding } from "../launcher/LauncherOnboarding";
import { useLauncherSnapshot, useLauncherStore } from "../launcher/launcher-store";
import { useState } from "react";

export function LauncherPage() {
  const snapshot = useLauncherSnapshot();
  const { dispatchLauncherCommand } = useLauncherStore();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return localStorage.getItem("vantare.launcherOnboardingCompleted") !== "true";
    } catch {
      return false;
    }
  });
  const completeOnboarding = () => {
    setOnboardingOpen(false);
    try {
      localStorage.setItem("vantare.launcherOnboardingCompleted", "true");
    } catch {
      // Restricted browser storage is not a blocker for the launcher.
    }
    dispatchLauncherCommand("launcher:onboarding:complete");
  };
  return (
    <div className="flex flex-col gap-5">
      {onboardingOpen && snapshot && (
        <LauncherOnboarding apps={snapshot.apps} onComplete={completeOnboarding} />
      )}
      <div className="opacity-0 animate-fade-in-up">
        <V52SectionHeader
          title="Launcher"
          description="Detecta apps, crea perfiles de lanzamiento y arranca cadenas con un clic."
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 flex flex-col gap-4 opacity-0 animate-fade-in-up delay-100">
          <AppsPanel />
        </section>
        <section className="lg:col-span-2 space-y-3 opacity-0 animate-fade-in-up delay-150">
          <ProfilesPanel />
        </section>
      </div>
      <LauncherSessionPanel />
    </div>
  );
}
