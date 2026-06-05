import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusIndicator } from '../../shared/components/StatusIndicator';
import { useAppStore } from '../../shared/stores/app-store';
import { useSettingsStore } from '../../shared/stores/settings-store';
import { useProfileStore } from '../../shared/stores/profile-store';
import { useSimState } from '@vantare/ui-core';

export default function DashboardPage() {
  const { connected: simConnected, simName } = useSimState();
  const { demoMode, setDemoMode } = useAppStore();
  const settings = useSettingsStore((s) => s.settings);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const [themeName, setThemeName] = useState('Default');

  useEffect(() => {
    window.vantare
      .getActiveTheme()
      .then((theme) => {
        if (theme?.name) setThemeName(theme.name);
      })
      .catch(() => {
        setThemeName('Default');
      });
  }, []);

  const simStatus = simConnected ? 'connected' : 'disconnected';

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          data-testid="dashboard-sim-status"
          className="glass-panel p-4 space-y-2"
        >
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Sim Status
          </h2>
          <div className="flex items-center gap-2">
            <StatusIndicator status={simStatus} />
            <span className="text-sm text-[var(--color-text-muted)]">
              {simConnected && simName ? simName : 'No sim detected'}
            </span>
          </div>
        </div>

        <div
          data-testid="dashboard-quick-settings"
          className="glass-panel p-4 space-y-2"
        >
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Quick Settings
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">Demo Mode</span>
              <button
                data-testid="demo-mode-toggle"
                onClick={() => setDemoMode(!demoMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  demoMode ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-elevated)]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-text)] transition-transform ${
                    demoMode ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">HTTP Server Port</span>
              <span className="text-sm text-[var(--color-text)] font-mono">
                {settings?.httpServerPort ?? '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">Overlay Visibility Key</span>
              <span className="text-sm text-[var(--color-text)] font-mono">
                {settings?.overlayVisibilityKey ?? '—'}
              </span>
            </div>
          </div>
        </div>

        <div
          data-testid="dashboard-active-profile"
          className="glass-panel p-4 space-y-2"
        >
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Active Profile
          </h2>
          <p className="text-sm text-[var(--color-text)]">
            {activeProfile?.name ?? 'No profile selected'}
          </p>
          {activeProfile && (
            <Link
              to="/profiles"
              className="inline-block text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
            >
              Manage
            </Link>
          )}
        </div>

        <div
          data-testid="dashboard-active-theme"
          className="glass-panel p-4 space-y-2"
        >
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Active Theme
          </h2>
          <p className="text-sm text-[var(--color-text)]">{themeName}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Read-only</p>
        </div>
      </div>
    </div>
  );
}
