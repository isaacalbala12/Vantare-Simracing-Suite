import { useEffect, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { SettingsForm } from '@vantare/ui-core';
import { Feature } from '@vantare/auth';
import { useSettingsStore } from '../../shared/stores/settings-store';
import { useLicense } from '../../shared/hooks/useLicense';

const baseSettingsShape = {
  language: z.enum(['en', 'es', 'fr', 'de']).default('en'),
  autostart: z.boolean(),
  minimizeToTray: z.boolean(),
  startMinimized: z.boolean(),
  overlayVisibilityKey: z.string(),
  alertVolume: z.number().min(0).max(1),
  alertEnabled: z.boolean(),
  autoUpdate: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  httpServerPort: z.number().int().min(1024).max(65535),
  networkAccess: z.boolean(),
};

function buildSettingsSchema(canAccess: (feature: Feature) => boolean) {
  const simOptions: [string, ...string[]] = ['auto', 'iRacing'];
  if (canAccess(Feature.LMU)) simOptions.push('LMU');
  if (canAccess(Feature.AC)) simOptions.push('Assetto Corsa');

  return z.object({
    ...baseSettingsShape,
    preferredSim: z.enum(simOptions).default('auto'),
  });
}

export type SettingsFormValues = z.infer<ReturnType<typeof buildSettingsSchema>>;

export default function SettingsPage() {
  const { canAccess } = useLicense();
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const settingsSchema = useMemo(() => buildSettingsSchema(canAccess), [canAccess]);

  const formValues = useMemo(() => {
    if (!settings) return null;
    const parsed = settingsSchema.safeParse(settings);
    if (parsed.success) return parsed.data;
    return { ...settings, preferredSim: 'auto' } as SettingsFormValues;
  }, [settings, settingsSchema]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleChange = useCallback(
    (partial: Partial<SettingsFormValues>) => {
      saveSettings(partial);
    },
    [saveSettings],
  );

  if (isLoading || !settings || !formValues) {
    return (
      <div
        data-testid="settings-page"
        className="flex items-center justify-center h-full text-[var(--color-text-muted)]"
      >
        <div className="text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div data-testid="settings-page" className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Application-wide preferences
        </p>
      </div>

      <div data-testid="settings-form" className="flex-1 overflow-auto">
        <SettingsForm
          schema={settingsSchema as any}
          values={formValues}
          onChange={handleChange}
          testId="settings"
        />
      </div>
    </div>
  );
}
