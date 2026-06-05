import { useEffect, useCallback } from 'react';
import { z } from 'zod';
import { SettingsForm } from '@vantare/ui-core';
import { Feature } from '@vantare/auth';
import { useSettingsStore } from '../../shared/stores/settings-store';
import { useLicense } from '../../shared/hooks/useLicense';

// ──────────────────────────────────────────────
// Zod schema mirroring the Settings interface
// ──────────────────────────────────────────────

export const SettingsSchema = z.object({
  language: z.enum(['en', 'es', 'fr', 'de']).default('en'),
  autostart: z.boolean(),
  minimizeToTray: z.boolean(),
  startMinimized: z.boolean(),
  overlayVisibilityKey: z.string(),
  preferredSim: z.enum(['auto', 'iRacing', 'LMU', 'Assetto Corsa']).default('auto'),
  alertVolume: z.number().min(0).max(1),
  alertEnabled: z.boolean(),
  autoUpdate: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  httpServerPort: z.number().int().min(1024).max(65535),
  networkAccess: z.boolean(),
});

export type SettingsFormValues = z.infer<typeof SettingsSchema>;

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function SettingsPage() {
  const { canAccess } = useLicense();
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Persist settings when the form emits changes
  const handleChange = useCallback(
    (partial: Partial<SettingsFormValues>) => {
      if (partial.preferredSim === 'LMU' && !canAccess(Feature.LMU)) return;
      if (partial.preferredSim === 'Assetto Corsa' && !canAccess(Feature.AC)) return;
      saveSettings(partial);
    },
    [saveSettings, canAccess],
  );

  if (isLoading || !settings) {
    return (
      <div
        data-testid="settings-page"
        className="flex items-center justify-center h-full text-white/50"
      >
        <div className="text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div data-testid="settings-page" className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white/90">Settings</h1>
        <p className="text-sm text-white/50 mt-1">
          Application-wide preferences
        </p>
      </div>

      <div data-testid="settings-form" className="flex-1 overflow-auto">
        <SettingsForm
          schema={SettingsSchema as any}
          values={settings as unknown as SettingsFormValues}
          onChange={handleChange}
          testId="settings"
        />
      </div>
    </div>
  );
}
