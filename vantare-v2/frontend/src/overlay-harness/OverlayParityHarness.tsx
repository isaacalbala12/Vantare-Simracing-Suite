import type { CSSProperties } from "react";
import { WidgetVisualHost } from "../overlay/core/WidgetVisualHost";
import {
  buildHarnessTelemetry,
  buildHarnessWidget,
  seedHarnessInputHistory,
} from "../overlay/authoring/fixtures/authoring-fixtures";
import { buildEngineerPresentationFixture } from "../engineer/engineer-presentation-fixtures";
import { parseHarnessQuery, type HarnessQuery } from "./overlay-parity-query";
import { buildAuthoringV2Runtime } from "../overlay/authoring/fixtures/authoring-v2-fixture";

export function OverlayParityHarness({ query }: { query: HarnessQuery }) {
  const snapshot = buildHarnessTelemetry({
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    variant: query.variant,
    designId: query.designId,
  });
  const widget = buildHarnessWidget(query.widget, query.system, query.variant, query.designId);
  seedHarnessInputHistory(widget, snapshot);
  const runtime = buildAuthoringV2Runtime(widget.type, snapshot);

  return (
    <div
      data-overlay-parity-stage
      data-overlay-parity-widget={query.widget}
      data-overlay-parity-system={query.system}
      data-overlay-parity-variant={query.variant}
      data-overlay-parity-design={query.designId ?? ""}
      style={{
        width: 1920,
        height: 1080,
        position: "relative",
        background: "transparent",
      }}
    >
      <div data-overlay-parity-surface-label>{query.surface}</div>
      <div
        data-overlay-parity-widget-frame
        style={
          {
            position: "absolute",
            left: `${widget.layout.x}px`,
            top: `${widget.layout.y}px`,
            width: `${widget.layout.w}px`,
            height: `${widget.layout.h}px`,
          } as CSSProperties
        }
      >
        <WidgetVisualHost
          widget={widget}
          snapshot={snapshot}
          renderMode={query.surface}
          runtime={query.widget === "engineer-radio" ? {
            ...runtime,
            engineerPresentation: query.state === "ready"
              ? buildEngineerPresentationFixture(query.engineerLocale ?? "es", query.engineerSeverity ?? "critical")
              : null,
          } : runtime}
        />
      </div>
    </div>
  );
}

export function OverlayParityHarnessPage({ search }: { search: string }) {
  const parsed = parseHarnessQuery(search);
  if ("error" in parsed) {
    return (
      <div data-overlay-parity-error role="alert">
        {parsed.error}
      </div>
    );
  }
  return <OverlayParityHarness query={parsed} />;
}
