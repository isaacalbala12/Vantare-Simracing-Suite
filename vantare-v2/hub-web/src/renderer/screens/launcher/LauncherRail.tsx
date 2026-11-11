import type { ResidentView } from "../../../contract/generated/contract";
import { residentText } from "../../i18n/launcher-resident";
import { LauncherApplicationsRail } from "../../ui/launcher/ApplicationsRail";
import { ProfileActionFeedback } from "../../ui/launcher/ProfileActions";
import { ProfileEditorRailFields } from "../../ui/launcher/ProfileEditor";
import { useProfileEditorState } from "./editor-state";
import { useProfileAction } from "./profile-actions";
import { useLauncherSnapshot } from "./state";
export function LauncherRail({
  residentStatus,
}: {
  residentStatus?: ResidentView;
}) {
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
        resident={residentStatus?.online ?? view?.resident ?? false}
        registration={
          draft.draft.hotkey
            ? residentText.registration[
                residentStatus?.registrations.find(
                  (item) =>
                    item.id === draft.draft.id &&
                    item.hotkey === draft.draft.hotkey,
                )?.state ?? "unconfirmed"
              ]
            : undefined
        }
        onChange={editor.update}
        onPolicy={(patch) =>
          editor.update({ policy: { ...draft.draft.policy, ...patch } })
        }
      />
    );
  if (!view) return null;
  return (
    <>
      {action.failure && editor.tab === "applications" && (
        <ProfileActionFeedback
          conflict={action.failure.revision !== undefined}
          pending={action.pending}
          canRetry={action.canRetry}
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
