import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  HostError,
  LauncherProfile,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { calendarText as text } from "../../i18n/calendar";
import { useToastManager } from "../../ui/Layers";
import { launcherKey, useLauncherSnapshot } from "../launcher/state";

// UTF-8 lexical order in Rust agrees with Unicode scalar order, not UTF-16.
function compareNames(a: string, b: string) {
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i) ?? 0,
      y = b.codePointAt(j) ?? 0;
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return a.length - i - (b.length - j);
}
export function defaultCalendarProfile(profiles: readonly LauncherProfile[]) {
  return profiles.reduce<LauncherProfile | undefined>(
    (selected, profile) =>
      !selected ||
      (profile.favorite && !selected.favorite) ||
      (profile.favorite === selected.favorite &&
        compareNames(profile.name, selected.name) < 0)
        ? profile
        : selected,
    undefined,
  );
}

// Immediate launch only. Deferred launch remains unavailable (issue 2089).
export function useCalendarLauncher(allowed: boolean) {
  const { client } = useHost(),
    cache = useQueryClient(),
    toast = useToastManager();
  const { view } = useLauncherSnapshot();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<HostError["kind"]>();
  const generation = useRef(0),
    pending = useRef(false),
    access = useRef(allowed);
  access.current = allowed;
  useEffect(() => {
    const epoch = ++generation.current;
    pending.current = false;
    setBusy(false);
    setReady(false);
    setFailure(undefined);
    if (!client || !allowed) return;
    const off = client.listen((message) => {
      if (epoch !== generation.current || !access.current) return;
      if (message.kind === "event" && message.event.topic === "launcher") {
        cache.setQueryData(launcherKey, message.event.value);
        setReady(true);
      }
    });
    const unsubscribe = client.subscribe("launcher");
    void client
      .request({ method: "launcher.get" })
      .then((reply) => {
        if (epoch !== generation.current || !access.current) return;
        if (reply.method === "launcher.get") {
          cache.setQueryData(launcherKey, reply.value);
          setReady(true);
        } else setFailure("rejected");
      })
      .catch((error) => {
        if (epoch === generation.current && access.current)
          setFailure(
            error instanceof HostFailure
              ? error.detail.kind
              : "coreUnavailable",
          );
      });
    return () => {
      generation.current++;
      off();
      unsubscribe();
    };
  }, [allowed, client, cache]);
  // Same selection as frozen launcher/view.rs::default_profile: favorites, then name.
  const profile = defaultCalendarProfile(view?.profiles ?? []);
  const canLaunch = !!(
    allowed &&
    ready &&
    client &&
    profile?.launchable &&
    view?.resident &&
    !view.protected &&
    !view.running &&
    !busy &&
    core.rights === "connected" &&
    core.access.verified &&
    !core.access.blocked &&
    !core.live
  );
  async function launch() {
    if (!canLaunch || !client || !view || !profile || pending.current) return;
    const epoch = generation.current;
    pending.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      const reply = await client.request({
        method: "launcher.launch",
        profile: profile.id,
        baseRevision: view.revision,
      });
      if (epoch !== generation.current || !access.current) return;
      if (reply.method !== "launcher.launch")
        throw new HostFailure({ kind: "rejected" });
      if (reply.accepted) toast.add({ title: text.launchSent });
      else setFailure("rejected");
    } catch (error) {
      if (epoch !== generation.current || !access.current) return;
      if (error instanceof HostFailure) {
        if (error.detail.kind === "launcherConflict")
          cache.setQueryData(launcherKey, error.detail.current);
        setFailure(error.detail.kind);
      } else setFailure("coreUnavailable");
    } finally {
      if (epoch === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return {
    profile: ready ? profile : undefined,
    canLaunch,
    busy,
    failure,
    launch,
  };
}
