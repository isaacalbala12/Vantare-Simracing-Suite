import { LauncherApplicationsRail } from "../../ui/launcher/ApplicationsRail";
import { ProfileEditorRailFields } from "../../ui/launcher/ProfileEditor";
import { useProfileEditorState } from "./editor-state";
import { useLauncherSnapshot } from "./state";
export function LauncherRail() {
  const { view, selected } = useLauncherSnapshot();
  const editor = useProfileEditorState();
  const draft = editor.value;
  if (draft)
    return (
      <ProfileEditorRailFields
        draft={draft.draft}
        apps={view?.apps ?? []}
        pending={draft.pending}
        resident={view?.resident ?? false}
        onChange={editor.update}
        onPolicy={(patch) =>
          editor.update({ policy: { ...draft.draft.policy, ...patch } })
        }
      />
    );
  if (!view) return null;
  return <LauncherApplicationsRail view={view} selected={selected} />;
}
