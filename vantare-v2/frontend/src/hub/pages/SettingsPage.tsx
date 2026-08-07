import { useRef, useState } from 'react';
import { I18nProvider, useI18n } from '../../i18n/I18nProvider';
import { LanguageSelector } from '../../i18n/LanguageSelector';
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

type TabId = 'account' | 'updates' | 'hotkeys' | 'diagnostics';

function SettingsPageInner() {
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
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

      {/* The selected tab used to be painted with bg-accent/10 and
          border-accent/30. `accent` is not a token this project defines, so it
          resolved to nothing and the selected tab read as a faint box. The
          gradient below is the same one Roadmap uses for a selected tab.
          Widths are content-sized rather than flex-1: with flex-1 every tab was
          as wide as the longest label, and a fifth section would squeeze them
          all. */}
      <nav
        className="glass-panel rounded-xl p-1.5 flex flex-wrap gap-1 opacity-0 animate-fade-in-up delay-100"
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
            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-gradient-to-br from-vantare-red-500 to-[#9a0606] text-white border-white/10'
                : 'bg-white/5 text-vantare-textMuted border-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="opacity-0 animate-fade-in-up delay-150 space-y-4">
        {activeTab === 'account' && (
          <div key="panel-account" id="panel-account" role="tabpanel" aria-label={t('settings.tab.account')}>
            <div className="card-sleek rounded-xl p-5">
              <AccountSettings />
            </div>
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
