import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PilotFields, PilotView } from "../../contract/generated/contract";
import { isPilotFields } from "../../contract/pilot-validation";
import { t } from "../i18n/es";
import { useToastManager } from "../ui/Layers";
import { useHost } from "./Host";

interface State {
  view?: PilotView;
  draft?: PilotFields;
  busy: boolean;
  error: boolean;
  dirty: boolean;
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
  const toast = useToastManager();
  const [view, setView] = useState<PilotView>();
  const [draft, setDraft] = useState<PilotFields>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const dirty =
    !!view && !!draft && JSON.stringify(view.fields) !== JSON.stringify(draft);
  const unsaved = useRef(false);
  unsaved.current = dirty || busy;
  const operation = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      if (reason === "live") {
        setDraft(undefined);
        setView(undefined);
        setError(false);
        return true;
      }
      await operation.current;
      if (!unsaved.current) return true;
      toast.add({ title: t("pilot.unsaved"), type: "warn" });
      return false;
    });
  }, [client, toast]);
  async function run(action: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    operation.current = action()
      .catch(() => {
        setError(true);
        toast.add({ title: t("pilot.failed"), type: "err" });
      })
      .finally(() => {
        saving.current = false;
        setBusy(false);
      });
    await operation.current;
  }
  async function load() {
    await run(async () => {
      const reply = await client?.request({ method: "pilot.load" });
      if (reply?.method !== "pilot.load") throw new Error("pilot unavailable");
      setView(reply.value);
      setDraft(structuredClone(reply.value.fields));
      unsaved.current = false;
    });
  }
  async function save() {
    if (!view || !draft || !isPilotFields(draft)) return;
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
      toast.add({ title: t("pilot.saved") });
    });
  }
  async function retry() {
    if (!view || !draft || !isPilotFields(draft)) return;
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
      toast.add({ title: t("pilot.saved") });
    });
  }
  return (
    <Context.Provider
      value={{
        view,
        draft,
        busy,
        error,
        dirty,
        load,
        save,
        retry,
        discard: () => {
          setDraft(view && structuredClone(view.fields));
          setError(false);
        },
        edit: (fields) => {
          if (!saving.current)
            setDraft((current) =>
              typeof fields === "function"
                ? current && fields(current)
                : fields,
            );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
