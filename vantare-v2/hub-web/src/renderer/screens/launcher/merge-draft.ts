import type {
  ProfileDraft,
  ProfilePolicy,
} from "../../../contract/generated/contract";
import { type EditorSnapshot, snapshot } from "./editor-state";

/** Replay only user edits over the new read; fresh private step identities stay private. */
export function mergeDraft(
  current: EditorSnapshot,
  read: Parameters<typeof snapshot>[0],
): EditorSnapshot {
  const fresh = snapshot(read, current.isNew);
  const draft = structuredClone(fresh.draft);
  const apply = <K extends keyof ProfileDraft>(key: K) => {
    if (
      JSON.stringify(current.draft[key]) !==
      JSON.stringify(current.original[key])
    )
      draft[key] = structuredClone(current.draft[key]);
  };
  for (const key of [
    "name",
    "favorite",
    "description",
    "notes",
    "advanced",
    "hotkey",
    "startup",
  ] as const)
    apply(key);
  const policy = <K extends keyof ProfilePolicy>(key: K) => {
    if (current.draft.policy[key] !== current.original.policy[key])
      draft.policy[key] = current.draft.policy[key];
  };
  for (const key of Object.keys(draft.policy) as (keyof ProfilePolicy)[])
    policy(key);
  const changedSteps =
    JSON.stringify(current.draft.steps) !==
    JSON.stringify(current.original.steps);
  if (changedSteps)
    draft.steps = current.draft.steps.map((step) => {
      const index = current.original.steps.findIndex(
        (original) => original.key !== null && original.key === step.key,
      );
      // A different revision has no persistent step identity in the native document.
      const candidate =
        fresh.revision === current.revision
          ? fresh.draft.steps[index]
          : undefined;
      return {
        ...step,
        key: candidate?.appId === step.appId ? candidate.key : null,
        hasCustomArguments:
          candidate?.appId === step.appId && candidate.hasCustomArguments,
      };
    });
  return {
    ...fresh,
    draft,
    stepKeys: changedSteps ? current.stepKeys : fresh.stepKeys,
    argumentLossFromRevision:
      changedSteps && fresh.revision !== current.revision,
  };
}
