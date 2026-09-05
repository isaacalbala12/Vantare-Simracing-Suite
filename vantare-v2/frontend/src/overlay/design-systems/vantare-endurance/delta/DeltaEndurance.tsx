import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { parseDeltaEnduranceSettings } from "./delta-endurance-settings";
import { DeltaRedlineTemplate } from "./DeltaRedlineTemplate";

export function DeltaEndurance({ model, settings }: WidgetRendererProps<DeltaViewModel>) {
  const parsed = parseDeltaEnduranceSettings(settings);

  if (parsed.templateId === "delta-redline") {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="delta"
        data-status={model.status}
        data-tone={model.tone}
        data-template="delta-redline"
        className="ven-root ven-delta ven-dred"
        style={{ "--ven-delta-loss": parsed.lossColor } as CSSProperties}
      >
        {/* showHeader drives the reference row: the expanded state of the design. */}
        <DeltaRedlineTemplate model={model} showReference={parsed.showHeader} />
      </section>
    );
  }

  if (parsed.templateId === "delta-neo") {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="delta"
        data-status={model.status}
        data-tone={model.tone}
        data-template="delta-neo"
        className="ven-root ven-delta ven-neod"
        style={{ "--ven-delta-loss": parsed.lossColor } as CSSProperties}
      >
        {parsed.showHeader ? (
          <header className="ven-neo-header">
            <span className="ven-neo-brand">VANTARE</span>
            <span className="ven-neo-clock">
              <span className="ven-neo-clock-label">DELTA</span>
            </span>
          </header>
        ) : null}
        <div className="ven-neo-card ven-neod-card">
          <strong className="ven-neod-value" data-tone={model.tone}>
            {model.deltaText}
          </strong>
          {model.statusMessage ? (
            <p className="ven-status-message" role="status">
              {model.statusMessage}
            </p>
          ) : null}
          <div aria-hidden="true" className="ven-neod-track" data-tone={model.tone}>
            <span className="ven-neod-center" />
            <span
              className="ven-neod-fill"
              data-tone={model.tone}
              style={{ "--delta-progress": String(model.progress) } as CSSProperties}
            />
          </div>
          <div className="ven-neod-laps">
            <span className="ven-neod-well">
              <span className="ven-neod-well-label">LAST</span>
              {model.lastLapText}
            </span>
            <span className="ven-neod-well">
              <span className="ven-neod-well-label">BEST</span>
              {model.bestLapText}
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-widget-system="vantare-endurance"
      data-widget-renderer="delta"
      data-status={model.status}
      data-tone={model.tone}
      data-template={parsed.templateId}
      className="ven-root ven-delta"
      style={{ "--ven-delta-loss": parsed.lossColor } as CSSProperties}
    >
      {parsed.showHeader ? (
        <header className="ven-titlebar">
          <span className="ven-brand">VANTARE</span>
          <span className="ven-title">DELTA</span>
        </header>
      ) : null}
      <strong className="ven-delta-value" data-tone={model.tone}>
        {model.deltaText}
      </strong>
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {parsed.templateId === "delta-strip" ? (
        <div aria-hidden="true" className="ven-delta-track" data-tone={model.tone}>
          <span className="ven-delta-center" />
          <span
            className="ven-delta-fill"
            data-tone={model.tone}
            style={{ "--delta-progress": String(model.progress) } as CSSProperties}
          />
        </div>
      ) : (
        <div className="ven-delta-laps">
          <span>
            LAST<strong>{model.lastLapText}</strong>
          </span>
          <span>
            BEST<strong>{model.bestLapText}</strong>
          </span>
        </div>
      )}
    </section>
  );
}
