import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { ProfileDocumentV3 } from "../core/profile-document";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewport,
  type ViewportSize,
} from "../core/layout-viewport";
import {
  mapWidgetFrameToResponsive,
  resolveResponsiveSceneTransform,
} from "../core/responsive-layout";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWidgetDiagnosticCollector, type WidgetDiagnostic, type WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import { resolveRuntimeLayout, selectRuntimeWidgets } from "./resolve-runtime-layout";
import { useOverlayRuntimeContext } from "./use-rate-limited-telemetry";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import { EngineerSubtitles } from "../../engineer/EngineerSubtitles";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";
import type { OverlayRuntimeContext } from "../core/overlay-runtime-context";
import {
  EMPTY_RACE_SCHEDULE_SNAPSHOT,
  type RaceScheduleStore,
} from "../core/race-schedule-store";
import {
  isStandingsRedlineWidget,
  resolveStandingsRedlineVisualBaseWidth,
} from "../widget-types/standings/standings-redline-layout";

export type RuntimeOverlaySurfaceProps = {
  document: ProfileDocumentV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  engineerPresentations?: EngineerPresentationStore;
  overlayV2Features?: readonly OverlayV2Feature[];
  raceSchedule?: RaceScheduleStore;
};

const subscribeToNothing = () => () => undefined;
const noPresentation = () => null;

export function RuntimeOverlaySurface(props: RuntimeOverlaySurfaceProps): React.ReactElement {
  const { document, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics: diagnosticsProp, engineerPresentations, overlayV2Features, raceSchedule } = props;
  const diagnostics = useMemo(() => diagnosticsProp ?? createWidgetDiagnosticCollector(), [diagnosticsProp]);
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const [contextMemory, setContextMemory] = useState<{
    observed: OverlayRuntimeContext;
    lastUseful?: OverlayRuntimeContext;
  }>(() => ({
    observed: runtimeContext,
    lastUseful: runtimeContext.sessionType ? runtimeContext : undefined,
  }));
  if (contextMemory.observed !== runtimeContext) {
    setContextMemory({
      observed: runtimeContext,
      lastUseful: runtimeContext.sessionType ? runtimeContext : contextMemory.lastUseful,
    });
  }
  const layoutContext = runtimeContext.sessionType
    ? runtimeContext
    : contextMemory.lastUseful ?? runtimeContext;
  const authorityUnavailable = telemetry.getOverlayFailure() !== undefined ||
    telemetry.getOverlayFrame() === undefined ||
    telemetry.getOverlaySource() === undefined ||
    runtimeContext.sourceState === "error" ||
    runtimeContext.sourceState === "stale";
  const layout = resolveRuntimeLayout(document, layoutContext);
  // En ausencia/fallo de V2 los frames deben seguir montados: el host es quien
  // convierte ese estado en un diagnostico visible. Filtrar aqui ocultaria el
  // unico mensaje accionable para Desktop y OBS.
  const widgets = selectRuntimeWidgets(layout, layoutContext, {
    bypassVisibility: authorityUnavailable,
  });
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
  const raceScheduleSnapshot = useSyncExternalStore(
    raceSchedule?.subscribe ?? subscribeToNothing,
    raceSchedule?.getSnapshot ?? (() => EMPTY_RACE_SCHEDULE_SNAPSHOT),
    () => EMPTY_RACE_SCHEDULE_SNAPSHOT,
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
    ? resolveResponsiveSceneTransform(layoutViewport, outputViewport)
    : null;

  const origin = layoutOrigin ?? { x: 0, y: 0 };
  const effectiveWidgets = widgets.map((widget) => {
    const localLayout = {
      ...widget.layout,
      x: widget.layout.x - origin.x,
      y: widget.layout.y - origin.y,
    };
    return {
      ...widget,
      layout: localLayout,
      visualBaseWidth: isStandingsRedlineWidget(widget)
        ? resolveStandingsRedlineVisualBaseWidth(widget, localLayout)
        : undefined,
    };
  });
  const responsiveWidgets = transform
    ? effectiveWidgets.map((widget) => {
        const responsiveLayout = mapWidgetFrameToResponsive(widget.layout, transform);
        return {
          ...widget,
          layout: { ...widget.layout, ...responsiveLayout },
        };
      })
    : effectiveWidgets;

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
        width: transform.layoutWidth,
        height: transform.layoutHeight,
        overflow: "hidden",
        background: "transparent",
        transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
        transformOrigin: "top left",
      }
    : undefined;

  return (
    <div ref={surfaceRef} data-testid="runtime-overlay-surface" data-render-mode={renderMode} style={surfaceStyle}>
      {transform && sceneStyle ? (
        <div
          data-testid="runtime-overlay-scene"
          data-layout-width={transform.layoutWidth}
          data-layout-height={transform.layoutHeight}
          data-scale={transform.scale}
          data-offset-x={transform.offsetX}
          data-offset-y={transform.offsetY}
          style={sceneStyle}
        >
          {responsiveWidgets.map((widget) => (
            <RuntimeWidgetFrame
              key={widget.id}
              widget={widget}
              profileId={document.id}
              telemetry={telemetry}
              renderMode={renderMode}
              visualBaseWidth={widget.visualBaseWidth}
              onDiagnostic={onDiagnostic}
              diagnostics={diagnostics}
              engineerPresentation={engineerPresentation}
              engineerSubtitlesEnabled={subtitlesEnabled}
              overlayV2Features={overlayV2Features}
              raceSchedule={raceScheduleSnapshot}
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
