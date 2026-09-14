import type { WidgetPolicyWire } from "../../../overlay/core/widget-policy";
import type {
  ProfileDocumentV3,
  SessionLayoutType,
} from "../../../overlay/core/profile-document";
import {
  assertCommandAccess,
  StudioAccessError,
  validateDraftAccess,
} from "../access/studio-access";
import { upgradeProfileVisualConfigs } from "../../../overlay/core/visual-config-migration";
import {
  commitStudioCommand,
  createStudioHistory,
  discardStudioHistory,
  markStudioHistorySaved,
  redoStudioHistory,
  undoStudioHistory,
  type StudioHistory,
} from "./studio-history";
import { StudioCommandError, type StudioCommand } from "./studio-command";
import type { StudioProfileClient, StudioSaveResult } from "./studio-profile-client";
import {
  buildHistoryFromRecovery,
  createStudioRecoveryStore,
} from "./studio-recovery";
import { writeCachedStudioDocument } from "./studio-doc-cache";
import type { StudioSaveState } from "./studio-context";

/**
 * Estado crudo del dominio documento del Studio. Los derivados (document,
 * dirty, canUndo, activeLayout) se calculan en los selectores de los
 * consumidores: el snapshot debe permanecer referencialmente estable entre
 * cambios para que useSyncExternalStore deduplique bien.
 */
export type StudioDocumentState = {
  history: StudioHistory | null;
  revision: string;
  activeSession: SessionLayoutType;
  selectedWidgetId: string | null;
  saveState: StudioSaveState;
  accessNotice: string | null;
  visuallyMigratedWidgetIds: readonly string[];
  loadError: string | null;
};

export type StudioRecoveryStore = ReturnType<typeof createStudioRecoveryStore>;

/** Dependencias que llegan por props/memos del provider y pueden cambiar. */
export type StudioStoreDeps = {
  widgetPolicy: WidgetPolicyWire | null;
  client: StudioProfileClient;
  initialFile: string;
  recoveryStore: StudioRecoveryStore | null;
};

export type StudioSeed = {
  history: StudioHistory;
  migratedWidgetIds: string[];
} | null;

export type LoadedStudioDocument = {
  document: ProfileDocumentV3;
  revision: string;
};

export type StudioStore = {
  getSnapshot: () => StudioDocumentState;
  subscribe: (listener: () => void) => () => void;
  /** El provider lo llama en cada render: las acciones siempre leen deps frescas. */
  configure: (deps: StudioStoreDeps) => void;
  /** Aplica el resultado de client.load respetando la semilla SWR. */
  applyLoadedDocument: (loaded: LoadedStudioDocument, seed: StudioSeed) => void;
  applyLoadError: (message: string) => void;
  dispatch: (command: StudioCommand) => boolean;
  selectWidget: (id: string | null) => void;
  selectSession: (type: SessionLayoutType) => void;
  save: () => Promise<StudioSaveResult>;
  undo: () => boolean;
  redo: () => boolean;
  discardAll: () => void;
  acceptRecovery: (recoveredDocument: ProfileDocumentV3) => void;
  dismissAccessNotice: () => void;
  notifyAccessDenied: (message: string) => void;
};

