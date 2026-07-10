import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
} from "../../../overlay/core/profile-document";
import type { MockLocationScenario, MockSessionScenario } from "../../../overlay/core/mock-scenarios";
import { upgradeProfileVisualConfigs } from "../../../overlay/core/visual-config-migration";
import {
  commitStudioCommand,
  discardStudioHistory,
  createStudioHistory,
  isStudioHistoryDirty,
  markStudioHistorySaved,
  redoStudioHistory,
  undoStudioHistory,
  type StudioHistory,
} from "./studio-history";
import { resolveSessionLayout } from "./session-layouts";
import type { StudioCommand } from "./studio-command";
import type { StudioProfileClient, StudioSaveResult } from "./studio-profile-client";

export type StudioSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export type StudioPreviewState = {
  source: "mock" | "live";
  mockSession: MockSessionScenario;
  mockLocation: MockLocationScenario;
  zoom: "fit" | 50 | 75 | 100 | 125;
  backgroundId: string;
  safeArea: boolean;
};

const DEFAULT_PREVIEW_STATE: StudioPreviewState = {
  source: "mock",
  mockSession: "practice",
  mockLocation: "track",
  zoom: "fit",
  backgroundId: "vantare-grid",
  safeArea: false,
};

type StudioDocumentContextValue = {
  document: ProfileDocumentV3 | null;
  activeLayout: SessionLayoutV3 | null;
  activeSession: SessionLayoutType;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: StudioSaveState;
  lastError: string | null;
  visuallyMigratedWidgetIds: readonly string[];
  dispatch(command: StudioCommand): void;
  selectWidget(id: string | null): void;
  selectSession(type: SessionLayoutType): void;
  save(): Promise<StudioSaveResult>;
  undo(): void;
  redo(): void;
  discardAll(): void;
};

type StudioPreviewContextValue = {
  preview: StudioPreviewState;
  setPreview(patch: Partial<StudioPreviewState>): void;
};

const StudioDocumentContext = createContext<StudioDocumentContextValue | null>(null);
const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

function buildInitialHistory(loadedDocument: ProfileDocumentV3): {
  history: StudioHistory;
  migratedWidgetIds: string[];
} {
  const upgrade = upgradeProfileVisualConfigs(loadedDocument);
  const history = {
    ...createStudioHistory(upgrade.document),
    saved: structuredClone(loadedDocument),
  };
  return {
    history,
    migratedWidgetIds: upgrade.migratedWidgetIds,
  };
}

export function StudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
}): JSX.Element {
  const { client, initialFile, children } = props;
  const [history, setHistory] = useState<StudioHistory | null>(null);
  const [revision, setRevision] = useState<string>("");
  const [activeSession, setActiveSession] = useState<SessionLayoutType>("general");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<StudioSaveState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [visuallyMigratedWidgetIds, setVisuallyMigratedWidgetIds] = useState<readonly string[]>([]);
  const [preview, setPreviewState] = useState<StudioPreviewState>(DEFAULT_PREVIEW_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSaveState("idle");
    setLastError(null);
    setLoadError(null);

    void client.load(initialFile).then(
      (loaded) => {
        if (cancelled) {
          return;
        }
        const initial = buildInitialHistory(loaded.document);
        setHistory(initial.history);
        setRevision(loaded.revision);
        setVisuallyMigratedWidgetIds(initial.migratedWidgetIds);
        setActiveSession("general");
        setSelectedWidgetId(null);
      },
      (error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "failed to load studio profile";
        setLoadError(message);
        setHistory(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [client, initialFile]);

  const document = history?.present ?? null;
  const dirty = history ? isStudioHistoryDirty(history) : false;

  const activeLayout = useMemo(() => {
    if (!document) {
      return null;
    }
    return resolveSessionLayout(document, activeSession);
  }, [document, activeSession]);

  const dispatch = useCallback((command: StudioCommand) => {
    setHistory((current) => (current ? commitStudioCommand(current, command) : current));
    setSaveState("idle");
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => (current ? undoStudioHistory(current) : current));
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => (current ? redoStudioHistory(current) : current));
  }, []);

  const discardAll = useCallback(() => {
    setHistory((current) => (current ? discardStudioHistory(current) : current));
    setSaveState("idle");
    setLastError(null);
    setVisuallyMigratedWidgetIds([]);
  }, []);

  const save = useCallback(async (): Promise<StudioSaveResult> => {
    if (!history || !document) {
      return { status: "error", message: "studio profile is not loaded" };
    }
    setSaveState("saving");
    setLastError(null);
    const result = await client.save({ document, expectedRevision: revision });
    if (result.status === "saved") {
      setHistory((current) =>
        current ? markStudioHistorySaved({ ...current, present: result.document }, result.document) : current,
      );
      setRevision(result.revision);
      setSaveState("saved");
      setVisuallyMigratedWidgetIds([]);
      return result;
    }
    if (result.status === "conflict") {
      setSaveState("conflict");
      setLastError(result.message);
      return result;
    }
    setSaveState("error");
    setLastError(result.message);
    return result;
  }, [client, document, history, revision]);

  const setPreview = useCallback((patch: Partial<StudioPreviewState>) => {
    setPreviewState((current) => ({ ...current, ...patch }));
  }, []);

  const documentValue = useMemo<StudioDocumentContextValue>(
    () => ({
      document,
      activeLayout,
      activeSession,
      selectedWidgetId,
      dirty,
      saveState,
      lastError: loadError ?? lastError,
      visuallyMigratedWidgetIds,
      dispatch,
      selectWidget: setSelectedWidgetId,
      selectSession: setActiveSession,
      save,
      undo,
      redo,
      discardAll,
    }),
    [
      document,
      activeLayout,
      activeSession,
      selectedWidgetId,
      dirty,
      saveState,
      loadError,
      lastError,
      visuallyMigratedWidgetIds,
      dispatch,
      save,
      undo,
      redo,
      discardAll,
    ],
  );

  const previewValue = useMemo<StudioPreviewContextValue>(
    () => ({
      preview,
      setPreview,
    }),
    [preview, setPreview],
  );

  return (
    <StudioDocumentContext.Provider value={documentValue}>
      <StudioPreviewContext.Provider value={previewValue}>{children}</StudioPreviewContext.Provider>
    </StudioDocumentContext.Provider>
  );
}

export function useStudioDocument(): StudioDocumentContextValue {
  const context = useContext(StudioDocumentContext);
  if (!context) {
    throw new Error("useStudioDocument must be used inside StudioProvider");
  }
  return context;
}

export function useStudioPreview(): StudioPreviewContextValue {
  const context = useContext(StudioPreviewContext);
  if (!context) {
    throw new Error("useStudioPreview must be used inside StudioProvider");
  }
  return context;
}