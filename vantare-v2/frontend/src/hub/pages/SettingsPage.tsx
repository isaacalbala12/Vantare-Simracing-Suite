import { useState } from 'react';
import { I18nProvider, useI18n } from '../../i18n/I18nProvider';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { AccountSettings } from '../settings/AccountSettings';
import { AboutSettings } from '../settings/AboutSettings';
import { CpuSamplingSetting } from '../settings/CpuSamplingSetting';
import { HotkeysSettings } from '../settings/HotkeysSettings';
import { UpdatesSettings } from '../settings/UpdatesSettings';
import { WailsDiagnosticsPanel } from '../settings/diagnostics/WailsDiagnosticsPanel';
import { useAppSettings } from '../settings/useAppSettings';
import { useUpdaterSettings } from '../settings/useUpdaterSettings';
import { useAccess } from '../../lib/access';
import { allowedUpdateChannels } from '../../lib/access-policy';

// The settings contract moved to hub/settings/settings-contract.ts. These
// re-exports keep the existing importers working; a page should not be the
// home of a domain type, and they will be repointed in a later cut.
export type {
  AppSettings,
  Asset,
  Channel,
  Release,
  UpdateInfo,
  UpdaterSettings,
} from '../settings/settings-contract';

export type {
  LauncherAppEntry,
  LauncherAppCategory,
  LaunchStep,
  LaunchProfile,
} from "../launcher/launcher-state";

type TabId = 'account' | 'updates' | 'hotkeys' | 'diagnostics';

function SettingsPageInner() {
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const { t } = useI18n();
  const access = useAccess();
  const availableChannels = allowedUpdateChannels(access);
  const updater = useUpdaterSettings();
  const app = useAppSettings();

  const TABS = [
    { id: 'account' as const, label: t('settings.tab.account') },
    { id: 'updates' as const, label: t('settings.tab.updates') },
    { id: 'hotkeys' as const, label: t('settings.tab.hotkeys') },
    { id: 'diagnostics' as const, label: t('settings.tab.diagnostics') },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between opacity-0 animate-fade-in-up">
        <div>
          <h1 className="font-sans font-bold text-3xl text-white tracking-tight">
            {t('settings.title')}
          </h1>
          <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
            {t('settings.subtitle')}
          </p>
        </div>
        <LanguageSelector />
      </header>

      <nav
        className="glass-panel rounded-xl p-1.5 flex gap-1 opacity-0 animate-fade-in-up delay-100"
        role="tablist"
        aria-label={t("settings.nav.label")}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-accent/10 border border-accent/30 text-white'
                : 'text-vantare-textMuted hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="opacity-0 animate-fade-in-up delay-150 space-y-4">
        {activeTab === 'account' && (
          <div key="panel-account" id="panel-account" role="tabpanel" aria-label="Cuenta">
            <div className="card-sleek rounded-xl p-5 border border-white/5">
              <AccountSettings />
            </div>
          </div>
        )}

        {activeTab === 'updates' && (
          <div key="panel-updates" id="panel-updates" role="tabpanel" aria-label="Actualizaciones" className="space-y-4">
            <UpdatesSettings updater={updater} availableChannels={availableChannels} />
          </div>
        )}

        {activeTab === 'hotkeys' && (
          <div key="panel-hotkeys" id="panel-hotkeys" role="tabpanel" aria-label="Hotkeys">
            <HotkeysSettings app={app} />
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div key="panel-diagnostics" id="panel-diagnostics" role="tabpanel" aria-label="Diagnóstico" className="space-y-4">
            <WailsDiagnosticsPanel />
            <CpuSamplingSetting app={app} />
            <AboutSettings info={updater.info} updaterSettings={updater.settings} />
          </div>
        )}
      </div>

      {app.settingsStatus && (
        <div className="text-xs text-vantare-textMuted font-mono">{app.settingsStatus}</div>
      )}

      {updater.confirmDowngrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-panel rounded-xl p-6 border border-white/10 max-w-md w-full">
            <h3 className="font-display font-semibold text-lg text-white mb-2">
              {t("settings.downgrade.title")}
            </h3>
            <p className="text-sm text-vantare-textMuted mb-4">
              {t("settings.downgrade.bodyBefore")}{' '}
              <strong className="text-white">{updater.confirmDowngrade.tag_name}</strong>,{' '}
              {t("settings.downgrade.bodyMiddle")}{' '}
              <strong className="text-white">{updater.info?.currentVersion}</strong>.{' '}
              {t("settings.downgrade.bodyAfter")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => updater.setConfirmDowngrade(null)}
                className="px-4 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white transition-colors"
              >
                {t("settings.downgrade.cancel")}
              </button>
              <button
                type="button"
                onClick={() => updater.startInstall(updater.confirmDowngrade!)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
              >
                {t("settings.downgrade.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  return (
    <I18nProvider>
      <SettingsPageInner />
    </I18nProvider>
  );
}
