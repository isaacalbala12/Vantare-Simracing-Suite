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
import { useLauncherRequest } from "./LauncherRequest";
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
  const launchRequest = useLauncherRequest();
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
    const favoriteRequest = profile === undefined;
    const current = cache.getQueryData<LauncherView>(["launcher"]) ?? snapshot;
    const status = cache.getQueryData<CoreStatus>(coreKey) ?? core;
    const selected = current?.profiles.find((item) => item.id === profile);
    const changed =
      profile !== undefined &&
      (!current || current.revision !== baseRevision || !selected);
    const reason = changed
      ? text.changed
      : document.querySelector("dialog[open]")
        ? text.accessUnavailable
        : (launcherAccess(status) ??
          (status.live
            ? text.live
            : pending.current || launchRequest.busy()
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
                            : !selected.launchable
                              ? text.unavailable
                              : undefined
                  : undefined));
    if (reason || !client) {
      warn(reason ?? text.failed);
      return;
    }
    if (favoriteRequest) {
      if (!current) {
        warn(text.loading);
        return;
      }
      const favorite = current.profiles
        .filter((item) => item.favorite)
        .sort((a, b) => {
          // Match Rust String::cmp, including names outside the BMP (UTF-16 differs).
          const left = [...a.name],
            right = [...b.name];
          for (let i = 0; i < Math.min(left.length, right.length); i++) {
            const order =
              (left[i]?.codePointAt(0) ?? 0) - (right[i]?.codePointAt(0) ?? 0);
            if (order) return order;
          }
          return left.length - right.length;
        })[0];
      if (!favorite) {
        navigate("launcher");
        toast.add({ title: t("shell.profileNeeded") });
        return;
      }
      profile = favorite.id;
      baseRevision = current.revision;
    }
    if (!profile || !baseRevision) {
      warn(text.failed);
      return;
    }
    pending.current = true;
    setWaiting(true);
    try {
      const reply = await launchRequest.request({
        method: "launcher.launchChecked",
        profile,
        baseRevision,
      });
      if (!alive.current) return;
      if (reply.method !== "launcher.launchChecked") {
        warn(text.failed);
        return;
      }
      if (!favoriteRequest && reply.value.kind === "queued")
        cache.setQueryData(["launcher", "selection"], profile);
      navigate("launcher");
      if (!favoriteRequest) {
        if (reply.value.kind === "queued") toast.add({ title: text.sent });
        else warn(text.failed);
      } else
        toast.add({
          title:
            reply.value.kind === "queued"
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
      } else warn(favoriteRequest ? t("shell.favoriteFailed") : text.failed);
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
