import { LauncherApplicationsRail } from "../../ui/launcher/ApplicationsRail";
import { ProfileActionFeedback } from "../../ui/launcher/ProfileActions";
import { ProfileEditorRailFields } from "../../ui/launcher/ProfileEditor";
import { useProfileEditorState } from "./editor-state";
import { useProfileAction } from "./profile-actions";
import { useLauncherSnapshot } from "./state";
export function LauncherRail() {
  const { view, selected } = useLauncherSnapshot();
  const editor = useProfileEditorState();
  const action = useProfileAction();
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
  return (
    <>
      {action.failure && (
        <ProfileActionFeedback
          conflict={action.failure.revision !== undefined}
          pending={action.pending}
          onRetry={action.retry}
          onDiscard={action.discard}
        />
      )}
      <LauncherApplicationsRail
        view={view}
        selected={selected}
        pending={action.pending}
        onOption={(id, patch) =>
          void action.execute({
            method: "launcher.profile.option",
            id,
            patch,
            baseRevision: view.revision,
          })
        }
        onApplications={(create = false) => {
          editor.setTab("applications");
          editor.setCreateApplication(create);
        }}
      />
    </>
  );
}