export function buildInitialHistory(loadedDocument: ProfileDocumentV3): {
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

export function createStudioStore(seed: StudioSeed): StudioStore {
  // configure() se llama en el primer render del provider, antes de que
  // cualquier accion pueda dispararse.
  let deps: StudioStoreDeps = {
    widgetPolicy: null,
    client: {
      load: () => Promise.reject(new Error("studio store not configured")),
      save: () => Promise.reject(new Error("studio store not configured")),
    },
    initialFile: "",
    recoveryStore: null,
  };
  let state: StudioDocumentState = {
    history: seed?.history ?? null,
    revision: "",
    activeSession: "general",
    selectedWidgetId: null,
    saveState: "idle",
    accessNotice: null,
    visuallyMigratedWidgetIds: seed?.migratedWidgetIds ?? [],
    loadError: null,
  };
  // Un solo drenaje de save en vuelo, igual que el savePromiseRef anterior.
  let savePromise: Promise<StudioSaveResult> | null = null;
  const subscribers = new Set<() => void>();

  const notify = () => {
    subscribers.forEach((subscriber) => subscriber());
  };

  const setState = (patch: Partial<StudioDocumentState>) => {
    state = { ...state, ...patch };
    notify();
  };

  const store: StudioStore = {
    getSnapshot: () => state,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    configure: (nextDeps) => {
      deps = nextDeps;
    },

    applyLoadedDocument: (loaded, currentSeed) => {
      const initial = buildInitialHistory(loaded.document);
      const seeded = currentSeed !== null;
      // Si el usuario ya edito sobre la semilla cacheada, se conservan esas
      // ediciones y solo se reancla el baseline `saved` al documento real.
      const editedSinceCache = seeded && state.history !== currentSeed!.history;
      // Fresco identico a la semilla (caso comun: reabrir sin cambios): solo
      // avanza la revision — cero re-render del canvas, cero salto.
      const freshEqualsSeed =
        seeded &&
        !editedSinceCache &&
        JSON.stringify(currentSeed!.history.present) ===
          JSON.stringify(initial.history.present);
      if (freshEqualsSeed) {
        setState({
          revision: loaded.revision,
          saveState: "idle",
          accessNotice: null,
          loadError: null,
        });
        writeCachedStudioDocument(deps.initialFile, initial.history.present);
        return;
      }
      setState({
        history:
          editedSinceCache && state.history
            ? markStudioHistorySaved(state.history, loaded.document)
            : initial.history,
        revision: loaded.revision,
        visuallyMigratedWidgetIds: initial.migratedWidgetIds,
        activeSession: "general",
        selectedWidgetId: null,
        saveState: "idle",
        accessNotice: null,
        loadError: null,
      });
      // La cache guarda el documento YA migrado (lo que pinta el canvas) para
      // que la siguiente semilla y la carga fresca sean identicas por
      // construccion.
      writeCachedStudioDocument(deps.initialFile, initial.history.present);
    },

    applyLoadError: (message) => {
      setState({
        saveState: "idle",
        accessNotice: null,
        loadError: message,
        history: null,
        revision: "",
      });
    },

    dispatch: (command) => {
      const history = state.history;
      if (!history?.present) {
        return false;
      }
      try {
        assertCommandAccess(
          deps.widgetPolicy,
          command,
          history.present,
          command.type === "widget/apply-design" ? command.design : undefined,
        );
      } catch (error) {
        if (error instanceof StudioAccessError) {
          setState({ accessNotice: error.message });
          return false;
        }
        throw error;
      }
      try {
        const next = commitStudioCommand(history, command);
        if (next === history) {
          return false;
        }
        setState({ history: next, accessNotice: null, saveState: "idle" });
        return true;
      } catch (error) {
        if (error instanceof StudioCommandError) {
          setState({ accessNotice: error.message });
          return false;
        }
        throw error;
      }
    },

    selectWidget: (id) => {
      setState({ selectedWidgetId: id });
    },

    selectSession: (type) => {
      setState({ activeSession: type });
    },

    undo: () => {
      const history = state.history;
      if (!history) {
        return false;
      }
      const next = undoStudioHistory(history);
      if (next === history) {
        return false;
      }
      setState({ history: next });
      return true;
    },

    redo: () => {
      const history = state.history;
      if (!history) {
        return false;
      }
      const next = redoStudioHistory(history);
      if (next === history) {
        return false;
      }
      setState({ history: next });
      return true;
    },

    discardAll: () => {
      const current = state.history;
      if (!current) {
        return;
      }
      if (deps.recoveryStore && current.saved) {
        deps.recoveryStore.clear(current.saved.id);
      }
      setState({
        history: discardStudioHistory(current),
        saveState: "idle",
        accessNotice: null,
        visuallyMigratedWidgetIds: [],
      });
    },

    acceptRecovery: (recoveredDocument) => {
      const current = state.history;
      if (!current) {
        return;
      }
      setState({ history: buildHistoryFromRecovery(current.saved, recoveredDocument) });
    },

    dismissAccessNotice: () => {
      setState({ accessNotice: null });
    },

    notifyAccessDenied: (message) => {
      setState({ accessNotice: message });
    },

    save: () => {
      // Todos los consumidores comparten el mismo drenaje: nunca hay dos
      // saves en vuelo. Si el documento cambia mientras se guarda A, el bucle
      // guarda B a continuacion con la revision confirmada por A.
      if (savePromise) {
        return savePromise;
      }

      const promise = (async (): Promise<StudioSaveResult> => {
        setState({ saveState: "saving", accessNotice: null });

        while (true) {
          const currentHistory = state.history;
          const currentDocument = currentHistory?.present ?? null;
          const currentRevision = state.revision;
          if (!currentHistory || !currentDocument || !currentHistory.saved) {
            const result: StudioSaveResult = {
              status: "error",
              message: "studio profile is not loaded",
            };
            setState({ saveState: "error", accessNotice: result.message });
            return result;
          }

          const draftValidation = validateDraftAccess(
            deps.widgetPolicy,
            currentHistory.saved,
            currentDocument,
          );
          if (!draftValidation.allowed) {
            const result: StudioSaveResult = {
              status: "error",
              message: draftValidation.reason,
            };
            setState({ saveState: "error", accessNotice: draftValidation.reason });
            return result;
          }

          let result: StudioSaveResult;
          try {
            result = await deps.client.save({
              file: deps.initialFile,
              document: currentDocument,
              expectedRevision: currentRevision,
            });
          } catch (error: unknown) {
            result = {
              status: "error",
              message: error instanceof Error ? error.message : "studio profile save failed",
            };
          }

          if (result.status === "saved") {
            // El presente nunca se sustituye por la respuesta. Solo avanza el
            // snapshot guardado; una edicion B ocurrida durante A conserva su
            // identidad, su historial y provoca el siguiente save.
            const latestHistory = state.history;
            if (!latestHistory) {
              const unloaded: StudioSaveResult = {
                status: "error",
                message: "studio profile is not loaded",
              };
              setState({ saveState: "error", accessNotice: unloaded.message });
              return unloaded;
            }
            const hasNewerDocument = latestHistory.present !== currentDocument;
            setState({
              history: markStudioHistorySaved(latestHistory, result.document),
              revision: result.revision,
            });

            if (hasNewerDocument) {
              continue;
            }

            deps.recoveryStore?.clear(result.document.id);
            // La cache SWR acompana al ultimo documento confirmado, no a una
            // respuesta intermedia con una edicion posterior en cola.
            writeCachedStudioDocument(deps.initialFile, result.document);
            setState({ saveState: "saved", visuallyMigratedWidgetIds: [] });
            return result;
          }

          setState({
            saveState: result.status === "conflict" ? "conflict" : "error",
            accessNotice: result.message,
          });
          return result;
        }
      })();

      savePromise = promise;
      void promise.finally(() => {
        if (savePromise === promise) {
          savePromise = null;
        }
      });
      return promise;
    },
  };

  return store;
}
