import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PilotFields, PilotView } from "../../contract/generated/contract";
import { isPilotFields } from "../../contract/pilot-validation";
import { centeredCrop, type PhotoCrop } from "../screens/settings/photo-crop";
import {
  encodePilotPhoto,
  openPilotPhoto,
} from "../screens/settings/pilot-photo";
import { useHost } from "./Host";

interface State {
  photo?: { image: ImageBitmap; crop: PhotoCrop };
  photoBusy: boolean;
  photoError: boolean;
  choosePhoto(file: File): Promise<void>;
  cropPhoto(crop: PhotoCrop): void;
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
    if (saving.current || photoLoading.current || photoResource.current) return;
    const generation = ++photoGeneration.current;
    photoLoading.current = true;
    unsaved.current = true;
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
    if (!photo || saving.current) return;
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
  const operation = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      if (reason === "live") {
        cancelPhoto();
        setDraft(undefined);
        setView(undefined);
        setError(false);
        setCloseVeto(false);
        setLastSaved(false);
        return true;
      }
      await operation.current;
      if (!unsaved.current) return true;
      setCloseVeto(true);
      return false;
    });
  }, [client, cancelPhoto]);
  async function run(action: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    operation.current = action()
      .catch(() => {
        setError(true);
        setLastSaved(false);
      })
      .finally(() => {
        saving.current = false;
        setBusy(false);
      });
    await operation.current;
  }
  async function load() {
    cancelPhoto();
    await run(async () => {
      const reply = await client?.request({ method: "pilot.load" });
      if (reply?.method !== "pilot.load") throw new Error("pilot unavailable");
      setView(reply.value);
      setDraft(structuredClone(reply.value.fields));
      unsaved.current = false;
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
    await run(async () => {
      const reply = await client?.request({
        method: "pilot.save",
        fields,
        baseRevision: view.revision,
      });
      if (reply?.method !== "pilot.save") throw new Error("pilot not saved");
      setView(reply.value);
      setDraft(structuredClone(reply.value.fields));
      unsaved.current = false;
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
    await run(async () => {
      const latest = await client?.request({ method: "pilot.load" });
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
      if (saved?.method !== "pilot.save") throw new Error("pilot not saved");
      setView(saved.value);
      setDraft(structuredClone(saved.value.fields));
      unsaved.current = false;
      setLastSaved(true);
      setCloseVeto(false);
    });
  }
  return (
    <Context.Provider
      value={{
        photo,
        photoBusy,
        photoError,
        choosePhoto,
        cancelPhoto,
        applyPhoto,
        cropPhoto: (crop) => {
          if (!saving.current)
            setPhoto((current) => current && { ...current, crop });
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
          cancelPhoto();
          setDraft(view && structuredClone(view.fields));
          setError(false);
          setLastSaved(false);
          setCloseVeto(false);
        },
        edit: (fields) => {
          if (!saving.current) {
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
