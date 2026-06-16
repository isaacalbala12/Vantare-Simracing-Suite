import { useState, useEffect, useCallback } from 'react';
import { Events } from '@wailsio/runtime';
import { Topbar } from './components/Topbar';
import { UpdateBanner } from './components/UpdateBanner';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { PreviewPage } from './pages/PreviewPage';
import { SettingsPage } from './pages/SettingsPage';

type Section = 'dashboard' | 'profiles' | 'preview' | 'telemetry' | 'setup';

export function HubApp() {
  const [section, setSection] = useState<Section>('dashboard');
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('hub');
    const unsub = Events.On('app:version', (event: { data: { version?: string } }) => {
      setVersion(event.data.version ?? null);
    });
    Events.Emit('app:version:get');
    return () => {
      document.body.classList.remove('hub');
      unsub?.();
    };
  }, []);

  const handleNavigate = useCallback((id: string) => {
    setSection(id as Section);
  }, []);

  return (
    <div className="min-h-screen premium-bg relative overflow-y-auto">
      <Topbar activeSection={section} onNavigate={handleNavigate} version={version} />
      <UpdateBanner />
      <main className="pt-14 min-h-screen">
        {section === "dashboard" && <DashboardPage />}
        {section === "profiles" && <ProfilesPage onOpenPreview={() => setSection("preview")} />}
        {section === "preview" && <PreviewPage />}
        {section === "setup" && <SettingsPage />}
        {section === "telemetry" && (
          <div className="flex items-center justify-center h-[60vh] text-vantare-textMuted text-sm font-mono">
            Telemetría — próxima actualización
          </div>
        )}
      </main>
    </div>
  );
}
