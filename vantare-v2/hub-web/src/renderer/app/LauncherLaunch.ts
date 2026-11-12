import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type {
  CoreStatus,
  LauncherView,
} from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import { t } from "../i18n/es";
import { launcherText as text } from "../i18n/launcher";
import { useToastManager } from "../ui/Layers";
import { coreKey, useHost } from "./Host";
import { lock } from "./navigation";
import { useUi } from "./UiState";

/** The frame's favorite and per-profile buttons share one in-flight guard. */
export function useLauncherLaunch(core: CoreStatus, snapshot?: LauncherView) {
  const { client } = useHost(),
    cache = useQueryClient(),
    toast = useToastManager();
  const navigate = useUi((ui) => ui.navigate);
  const pending = useRef(false),
    alive = useRef(true);
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
        ? text.denied
        : (lock("launcher", status.access) ??
          (status.rights !== "connected" || status.live
            ? text.denied
            : pending.current || current?.running
              ? text.busy
              : current?.scanning
                ? text.scanning
                : profile !== undefined &&
                    (!current?.resident || !selected?.apps.length)
                  ? text.launchUnavailable
                  : undefined));
    if (reason || !client) {
      warn(reason ?? text.coreUnavailable);
      return;
    }
    pending.current = true;
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
      toast.add({
        title: reply.accepted
          ? t("shell.favoriteSent")
          : t("shell.profileNeeded"),
      });
    } catch (failure) {
      if (
        failure instanceof HostFailure &&
        failure.detail.kind === "launcherConflict"
      ) {
        cache.setQueryData(["launcher"], failure.detail.current);
        warn(text.changed);
      } else warn(text.failed);
    } finally {
      pending.current = false;
    }
  }
  return {
    launchFavorite: () => launch(),
    launchProfile: (profile: string, baseRevision: string) =>
      launch(profile, baseRevision),
  };
}
