import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { resolveStudioV3Text } from './studio-v3-i18n';
import './overlay-studio-v3.css';
import { openBrowserView, type BrowserViewDecision } from './browser-view';
import type { TelemetryRateCoordinator } from '../../overlay/core/telemetry-rate-coordinator';
import { createWidgetDiagnosticCollector } from '../../overlay/core/widget-diagnostics';
import type { TelemetryAdapter } from '../../overlay/transports/telemetry-adapter';
import type { WidgetRuntimeInput } from '../../overlay/core/widget-definition';
import { StudioTelemetryProvider } from './canvas/StudioTelemetryProvider';
import { StudioConfirmProvider } from './components/StudioConfirmProvider';
import { DirtyChangesDialog } from './components/DirtyChangesDialog';
import { RecoveryDialog } from './components/RecoveryDialog';
import { createStudioRecoveryStore, type StudioRecoveryRecord } from './state/studio-recovery';
import { useStudioDocument } from './state/studio-store';
import { StudioOrbitLayout } from './orbit/StudioOrbitLayout';
import type { StudioProfileEntry } from './studio-profile-entry';

export type OverlayStudioV3Props = {
  profiles: StudioProfileEntry[];
  activeFile: string;
  onRequestProfileChange: (file: string) => void;
  coordinator: TelemetryRateCoordinator;
  telemetryAdapter?: TelemetryAdapter | null;
  liveAvailable?: boolean;
  active?: boolean;
  runtime?: WidgetRuntimeInput;
  recoveryStorage?: Storage | null;
  browserViewStudioPreview?: boolean;
};

type RecoveryPromptState = {
  record: StudioRecoveryRecord;
  warning?: string;
};

