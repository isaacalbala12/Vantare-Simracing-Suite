import type { ReactNode } from "react";
import { DesignSystemResolutionError } from "./design-system-definition";
import type { WidgetInstanceV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";
import { prepareWidgetVisualSettings } from "./widget-visual-settings";
import { WidgetRenderBoundary } from "./WidgetRenderBoundary";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";
import type { WidgetRuntimeInput } from "./widget-definition";
import { getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import { buildSettledRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import { isRelativeRedlineTemplateId } from "../design-systems/vantare-endurance/relative/relative-endurance-settings";
import type { RelativeViewModel } from "../widget-types/relative/relative-view-model";

export type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";

export type WidgetVisualHostProps = {
  widget: WidgetInstanceV3;
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

function CommittedRedlineRelative(props: {
  frame: NonNullable<WidgetRuntimeInput["overlayV2Frame"]>;
  source: NonNullable<WidgetRuntimeInput["overlayV2Source"]>;
  content: Record<string, unknown>;
  render: (model: RelativeViewModel) => ReactNode;
}): ReactNode {
  // Redline opts into the Go-owned settled membership. The frontend retains
  // only visual motion; it must not apply a second membership hold.
  const model = buildSettledRelativeViewModelV2(
    props.frame,
    props.source,
    props.content as never,
  );
  return props.render(model);
}

export function WidgetVisualHost(props: WidgetVisualHostProps): ReactNode {
  const { widget, renderMode } = props;

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
  if (v2Entry && v2Failure) {
    const code = `overlay-v2-${v2Failure.code}`;
    reportDiagnostic(props, code, v2Failure.message);
    return <HostDiagnostic widget={widget} code={code} message={v2Failure.message} />;
  }
  if (v2Entry && source?.state === "error") {
    const message = source.reason ?? "Overlay V2 source error";
    reportDiagnostic(props, "overlay-v2-source-error", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-source-error" message={message} />;
  }
  if (v2Entry && !harnessMode && !frame) {
    const message = "Overlay V2 frame unavailable";
    reportDiagnostic(props, "overlay-v2-frame-missing", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-frame-missing" message={message} />;
  }
  if (v2Entry && !harnessMode && !source) {
    const message = "Overlay V2 source state unavailable";
    reportDiagnostic(props, "overlay-v2-source-missing", message);
    return <HostDiagnostic widget={widget} code="overlay-v2-source-missing" message={message} />;
  }

  const relativeRedline = widget.type === "relative" &&
    registration.systemId === "vantare-endurance" &&
    isRelativeRedlineTemplateId(settings.templateId);
  const Renderer = registration.Renderer;
  if (v2Entry && frame && source && relativeRedline) {
    return (
      <CommittedRedlineRelative
        frame={frame}
        source={source}
        content={content}
        render={(model) => (
          <WidgetRenderBoundary
            widgetId={widget.id}
            widgetType={widget.type}
            systemId={widget.visual.systemId}
            onError={(error) => reportDiagnostic(props, "renderer-exception", error.message)}
          >
            <Renderer model={model} settings={settings} renderMode={renderMode} layout={widget.layout} />
          </WidgetRenderBoundary>
        )}
      />
    );
  }

  let model;
  if (v2Entry && frame && source) {
    // V2 se construye primero: el builder V1 no se ejecuta para luego
    // sobrescribirlo. El renderer recibe únicamente la ViewModel pura.
    model = v2Entry.buildViewModelV2(
      frame,
      source,
      content,
      {
        ...props.runtime,
        relativeViewModelInstanceKey: props.runtime?.relativeViewModelInstanceKey ?? `${renderMode}:${widget.id}`,
        relativeViewModelStability: undefined,
      },
    );
  } else if (!v2Entry && definition.buildAuxiliaryViewModel) {
    model = definition.buildAuxiliaryViewModel(content as never, props.runtime ?? {}, renderMode);
  } else {
    const message = `No V2 or auxiliary authority registered for ${widget.type}`;
    reportDiagnostic(props, "widget-authority-missing", message);
    return <HostDiagnostic widget={widget} code="widget-authority-missing" message={message} />;
  }

  const staleMessage = v2Entry && frame && source?.state === "stale"
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
