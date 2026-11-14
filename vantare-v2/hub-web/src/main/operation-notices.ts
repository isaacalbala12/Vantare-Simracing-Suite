import type {
  CoreStatus,
  HostToUi,
  LauncherView,
  ResidentView,
  SettingsView,
  UpdatesView,
} from "../contract/generated/contract";
import { notices as text } from "../renderer/i18n/notifications";
import {
  completionProfileName,
  launcherCompletionFeed,
  notificationGeneration,
} from "../shared/launcher-completion";
import type { SystemNotice } from "./system-notifications";

/** Trusted host observations only; no renderer route accepts notification content. */
export function operationNotices(present: (value: SystemNotice) => boolean) {
  let closed = false;
  let settings: SettingsView | undefined;
  let updateKey: string | undefined;
  let core: CoreStatus | undefined;
  let launcher: LauncherView | undefined;
  let lastResident: ResidentView | undefined;
  const completions = launcherCompletionFeed(() =>
    notificationGeneration(core),
  );
  function observeCore(value: CoreStatus) {
    core = value;
    if (lastResident) completions.observe(lastResident);
  }
  function updates(value: UpdatesView) {
    if (value.beta?.state !== "ready") return;
    const key = value.beta.version;
    if (key === updateKey) return;
    updateKey = key;
    if (
      settings &&
      !settings.protected &&
      settings.general.updates &&
      settings.general.toasts
    )
      present({
        title: text.updateReady,
        body: text.updateReadyBody(key),
        silent: false,
      });
  }
  return {
    observe(message: HostToUi) {
      if (closed) return;
      if (message.kind === "failure") {
        if (message.error.kind === "conflict") settings = message.error.current;
        if (message.id === 0) {
          settings = undefined;
          core = undefined;
          lastResident = undefined;
          completions.reset();
        }
        return;
      }
      if (message.kind === "response") {
        const reply = message.result;
        switch (reply.method) {
          case "launcher.get":
            launcher = reply.value;
            return;
          case "core.get":
            observeCore(reply.value);
            return;
          case "settings.get":
          case "settings.update":
          case "settings.retry":
          case "settings.discard":
            settings = reply.value;
            return;
          case "updates.get":
            updates(reply.value);
            return;
        }
      }
      if (message.kind === "event" && message.event.topic === "launcher")
        launcher = message.event.value;
      if (message.kind === "event" && message.event.topic === "core")
        observeCore(message.event.value);
      if (message.kind === "event" && message.event.topic === "updates")
        updates(message.event.value);
      const resident =
        message.kind === "event" && message.event.topic === "launcherResident"
          ? message.event.value
          : message.kind === "response" &&
              message.result.method === "launcher.resident.get"
            ? message.result.value
            : undefined;
      if (!resident) return;
      // Advance even while muted: enabling a preference never replays old runs.
      lastResident = resident;
      const finished = completions.observe(resident);
      if (
        settings &&
        !settings.protected &&
        settings.general.launcher &&
        settings.general.toasts
      )
        for (const item of finished)
          present({
            title: text.launchReady,
            body: text.launchReadyBody(completionProfileName(item, launcher)),
            silent: false,
          });
    },
    close() {
      closed = true;
      settings = undefined;
      core = undefined;
      launcher = undefined;
      lastResident = undefined;
      completions.reset();
    },
  };
}
