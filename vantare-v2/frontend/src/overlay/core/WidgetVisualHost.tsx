import type { ReactNode } from "react";
import { DesignSystemResolutionError } from "./design-system-definition";
import type { WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { widgetTypeRegistry } from "./widget-registry";
import { prepareWidgetVisualSettings } from "./widget-visual-settings";
import { WidgetRenderBoundary } from "./WidgetRenderBoundary";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";
import { readInputTelemetryHistory, recordInputTelemetrySample } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import type { InputTelemetryViewModel } from "../widget-types/input-telemetry/input-telemetry-view-model";

export type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";

export type WidgetVisualHostProps = {
  widget: WidgetInstanceV3;
  snapshot: TelemetrySnapshot;
  renderMode: "studio" | "desktop" | "obs" | "harness";
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
};

function reportDiagnostic(
  props: WidgetVisualHostProps,
  code: string,
  message: string,
): void {
  const diagnostic = {
    code,
    widgetId: props.widget.id,
    widgetType: props.widget.type,
    systemId: props.widget.visual.systemId,
    surface: props.renderMode,
    message,
    occurredAt: new Date(0).toISOString(),
  } satisfies WidgetDiagnostic;
  props.diagnostics?.report(diagnostic);
  props.onDiagnostic?.(diagnostic);
}

function HostDiagnostic(props: {
  widget: WidgetInstanceV3;
  message: string;
  code: string;
}): ReactNode {
  return (
    <div
      data-testid="widget-host-diagnostic"
      data-widget-id={props.widget.id}
      data-widget-type={props.widget.type}
      data-system-id={props.widget.visual.systemId}
      data-diagnostic-code={props.code}
      role="alert"
    >
      {props.message}
    </div>
  );
}

export function WidgetVisualHost(props: WidgetVisualHostProps): ReactNode {
  const { widget, snapshot, renderMode } = props;

  let definition;
  try {
    definition = widgetTypeRegistry.get(widget.type);
  } catch (error) {
    const message = error instanceof Error ? error.message : "widget type not registered";
    reportDiagnostic(props, "unknown-widget-type", message);
    return <HostDiagnostic widget={widget} code="unknown-widget-type" message={message} />;
  }

  let content: Record<string, unknown>;
  try {
    content = definition.parseContent(widget.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid widget content";
    reportDiagnostic(props, "invalid-content", message);
    return <HostDiagnostic widget={widget} code="invalid-content" message={message} />;
  }

  let model = definition.buildViewModel(snapshot, content as never);
  if (widget.type === "input-telemetry") {
    const inputContent = content as { historySeconds: number };
    recordInputTelemetrySample(widget.id, snapshot);
    model = {
      ...model,
      history: readInputTelemetryHistory(widget.id, snapshot, inputContent.historySeconds),
    } as InputTelemetryViewModel;
  }

  let registration;
  let settings: Record<string, unknown>;
  try {
    ({ registration, settings } = prepareWidgetVisualSettings(widget));
  } catch (error) {
    const code =
      error instanceof DesignSystemResolutionError ? "unsupported-visual-pair" : "invalid-settings";
    const message = error instanceof Error ? error.message : "invalid widget settings";
    reportDiagnostic(props, code, message);
    return <HostDiagnostic widget={widget} code={code} message={message} />;
  }

  const Renderer = registration.Renderer;

  return (
    <WidgetRenderBoundary
      widgetId={widget.id}
      widgetType={widget.type}
      systemId={widget.visual.systemId}
      onError={(error) => reportDiagnostic(props, "renderer-exception", error.message)}
    >
      <Renderer model={model} settings={settings} renderMode={renderMode} />
    </WidgetRenderBoundary>
  );
}
