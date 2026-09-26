import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { WidgetPolicyWire } from "../../../overlay/core/widget-policy";
import { useWailsWidgetPolicy } from "../../../overlay/core/use-widget-policy";
import {
  readCachedStudioDocument,
} from "./studio-doc-cache";
import type { StudioProfileClient } from "./studio-profile-client";
import { createStudioRecoveryStore } from "./studio-recovery";
import {
  StudioWidgetPolicyContext,
  StudioPreviewContext,
  StudioStoreContext,
  type StudioPreviewContextValue,
  type StudioPreviewState,
} from "./studio-context";
import {
  buildInitialHistory,
  createStudioStore,
  type StudioSeed,
} from "./studio-document-store";
import { selectStudioDirty } from "./studio-derived-selectors";
import { orbitStore, ORBIT_KEYS } from "../../orbit/orbit-store";
import { CANVAS_BACKGROUNDS } from "../canvas/canvas-backgrounds";
import { findWallpaper, wallpaperIdOf } from "../canvas/studio-wallpapers";

const DEFAULT_PREVIEW_STATE: StudioPreviewState = {
  source: "mock",
  mockSession: "practice",
  mockLocation: "track",
  zoom: "fit",
  // El escenario sigue la paleta hasta que se elige otro fondo.
  backgroundId: "theme",
  safeArea: false,
};

function initialPreviewState(): StudioPreviewState {
  const saved = orbitStore.get(ORBIT_KEYS.studioBackground);
  const backgroundId = saved && (
    CANVAS_BACKGROUNDS.some((background) => background.id === saved) ||
    findWallpaper(wallpaperIdOf(saved)) !== null
  ) ? saved : "theme";
  return { ...DEFAULT_PREVIEW_STATE, backgroundId };
}

export function StudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
  recoveryStorage?: Storage | null;
  recoveryWriteDelayMs?: number;
  widgetPolicy?: WidgetPolicyWire | null;
}): React.ReactElement {
  const {
    client,
    initialFile,
    children,
    recoveryStorage = null,
    recoveryWriteDelayMs = 300,
    widgetPolicy = null,
  } = props;
  // Stale-while-revalidate: the local cache of the last known document seeds
  // history in the state initializer (once per mount) so widgets paint
  // instantly while the fresh load travels over IPC.
  const [seed] = useState<StudioSeed>(() => {
    const cached = readCachedStudioDocument(initialFile);
    return cached ? buildInitialHistory(cached) : null;
  });
  const [store] = useState(() => createStudioStore(seed));
  const recoveryStore = useMemo(
    () => (recoveryStorage ? createStudioRecoveryStore(recoveryStorage) : null),
    [recoveryStorage],
  );
  store.configure({ widgetPolicy, client, initialFile, recoveryStore });
  const [preview, setPreviewState] = useState<StudioPreviewState>(initialPreviewState);

  useEffect(() => {
    let cancelled = false;

    void client.load(initialFile).then(
      (loaded) => {
        if (cancelled) {
          return;
        }
        store.applyLoadedDocument(loaded, seed);
      },
      (error: unknown) => {
        if (cancelled) {
          return;
        }
        // Sin load fresco la semilla cacheada no es de fiar: estado de error.
        const message = error instanceof Error ? error.message : "failed to load studio profile";
        store.applyLoadError(message);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [client, initialFile, seed, store]);

  // El provider se suscribe al snapshot entero (referencia estable) y el
  // efecto solo depende de los campos que programa el recovery: selección o
  // sesión no lo reprograman.
  const docState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const document = docState.history?.present ?? null;
  const dirty = selectStudioDirty(docState.history);

  useEffect(() => {
    if (!recoveryStore || !document || !dirty) {
      return;
    }
    const timeout = window.setTimeout(() => {
      recoveryStore.write({
        version: 1,
        profileId: document.id,
        baseRevision: docState.revision,
        capturedAt: new Date().toISOString(),
        document,
      });
    }, recoveryWriteDelayMs);
    return () => window.clearTimeout(timeout);
  }, [recoveryStore, document, dirty, docState.revision, recoveryWriteDelayMs]);

  const setPreview = useCallback((patch: Partial<StudioPreviewState>) => {
    if (patch.backgroundId !== undefined) {
      orbitStore.set(ORBIT_KEYS.studioBackground, patch.backgroundId);
    }
    setPreviewState((current) => ({ ...current, ...patch }));
  }, []);

  const previewValue = useMemo<StudioPreviewContextValue>(
    () => ({
      preview,
      setPreview,
    }),
    [preview, setPreview],
  );

  return (
    <StudioStoreContext.Provider value={store}>
      <StudioWidgetPolicyContext.Provider value={widgetPolicy}>
        <StudioPreviewContext.Provider value={previewValue}>
          {children}
        </StudioPreviewContext.Provider>
      </StudioWidgetPolicyContext.Provider>
    </StudioStoreContext.Provider>
  );
}

export function ConnectedStudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
  recoveryStorage?: Storage | null;
  recoveryWriteDelayMs?: number;
  widgetPolicy?: WidgetPolicyWire | null;
}): React.ReactElement {
  const { widgetPolicy: policyOverride, ...rest } = props;
  const { policy: livePolicy } = useWailsWidgetPolicy();
  return <StudioProvider {...rest} widgetPolicy={policyOverride ?? livePolicy} />;
}
