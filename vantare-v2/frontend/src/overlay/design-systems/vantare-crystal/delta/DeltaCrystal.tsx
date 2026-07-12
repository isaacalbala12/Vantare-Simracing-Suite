import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { parseDeltaSettings } from "./delta-settings";
import { DeltaBarCrystal } from "./DeltaBarCrystal";
import { DeltaSimpleCrystal } from "./DeltaSimpleCrystal";

export function DeltaCrystal({ model, settings }: WidgetRendererProps<DeltaViewModel>) {
  const { templateId, showHeader } = parseDeltaSettings(settings);

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="delta"
      data-status={model.status}
      data-tone={model.tone}
      className="vc-delta"
    >
      {templateId === "delta-simple" ? (
        <DeltaSimpleCrystal model={model} />
      ) : (
        <DeltaBarCrystal model={model} showHeader={showHeader} />
      )}
    </section>
  );
}
