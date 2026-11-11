import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ProfileDraft,
  ProfileEditorView,
} from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import type { Client } from "../../bridge/client";
import { profileText as text } from "../../i18n/profile-editor";
import { useToastManager } from "../../ui/Layers";
import { DiscardProfileDialog } from "../../ui/launcher/ProfileEditor";
export interface EditorSnapshot extends ProfileEditorView {
  original: ProfileDraft;
  pending: boolean;
  isNew: boolean;
  stepKeys: string[];
  restored?: boolean;
  argumentLossFromRevision?: boolean;
}
export function snapshot(
  value: ProfileEditorView,
  isNew = false,
): EditorSnapshot {
  return {
    ...value,
    pending: false,
    isNew,
    original: structuredClone(value.draft),
    stepKeys: value.draft.steps.map(() => crypto.randomUUID()),
  };
}
const EditorContext = createContext<{
  value: EditorSnapshot | null;
  set: Dispatch<SetStateAction<EditorSnapshot | null>>;
  update: (patch: Partial<ProfileDraft>) => void;
  close: () => void;
} | null>(null);
const draftKey = ["launcher", "profileDraft"] as const;
const guardKey = ["launcher", "profileDraftGuard"] as const;
export function isDirty(value: EditorSnapshot | null | undefined): boolean {
  return (
    !!value && JSON.stringify(value.draft) !== JSON.stringify(value.original)
  );
}
export function ProfileEditorProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  const { client } = useHost();
  const toast = useToastManager();
  const [value, set] = useState<EditorSnapshot | null>(() => {
    const saved = query.getQueryData<EditorSnapshot | null>(draftKey);
    return saved ? { ...saved, pending: false, restored: true } : null;
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const wasEditing = useRef(value !== null);
  useLayoutEffect(() => {
    if (wasEditing.current && !value)
      document.querySelector<HTMLElement>("[data-launcher-edit]")?.focus();
    wasEditing.current = value !== null;
  }, [value]);
  useEffect(() => {
    query.setQueryDefaults(draftKey, { gcTime: Infinity });
    query.setQueryData(draftKey, value);
  }, [query, value]);
  useEffect(() => {
    if (!client) return;
    const prior = query.getQueryData<{ client: Client; dispose: () => void }>(
      guardKey,
    );
    if (prior?.client === client) return;
    prior?.dispose();
    // Owned by this Client's lifetime, including while another section is visible.
    // Client.close clears guards; the cache retains at most one binding per session.
    const dispose = client.addCloseGuard((reason) => {
      if (reason === "live") return true;
      const saved = query.getQueryData<EditorSnapshot | null>(draftKey);
      if (!saved?.pending && !isDirty(saved)) return true;
      toast.add({ title: text.unsaved, type: "warn" });
      return false;
    });
    query.setQueryDefaults(guardKey, { gcTime: Infinity });
    query.setQueryData(guardKey, { client, dispose });
  }, [client, query, toast]);
  const close = () => {
    if (value?.pending) return;
    if (isDirty(value)) setConfirmClose(true);
    else set(null);
  };
  const update = (patch: Partial<ProfileDraft>) =>
    set((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : null,
    );
  return (
    <EditorContext.Provider value={{ value, set, update, close }}>
      {children}
      <DiscardProfileDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          set(null);
        }}
      />
    </EditorContext.Provider>
  );
}
export function useProfileEditorState() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("Profile editor requires its screen provider");
  return value;
}
