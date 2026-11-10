import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { profileLimits } from "../../../contract/generated/contract";
import { isProfileDraft } from "../../../contract/profile-validation";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { profileText as text } from "../../i18n/profile-editor";
import { useToastManager } from "../../ui/Layers";
import {
  ArgumentLossDialog,
  ProfileEditorFields,
} from "../../ui/launcher/ProfileEditor";
import {
  type EditorSnapshot,
  snapshot,
  useProfileEditorState,
} from "./editor-state";
import { launcherKey, useLauncherSnapshot } from "./state";

function argumentLoss(value: EditorSnapshot): number {
  return value.original.steps.filter(
    (step) =>
      step.hasCustomArguments &&
      !value.draft.steps.some(
        (current) =>
          current.key !== null &&
          current.key === step.key &&
          current.appId === step.appId,
      ),
  ).length;
}
export function ProfileEditor() {
  const { client } = useHost();
  const query = useQueryClient();
  const { view } = useLauncherSnapshot();
  const { value, set, update } = useProfileEditorState();
  const toast = useToastManager();
  const [error, setError] = useState<string>();
  const [conflictRevision, setConflictRevision] = useState<string>();
  const [confirmation, setConfirmation] = useState<{
    revision: string;
    source: EditorSnapshot;
  }>();
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
          {
            key: null,
            appId: app.id,
            delaySeconds: 2,
            hasCustomArguments: false,
          },
        ],
      },
      stepKeys: [...current.stepKeys, crypto.randomUUID()],
    });
  }
  async function save(
    revision = current.revision,
    confirmed = false,
    source = current,
  ) {
    if (!client || busy.current || !view) return;
    const nameBytes = new TextEncoder().encode(source.draft.name).length;
    if (
      !source.draft.name.trim() ||
      source.draft.name.includes("\0") ||
      nameBytes > profileLimits.name
    ) {
      setError(text.invalidName);
      return;
    }
    if (!source.draft.steps.length) {
      setError(text.emptySteps);
      return;
    }
    if (
      source.draft.steps.some(
        (step) =>
          !view.apps.some((app) => app.id === step.appId && app.available),
      )
    ) {
      setError(text.missing);
      return;
    }
    const draft = source.draft;
    if (!isProfileDraft(draft)) {
      setError(text.failed);
      return;
    }
    if (!confirmed && argumentLoss(source) > 0) {
      setConfirmation({ revision, source });
      return;
    }
    busy.current = true;
    set({ ...source, pending: true });
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
      set({ ...source, pending: false });
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
  async function retry() {
    if (!client || busy.current) return;
    busy.current = true;
    set({ ...current, pending: true });
    try {
      let reply: Awaited<ReturnType<typeof client.request>>;
      try {
        reply = await client.request({
          method: "launcher.profile.get",
          id: current.draft.id,
        });
      } catch (failure) {
        if (
          !current.isNew ||
          !(failure instanceof HostFailure) ||
          failure.detail.kind !== "denied"
        )
          throw failure;
        reply = await client.request({
          method: "launcher.profile.get",
          id: null,
        });
      }
      if (!alive.current || reply.method !== "launcher.profile.get") return;
      const fresh = snapshot(reply.value, current.isNew);
      const steps = current.draft.steps.map((step) => {
        const index = current.original.steps.findIndex(
          (original) => original.key !== null && original.key === step.key,
        );
        const candidate = fresh.draft.steps[index];
        return {
          ...step,
          key: candidate?.appId === step.appId ? candidate.key : null,
          hasCustomArguments:
            candidate?.appId === step.appId && candidate.hasCustomArguments,
        };
      });
      const source = {
        ...fresh,
        draft: { ...current.draft, id: fresh.draft.id, steps },
        stepKeys: current.stepKeys,
      };
      set(source);
      setConflictRevision(undefined);
      setError(undefined);
      busy.current = false;
      await save(source.revision, false, source);
    } catch {
      if (alive.current) {
        set({ ...current, pending: false });
        setError(text.failed);
      }
    } finally {
      busy.current = false;
    }
  }
  actions.current = {
    save: () => void save(),
    cancel: () => {
      if (confirmation) setConfirmation(undefined);
      else set(null);
    },
  };
  return (
    <>
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
        onRetry={() => void (conflictRevision ? retry() : save())}
        onDiscard={() => void discard()}
      />
      <ArgumentLossDialog
        count={confirmation ? argumentLoss(confirmation.source) : 0}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={() => {
          if (confirmation) {
            const { revision, source } = confirmation;
            setConfirmation(undefined);
            void save(revision, true, source);
          }
        }}
      />
    </>
  );
}
