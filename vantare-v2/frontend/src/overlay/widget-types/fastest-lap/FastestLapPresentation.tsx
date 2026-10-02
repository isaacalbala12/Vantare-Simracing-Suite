import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { WidgetRenderMode } from "../../core/widget-definition";
import type { FastestLapNotice, FastestLapViewModel } from "./fastest-lap-view-model";
import { createFastestLapStore } from "./fastest-lap-store";

/** Commit telemetry before publishing a notice; renderers receive a pure model. */
export function FastestLapPresentation({ model, renderMode, authoringPlayback, children }: {
  model: FastestLapViewModel;
  renderMode: WidgetRenderMode;
  authoringPlayback?: boolean;
  children: (model: FastestLapViewModel) => ReactNode;
}) {
  const [store] = useState(createFastestLapStore);
  const notice = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useLayoutEffect(() => { store.accept(model); }, [store, model]);
  useLayoutEffect(() => () => store.reset(), [store]);
  const preview = !authoringPlayback && (renderMode === "studio" || renderMode === "harness");
  const previewTiming = model.showClass && model.candidate ? model.candidate : model.showPersonal ? model.personal : undefined;
  const previewNotice: FastestLapNotice | undefined = previewTiming ? {
    id: 0, kind: model.showClass && model.candidate ? "class" : "personal", phase: "visible", timing: previewTiming,
  } : undefined;
  const notification = model.status !== "ready" ? undefined
    : preview ? previewNotice : notice?.scopeKey === model.scopeKey ? notice : undefined;
  return children({ ...model, notification, preview });
}
