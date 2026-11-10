import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LauncherProfile } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { launcherText as text } from "../../i18n/launcher";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { LauncherProfiles } from "../../ui/launcher/Profiles";
import {
  launcherKey,
  launcherSelectionKey,
  useLauncherSnapshot,
} from "./state";
export function Launcher() {
  const { client } = useHost();
  const query = useQueryClient();
  const { view, selected } = useLauncherSnapshot();
  const setView = useCallback(
    (view: import("../../../contract/generated/contract").LauncherView) => {
      query.setQueryData(launcherKey, view);
    },
    [query],
  );
  const setSelected = (id: string) => {
    query.setQueryData(launcherSelectionKey, id);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    if (!client || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const reply = await client.request({ method: "launcher.get" });
      if (alive.current && reply.method === "launcher.get") {
        setView(reply.value);
        setAccepted(false);
        setError(undefined);
      }
    } catch {
      if (alive.current) setError(text.failed);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }, [client, setView]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!client) return;
    const off = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher") {
        setView(message.event.value);
        setAccepted(false);
      }
    });
    const unsubscribe = client.subscribe("launcher");
    return () => {
      unsubscribe();
      off();
    };
  }, [client, setView]);
  async function launch(profile: LauncherProfile) {
    if (!client || !view || busy.current || !profile.launchable) return;
    busy.current = true;
    setPending(true);
    setAccepted(false);
    setError(undefined);
    try {
      const reply = await client.request({
        method: "launcher.launch",
        profile: profile.id,
        baseRevision: view.revision,
      });
      if (alive.current && reply.method === "launcher.launch") {
        setAccepted(reply.accepted);
      }
    } catch (failure) {
      if (!alive.current) return;
      if (
        failure instanceof HostFailure &&
        failure.detail.kind === "launcherConflict"
      ) {
        setView(failure.detail.current);
        setError(text.changed);
      } else setError(text.failed);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  if (!view)
    return error ? (
      <Callout
        tone="err"
        title={error}
        actions={
          <Button onClick={() => void reload()} busy={pending}>
            {text.reload}
          </Button>
        }
      />
    ) : (
      <Skeleton label={text.loading} />
    );
  return (
    <LauncherProfiles
      view={view}
      selected={selected}
      pending={pending}
      error={error}
      accepted={accepted}
      onSelect={setSelected}
      onLaunch={(profile) => void launch(profile)}
      onReload={() => void reload()}
    />
  );
}