export function OverlayStudioV3(props: OverlayStudioV3Props): React.ReactElement {
  const {
    coordinator,
    telemetryAdapter = null,
    liveAvailable = false,
    active = true,
    runtime,
    recoveryStorage: recoveryStorageProp,
    browserViewStudioPreview = false,
    onRequestProfileChange,
    activeFile,
    profiles,
  } = props;
  const { t } = useI18n();
  const telemetryProps = { coordinator, telemetryAdapter, liveAvailable, active, runtime };
  const recoveryStorage =
    recoveryStorageProp ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  const diagnostics = useMemo(() => createWidgetDiagnosticCollector(), []);

  const {
    dirty,
    save,
    discardAll,
    acceptRecovery,
    document,
    revision,
    accessNotice,
    dismissAccessNotice,
  } = useStudioDocument();

  const [pendingProfileFile, setPendingProfileFile] = useState<string | null>(null);
  const [dirtyDialogOpen, setDirtyDialogOpen] = useState(false);
  const [dirtySaving, setDirtySaving] = useState(false);
  const [dirtyError, setDirtyError] = useState<string | null>(null);
  const [recoveryPrompt, setRecoveryPrompt] = useState<RecoveryPromptState | null>(null);
  const [browserViewDialogOpen, setBrowserViewDialogOpen] = useState(false);
  const [browserViewSaving, setBrowserViewSaving] = useState(false);
  const [browserViewError, setBrowserViewError] = useState<string | null>(null);
  const recoveryCheckedProfileIdRef = useRef<string | null>(null);
  const browserViewDecideRef = useRef<((decision: BrowserViewDecision) => void) | null>(null);

  useEffect(() => {
    const profileId = document?.id;
    if (!profileId || !recoveryStorage) {
      return;
    }
    if (recoveryCheckedProfileIdRef.current === profileId) {
      return;
    }
    recoveryCheckedProfileIdRef.current = profileId;

    const store = createStudioRecoveryStore(recoveryStorage);
    const result = store.read(profileId, revision);
    if (!result.record) return;
    const timer = window.setTimeout(
      () => setRecoveryPrompt({ record: result.record!, warning: result.warning }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [document?.id, recoveryStorage, revision]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const closeDirtyDialog = useCallback(() => {
    setDirtyDialogOpen(false);
    setPendingProfileFile(null);
    setDirtyError(null);
    setDirtySaving(false);
  }, []);

  const continueProfileNavigation = useCallback(() => {
    if (!pendingProfileFile) {
      return;
    }
    const file = pendingProfileFile;
    closeDirtyDialog();
    onRequestProfileChange(file);
  }, [closeDirtyDialog, onRequestProfileChange, pendingProfileFile]);

  const guardedProfileChange = useCallback(
    (file: string) => {
      if (file === activeFile) {
        return;
      }
      if (!dirty) {
        onRequestProfileChange(file);
        return;
      }
      setPendingProfileFile(file);
      setDirtyDialogOpen(true);
      setDirtyError(null);
    },
    [activeFile, dirty, onRequestProfileChange],
  );

  const handleDirtySave = useCallback(async () => {
    setDirtySaving(true);
    setDirtyError(null);
    const result = await save();
    if (result.status === 'saved') {
      continueProfileNavigation();
      return;
    }
    setDirtySaving(false);
    setDirtyError(result.message);
  }, [continueProfileNavigation, save]);

  const handleDirtyDiscard = useCallback(() => {
    discardAll();
    continueProfileNavigation();
  }, [continueProfileNavigation, discardAll]);

  const handleRecoveryDiscard = useCallback(() => {
    if (recoveryStorage && document) {
      createStudioRecoveryStore(recoveryStorage).clear(document.id);
    }
    setRecoveryPrompt(null);
  }, [document, recoveryStorage]);

  const handleRecoveryRecover = useCallback(() => {
    if (!recoveryPrompt) {
      return;
    }
    acceptRecovery(recoveryPrompt.record.document);
    if (recoveryStorage) {
      createStudioRecoveryStore(recoveryStorage).clear(recoveryPrompt.record.profileId);
    }
    setRecoveryPrompt(null);
  }, [acceptRecovery, recoveryPrompt, recoveryStorage]);

  const closeBrowserViewDialog = useCallback(() => {
    browserViewDecideRef.current?.('cancel');
    browserViewDecideRef.current = null;
    setBrowserViewDialogOpen(false);
    setBrowserViewSaving(false);
    setBrowserViewError(null);
  }, []);

  const handleOpenBrowserView = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    setBrowserViewError(null);
    const result = await openBrowserView({
      dirty,
      profileFile: activeFile,
      baseUrl: window.location.origin,
      studioPreview: browserViewStudioPreview,
      decide: () =>
        new Promise<BrowserViewDecision>((resolve) => {
          browserViewDecideRef.current = resolve;
          setBrowserViewDialogOpen(true);
        }),
      save,
      open: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    });

    setBrowserViewSaving(false);
    browserViewDecideRef.current = null;

    if (result === 'opened' || result === 'cancelled') {
      setBrowserViewDialogOpen(false);
      setBrowserViewError(null);
      return;
    }

    setBrowserViewDialogOpen(true);
    setBrowserViewError('studio.v3.browserView.saveFailed');
  }, [activeFile, browserViewStudioPreview, dirty, save]);

  const handleBrowserViewSave = useCallback(() => {
    setBrowserViewSaving(true);
    setBrowserViewError(null);
    browserViewDecideRef.current?.('save');
  }, []);

  return (
    <div
      data-testid="overlay-studio-v3"
      className="osv3-workbench osv3-workbench--orbit"
      data-orbit="true"
    >
      {accessNotice ? (
        <div
          data-testid="studio-access-notice"
          className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-4 py-3 text-sm text-vantare-red-300"
          role="alert"
        >
          <span>{resolveStudioV3Text(accessNotice, t)}</span>
          <button
            type="button"
            className="rounded-md border border-white/15 px-2 py-1 text-xs font-semibold text-white"
            onClick={dismissAccessNotice}
          >
            Cerrar
          </button>
        </div>
      ) : null}
      <StudioConfirmProvider>
        <StudioTelemetryProvider {...telemetryProps}>
          <StudioOrbitLayout
            activeFile={activeFile}
            diagnostics={diagnostics}
            onOpenBrowserView={() => void handleOpenBrowserView()}
            onRequestProfileChange={guardedProfileChange}
            profiles={profiles}
          />
        </StudioTelemetryProvider>
      </StudioConfirmProvider>
      <DirtyChangesDialog
        open={dirtyDialogOpen}
        saving={dirtySaving}
        errorMessage={dirtyError}
        onSave={() => void handleDirtySave()}
        onDiscard={handleDirtyDiscard}
        onCancel={closeDirtyDialog}
      />
      <RecoveryDialog
        open={recoveryPrompt !== null}
        profileName={
          recoveryPrompt?.record.document.name ??
          document?.name ??
          t('studio.v3.recovery.profileFallback')
        }
        capturedAt={recoveryPrompt?.record.capturedAt ?? ''}
        staleRevisionWarning={recoveryPrompt?.warning}
        onRecover={handleRecoveryRecover}
        onDiscard={handleRecoveryDiscard}
      />
      <DirtyChangesDialog
        open={browserViewDialogOpen}
        saving={browserViewSaving}
        errorMessage={browserViewError ? resolveStudioV3Text(browserViewError, t) : null}
        dialogTestId="studio-browser-view-dialog"
        title={t('studio.v3.browserView.dialog.title')}
        body={t('studio.v3.browserView.dialog.body')}
        showDiscard={false}
        onSave={handleBrowserViewSave}
        onCancel={closeBrowserViewDialog}
      />
    </div>
  );
}
