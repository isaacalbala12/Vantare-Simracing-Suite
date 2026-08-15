import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileDocumentV3, SessionLayoutType, WidgetLayoutV3 } from "../core/profile-document";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewport,
  resolveLayoutViewportTransform,
  type ViewportSize,
} from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { useRateLimitedTelemetry } from "../runtime/use-rate-limited-telemetry";
import { resolveRuntimeLayout } from "../runtime/resolve-runtime-layout";
import { applyStudioCommand } from "../../hub/overlay-studio/state/studio-command";
import { InPlaceWidgetEditFrame } from "./InPlaceWidgetEditFrame";
import { useInplaceInteraction } from "./use-inplace-interaction";
import { RUNTIME_SURFACE_VISIBILITY_HZ } from "../runtime/RuntimeOverlaySurface";
import { useI18n } from "../../i18n/I18nProvider";

export type InPlaceEditOverlayProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
};

type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

export function InPlaceEditOverlay(props: InPlaceEditOverlayProps): React.ReactElement {
  const { document: initialDocument, revision: initialRevision, layoutOrigin, telemetry } = props;
  const { t } = useI18n();
  const [document, setDocument] = useState<ProfileDocumentV3>(initialDocument);
  const [revision, setRevision] = useState(initialRevision);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [requestId] = useState(() => `inplace-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [frozenSnapshot, setFrozenSnapshot] = useState<TelemetrySnapshot | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [outputViewport, setOutputViewport] = useState<ViewportSize | null>(null);
  const snapshot = useRateLimitedTelemetry(telemetry, RUNTIME_SURFACE_VISIBILITY_HZ);
  const layout = resolveRuntimeLayout(document, snapshot);
  const layoutViewport = resolveLayoutViewport(document);
  const widgets = useMemo(
    () => [...layout.widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex),
    [layout.widgets],
  );

  const interaction = useInplaceInteraction({
    widgets,
    session: layout.type as SessionLayoutType,
    scale: 1,
    layoutViewport,
    sceneRef: surfaceRef,
    selectedWidgetId,
    onCommit: (widgetId, nextLayout) => {
      const next = applyStudioCommand(document, {
        type: "widget/layout",
        session: layout.type as SessionLayoutType,
        widgetIds: [widgetId],
        patch: buildLayoutPatch(widgets.find((widget) => widget.id === widgetId)?.layout, nextLayout),
      });
      setDocument(next);
      setSaveState("saving");
      Events.Emit("overlay:edit-layout:save", {
        requestId: requestId,
        expectedRevision: revision,
        document: next,
      });
    },
    onSelect: (widgetId) => {
      setFrozenSnapshot(snapshot);
      setSelectedWidgetId(widgetId);
    },
  });

  // Durante un gesto el snapshot queda congelado (capturado al seleccionar) para
  // que los re-renders de telemetria no pisen la preview imperativa del frame.
  const snapshotOverride = interaction.isInteractionActive ? frozenSnapshot ?? undefined : undefined;

  useEffect(() => {
    const unsubSaved = Events.On("studio:profile:saved", (event: { data: unknown }) => {
      const payload = event.data as { requestId?: string; revision?: string } | null;
      if (!payload || payload.requestId !== requestId) {
        return;
      }
      if (payload.revision) {
        setRevision(payload.revision);
      }
      setSaveState("saved");
    });
    const unsubConflict = Events.On("studio:profile:conflict", (event: { data: unknown }) => {
      const payload = event.data as { requestId?: string } | null;
      if (!payload || payload.requestId !== requestId) {
        return;
      }
      setSaveState("conflict");
    });
    const unsubError = Events.On("studio:profile:error", (event: { data: unknown }) => {
      const payload = event.data as { requestId?: string } | null;
      if (!payload || payload.requestId !== requestId) {
        return;
      }
      setSaveState("error");
    });
    return () => {
      unsubSaved?.();
      unsubConflict?.();
      unsubError?.();
    };
  }, [requestId]);

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
              selected={selectedWidgetId === widget.id}
              layoutOrigin={layoutOrigin}
              telemetry={telemetry}
              snapshotOverride={snapshotOverride}
              onSelect={setSelectedWidgetId}
              onFramePointerDown={interaction.onFramePointerDown}
              onResizePointerDown={interaction.onResizePointerDown}
              onLostPointerCapture={interaction.onLostPointerCapture}
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
