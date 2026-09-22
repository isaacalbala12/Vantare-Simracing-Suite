import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { WidgetRenderMode } from "../../core/widget-definition";
import type { FastestLapViewModel } from "./fastest-lap-view-model";
import { createFastestLapStore } from "./fastest-lap-store";

/** Commit telemetry before publishing a notice; renderers receive a pure model. */
export function FastestLapPresentation({ model, renderMode, children }: {
  model: FastestLapViewModel;
  renderMode: WidgetRenderMode;
  children: (model: FastestLapViewModel) => ReactNode;
}) {
  const [store] = useState(createFastestLapStore);
  const notice = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useLayoutEffect(() => { store.accept(model); }, [store, model]);
  useLayoutEffect(() => () => store.reset(), [store]);
  const preview = renderMode === "studio" || renderMode === "harness";
  const notification = model.status !== "ready" ? undefined
    : preview ? model.candidate
    : notice?.scopeKey === model.scopeKey ? notice.timing : undefined;
  return children({ ...model, notification, preview });
}
