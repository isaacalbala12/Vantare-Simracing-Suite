import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import "../tokens.css";

export function DeltaOriginal({ model, settings }: WidgetRendererProps<DeltaViewModel>) {
  const showHeader = settings.showHeader !== false;

  return (
    <section
      data-widget-system="vantare-original"
      data-widget-renderer="delta"
      data-status={model.status}
      data-tone={model.tone}
      className="vo-delta"
    >
      {showHeader ? (
        <header className="vo-delta-header">
          <span className="vo-delta-label">DELTA</span>
          <span className="vo-delta-last-lap">{model.lastLapText}</span>
        </header>
      ) : null}
      <strong className="vo-delta-value" data-tone={model.tone}>
        {model.deltaText}
      </strong>
      {model.statusMessage ? (
        <p className="vo-delta-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div aria-hidden="true" className="vo-delta-track" data-tone={model.tone}>
        <span className="vo-delta-center" />
        <span
          className="vo-delta-fill"
          style={{ "--delta-progress": String(model.progress) } as CSSProperties}
        />
      </div>
    </section>
  );
}