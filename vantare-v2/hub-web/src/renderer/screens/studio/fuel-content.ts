import type {
  OverlayInstance,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioWidgetOptions } from "../../../contract/generated/studio";
import { useStudio } from "./state";

export function hasFuelContent(item: OverlayInstance) {
  return (
    item.kind === "fuel-strategy" && item.settings?.kind === "fuel-strategy"
  );
}

const limits = studioWidgetOptions.fuel;
const rows = Object.freeze(
  Array.from(
    {
      length: (limits.historyMax - limits.historyMin) / limits.historyStep + 1,
    },
    (_, index) => limits.historyMin + index * limits.historyStep,
  ),
);

export function useFuelContent(item: OverlayInstance) {
  const state = useStudio();
  const view = state.view;
  const settings =
    view?.state === "ready" &&
    hasFuelContent(item) &&
    item.settings?.kind === "fuel-strategy"
      ? item.settings
      : null;
  const editable = settings?.designSystem === "eficiencia";
  const disabled = item.locked || view?.plan === "unverified";
  const save = (value: WidgetSettingsPatch) => {
    if (!editable || !view || disabled || state.pending) return;
    void state.execute({
      method: "studio.instance",
      id: item.id,
      baseRevision: view.revision,
      patch: { field: "settings", value },
    });
  };
  return {
    settings,
    editable,
    disabled,
    pending: state.pending,
    unverified: view?.plan === "unverified",
    rows,
    setRows(historyRows: number) {
      if (rows.includes(historyRows))
        save({ kind: "fuel-strategy", historyRows });
    },
    setProjection(showProjection: boolean) {
      save({ kind: "fuel-strategy", showProjection });
    },
  };
}
