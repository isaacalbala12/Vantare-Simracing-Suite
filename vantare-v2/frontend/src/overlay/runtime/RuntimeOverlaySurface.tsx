import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import type { ProfileDocumentV3, SessionLayoutType } from "../core/profile-document";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewport,
  resolveLayoutViewportTransform,
  type ViewportSize,
} from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWidgetDiagnosticCollector, type WidgetDiagnostic, type WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import { mapTelemetrySessionToLayoutType, resolveRuntimeLayout, selectRuntimeWidgets } from "./resolve-runtime-layout";
import { useRateLimitedTelemetry } from "./use-rate-limited-telemetry";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import { EngineerSubtitles } from "../../engineer/EngineerSubtitles";
import { useCanvasInteraction } from "../../hub/overlay-studio/canvas/useCanvasInteraction";
import { CanvasGuides } from "../../hub/overlay-studio/canvas/CanvasGuides";
import { applyStudioCommand, type StudioCommand } from "../../hub/overlay-studio/state/studio-command";

export const RUNTIME_SURFACE_VISIBILITY_HZ = 15;

export type RuntimeOverlaySurfaceProps = {
  document: ProfileDocumentV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  engineerPresentations?: EngineerPresentationStore;
  editing?: {
    onDocumentChange(document: ProfileDocumentV3): void;
  };
};

type RuntimeEditSceneProps = {
  document: ProfileDocumentV3;
  session: SessionLayoutType;
  widgets: ReturnType<typeof selectRuntimeWidgets>;
  scale: number;
  sceneStyle: CSSProperties;
  telemetry: TelemetryRateCoordinator;
  layoutOrigin?: { x: number; y: number };
  onDocumentChange(document: ProfileDocumentV3): void;
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics: WidgetDiagnosticCollector;
  engineerPresentation: ReturnType<EngineerPresentationStore["getSnapshot"]>;
  engineerSubtitlesEnabled: boolean;
};

function RuntimeEditScene(props: RuntimeEditSceneProps): React.ReactElement {
  const {
    document,
    session,
    widgets,
    scale,
    sceneStyle,
    telemetry,
    layoutOrigin,
    onDocumentChange,
    onDiagnostic,
    diagnostics,
    engineerPresentation,
    engineerSubtitlesEnabled,
  } = props;
  const sceneRef = useRef<HTMLDivElement>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const dispatch = (command: StudioCommand) => onDocumentChange(applyStudioCommand(document, command));
  const interaction = useCanvasInteraction({
    widgets,
    session,
    scale,
    layoutViewport: resolveLayoutViewport(document),
    sceneRef: sceneRef as RefObject<HTMLElement | null>,
    selectedWidgetId,
    dispatch,
    selectWidget: setSelectedWidgetId,
  });

  return (
    <div
      ref={sceneRef}
      data-testid="runtime-overlay-scene"
      data-layout-width={resolveLayoutViewport(document).width}
      data-layout-height={resolveLayoutViewport(document).height}
      data-scale={scale}
      style={sceneStyle}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setSelectedWidgetId(null);
      }}
    >
      <CanvasGuides guides={interaction.guides} />
      {widgets.map((widget) => (
        <RuntimeWidgetFrame
          key={widget.id}
          widget={widget}
          telemetry={telemetry}
          renderMode="desktop"
          layoutOrigin={layoutOrigin}
          onDiagnostic={onDiagnostic}
          diagnostics={diagnostics}
          engineerPresentation={engineerPresentation}
          engineerSubtitlesEnabled={engineerSubtitlesEnabled}
          edit={{
            selected: selectedWidgetId === widget.id,
            previewActive: interaction.isWidgetPreviewActive(widget.id),
            onSelect: setSelectedWidgetId,
            onFramePointerDown: interaction.onFramePointerDown,
            onResizePointerDown: interaction.onResizePointerDown,
            onLostPointerCapture: interaction.onLostPointerCapture,
          }}
        />
      ))}
    </div>
  );
}

const subscribeToNothing = () => () => undefined;
const noPresentation = () => null;

