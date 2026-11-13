import { useEffect, useState } from "react";
import type {
  InstancePatch,
  OverlayInstance,
} from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "./state";
export const trackSessions = ["practice", "qualifying", "race"] as const;
export function sessionsSummary(item: Pick<OverlayInstance, "showIn">) {
  const keys = trackSessions.filter((key) => item.showIn[key]);
  return keys.length === 3
    ? t.sessionsAll
    : keys.length === 0
      ? t.noSessions
      : keys.length === 1
        ? t.onlySessions(keys.map((key) => t.sessionNames[key]))
        : t.trackSeveralSessions(keys.map((key) => t.sessionNames[key]));
}
export function useTrack(item: OverlayInstance) {
  const state = useStudio();
  const view = state.view;
  const [opacity, setOpacity] = useState(item.opacity);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    if (!state.pending) setOpacity(item.opacity);
  }, [item.opacity, state.pending]);
  const disabled =
    view?.state !== "ready" || view.plan === "unverified" || item.locked;
  const patch = async (value: InstancePatch) => {
    if (!view || disabled || state.pending) return;
    setSaving(value.field);
    try {
      return await state.execute({
        method: "studio.instance",
        id: item.id,
        patch: value,
        baseRevision: view.revision,
      });
    } finally {
      setSaving(null);
    }
  };
  const visibility = async (visible: boolean) => {
    if (!view || disabled || state.pending) return;
    setSaving("visible");
    try {
      return await state.execute({
        method: "studio.visibility",
        id: item.id,
        visible,
        baseRevision: view.revision,
      });
    } finally {
      setSaving(null);
    }
  };
  return {
    readable: view?.state === "ready",
    disabled,
    pending: state.pending,
    opacity,
    setOpacity,
    patch,
    visibility,
    saving,
  };
}
