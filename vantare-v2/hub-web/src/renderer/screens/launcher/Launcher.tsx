import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LauncherProfile,
  ResidentRemoveTarget,
} from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { useLauncherRequest } from "../../app/LauncherRequest";
import { HostFailure } from "../../bridge/client";
import { launcherText as text } from "../../i18n/launcher";
import { removalText } from "../../i18n/launcher-removal";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { CheckedRemovalDialog } from "../../ui/launcher/CheckedRemovalDialog";
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
import type { ResidentControlController } from "./resident-control";
import type { ResidentRemovalController } from "./resident-removal";
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
export function Launcher({
  control,
  removal,
}: {
  control?: ResidentControlController;
  removal: ResidentRemovalController;
}) {
  const { client } = useHost();
  const action = useProfileAction();
  const launchRequest = useLauncherRequest();
  const heading = useRef<HTMLHeadingElement>(null);
  const [removedProfile, setRemovedProfile] = useState<string>();
  const [removing, setRemoving] = useState<{
    profile: LauncherProfile;
    target?: ResidentRemoveTarget;
  }>();
  const [duplicating, setDuplicating] = useState<LauncherProfile>();
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
    // The frame's live feed may already have a fresh snapshot. Do not disable
    // the newly visible controls for a redundant initial read in that case.
    if (!query.getQueryData(launcherKey)) void reload();
  }, [reload, query]);
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
    if (
      !client ||
      !view ||
      busy.current ||
      launchRequest.busy() ||
      !profile.launchable
    )
      return;
    busy.current = true;
    setPending(true);
    setAccepted(false);
    setError(undefined);
    try {
      const reply = await launchRequest.request({
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
      removal.dismiss();
      setRemoving({ profile, target: removal.target(profile.id) });
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
        setDuplicating(profile);
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
  useEffect(() => {
    if (removing && removal.attempt?.phase.kind === "removed") {
      setRemovedProfile(removing.profile.id);
      setRemoving(undefined);
      void reload();
    }
  }, [removing, removal.attempt, reload]);
  useEffect(() => {
    if (
      removedProfile &&
      view &&
      !view.profiles.some((profile) => profile.id === removedProfile)
    ) {
      heading.current?.focus();
      setRemovedProfile(undefined);
    }
  }, [removedProfile, view]);
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
          canRetry={action.canRetry}
          onRetry={action.retry}
          onDiscard={action.discard}
        />
      )}
      <p
        role="status"
        className={
          removal.attempt?.phase.kind === "removed" ? undefined : "v-sr-only"
        }
      >
        {removal.attempt?.phase.kind === "removed" ? removalText.removed : ""}
      </p>
      <LauncherProfiles
        headingRef={heading}
        view={view}
        selected={selected}
        pending={pending || action.pending || launchRequest.pending}
        error={error}
        accepted={accepted}
        control={control}
        onAction={profileAction}
        onSelect={setSelected}
        onEdit={(id) => void openEditor(id)}
        onNew={() => void openEditor(null)}
        onApplications={() => editor.setTab("applications")}
        onLaunch={(profile) => void launch(profile)}
        onReload={() => void reload()}
      />
      <CheckedRemovalDialog
        name={removing?.profile.name}
        target={removing?.target}
        control={removal}
        onClose={() => {
          setRemoving(undefined);
          removal.dismiss();
        }}
      />
      <RemoveProfileDialog
        name={duplicating?.name}
        duplicate={duplicating !== undefined}
        pending={action.pending}
        onCancel={() => {
          setDuplicating(undefined);
        }}
        onConfirm={() => {
          if (!duplicating) return;
          const profile = duplicating;
          setDuplicating(undefined);
          void action.execute({
            method: "launcher.profile.duplicate",
            id: profile.id,
            baseRevision: view.revision,
          });
        }}
      />
    </>
  );
}
