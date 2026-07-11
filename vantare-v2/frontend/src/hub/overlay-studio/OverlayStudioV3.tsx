import { useCallback, useEffect, useRef, useState } from "react";
import "./overlay-studio-v3.css";
import { openBrowserView, type BrowserViewDecision } from "./browser-view";
import type { TelemetryRateCoordinator } from "../../overlay/core/telemetry-rate-coordinator";
import type { TelemetryAdapter } from "../../overlay/transports/wails-telemetry-adapter";
import { StudioTelemetryProvider } from "./canvas/StudioTelemetryProvider";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { DirtyChangesDialog } from "./components/DirtyChangesDialog";
import { InspectorSlot } from "./components/InspectorSlot";
import { RecoveryDialog } from "./components/RecoveryDialog";
import { ResponsivePanelControls } from "./components/ResponsivePanelControls";
import { StudioHeader, type StudioHeaderProps } from "./components/StudioHeader";
import { WidgetListPanel } from "./components/WidgetListPanel";
import { createStudioRecoveryStore, type StudioRecoveryRecord } from "./state/studio-recovery";
import { useStudioDocument } from "./state/studio-store";

export type OverlayStudioV3Props = StudioHeaderProps & {
  coordinator: TelemetryRateCoordinator;
  telemetryAdapter?: TelemetryAdapter | null;
  liveAvailable?: boolean;
  viewportWidth?: number;
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
    viewportWidth: viewportWidthProp,
    recoveryStorage: recoveryStorageProp,
    browserViewStudioPreview = false,
    onRequestProfileChange,
    activeFile,
    ...headerProps
  } = props;
  const telemetryProps = { coordinator, telemetryAdapter, liveAvailable };
  const viewportWidth = viewportWidthProp ?? (typeof window !== "undefined" ? window.innerWidth : 1440);
  const recoveryStorage =
    recoveryStorageProp ?? (typeof window !== "undefined" ? window.sessionStorage : null);

  const {
    dirty,
    save,
    discardAll,
    acceptRecovery,
    document,
    revision,
    selectedWidgetId,
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
    if (result.record) {
      setRecoveryPrompt({ record: result.record, warning: result.warning });
    }
  }, [document?.id, recoveryStorage, revision]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
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
    if (result.status === "saved") {
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
    browserViewDecideRef.current?.("cancel");
    browserViewDecideRef.current = null;
    setBrowserViewDialogOpen(false);
    setBrowserViewSaving(false);
    setBrowserViewError(null);
  }, []);

  const handleOpenBrowserView = useCallback(async () => {
    if (typeof window === "undefined") {
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
        window.open(url, "_blank", "noopener,noreferrer");
      },
    });

    setBrowserViewSaving(false);
    browserViewDecideRef.current = null;

    if (result === "opened" || result === "cancelled") {
      setBrowserViewDialogOpen(false);
      setBrowserViewError(null);
      return;
    }

    setBrowserViewDialogOpen(true);
    setBrowserViewError("No se pudo guardar el perfil. Browser View solo usa el estado guardado.");
  }, [activeFile, browserViewStudioPreview, dirty, save]);

  const handleBrowserViewSave = useCallback(() => {
    setBrowserViewSaving(true);
    setBrowserViewError(null);
    browserViewDecideRef.current?.("save");
  }, []);

  return (
    <div data-testid="overlay-studio-v3" className="osv3-workbench">
      <StudioHeader
        {...headerProps}
        activeFile={activeFile}
        onRequestProfileChange={guardedProfileChange}
      />
      <ResponsivePanelControls
        viewportWidth={viewportWidth}
        selectedWidgetId={selectedWidgetId}
        listPanel={<WidgetListPanel />}
        canvasPanel={
          <StudioTelemetryProvider {...telemetryProps}>
            <StudioCanvas onOpenBrowserView={() => void handleOpenBrowserView()} />
          </StudioTelemetryProvider>
        }
        inspectorPanel={
          <StudioTelemetryProvider {...telemetryProps}>
            <InspectorSlot />
          </StudioTelemetryProvider>
        }
      />
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
        profileName={recoveryPrompt?.record.document.name ?? document?.name ?? "Perfil"}
        capturedAt={recoveryPrompt?.record.capturedAt ?? ""}
        staleRevisionWarning={recoveryPrompt?.warning}
        onRecover={handleRecoveryRecover}
        onDiscard={handleRecoveryDiscard}
      />
      <DirtyChangesDialog
        open={browserViewDialogOpen}
        saving={browserViewSaving}
        errorMessage={browserViewError}
        dialogTestId="studio-browser-view-dialog"
        title="Guardar antes de Browser View"
        body="Browser View muestra el perfil guardado, no el borrador actual. Guarda los cambios o cancela."
        showDiscard={false}
        onSave={handleBrowserViewSave}
        onCancel={closeBrowserViewDialog}
      />
    </div>
  );
}