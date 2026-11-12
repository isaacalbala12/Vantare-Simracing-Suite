import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CoreStatus,
  LauncherView,
} from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { commandsText as text } from "../i18n/commands.es";
import { t } from "../i18n/es";
import { useToastManager } from "../ui/Layers";
import { coreKey, useHost } from "./Host";
import { lock } from "./navigation";
import { useUi } from "./UiState";

export function launcherAccess(status: CoreStatus) {
  return (
    lock("launcher", status.access) ??
    (status.rights !== "connected" ? text.accessUnavailable : undefined)
  );
}

/** Favorite, rail and palette share one in-flight guard and current authority. */
export function useLauncherLaunch(core: CoreStatus, snapshot?: LauncherView) {
  const { client } = useHost(),
    cache = useQueryClient(),
    toast = useToastManager();
  const navigate = useUi((ui) => ui.navigate);
  const pending = useRef(false),
    alive = useRef(true);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const warn = (title: string) => {
    if (!alive.current) return;
    navigate("launcher");
    toast.add({ title, type: "warn" });
  };
  async function launch(profile?: string, baseRevision?: string) {
    const current = cache.getQueryData<LauncherView>(["launcher"]) ?? snapshot;
    const status = cache.getQueryData<CoreStatus>(coreKey) ?? core;
    const selected = current?.profiles.find((item) => item.id === profile);
    const changed =
      profile !== undefined &&
      (!current || current.revision !== baseRevision || !selected?.launchable);
    const reason = changed
      ? text.changed
      : document.querySelector("dialog[open]")
        ? text.accessUnavailable
        : (launcherAccess(status) ??
          (status.live
            ? text.live
            : pending.current
              ? text.pending
              : current?.running
                ? text.running
                : profile !== undefined
                  ? cache.getQueryState(["launcher"])?.fetchStatus ===
                    "fetching"
                    ? text.loading
                    : cache.getQueryState(["launcher"])?.status === "error"
                      ? text.readFailed
                      : current?.scanning
                        ? text.scanning
                        : !current?.resident
                          ? text.noResident
                          : !selected?.apps.length
                            ? text.noSteps
                            : undefined
                  : undefined));
    if (reason || !client) {
      warn(reason ?? text.failed);
      return;
    }
    pending.current = true;
    setWaiting(true);
    try {
      const reply = await client.request(
        profile !== undefined && baseRevision !== undefined
          ? { method: "launcher.launch", profile, baseRevision }
          : { method: "launcher.favorite" },
      );
      if (!alive.current) return;
      if (
        reply.method !== "launcher.launch" &&
        reply.method !== "launcher.favorite"
      ) {
        warn(text.failed);
        return;
      }
      if (profile) cache.setQueryData(["launcher", "selection"], profile);
      navigate("launcher");
      if (profile) {
        if (reply.accepted) toast.add({ title: text.sent });
        else warn(text.failed);
      } else
        toast.add({
          title: reply.accepted
            ? t("shell.favoriteSent")
            : t("shell.profileNeeded"),
        });
    } catch (failure) {
      if (!alive.current) return;
      if (
        failure instanceof HostFailure &&
        failure.detail.kind === "launcherConflict"
      ) {
        cache.setQueryData(["launcher"], failure.detail.current);
        warn(text.changed);
      } else warn(text.failed);
    } finally {
      pending.current = false;
      if (alive.current) setWaiting(false);
    }
  }
  return {
    pending: waiting,
    launchFavorite: () => launch(),
    launchProfile: (profile: string, baseRevision: string) =>
      launch(profile, baseRevision),
  };
}
