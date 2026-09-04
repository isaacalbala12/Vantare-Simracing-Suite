import type { CSSProperties } from "react";
import { WidgetVisualHost } from "../overlay/core/WidgetVisualHost";
import { buildAuthoringV2ScenarioRuntime } from "../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import { buildAuthoringV2ScenarioWidget } from "../overlay/authoring/fixtures/authoring-v2-scenario-widget";
import { buildEngineerPresentationFixture } from "../engineer/engineer-presentation-fixtures";
import { getCrystalParityDesign, parseHarnessQuery, type HarnessQuery } from "./overlay-parity-query";

export function OverlayParityHarness({ query }: { query: HarnessQuery }) {
  const widget = buildAuthoringV2ScenarioWidget({
    widget: query.widget,
    system: query.system,
    variant: query.variant,
    ...(query.designId ? { designId: query.designId } : {}),
  });
  // La dimensión Crystal exacta vive en el manifest, no en la telemetría.
  const referenceDesign = query.designId ? getCrystalParityDesign(query.designId) : undefined;
  if (referenceDesign) {
    widget.layout = { ...widget.layout, w: referenceDesign.width, h: referenceDesign.height };
  }
  const runtime = {
    ...buildAuthoringV2ScenarioRuntime({
      session: query.session,
      location: query.location,
      state: query.state,
      widget: query.widget,
      system: query.system,
      variant: query.variant,
    }),
    ...(query.widget === "engineer-radio"
      ? {
          engineerPresentation:
            query.state === "ready"
              ? buildEngineerPresentationFixture(query.engineerLocale ?? "es", query.engineerSeverity ?? "critical")
              : null,
        }
      : {}),
  };

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
          renderMode={query.surface}
          runtime={runtime}
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