export function RuntimeOverlaySurface(props: RuntimeOverlaySurfaceProps): React.ReactElement {
  const { document, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics: diagnosticsProp, engineerPresentations, editing } = props;
  const diagnostics = useMemo(() => diagnosticsProp ?? createWidgetDiagnosticCollector(), [diagnosticsProp]);
  const snapshot = useRateLimitedTelemetry(telemetry, RUNTIME_SURFACE_VISIBILITY_HZ);
  const layout = resolveRuntimeLayout(document, snapshot);
  const widgets = selectRuntimeWidgets(layout, snapshot);
  const requestedSession = mapTelemetrySessionToLayoutType(snapshot.session.type);
  const activeSession = document.layouts[requestedSession] ? requestedSession : "general";
  const editWidgets = [...(document.layouts[activeSession]?.widgets ?? [])]
    .filter((widget) => widget.behavior.enabled)
    .sort((left, right) => left.layout.zIndex - right.layout.zIndex);
  const layoutViewport = resolveLayoutViewport(document);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [outputViewport, setOutputViewport] = useState<ViewportSize | null>(null);
  const preservedDiagnosticSent = useRef(false);
  const engineerPresentation = useSyncExternalStore(
    engineerPresentations?.subscribe ?? subscribeToNothing,
    engineerPresentations?.getSnapshot ?? noPresentation,
    noPresentation,
  );
  const subtitlesEnabled = useSyncExternalStore(
    engineerPresentations?.subscribe ?? subscribeToNothing,
    engineerPresentations?.getSubtitlesEnabled ?? (() => false),
    () => false,
  );

  useEffect(() => {
    const preserved = layout.preservedWidgets ?? [];
    if (preserved.length === 0 || preservedDiagnosticSent.current) {
      return;
    }
    preservedDiagnosticSent.current = true;
    const diagnostic = {
      code: "preserved-widgets-skipped",
      surface: renderMode,
      message: `Skipping ${preserved.length} preserved legacy widget(s) at runtime`,
      occurredAt: new Date(0).toISOString(),
    } satisfies WidgetDiagnostic;
    diagnostics.report(diagnostic);
    onDiagnostic?.(diagnostic);
  }, [diagnostics, layout.preservedWidgets, onDiagnostic, renderMode]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const updateViewport = (width: number, height: number) => {
      const isValid =
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0 &&
        width <= MAX_LAYOUT_VIEWPORT_DIMENSION &&
        height <= MAX_LAYOUT_VIEWPORT_DIMENSION;
      const next = isValid ? { width, height } : null;
      setOutputViewport((current) => {
        if (current === null && next === null) return current;
        if (current && next && current.width === next.width && current.height === next.height) {
          return current;
        }
        return next;
      });
    };
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === surface) ?? entries[0];
        if (!entry) return;
        const contentBoxSize = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize as unknown as ResizeObserverSize | undefined;
        updateViewport(
          contentBoxSize?.inlineSize ?? entry.contentRect.width,
          contentBoxSize?.blockSize ?? entry.contentRect.height,
        );
      });
      observer.observe(surface);
      return () => observer.disconnect();
    }

    const measureClientBox = () => updateViewport(surface.clientWidth, surface.clientHeight);
    measureClientBox();
    window.addEventListener("resize", measureClientBox);
    return () => window.removeEventListener("resize", measureClientBox);
  }, []);

  const transform = outputViewport
    ? resolveLayoutViewportTransform(layoutViewport, outputViewport)
    : null;

  const surfaceStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "transparent",
  };

  const sceneStyle: CSSProperties | undefined = transform
    ? {
        position: "absolute",
        left: 0,
        top: 0,
        width: layoutViewport.width,
        height: layoutViewport.height,
        overflow: "hidden",
        background: "transparent",
        transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
        transformOrigin: "top left",
      }
    : undefined;

  return (
    <div ref={surfaceRef} data-testid="runtime-overlay-surface" data-render-mode={renderMode} style={surfaceStyle}>
      {transform && sceneStyle && editing && renderMode === "desktop" ? (
        <RuntimeEditScene
          document={document}
          session={activeSession}
          widgets={editWidgets}
          scale={transform.scale}
          sceneStyle={sceneStyle}
          telemetry={telemetry}
          layoutOrigin={layoutOrigin}
          onDocumentChange={editing.onDocumentChange}
          onDiagnostic={onDiagnostic}
          diagnostics={diagnostics}
          engineerPresentation={engineerPresentation}
          engineerSubtitlesEnabled={subtitlesEnabled}
        />
      ) : transform && sceneStyle ? (
        <div
          data-testid="runtime-overlay-scene"
          data-layout-width={layoutViewport.width}
          data-layout-height={layoutViewport.height}
          data-scale={transform.scale}
          data-offset-x={transform.offsetX}
          data-offset-y={transform.offsetY}
          style={sceneStyle}
        >
          {widgets.map((widget) => (
            <RuntimeWidgetFrame
              key={widget.id}
              widget={widget}
              telemetry={telemetry}
              renderMode={renderMode}
              layoutOrigin={layoutOrigin}
              onDiagnostic={onDiagnostic}
              diagnostics={diagnostics}
              engineerPresentation={engineerPresentation}
              engineerSubtitlesEnabled={subtitlesEnabled}
            />
          ))}
          {subtitlesEnabled && engineerPresentation
            ? <EngineerSubtitles presentation={engineerPresentation} />
            : null}
        </div>
      ) : null}
    </div>
  );
}
