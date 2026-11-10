import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from "react";
import type {
  ProfileDraft,
  ProfileEditorView,
} from "../../../contract/generated/contract";
export interface EditorSnapshot extends ProfileEditorView {
  original: ProfileDraft;
  pending: boolean;
  isNew: boolean;
  stepKeys: string[];
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
  tab: "profiles" | "applications";
  setTab: Dispatch<SetStateAction<"profiles" | "applications">>;
  createApplication: boolean;
  setCreateApplication: Dispatch<SetStateAction<boolean>>;
  value: EditorSnapshot | null;
  set: Dispatch<SetStateAction<EditorSnapshot | null>>;
  update: (patch: Partial<ProfileDraft>) => void;
} | null>(null);
export function ProfileEditorProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<EditorSnapshot | null>(null);
  const [tab, setTab] = useState<"profiles" | "applications">("profiles");
  const [createApplication, setCreateApplication] = useState(false);
  const update = (patch: Partial<ProfileDraft>) =>
    set((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : null,
    );
  return (
    <EditorContext.Provider
      value={{
        value,
        set,
        update,
        tab,
        setTab,
        createApplication,
        setCreateApplication,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}
export function useProfileEditorState() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("Profile editor requires its screen provider");
  return value;
}
