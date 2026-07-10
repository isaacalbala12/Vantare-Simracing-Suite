import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
export function DeltaCrystal({ model, settings }: WidgetRendererProps<DeltaViewModel>) {
  const showMeta = settings.showHeader !== false;

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="delta"
      data-status={model.status}
      data-tone={model.tone}
      className="vc-delta"
    >
      <div className="vc-delta-glow" aria-hidden="true" />
      <div className="vc-delta-material">
        {showMeta ? (
          <div className="vc-delta-meta">
            <span className="vc-delta-label">DELTA</span>
            <span className="vc-delta-best-lap">{model.bestLapText}</span>
          </div>
        ) : null}
        <div className="vc-delta-value" data-tone={model.tone}>
          {model.deltaText}
        </div>
        {model.statusMessage ? (
          <p className="vc-delta-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-delta-meter" aria-hidden="true" data-tone={model.tone}>
          <span style={{ "--delta-progress": String(model.progress) } as CSSProperties} />
        </div>
      </div>
    </section>
  );
}