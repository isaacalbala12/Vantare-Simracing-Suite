import type {
  HostToUi,
  LauncherView,
  ProfileDraft,
  Request,
} from "../contract/generated/contract";
import {
  launcherLimits,
  profileCopySuffix,
  profileLimits,
} from "../contract/generated/contract";
import { isProfileActionMethod } from "../contract/profile-actions";
export function profileActionReply(
  id: number,
  request: Request,
  view: LauncherView,
  drafts: Map<string, ProfileDraft>,
): HostToUi | undefined {
  if (!isProfileActionMethod(request.method)) return;
  if (view.running) return { kind: "failure", id, error: { kind: "busy" } };
  if (!("baseRevision" in request) || request.baseRevision !== view.revision)
    return {
      kind: "failure",
      id,
      error: { kind: "launcherConflict", current: structuredClone(view) },
    };
  if (request.method === "launcher.trigger") {
    if (request.id !== null && !drafts.has(request.id))
      return { kind: "failure", id, error: { kind: "denied" } };
    view.lmuTrigger = request.id;
  } else if (
    request.method === "launcher.profile.delete" ||
    request.method === "launcher.profile.duplicate" ||
    request.method === "launcher.profile.favorite" ||
    request.method === "launcher.profile.option"
  ) {
    const draft = drafts.get(request.id);
    const summary = view.profiles.find((profile) => profile.id === request.id);
    if (!draft || !summary)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (request.method === "launcher.profile.delete") {
      drafts.delete(request.id);
      view.profiles = view.profiles.filter(
        (profile) => profile.id !== request.id,
      );
      if (view.lmuTrigger === request.id) view.lmuTrigger = null;
    } else if (request.method === "launcher.profile.duplicate") {
      if (
        view.profiles.length >= launcherLimits.profiles ||
        new TextEncoder().encode(draft.name + profileCopySuffix).length >
          profileLimits.name
      )
        return { kind: "failure", id, error: { kind: "denied" } };
      const copied = structuredClone(draft);
      copied.id = `profile-${crypto.randomUUID()}`;
      copied.name += profileCopySuffix;
      copied.favorite = false;
      copied.hotkey = "";
      copied.startup = false;
      copied.steps = copied.steps.map((step) => ({ ...step, key: null }));
      drafts.set(copied.id, copied);
      view.profiles.push({
        ...structuredClone(summary),
        id: copied.id,
        name: copied.name,
        favorite: false,
        options: { ...summary.options, startup: false },
      });
    } else if (request.method === "launcher.profile.favorite") {
      draft.favorite = request.favorite;
      summary.favorite = request.favorite;
    } else {
      const patch = request.patch;
      switch (patch.option) {
        case "alreadyRunning":
          draft.policy.alreadyRunning = summary.options.alreadyRunning =
            patch.value;
          break;
        case "failure":
          draft.policy.failure = summary.options.failure = patch.value;
          break;
        case "firstStepDelay":
          draft.policy.firstStepDelay = summary.options.firstStepDelay =
            patch.value;
          break;
        case "retries":
          draft.policy.retries = summary.options.retries = patch.value;
          break;
        case "startup":
          if (patch.value) {
            for (const other of drafts.values()) other.startup = false;
            for (const other of view.profiles) other.options.startup = false;
          }
          draft.startup = summary.options.startup = patch.value;
          break;
        case "closeOnExit":
          draft.policy.exit = patch.value ? "closeStarted" : "leave";
          summary.options.closeOnExit = patch.value;
          break;
      }
    }
  } else return;
  view.revision = (BigInt(`0x${view.revision}`) + 1n)
    .toString(16)
    .padStart(64, "0");
  return {
    kind: "response",
    id,
    result: { method: request.method, value: structuredClone(view) },
  };
}
