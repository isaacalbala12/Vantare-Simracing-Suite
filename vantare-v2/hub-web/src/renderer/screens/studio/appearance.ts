import { useState } from "react";
import type {
  OverlayInstance,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { useStudio } from "./state";

export function useAppearance(item: OverlayInstance) {
  const state = useStudio();
  const [saving, setSaving] = useState<string | null>(null);
  const view = state.view;
  const disabled =
    view?.state !== "ready" || view.plan === "unverified" || item.locked;
  const patch = async (value: WidgetSettingsPatch, control: string) => {
    if (disabled || !view || !item.settings || state.pending) return;
    setSaving(control);
    try {
      return await state.execute({
        method: "studio.instance",
        id: item.id,
        baseRevision: view.revision,
        patch: { field: "settings", value },
      });
    } finally {
      setSaving(null);
    }
  };
  return {
    readable: view?.state === "ready",
    disabled,
    pending: state.pending,
    saving,
    patch,
  };
}
