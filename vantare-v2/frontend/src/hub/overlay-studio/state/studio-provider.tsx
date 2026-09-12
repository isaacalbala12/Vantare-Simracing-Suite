import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAccess } from "../../../lib/access";
import type { AccessContext } from "../../../lib/access-policy";
import { DEFAULT_STUDIO_ACCESS } from "../access/studio-access";
import {
  readCachedStudioDocument,
} from "./studio-doc-cache";
import type { StudioProfileClient } from "./studio-profile-client";
import { createStudioRecoveryStore } from "./studio-recovery";
import {
  StudioAccessContext,
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
import { isStudioHistoryDirty } from "./studio-history";

const DEFAULT_PREVIEW_STATE: StudioPreviewState = {
  source: "mock",
  mockSession: "practice",
  mockLocation: "track",
  zoom: "fit",
  // El degradado se parece mas a lo que hay detras de un overlay en carrera que
  // una rejilla plana, asi que juzgar contraste y legibilidad sobre el es mas
  // fiel. La rejilla sigue disponible en el selector para alinear a ojo.
  backgroundId: "gradient",
  safeArea: false,
};

export function StudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
  recoveryStorage?: Storage | null;
  recoveryWriteDelayMs?: number;
  access?: AccessContext;
}): React.ReactElement {
  const {
    client,
    initialFile,
    children,
    recoveryStorage = null,
    recoveryWriteDelayMs = 300,
    access: accessOverride,
  } = props;
  const access = accessOverride ?? DEFAULT_STUDIO_ACCESS;
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
  store.configure({ access, client, initialFile, recoveryStore });
  const [preview, setPreviewState] = useState<StudioPreviewState>(DEFAULT_PREVIEW_STATE);

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
  const dirty = docState.history ? isStudioHistoryDirty(docState.history) : false;

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
      <StudioAccessContext.Provider value={access}>
        <StudioPreviewContext.Provider value={previewValue}>
          {children}
        </StudioPreviewContext.Provider>
      </StudioAccessContext.Provider>
    </StudioStoreContext.Provider>
  );
}

export function ConnectedStudioProvider(props: {
  client: StudioProfileClient;
  initialFile: string;
  children: ReactNode;
  recoveryStorage?: Storage | null;
  recoveryWriteDelayMs?: number;
}): React.ReactElement {
  const access = useAccess();
  return <StudioProvider {...props} access={access} />;
}
