import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { profileLimits } from "../../../contract/generated/contract";
import { isProfileDraft } from "../../../contract/profile-validation";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { profileText as text } from "../../i18n/profile-editor";
import { useToastManager } from "../../ui/Layers";
import { ProfileEditorFields } from "../../ui/launcher/ProfileEditor";
import { snapshot, useProfileEditorState } from "./editor-state";
import { launcherKey, useLauncherSnapshot } from "./state";

export function ProfileEditor() {
  const { client } = useHost();
  const query = useQueryClient();
  const { view } = useLauncherSnapshot();
  const { value, set, update } = useProfileEditorState();
  const toast = useToastManager();
  const [error, setError] = useState<string>();
  const [conflictRevision, setConflictRevision] = useState<string>();
  const busy = useRef(false);
  const alive = useRef(true);
  const actions = useRef({ save: () => {}, cancel: () => {} });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) {
        event.preventDefault();
        actions.current.cancel();
      } else if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        actions.current.save();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const dirty =
    value !== null &&
    JSON.stringify(value.draft) !== JSON.stringify(value.original);
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard((reason) => {
      if (reason !== "window") {
        set(null);
        return true;
      }
      if (!dirty) return true;
      toast.add({ title: text.unsaved, type: "warn" });
      return false;
    });
  }, [client, dirty, set, toast]);
  if (!value || !view) return null;
  const current = value;
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= current.draft.steps.length) return;
    const steps = [...current.draft.steps];
    const stepKeys = [...current.stepKeys];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    [stepKeys[index], stepKeys[target]] = [stepKeys[target], stepKeys[index]];
    set({ ...current, draft: { ...current.draft, steps }, stepKeys });
  }
  function add() {
    if (!view || current.draft.steps.length >= profileLimits.steps) {
      setError(text.limit);
      return;
    }
    const app = view.apps.find((app) => app.available) ?? view.apps[0];
    if (!app) {
      setError(text.missing);
      return;
    }
    set({
      ...current,
      draft: {
        ...current.draft,
        steps: [
          ...current.draft.steps,
          { appId: app.id, delaySeconds: 2, hasCustomArguments: false },
        ],
      },
      stepKeys: [...current.stepKeys, crypto.randomUUID()],
    });
  }
  async function save(revision = current.revision) {
    if (!client || busy.current || !view) return;
    const nameBytes = new TextEncoder().encode(current.draft.name).length;
    if (
      !current.draft.name.trim() ||
      current.draft.name.includes("\0") ||
      nameBytes > profileLimits.name
    ) {
      setError(text.invalidName);
      return;
    }
    if (!current.draft.steps.length) {
      setError(text.emptySteps);
      return;
    }
    if (
      current.draft.steps.some(
        (step) =>
          !view.apps.some((app) => app.id === step.appId && app.available),
      )
    ) {
      setError(text.missing);
      return;
    }
    const draft = current.draft;
    if (!isProfileDraft(draft)) {
      setError(text.failed);
      return;
    }
    busy.current = true;
    set({ ...current, pending: true });
    setError(undefined);
    try {
      const reply = await client.request({
        method: "launcher.profile.save",
        draft,
        baseRevision: revision,
      });
      if (!alive.current) return;
      if (reply.method === "launcher.profile.save") {
        query.setQueryData(launcherKey, reply.value);
        set(null);
        toast.add({ title: text.saved });
      }
    } catch (failure) {
      if (!alive.current) return;
      set({ ...current, pending: false });
      if (
        failure instanceof HostFailure &&
        failure.detail.kind === "launcherConflict"
      ) {
        setConflictRevision(failure.detail.current.revision);
        query.setQueryData(launcherKey, failure.detail.current);
        setError(text.conflict);
      } else setError(text.failed);
    } finally {
      busy.current = false;
    }
  }
  async function discard() {
    if (!client || busy.current) return;
    if (current.isNew) {
      set(null);
      return;
    }
    busy.current = true;
    set({ ...current, pending: true });
    try {
      const reply = await client.request({
        method: "launcher.profile.get",
        id: current.draft.id,
      });
      if (alive.current && reply.method === "launcher.profile.get") {
        set(snapshot(reply.value));
        setError(undefined);
        setConflictRevision(undefined);
      }
    } catch {
      if (alive.current) {
        set({ ...current, pending: false });
        setError(text.failed);
      }
    } finally {
      busy.current = false;
    }
  }
  actions.current = { save: () => void save(), cancel: () => set(null) };
  return (
    <ProfileEditorFields
      draft={current.draft}
      apps={view.apps}
      rowKeys={current.stepKeys}
      pending={current.pending}
      error={error}
      onChange={update}
      onMove={move}
      onRemove={(index) =>
        set({
          ...current,
          draft: {
            ...current.draft,
            steps: current.draft.steps.filter((_, i) => i !== index),
          },
          stepKeys: current.stepKeys.filter((_, i) => i !== index),
        })
      }
      onAdd={add}
      onSave={() => void save()}
      onCancel={() => set(null)}
      onRetry={() => void save(conflictRevision ?? current.revision)}
      onDiscard={() => void discard()}
    />
  );
}
