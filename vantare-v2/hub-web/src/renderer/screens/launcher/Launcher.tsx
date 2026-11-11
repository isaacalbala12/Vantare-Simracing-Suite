import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LauncherProfile } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { launcherText as text } from "../../i18n/launcher";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import {
  ProfileActionFeedback,
  type ProfileCardAction,
  RemoveProfileDialog,
} from "../../ui/launcher/ProfileActions";
import { LauncherProfiles } from "../../ui/launcher/Profiles";
import { snapshot, useProfileEditorState } from "./editor-state";
import { ProfileEditor } from "./ProfileEditor";
import { useProfileAction } from "./profile-actions";
import { profileFailure } from "./profile-errors";
import {
  launcherKey,
  launcherSelectionKey,
  useLauncherSnapshot,
} from "./state";

function failureText(failure: unknown): string {
  if (failure instanceof HostFailure) {
    switch (failure.detail.kind) {
      case "busy":
        return text.busy;
      case "coreUnavailable":
        return text.coreUnavailable;
      case "denied":
        return text.denied;
    }
  }
  return text.failed;
}
export function Launcher() {
  const { client } = useHost();
  const action = useProfileAction();
  const [removing, setRemoving] = useState<LauncherProfile>();
  const editor = useProfileEditorState();
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
  // The acknowledgment is transient, not a synthesized resident state. A chain
  // may finish between two 500 ms status samples without producing a transition.
  useEffect(() => {
    if (!accepted) return;
    const timer = window.setTimeout(() => setAccepted(false), 1500);
    return () => window.clearTimeout(timer);
  }, [accepted]);
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
    } catch (failure) {
      if (alive.current) setError(failureText(failure));
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
  async function openEditor(id: string | null) {
    if (!client || busy.current || view?.protected) return;
    busy.current = true;
    setPending(true);
    try {
      const reply = await client.request({
        method: "launcher.profile.get",
        id,
      });
      if (alive.current && reply.method === "launcher.profile.get")
        editor.set(snapshot(reply.value, id === null));
    } catch (failure) {
      if (alive.current) setError(profileFailure(failure, true));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
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
      } else setError(failureText(failure));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  function profileAction(profile: LauncherProfile, kind: ProfileCardAction) {
    if (!view || pending || action.pending) return;
    if (kind === "remove") {
      setRemoving(profile);
      return;
    }
    const baseRevision = view.revision;
    switch (kind) {
      case "favorite":
        void action.execute({
          method: "launcher.profile.favorite",
          id: profile.id,
          favorite: !profile.favorite,
          baseRevision,
        });
        break;
      case "duplicate":
        void action.execute({
          method: "launcher.profile.duplicate",
          id: profile.id,
          baseRevision,
        });
        break;
      case "trigger":
        void action.execute({
          method: "launcher.trigger",
          id: view.lmuTrigger === profile.id ? null : profile.id,
          baseRevision,
        });
        break;
    }
  }
  if (editor.value) return <ProfileEditor />;
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
    <>
      {action.failure && (
        <ProfileActionFeedback
          conflict={action.failure.revision !== undefined}
          pending={action.pending}
          onRetry={action.retry}
          onDiscard={action.discard}
        />
      )}
      <LauncherProfiles
        view={view}
        selected={selected}
        pending={pending || action.pending}
        error={error}
        accepted={accepted}
        onAction={profileAction}
        onSelect={setSelected}
        onEdit={(id) => void openEditor(id)}
        onNew={() => void openEditor(null)}
        onApplications={() => editor.setTab("applications")}
        onLaunch={(profile) => void launch(profile)}
        onReload={() => void reload()}
      />
      <RemoveProfileDialog
        id={removing?.id}
        pending={action.pending}
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => {
          if (!removing) return;
          void action.execute({
            method: "launcher.profile.delete",
            id: removing.id,
            baseRevision: view.revision,
          });
          setRemoving(undefined);
        }}
      />
    </>
  );
}
