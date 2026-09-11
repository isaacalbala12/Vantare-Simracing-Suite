import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { WidgetPolicyWire } from "../../../overlay/core/widget-policy";
import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
} from "../../../overlay/core/profile-document";
import type { AuthoringV2Scenario } from "../../../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import type { StudioCommand } from "./studio-command";
import type { StudioSaveResult } from "./studio-profile-client";
import { isStudioHistoryDirty } from "./studio-history";
import { resolveSessionLayout } from "./session-layouts";
import type { StudioStore } from "./studio-document-store";

export type StudioSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export type StudioPreviewState = {
  source: "mock" | "live";
  mockSession: AuthoringV2Scenario["session"];
  mockLocation: AuthoringV2Scenario["location"];
  zoom: "fit" | 50 | 75 | 100 | 125 | 150;
  backgroundId: string;
  safeArea: boolean;
};

export type StudioDocumentContextValue = {
  /** Live native snapshot, or null before the first one: basic Free applies. */
  widgetPolicy: WidgetPolicyWire | null;
  document: ProfileDocumentV3 | null;
  savedDocument: ProfileDocumentV3 | null;
  revision: string;
  activeLayout: SessionLayoutV3 | null;
  activeSession: SessionLayoutType;
  selectedWidgetId: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saveState: StudioSaveState;
  lastError: string | null;
  accessNotice: string | null;
  visuallyMigratedWidgetIds: readonly string[];
  dispatch(command: StudioCommand): boolean;
  selectWidget(id: string | null): void;
  selectSession(type: SessionLayoutType): void;
  save(): Promise<StudioSaveResult>;
  undo(): boolean;
  redo(): boolean;
  discardAll(): void;
  acceptRecovery(recoveredDocument: ProfileDocumentV3): void;
  dismissAccessNotice(): void;
  notifyAccessDenied(message: string): void;
};

export type StudioPreviewContextValue = {
  preview: StudioPreviewState;
  setPreview(patch: Partial<StudioPreviewState>): void;
};

// El contexto entrega la instancia del store (referencia estable: nunca
// repinta). Los datos viven dentro y se leen con useStudioSelector.
export const StudioStoreContext = createContext<StudioStore | null>(null);
export const StudioWidgetPolicyContext = createContext<WidgetPolicyWire | null>(null);
export const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

export function useStudioStoreInstance(): StudioStore {
  const store = useContext(StudioStoreContext);
  if (!store) {
    throw new Error("useStudioStoreInstance must be used inside StudioProvider");
  }
  return store;
}

/**
 * Suscripcion granular: el consumidor solo repinta cuando cambia el slice
 * seleccionado. El selector debe devolver valores estables por referencia
 * (campos crudos o primitivos); los derivados se memoizan fuera con useMemo.
 */
export function useStudioSelector<T>(selector: (state: ReturnType<StudioStore["getSnapshot"]>) => T): T {
  const store = useStudioStoreInstance();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

/**
 * Shim de compatibilidad: devuelve la forma completa del contexto historico
 * para consumidores no migrados. Suscribe al estado entero — mismo
 * comportamiento que el documentValue anterior. Migrar a useStudioSelector
 * da la granularidad real.
 */
export function useStudioDocument(): StudioDocumentContextValue {
  const store = useStudioStoreInstance();
  const widgetPolicy = useContext(StudioWidgetPolicyContext);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return useMemo<StudioDocumentContextValue>(() => {
    const document = state.history?.present ?? null;
    return {
      widgetPolicy,
      document,
      savedDocument: state.history?.saved ?? null,
      revision: state.revision,
      activeLayout: document ? resolveSessionLayout(document, state.activeSession) : null,
      activeSession: state.activeSession,
      selectedWidgetId: state.selectedWidgetId,
      dirty: state.history ? isStudioHistoryDirty(state.history) : false,
      canUndo: (state.history?.past.length ?? 0) > 0,
      canRedo: (state.history?.future.length ?? 0) > 0,
      saveState: state.saveState,
      lastError: state.loadError,
      accessNotice: state.accessNotice,
      visuallyMigratedWidgetIds: state.visuallyMigratedWidgetIds,
      dispatch: store.dispatch,
      selectWidget: store.selectWidget,
      selectSession: store.selectSession,
      save: store.save,
      undo: store.undo,
      redo: store.redo,
      discardAll: store.discardAll,
      acceptRecovery: store.acceptRecovery,
      dismissAccessNotice: store.dismissAccessNotice,
      notifyAccessDenied: store.notifyAccessDenied,
    };
  }, [widgetPolicy, state, store]);
}

export function useStudioPreview(): StudioPreviewContextValue {
  const context = useContext(StudioPreviewContext);
  if (!context) {
    throw new Error("useStudioPreview must be used inside StudioProvider");
  }
  return context;
}
