import { useCallback, useEffect, useRef, useState } from "react";
import "./overlay-studio-v3.css";
import { ConnectedStudioTelemetryProvider } from "./canvas/StudioTelemetryProvider";
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
  viewportWidth?: number;
  recoveryStorage?: Storage | null;
};

type RecoveryPromptState = {
  record: StudioRecoveryRecord;
  warning?: string;
};

export function OverlayStudioV3(props: OverlayStudioV3Props): React.ReactElement {
  const {
    viewportWidth: viewportWidthProp,
    recoveryStorage: recoveryStorageProp,
    onRequestProfileChange,
    activeFile,
    ...headerProps
  } = props;
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
  const recoveryCheckedProfileIdRef = useRef<string | null>(null);

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
          <ConnectedStudioTelemetryProvider>
            <StudioCanvas />
          </ConnectedStudioTelemetryProvider>
        }
        inspectorPanel={
          <ConnectedStudioTelemetryProvider>
            <InspectorSlot />
          </ConnectedStudioTelemetryProvider>
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
    </div>
  );
}