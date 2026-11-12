import { useEffect, useState } from "react";
import type {
  DeltaReference,
  OverlayInstance,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioWidgetOptions } from "../../../contract/generated/studio";
import { useStudio } from "./state";

export function hasDrivingContent(item: OverlayInstance) {
  return item.settings?.kind === "delta" || item.settings?.kind === "pedals";
}

// The view only renders this model. Revision selection and write guards stay
// here so a new inspector layout does not change persistence behavior.
export function useDrivingContent(item: OverlayInstance) {
  const state = useStudio();
  const view = state.view;
  const settings =
    view?.state === "ready" && item.settings?.kind === item.kind
      ? item.settings
      : null;
  const disabled = item.locked || view?.plan === "unverified";
  const delta =
    settings?.kind === "delta" && settings.designSystem === "vantare";
  const sectors = delta && settings.size === "expanded";
  const brake =
    settings?.kind === "pedals" && settings.designSystem === "vantare";
  const pedals = settings?.kind === "pedals";
  const savedGap = pedals ? settings.gap : undefined;
  const [gapDraft, setGap] = useState({
    id: item.id,
    text: savedGap === undefined ? "" : String(savedGap),
  });
  const gap =
    gapDraft.id === item.id
      ? gapDraft.text
      : savedGap === undefined
        ? ""
        : String(savedGap);
  const [gapError, setGapError] = useState(false);
  useEffect(() => {
    setGap({
      id: item.id,
      text: savedGap === undefined ? "" : String(savedGap),
    });
    setGapError(false);
  }, [savedGap, item.id]);
  const save = (value: WidgetSettingsPatch) => {
    if (!settings || !view || state.pending || disabled) return;
    void state.execute({
      method: "studio.instance",
      id: item.id,
      baseRevision: view.revision,
      patch: { field: "settings", value },
    });
  };
  return {
    settings,
    disabled,
    unverified: view?.plan === "unverified",
    pending: state.pending,
    delta,
    sectors,
    brake,
    pedals,
    gap,
    gapError,
    gapLimits: studioWidgetOptions.pedals,
    editGap(value: string) {
      if (state.pending || disabled) return;
      setGap({ id: item.id, text: value });
      setGapError(false);
    },
    commitGap() {
      if (!pedals || state.pending || disabled) return;
      const value = Number(gap);
      const { gapMin, gapMax } = studioWidgetOptions.pedals;
      if (
        !gap.trim() ||
        !Number.isFinite(value) ||
        value < gapMin ||
        value > gapMax
      ) {
        setGapError(true);
        return;
      }
      if (value !== savedGap) save({ kind: "pedals", gap: value });
      // The saved projection stays authoritative after a failure/discard.
      setGap({ id: item.id, text: String(savedGap) });
    },
    references: studioWidgetOptions.delta.references,
    setReference(value: DeltaReference) {
      if (delta && studioWidgetOptions.delta.references.includes(value))
        save({ kind: "delta", reference: value });
    },
    setSectors(value: boolean) {
      if (sectors) save({ kind: "delta", showSectors: value });
    },
    setBrakePeak(value: boolean) {
      if (brake) save({ kind: "pedals", showBrakePeak: value });
    },
  };
}
