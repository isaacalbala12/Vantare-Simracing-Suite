import { useMemo, type ReactNode } from "react";
import { DesignSystemResolutionError } from "./design-system-definition";
import type { WidgetInstanceV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";
import { prepareWidgetVisualSettings } from "./widget-visual-settings";
import { WidgetRenderBoundary } from "./WidgetRenderBoundary";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";
import type { WidgetRuntimeInput, WidgetViewModelBase } from "./widget-definition";
import { getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";
import { resolveMotionLevel, useReducedMotion } from "./widget-motion";
import { buildSettledRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import { isRelativeRedlineTemplateId } from "../design-systems/vantare-endurance/relative/relative-endurance-settings";
import type { RelativeViewModel } from "../widget-types/relative/relative-view-model";
import { FastestLapPresentation } from "../widget-types/fastest-lap/FastestLapPresentation";
import type { FastestLapViewModel } from "../widget-types/fastest-lap/fastest-lap-view-model";

export type { WidgetDiagnostic, WidgetDiagnosticCollector } from "./widget-diagnostics";

export type WidgetVisualHostProps = {
  widget: WidgetInstanceV3;
  renderMode: "studio" | "desktop" | "obs" | "harness";
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  runtime?: WidgetRuntimeInput;
  /** Explicit visual-authoring fixture. Never accepted by a production build. */
  authoringModel?: WidgetViewModelBase;
  /** Workshop transport may exercise transient notices on the Studio surface. */
  authoringPlayback?: boolean;
  /** Pure presentation decision resolved by the native widget policy. */
  brandVisible?: boolean;
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

type PreparedWidgetVisual =
  | {
      ok: true;
      definition: ReturnType<typeof widgetTypeRegistry.get>;
      content: Record<string, unknown>;
      registration: ReturnType<typeof prepareWidgetVisualSettings>["registration"];
      settings: Record<string, unknown>;
    }
  | { ok: false; code: string; message: string };

// La preparacion estatica (registro, parseContent, migracion, merge y
// parseSettings) depende unicamente del objeto widget; las notificaciones de
// telemetria re-renderizan sin cambiarlo, asi que se memoiza por referencia.
// Los widgets se actualizan por inmutabilidad (todo comando crea un objeto
// nuevo), lo que mantiene la invalidacion correcta en cualquier edicion.
function prepareWidgetVisual(widget: WidgetInstanceV3): PreparedWidgetVisual {
  let definition;
  try {
    definition = widgetTypeRegistry.get(widget.type);
  } catch (error) {
    return {
      ok: false,
      code: "unknown-widget-type",
      message: error instanceof Error ? error.message : "widget type not registered",
    };
  }

  let content: Record<string, unknown>;
  try {
    content = definition.parseContent(widget.content);
  } catch (error) {
    return {
      ok: false,
      code: "invalid-content",
      message: error instanceof Error ? error.message : "invalid widget content",
    };
  }

  try {
    const { registration, settings } = prepareWidgetVisualSettings(widget);
    return { ok: true, definition, content, registration, settings };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof DesignSystemResolutionError ? "unsupported-visual-pair" : "invalid-settings",
      message: error instanceof Error ? error.message : "invalid widget settings",
    };
  }
}

export function WidgetVisualHost(props: WidgetVisualHostProps): ReactNode {
  const { widget, renderMode } = props;
  // Reactivo: si el sistema activa reduced-motion con el widget montado, el
  // nivel cae a minimal en este mismo render y los motores cancelan en el
  // layout effect — sin esperar a que la telemetría empuje otro frame.
  const reducedMotion = useReducedMotion();

  const prepared = useMemo(() => prepareWidgetVisual(widget), [widget]);
  if (!prepared.ok) {
    reportDiagnostic(props, prepared.code, prepared.message);
    return <HostDiagnostic widget={widget} code={prepared.code} message={prepared.message} />;
  }
  const { definition, content, registration, settings } = prepared;

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
  const presentationSettings = props.brandVisible === undefined
    ? settings
    : { ...settings, brandVisible: props.brandVisible };
  // La política de rendimiento llega a los renderers como presupuesto de
  // motion/effects — antes solo el scheduler la obedecía.
  const performance = frame?.capabilities.performance;
  const motion = resolveMotionLevel(performance, reducedMotion);
  const effects = performance?.effects;
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
            <Renderer model={model} settings={presentationSettings} renderMode={renderMode} layout={widget.layout} motion={motion} effects={effects} />
          </WidgetRenderBoundary>
        )}
      />
    );
  }

  let model;
  if (v2Entry && frame && source) {
    // V2 es la única autoridad de telemetría; el renderer recibe únicamente
    // la ViewModel pura.
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

  const visualModel = import.meta.env.DEV && props.authoringModel?.type === widget.type
    ? props.authoringModel
    : model;
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
        {widget.type === "fastest-lap"
          ? <FastestLapPresentation key={widget.id} model={visualModel as FastestLapViewModel} renderMode={renderMode} authoringPlayback={import.meta.env.DEV && props.authoringPlayback}>
              {(noticeModel) => <Renderer model={noticeModel} settings={presentationSettings} renderMode={renderMode} layout={widget.layout} motion={motion} effects={effects} />}
            </FastestLapPresentation>
          : <Renderer model={visualModel} settings={presentationSettings} renderMode={renderMode} layout={widget.layout} motion={motion} effects={effects} />}
      </WidgetRenderBoundary>
    </>
  );
}
