import { useRef, useState } from 'react';
import { I18nProvider, useI18n } from '../../i18n/I18nProvider';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { HubSubnav } from '../components/HubSubnav';
import { StartupSettings } from '../settings/StartupSettings';
import { useStartupSettings } from '../settings/useStartupSettings';
import { AccountSettings } from '../settings/AccountSettings';
import { AboutSettings } from '../settings/AboutSettings';
import { CpuSamplingSetting } from '../settings/CpuSamplingSetting';
import { DowngradeModal } from '../settings/DowngradeModal';
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

type TabId = 'account' | 'application' | 'updates' | 'hotkeys' | 'diagnostics';

function SettingsPageInner() {
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { t } = useI18n();
  const access = useAccess();
  const availableChannels = allowedUpdateChannels(access);
  const updater = useUpdaterSettings();
  const app = useAppSettings();
  const startup = useStartupSettings();

  const TABS = [
    { id: 'account' as const, label: t('settings.tab.account') },
    { id: 'application' as const, label: t('settings.tab.application') },
    { id: 'updates' as const, label: t('settings.tab.updates') },
    { id: 'hotkeys' as const, label: t('settings.tab.hotkeys') },
    { id: 'diagnostics' as const, label: t('settings.tab.diagnostics') },
  ];

  // A tablist is expected to be walkable with the arrow keys, with a single
  // stop in the tab order. Without this the four tabs were four separate stops
  // and the arrows did nothing.
  function moveWithArrowKeys(event: React.KeyboardEvent, index: number) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + offset + TABS.length) % TABS.length;
    setActiveTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* The sections sit attached under the global nav instead of floating in
          a pill bar below the page title, and they share its language -- an
          underline on the active item -- because two rows of navigation that
          look unrelated read as two unrelated things. The old bar painted the
          selected tab with bg-accent/10 and border-accent/30; `accent` is not a
          token this project defines, so it resolved to nothing and the
          selection was barely visible. */}
      <HubSubnav>
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-3 py-2.5 text-xs lg:text-sm font-medium text-vantare-textMuted"
          role="tablist"
          aria-label={t("settings.nav.label")}
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => moveWithArrowKeys(event, index)}
              className={`nav-item whitespace-nowrap ${
                activeTab === tab.id ? 'active text-vantare-text' : 'hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </HubSubnav>

      <header className="opacity-0 animate-fade-in-up">
        <h1 className="font-sans font-bold text-3xl text-white tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed">
          {t('settings.subtitle')}
        </p>
      </header>

      <div className="opacity-0 animate-fade-in-up delay-150 space-y-4">
        {activeTab === 'account' && (
          <div key="panel-account" id="panel-account" role="tabpanel" aria-label={t('settings.tab.account')}>
            <div className="card-sleek rounded-xl p-5">
              <AccountSettings />
            </div>
          </div>
        )}

        {activeTab === 'application' && (
          <div key="panel-application" id="panel-application" role="tabpanel" aria-label={t('settings.tab.application')} className="space-y-4">
            {/* The language selector used to sit loose in the page header,
                which is not where anyone looks for a setting. */}
            <div className="card-sleek rounded-xl p-5">
              <h2 className="font-display font-semibold text-lg text-white mb-4">
                {t('settings.language.title')}
              </h2>
              <LanguageSelector />
            </div>
            <StartupSettings startup={startup} />
          </div>
        )}

        {activeTab === 'updates' && (
          <div key="panel-updates" id="panel-updates" role="tabpanel" aria-label={t('settings.tab.updates')} className="space-y-4">
            <UpdatesSettings updater={updater} availableChannels={availableChannels} />
          </div>
        )}

        {activeTab === 'hotkeys' && (
          <div key="panel-hotkeys" id="panel-hotkeys" role="tabpanel" aria-label={t('settings.tab.hotkeys')}>
            <HotkeysSettings app={app} />
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div key="panel-diagnostics" id="panel-diagnostics" role="tabpanel" aria-label={t('settings.tab.diagnostics')} className="space-y-4">
            <WailsDiagnosticsPanel />
            <CpuSamplingSetting app={app} />
            <AboutSettings info={updater.info} updaterSettings={updater.settings} />
          </div>
        )}
      </div>

      {updater.confirmDowngrade && (
        <DowngradeModal
          release={updater.confirmDowngrade}
          currentVersion={updater.info?.currentVersion}
          onCancel={() => updater.setConfirmDowngrade(null)}
          onConfirm={() => updater.startInstall(updater.confirmDowngrade!)}
        />
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
