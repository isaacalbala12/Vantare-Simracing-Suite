import { useState, useEffect, useCallback } from 'react';
import {
  SettingsForm,
  StandingsConfigSchema,
  RelativeConfigSchema,
  DeltaBarConfigSchema,
  StreamAlertsConfigSchema,
} from '@vantare/ui-core';
import { Feature } from '@vantare/auth';
import type { z } from 'zod';
import { useOverlayConfigStore } from '../../shared/stores/overlay-config-store';
import { useLicense } from '../../shared/hooks/useLicense';
import FeatureBadge from '../components/FeatureBadge';
import UpgradePrompt from '../components/UpgradePrompt';

type OverlayId = 'standings' | 'relative' | 'delta' | 'stream-alerts';

interface OverlayTab {
  id: OverlayId;
  label: string;
  schema: z.ZodType<any, any, any>;
  feature: Feature;
}

const overlayTabs: OverlayTab[] = [
  { id: 'standings', label: 'Standings', schema: StandingsConfigSchema as any, feature: Feature.STANDINGS },
  { id: 'relative', label: 'Relative', schema: RelativeConfigSchema as any, feature: Feature.RELATIVE },
  { id: 'delta', label: 'Delta Bar', schema: DeltaBarConfigSchema as any, feature: Feature.DELTA_BAR },
  { id: 'stream-alerts', label: 'Stream Alerts', schema: StreamAlertsConfigSchema as any, feature: Feature.STREAM_ALERTS },
];

export default function OverlaySettingsPage() {
  const { canAccess, requiredTier } = useLicense();
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayId>('standings');
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const draftConfigs = useOverlayConfigStore((s) => s.draftConfigs);
  const loadOverlayConfig = useOverlayConfigStore((s) => s.loadOverlayConfig);
  const updateOverlayConfig = useOverlayConfigStore((s) => s.updateOverlayConfig);
  const saveOverlayConfig = useOverlayConfigStore((s) => s.saveOverlayConfig);
  const discardChanges = useOverlayConfigStore((s) => s.discardChanges);
  const saving = useOverlayConfigStore((s) => s.saving);

  useEffect(() => {
    loadOverlayConfig(selectedOverlay);
  }, [selectedOverlay, loadOverlayConfig]);

  const handleSave = useCallback(async () => {
    const tab = overlayTabs.find((t) => t.id === selectedOverlay);
    if (tab && !canAccess(tab.feature)) return;

    await saveOverlayConfig(selectedOverlay);
    setConfirmation('Settings saved');
    setTimeout(() => setConfirmation(null), 2000);
  }, [selectedOverlay, saveOverlayConfig, canAccess]);

  const handleDiscard = useCallback(async () => {
    await discardChanges(selectedOverlay);
  }, [selectedOverlay, discardChanges]);

  const currentTab = overlayTabs.find((t) => t.id === selectedOverlay)!;
  const selectedLocked = !canAccess(currentTab.feature);

  return (
    <div className="p-6 h-full flex flex-col">
      <nav data-testid="overlay-settings-nav" className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
        {overlayTabs.map((tab) => {
          const locked = !canAccess(tab.feature);
          return (
            <button
              key={tab.id}
              data-testid={`overlay-tab-${tab.id}`}
              onClick={() => setSelectedOverlay(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                selectedOverlay === tab.id
                  ? 'bg-[var(--color-glass)] text-[var(--color-text)] border-b-2 border-[var(--color-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-glass)]'
              } ${locked ? 'opacity-70' : ''}`}
            >
              <span>{tab.label}</span>
              {locked && <FeatureBadge requiredTier={requiredTier(tab.feature)} />}
            </button>
          );
        })}
      </nav>

      <div data-testid="overlay-settings-form" className="flex-1 overflow-auto">
        {selectedLocked ? (
          <UpgradePrompt feature={currentTab.label} requiredTier={requiredTier(currentTab.feature)} />
        ) : (
          <SettingsForm
            schema={currentTab.schema as any}
            values={draftConfigs[selectedOverlay] ?? {}}
            onChange={(partial) => updateOverlayConfig(selectedOverlay, partial)}
            testId="settings"
          />
        )}
      </div>

      {!selectedLocked && (
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
          <button
            onClick={handleSave}
            data-testid="settings-save"
            disabled={saving}
            className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleDiscard}
            data-testid="settings-discard"
            className="rounded bg-[var(--color-glass)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            Discard
          </button>
          {confirmation && (
            <span data-testid="settings-confirmation" className="text-sm text-[var(--color-positive)]">
              {confirmation}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
