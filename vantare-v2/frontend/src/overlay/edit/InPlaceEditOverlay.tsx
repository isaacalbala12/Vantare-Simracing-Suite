import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ProfileDocumentV3, SessionLayoutType, WidgetLayoutV3 } from "../core/profile-document";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewport,
  resolveLayoutViewportTransform,
  type ViewportSize,
} from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { useOverlayRuntimeContext } from "../runtime/use-rate-limited-telemetry";
import { resolveRuntimeLayout } from "../runtime/resolve-runtime-layout";
import { StudioProvider, useStudioDocument } from "../../hub/overlay-studio/state/studio-store";
import type { AccessContext } from "../../lib/access-policy";
import { InPlaceWidgetEditFrame } from "./InPlaceWidgetEditFrame";
import { MemoInPlaceInspectorPanel } from "./InPlaceInspectorPanel";
import { useInplaceInteraction } from "./use-inplace-interaction";
import { useInplaceAutosave } from "./use-inplace-autosave";
import { createInPlaceProfileClient } from "./inplace-profile-client";
import { createWailsStudioEventTransport } from "../../hub/overlay-studio/state/studio-profile-client";
import { useI18n } from "../../i18n/I18nProvider";
import "./inplace-edit.css";

export type InPlaceEditOverlayProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  access?: AccessContext;
  licenseLoading?: boolean;
};

export function InPlaceEditOverlay(props: InPlaceEditOverlayProps): React.ReactElement {
  const { document, revision, layoutOrigin, telemetry, access, licenseLoading } = props;
  const transport = useMemo(() => createWailsStudioEventTransport(), []);
  const client = useMemo(
    () => createInPlaceProfileClient({ document, revision, transport }),
    [document, revision, transport],
  );

  return (
    <StudioProvider
      client={client}
      initialFile="in-place"
      recoveryStorage={null}
      access={access}
    >
      <InPlaceEditOverlayContent
        document={document}
        layoutOrigin={layoutOrigin}
        telemetry={telemetry}
        access={access}
        licenseLoading={licenseLoading ?? false}
      />
    </StudioProvider>
  );
}

function InPlaceEditOverlayContent(props: Omit<InPlaceEditOverlayProps, "revision">): React.ReactElement {
  const { document, layoutOrigin, telemetry, access, licenseLoading } = props;
  const { t } = useI18n();
  const {
    document: storeDocument,
    dispatch,
    selectWidget,
    save,
    undo,
    redo,
    saveState,
  } = useStudioDocument();
  const [selectedWidgetIdLocal, setSelectedWidgetIdLocal] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [outputViewport, setOutputViewport] = useState<ViewportSize | null>(null);
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const layout = resolveRuntimeLayout(storeDocument ?? document, runtimeContext);
  const layoutViewport = resolveLayoutViewport(storeDocument ?? document);
  const widgets = useMemo(
    () => [...layout.widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex),
    [layout.widgets],
  );

  const editingSession = layout.type as SessionLayoutType;

  const autosave = useInplaceAutosave({
    dispatch,
    undo,
    redo,
    save,
    interactionActive: false,
  });

  const interaction = useInplaceInteraction({
    widgets,
    session: editingSession,
    scale: 1,
    layoutViewport,
    sceneRef: surfaceRef,
    selectedWidgetId: selectedWidgetIdLocal,
    onCommit: (widgetId, nextLayout) => {
      autosave.dispatch({
        type: "widget/layout",
        session: editingSession,
        widgetIds: [widgetId],
        patch: buildLayoutPatch(
          widgets.find((widget) => widget.id === widgetId)?.layout,
          nextLayout,
        ),
      });
    },
    onSelect: (widgetId) => {
      setSelectedWidgetIdLocal(widgetId);
      selectWidget(widgetId);
    },
  });

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const updateViewport = (width: number, height: number) => {
      const isValid =
        Number.isFinite(width)
        && Number.isFinite(height)
        && width > 0
        && height > 0
        && width <= MAX_LAYOUT_VIEWPORT_DIMENSION
        && height <= MAX_LAYOUT_VIEWPORT_DIMENSION;
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

  const selectedWidget = selectedWidgetIdLocal
    ? widgets.find((widget) => widget.id === selectedWidgetIdLocal) ?? null
    : null;

  return (
    <div ref={surfaceRef} data-testid="inplace-edit-overlay" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "transparent" }}>
      {transform && sceneStyle ? (
        <div
          data-testid="inplace-edit-scene"
          data-layout-width={layoutViewport.width}
          data-layout-height={layoutViewport.height}
          data-scale={transform.scale}
          style={sceneStyle}
        >
          {widgets.map((widget) => (
            <InPlaceWidgetEditFrame
              key={widget.id}
              widget={widget}
              layout={widget.layout}
              previewActive={interaction.isWidgetPreviewActive(widget.id)}
              selected={selectedWidgetIdLocal === widget.id}
              layoutOrigin={layoutOrigin}
              telemetry={telemetry}
              onSelect={setSelectedWidgetIdLocal}
              onFramePointerDown={interaction.onFramePointerDown}
              onResizePointerDown={interaction.onResizePointerDown}
              onLostPointerCapture={interaction.onLostPointerCapture}
            />
          ))}
          {interaction.guides.map((guide, index) => (
            <div
              key={`${guide.orientation}-${guide.position}-${guide.kind}-${index}`}
              data-testid={`inplace-edit-guide-${guide.orientation}`}
              data-guide-kind={guide.kind}
              style={{
                position: "absolute",
                background: "rgba(56, 189, 248, 0.85)",
                pointerEvents: "none",
                zIndex: 0,
                ...(guide.orientation === "vertical"
                  ? { left: guide.position, top: 0, bottom: 0, width: 1 }
                  : { top: guide.position, left: 0, right: 0, height: 1 }),
              }}
            />
          ))}
        </div>
      ) : null}
      <div
        data-testid="edit-mode-chip"
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 5000,
          padding: "4px 10px",
          borderRadius: 4,
          background: "rgba(0, 0, 0, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "#e63946",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.08em",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        {t("overlay.editMode.chip")}
      </div>
      <div
        data-testid="edit-mode-hint"
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          zIndex: 5000,
          color: "rgba(255, 255, 255, 0.35)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        {t("overlay.editMode.hint")}
      </div>
      {saveState === "conflict" || saveState === "error" ? (
        <div
          data-testid="edit-mode-save-error"
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 5000,
            padding: "4px 8px",
            borderRadius: 4,
            background: "rgba(127, 29, 29, 0.9)",
            color: "#fecaca",
            fontSize: 10,
            fontFamily: "ui-monospace, monospace",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {t("overlay.editMode.saveError")}
        </div>
      ) : null}
      <MemoInPlaceInspectorPanel
        widget={selectedWidget}
        session={editingSession}
        telemetry={telemetry}
        access={access}
        licenseLoading={licenseLoading}
        autosave={autosave}
      />
    </div>
  );
}

function buildLayoutPatch(start: WidgetLayoutV3 | undefined, next: WidgetLayoutV3): Partial<WidgetLayoutV3> {
  const patch: Partial<WidgetLayoutV3> = {};
  if (!start) {
    return next;
  }
  if (start.x !== next.x) patch.x = next.x;
  if (start.y !== next.y) patch.y = next.y;
  if (start.w !== next.w) patch.w = next.w;
  if (start.h !== next.h) patch.h = next.h;
  return patch;
}
