import { useState, useEffect, useCallback } from "react";
import { Topbar } from "./components/Topbar";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { PreviewPage } from "./pages/PreviewPage";
import { SettingsPage } from "./pages/SettingsPage";

type Section = "dashboard" | "profiles" | "preview" | "telemetry" | "setup";

export function HubApp() {
  const [section, setSection] = useState<Section>("dashboard");

  useEffect(() => {
    document.body.classList.add("hub");
    return () => document.body.classList.remove("hub");
  }, []);

  const handleNavigate = useCallback((id: string) => {
    setSection(id as Section);
  }, []);

  return (
    <div className="min-h-screen premium-bg relative">
      <Topbar activeSection={section} onNavigate={handleNavigate} />

      <main className="pt-14">
        {section === "dashboard" && <DashboardPage />}
        {section === "profiles" && <ProfilesPage onOpenPreview={() => setSection("preview")} />}
        {section === "preview" && <PreviewPage />}
        {section === "setup" && <SettingsPage />}
        {(section === "telemetry") && (
          <div className="flex items-center justify-center h-[60vh] text-vantare-textMuted text-sm font-mono">
            Telemetría — próxima actualización
          </div>
        )}
      </main>
    </div>
  );
}
