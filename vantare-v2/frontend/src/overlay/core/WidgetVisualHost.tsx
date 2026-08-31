import { useState, type ReactNode } from "react";
import { DesignSystemResolutionError } from "./design-system-definition";
import type { WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { widgetTypeRegistry } from "./widget-registry";
import { prepareWidgetVisualSettings } from "./widget-visual-settings";
import { WidgetRenderBoundary } from "./WidgetRenderBoundary";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";
import { readInputTelemetryHistory, recordInputTelemetrySample } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import type { InputTelemetryViewModel } from "../widget-types/input-telemetry/input-telemetry-view-model";
import type { WidgetRuntimeInput } from "./widget-definition";
import { getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import { createRelativeViewModelState } from "../widget-types/relative/relative-view-model-v2";
import { isRelativeRedlineTemplateId } from "../design-systems/vantare-endurance/relative/relative-endurance-settings";

export type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";

export type WidgetVisualHostProps = {
  widget: WidgetInstanceV3;
  snapshot?: TelemetrySnapshot;
  renderMode: "studio" | "desktop" | "obs" | "harness";
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  runtime?: WidgetRuntimeInput;
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
  const [relativeViewModelState] = useState(createRelativeViewModelState);

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

  const v2Entry = getOverlayV2ViewModelEntry(widget.type);
  const frame = props.runtime?.overlayV2Frame;
  const source = props.runtime?.overlayV2Source;
  const harnessMode = renderMode === "harness";
  const v2Failure = props.runtime?.overlayV2Failure;
  // El único rollback diagnóstico se transporta como catálogo vacío; nunca
  // persiste y en superficies productivas muestra un estado, no pinta V1.
  const v2Rollback = props.runtime?.overlayV2Features?.length === 0;
  if (v2Entry && v2Rollback && !harnessMode) {
    const message = "Overlay V2 diagnostic rollback active";
    reportDiagnostic(props, "overlay-v2-rollback", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-rollback" message={message} />;
  }
  if (v2Entry && !v2Rollback && v2Failure) {
    const code = `overlay-v2-${v2Failure.code}`;
    reportDiagnostic(props, code, v2Failure.message);
    return <HostDiagnostic widget={widget} code={code} message={v2Failure.message} />;
  }
  if (v2Entry && !v2Rollback && source?.state === "error") {
    const message = source.reason ?? "Overlay V2 source error";
    reportDiagnostic(props, "overlay-v2-source-error", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-source-error" message={message} />;
  }
  if (v2Entry && !v2Rollback && !harnessMode && !frame) {
    const message = "Overlay V2 frame unavailable";
    reportDiagnostic(props, "overlay-v2-frame-missing", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-frame-missing" message={message} />;
  }
  if (v2Entry && !v2Rollback && !harnessMode && !source) {
    const message = "Overlay V2 source state unavailable";
    reportDiagnostic(props, "overlay-v2-source-missing", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-source-missing" message={message} />;
  }

  let model;
  if (v2Entry && !v2Rollback && frame && source) {
    const relativeRedline = widget.type === "relative" &&
      registration.systemId === "vantare-endurance" &&
      isRelativeRedlineTemplateId(settings.templateId);
    // V2 se construye primero: el builder V1 no se ejecuta para luego
    // sobrescribirlo. El renderer recibe únicamente la ViewModel pura.
    model = v2Entry.buildViewModelV2(
      frame,
      source,
      content,
      {
        ...props.runtime,
        relativeViewModelState,
        relativeViewModelInstanceKey: props.runtime?.relativeViewModelInstanceKey ?? `${renderMode}:${widget.id}`,
        relativeViewModelStability: relativeRedline ? "endurance-redline" : undefined,
      },
    );
  } else if (!v2Entry && definition.buildAuxiliaryViewModel) {
    model = definition.buildAuxiliaryViewModel(content as never, props.runtime ?? {}, renderMode);
  } else if (harnessMode && snapshot) {
    model = definition.buildPreviewViewModel
      ? definition.buildPreviewViewModel(snapshot, content as never, props.runtime ?? {})
      : definition.buildRuntimeViewModel
        ? definition.buildRuntimeViewModel(snapshot, content as never, props.runtime ?? {})
        : definition.buildViewModel(snapshot, content as never);
  } else {
    const message = `No V2 or auxiliary authority registered for ${widget.type}`;
    reportDiagnostic(props, "widget-authority-missing", message);
    return <HostDiagnostic widget={widget} code="widget-authority-missing" message={message} />;
  }

  if (harnessMode && snapshot && !(v2Entry && !v2Rollback && frame && source) && widget.type === "input-telemetry") {
    const inputContent = content as { historySeconds: number };
    recordInputTelemetrySample(widget.id, snapshot);
    model = {
      ...model,
      history: readInputTelemetryHistory(widget.id, snapshot, inputContent.historySeconds),
    } as InputTelemetryViewModel;
  }

  const Renderer = registration.Renderer;
  const staleMessage = v2Entry && !v2Rollback && frame && source?.state === "stale"
    ? `Overlay V2 stale${source.ageMs !== undefined ? ` (${Math.round(source.ageMs)} ms)` : ""}`
    : undefined;
  if (staleMessage) {
    reportDiagnostic(props, "overlay-v2-stale", staleMessage);
  }

  return (
    <>
      {staleMessage
        ? <HostDiagnostic widget={widget} code="overlay-v2-stale" message={staleMessage} />
        : null}
      <WidgetRenderBoundary
        widgetId={widget.id}
        widgetType={widget.type}
        systemId={widget.visual.systemId}
        onError={(error) => reportDiagnostic(props, "renderer-exception", error.message)}
      >
        <Renderer model={model} settings={settings} renderMode={renderMode} layout={widget.layout} />
      </WidgetRenderBoundary>
    </>
  );
}
