import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PilotFields, PilotView } from "../../contract/generated/contract";
import { isPilotFields } from "../../contract/pilot-validation";
import { centeredCrop, type PhotoCrop } from "../screens/settings/photo-crop";
import {
  encodePilotPhoto,
  openPilotPhoto,
} from "../screens/settings/pilot-photo";
import { useAccountSession } from "./AccountSession";
import { useHost } from "./Host";

interface State {
  available: boolean;
  sessionGeneration: number;
  sessionDiscarded: boolean;
  dismissSessionDiscarded(): void;
  photo?: { image: ImageBitmap; crop: PhotoCrop };
  photoBusy: boolean;
  photoError: boolean;
  choosePhoto(file: File): Promise<void>;
  cropPhoto(crop: PhotoCrop | ((current: PhotoCrop) => PhotoCrop)): void;
  cancelPhoto(): void;
  applyPhoto(): void;
  view?: PilotView;
  draft?: PilotFields;
  busy: boolean;
  error: boolean;
  dirty: boolean;
  lastSaved: boolean;
  closeVeto: boolean;
  load(): Promise<void>;
  save(): Promise<void>;
  retry(): Promise<void>;
  discard(): void;
  edit(fields: PilotFields | ((current: PilotFields) => PilotFields)): void;
}
const Context = createContext<State | undefined>(undefined);
export function usePilot() {
  const state = useContext(Context);
  if (!state) throw new Error("PilotProvider missing");
  return state;
}
export function PilotProvider({ children }: { children: ReactNode }) {
  const { client } = useHost();
  const session = useAccountSession();
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const epoch = useRef(0);
  const active = useRef(true);
  const hasChanges = useRef(false);
  const [sessionDiscarded, setSessionDiscarded] = useState(false);
  const dismissSessionDiscarded = useCallback(
    () => setSessionDiscarded(false),
    [],
  );
  const currentSession = () =>
    active.current &&
    session.getSnapshot().ready &&
    session.getSnapshot().generation === snapshot.generation;
  const [photo, setPhoto] = useState<{ image: ImageBitmap; crop: PhotoCrop }>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const photoResource = useRef<ImageBitmap | undefined>(undefined);
  const photoGeneration = useRef(0);
  const photoLoading = useRef(false);
  useEffect(
    () => () => {
      photoGeneration.current++;
      photoResource.current?.close();
      photoResource.current = undefined;
    },
    [],
  );
  const cancelPhoto = useCallback(() => {
    photoGeneration.current++;
    photoLoading.current = false;
    photoResource.current?.close();
    photoResource.current = undefined;
    setPhoto(undefined);
    setPhotoBusy(false);
    setPhotoError(false);
  }, []);
  async function choosePhoto(file: File) {
    if (
      !currentSession() ||
      saving.current ||
      photoLoading.current ||
      photoResource.current
    )
      return;
    const generation = ++photoGeneration.current;
    photoLoading.current = true;
    unsaved.current = true;
    hasChanges.current = true;
    setPhotoBusy(true);
    setPhotoError(false);
    setLastSaved(false);
    try {
      const image = await openPilotPhoto(file);
      if (generation !== photoGeneration.current) {
        image.close();
        return;
      }
      photoResource.current = image;
      setPhoto({ image, crop: centeredCrop(image.width, image.height) });
    } catch {
      if (generation === photoGeneration.current) setPhotoError(true);
    } finally {
      if (generation === photoGeneration.current) {
        photoLoading.current = false;
        setPhotoBusy(false);
      }
    }
  }
  function applyPhoto() {
    if (!currentSession() || !photo || saving.current) return;
    try {
      const value = encodePilotPhoto(photo.image, photo.crop);
      setDraft((current) => current && { ...current, photo: value });
      setLastSaved(false);
      cancelPhoto();
    } catch {
      setPhotoError(true);
    }
  }
  const [lastSaved, setLastSaved] = useState(false);
  const [closeVeto, setCloseVeto] = useState(false);
  const [view, setView] = useState<PilotView>();
  const [draft, setDraft] = useState<PilotFields>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const dirty =
    photoBusy ||
    !!photo ||
    (!!view &&
      !!draft &&
      JSON.stringify(view.fields) !== JSON.stringify(draft));
  const unsaved = useRef(false);
  unsaved.current = dirty || busy;
  hasChanges.current = dirty;
  const operation = useRef<Promise<void> | undefined>(undefined);
  const invalidate = useCallback(() => {
    epoch.current++;
    if (hasChanges.current) setSessionDiscarded(true);
    cancelPhoto();
    saving.current = false;
    operation.current = undefined;
    unsaved.current = false;
    hasChanges.current = false;
    setView(undefined);
    setDraft(undefined);
    setBusy(false);
    setError(false);
    setLastSaved(false);
    setCloseVeto(false);
  }, [cancelPhoto]);
  useLayoutEffect(() => {
    active.current = !!client;
    let observed = session.getSnapshot().generation;
    invalidate();
    const stop = session.subscribe(() => {
      const next = session.getSnapshot();
      if (next.generation !== observed || !next.ready) {
        observed = next.generation;
        invalidate();
      }
    });
    return () => {
      active.current = false;
      epoch.current++;
      stop();
      cancelPhoto();
    };
  }, [client, session, invalidate, cancelPhoto]);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      if (reason === "live") {
        invalidate();
        return true;
      }
      await operation.current;
      if (!unsaved.current) return true;
      setCloseVeto(true);
      return false;
    });
  }, [client, invalidate]);
  async function run(action: (current: () => boolean) => Promise<void>) {
    if (!currentSession() || saving.current) return;
    const started = epoch.current;
    const current = () => currentSession() && epoch.current === started;
    saving.current = true;
    setBusy(true);
    setError(false);
    operation.current = action(current)
      .catch(() => {
        if (!current()) return;
        setError(true);
        setLastSaved(false);
      })
      .finally(() => {
        if (!current()) return;
        saving.current = false;
        setBusy(false);
      });
    await operation.current;
  }
  async function load() {
    if (!currentSession()) return;
    cancelPhoto();
    await run(async (current) => {
      const reply = await client?.request({ method: "pilot.load" });
      if (!current()) return;
      if (reply?.method !== "pilot.load") throw new Error("pilot unavailable");
      setView(reply.value);
      setDraft(structuredClone(reply.value.fields));
      unsaved.current = false;
      hasChanges.current = false;
      setCloseVeto(false);
      setLastSaved(false);
    });
  }
  async function save() {
    if (
      photoLoading.current ||
      photoResource.current ||
      !view ||
      !draft ||
      !isPilotFields(draft)
    )
      return;
    const fields = structuredClone(draft);
    await run(async (current) => {
      const reply = await client?.request({
        method: "pilot.save",
        fields,
        baseRevision: view.revision,
      });
      if (!current()) return;
      if (reply?.method !== "pilot.save") throw new Error("pilot not saved");
      setView(reply.value);
      setDraft(structuredClone(reply.value.fields));
      unsaved.current = false;
      hasChanges.current = false;
      setLastSaved(true);
      setCloseVeto(false);
    });
  }
  async function retry() {
    if (
      photoLoading.current ||
      photoResource.current ||
      !view ||
      !draft ||
      !isPilotFields(draft)
    )
      return;
    const base = structuredClone(view.fields);
    const intent = structuredClone(draft);
    await run(async (current) => {
      const latest = await client?.request({ method: "pilot.load" });
      if (!current()) return;
      if (latest?.method !== "pilot.load") throw new Error("pilot unavailable");
      const fields = structuredClone(latest.value.fields);
      const apply = <K extends keyof PilotFields>(key: K) => {
        if (JSON.stringify(base[key]) !== JSON.stringify(intent[key]))
          fields[key] = structuredClone(intent[key]);
      };
      for (const key of Object.keys(base) as (keyof PilotFields)[]) apply(key);
      setView(latest.value);
      setDraft(fields);
      const saved = await client?.request({
        method: "pilot.save",
        fields,
        baseRevision: latest.value.revision,
      });
      if (!current()) return;
      if (saved?.method !== "pilot.save") throw new Error("pilot not saved");
      setView(saved.value);
      setDraft(structuredClone(saved.value.fields));
      unsaved.current = false;
      hasChanges.current = false;
      setLastSaved(true);
      setCloseVeto(false);
    });
  }
  return (
    <Context.Provider
      value={{
        available: snapshot.ready,
        sessionGeneration: snapshot.generation,
        sessionDiscarded,
        dismissSessionDiscarded,
        photo,
        photoBusy,
        photoError,
        choosePhoto,
        cancelPhoto,
        applyPhoto,
        cropPhoto: (crop) => {
          if (currentSession() && !saving.current)
            setPhoto(
              (current) =>
                current && {
                  ...current,
                  crop: typeof crop === "function" ? crop(current.crop) : crop,
                },
            );
        },
        view,
        draft,
        busy,
        error,
        dirty,
        lastSaved,
        closeVeto,
        load,
        save,
        retry,
        discard: () => {
          if (!currentSession()) return;
          dismissSessionDiscarded();
          cancelPhoto();
          setDraft(view && structuredClone(view.fields));
          setError(false);
          setLastSaved(false);
          setCloseVeto(false);
        },
        edit: (fields) => {
          if (currentSession() && !saving.current) {
            dismissSessionDiscarded();
            hasChanges.current = true;
            setLastSaved(false);
            setDraft((current) =>
              typeof fields === "function"
                ? current && fields(current)
                : fields,
            );
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
