import launcherFixture from "../../../fixtures/launcher-base.json";
import editorFixture from "../../../fixtures/launcher-editor.json";
import type {
  HostToUi,
  ProfileDraft,
  UiToHost,
} from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  if (sceneName.startsWith("launcher-")) {
    core.rights = "connected";
    core.access.verified = true;
  }
  const launcher = structuredClone(
    launcherFixture,
  ) as import("../../contract/generated/contract").LauncherView;
  if (
    sceneName === "launcher-ready" ||
    sceneName === "launcher-editor-ready" ||
    sceneName === "launcher-editor-custom" ||
    sceneName === "launcher-conflicto"
  ) {
    launcher.apps.forEach((app) => {
      app.available = true;
    });
    launcher.profiles.forEach((profile) => {
      profile.launchable = true;
    });
  }
  if (sceneName === "launcher-protected") {
    launcher.protected = true;
    launcher.profiles = [];
    launcher.apps = [];
  }
  if (sceneName === "launcher-offline") {
    launcher.resident = false;
  }

  const drafts = new Map<string, ProfileDraft>(
    launcher.profiles.map((profile) => [
      profile.id,
      {
        ...structuredClone(editorFixture.draft),
        id: profile.id,
        name: profile.name,
        description: profile.description,
        favorite: profile.favorite,
        steps: profile.apps.map((appId, index) => ({
          key: null,
          appId,
          delaySeconds: index ? 2 : 0,
          hasCustomArguments:
            sceneName === "launcher-editor-custom" && index === 0,
        })),
      } as ProfileDraft,
    ]),
  );
  let profileSerial = 0;
  let keySerial = 0;
  const stepKeys = new Map<
    string,
    { profile: string; revision: string; appId: string; customized: boolean }
  >();
  let reservedProfile: string | undefined;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind === "subscribe" && value.topic === "launcher")
      return {
        kind: "event",
        event: { topic: "launcher", value: structuredClone(launcher) },
      };
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "launcher.profile.get": {
        const draft =
          request.id === null
            ? (structuredClone(editorFixture.draft) as ProfileDraft)
            : structuredClone(drafts.get(request.id));
        if (!draft) return { kind: "failure", id, error: { kind: "denied" } };
        if (request.id === null) {
          draft.id = `profile-qa-${++profileSerial}`;
          reservedProfile = draft.id;
        }
        stepKeys.clear();
        for (const step of draft.steps) {
          step.key = (++keySerial).toString(16).padStart(64, "0");
          stepKeys.set(step.key, {
            profile: draft.id ?? "",
            revision: launcher.revision,
            appId: step.appId,
            customized: step.hasCustomArguments,
          });
        }
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              revision: launcher.revision,
              draft: structuredClone(draft),
            },
          },
        };
      }
      case "launcher.profile.save": {
        if (
          sceneName === "launcher-conflicto" &&
          launcher.revision === "0".repeat(64)
        )
          launcher.revision = "1".repeat(64);
        if (request.baseRevision !== launcher.revision)
          return {
            kind: "failure",
            id,
            error: {
              kind: "launcherConflict",
              current: structuredClone(launcher),
            },
          };
        if (
          request.draft.steps.length === 0 ||
          request.draft.steps.some(
            (step) =>
              !launcher.apps.some(
                (app) => app.id === step.appId && app.available,
              ),
          )
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        if (request.draft.id === null)
          return { kind: "failure", id, error: { kind: "denied" } };
        const profileId = request.draft.id;
        if (
          request.draft.id !== null &&
          !drafts.has(profileId) &&
          reservedProfile !== profileId
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        const seen = new Set<string>();
        const saved = structuredClone(request.draft);
        for (const step of saved.steps) {
          const source = step.key === null ? undefined : stepKeys.get(step.key);
          if (
            step.key !== null &&
            (!source ||
              source.revision !== request.baseRevision ||
              source.profile !== profileId ||
              seen.has(step.key))
          )
            return { kind: "failure", id, error: { kind: "denied" } };
          if (step.key !== null) seen.add(step.key);
          step.hasCustomArguments =
            source?.appId === step.appId && source.customized;
        }
        drafts.set(profileId, {
          ...saved,
          id: profileId,
        });
        const entry = {
          id: profileId,
          name: request.draft.name,
          description: request.draft.description,
          favorite: request.draft.favorite,
          apps: request.draft.steps.map((step) => step.appId),
          launchable: true,
          options: {
            alreadyRunning: request.draft.policy.alreadyRunning,
            firstStepDelay: request.draft.policy.firstStepDelay,
            retries: request.draft.policy.retries,
            failure: request.draft.policy.failure,
            startup: request.draft.startup,
          },
        };
        const existing = launcher.profiles.findIndex(
          (profile) => profile.id === profileId,
        );
        if (existing < 0) launcher.profiles.push(entry);
        else launcher.profiles[existing] = entry;
        launcher.revision = (BigInt(`0x${launcher.revision}`) + 1n)
          .toString(16)
          .padStart(64, "0");
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(launcher) },
        };
      }

      case "launcher.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(launcher) },
        };
      case "launcher.launch": {
        if (request.baseRevision !== launcher.revision)
          return {
            kind: "failure",
            id,
            error: {
              kind: "launcherConflict",
              current: structuredClone(launcher),
            },
          };
        if (!launcher.resident)
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        if (launcher.running)
          return { kind: "failure", id, error: { kind: "busy" } };
        if (
          !launcher.profiles.some((profile) => profile.id === request.profile)
        )
          return { kind: "failure", id, error: { kind: "denied" } };
        launcher.running = true;
        launcher.profiles.forEach((profile) => {
          profile.launchable = false;
        });
        return {
          kind: "response",
          id,
          result: { method: request.method, accepted: true },
        };
      }

      case "launcher.favorite":
        return {
          kind: "response",
          id,
          result: { method: "launcher.favorite", accepted: false },
        };

      default:
        return undefined;
    }
  };
}
