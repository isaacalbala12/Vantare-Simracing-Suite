import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ProfileDocumentV3, SessionLayoutType, WidgetLayoutV3, WidgetType } from "../core/profile-document";
import { useSyncExternalStore } from "react";
import { Events } from "@wailsio/runtime";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewport,
  resolveLayoutViewportTransform,
  type ViewportSize,
} from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { useOverlayRuntimeContext } from "../runtime/use-rate-limited-telemetry";
import { resolveRuntimeLayout } from "../runtime/resolve-runtime-layout";
import { StudioProvider, useStudioActions, useStudioSelector } from "../../hub/overlay-studio/state/studio-store";
import { FREE_ACCESS, type AccessContext } from "../../lib/access-policy";
import { InPlaceWidgetEditFrame } from "./InPlaceWidgetEditFrame";
import { MemoInPlaceInspectorPanel } from "./InPlaceInspectorPanel";
import { useInplaceInteraction } from "./use-inplace-interaction";
import { useInplaceAutosave } from "./use-inplace-autosave";
import { createInPlaceProfileClient } from "./inplace-profile-client";
import { createWailsStudioEventTransport } from "../../hub/overlay-studio/state/studio-profile-client";
import { useI18n } from "../../i18n/I18nProvider";
import { EMPTY_RACE_SCHEDULE_SNAPSHOT, type RaceScheduleStore } from "../core/race-schedule-store";
import { getStudioHotkey, isEditableTarget } from "../../hub/overlay-studio/state/studio-hotkeys";
import {
  buildWidgetMoveCommand,
  executeWidgetAction,
  findWidgetsAtPoint,
  mapHotkeyToWidgetAction,
} from "../../hub/overlay-studio/canvas/widget-actions";
import { clientToLogical } from "../../hub/overlay-studio/canvas/canvas-geometry";
import {
  WidgetContextMenu,
  type WidgetContextMenuState,
} from "../../hub/overlay-studio/canvas/WidgetContextMenu";
import { StudioConfirmProvider } from "../../hub/overlay-studio/components/StudioConfirmProvider";
import { useDeleteWidgetConfirm } from "../../hub/overlay-studio/components/studio-confirm";
import { AddWidgetDialog } from "../../hub/overlay-studio/catalog/AddWidgetDialog";
import { buildAddWidgetCommand } from "../../hub/overlay-studio/catalog/studio-catalog";
import { resolveSessionLayout } from "../../hub/overlay-studio/state/session-layouts";
import { widgetTypeRegistry } from "../core/widget-registry";
import "../../styles/orbit-kit.css";
import "../../styles/orbit-studio.css";
import "./inplace-edit.css";

const SESSION_LAYOUT_OPTIONS: readonly SessionLayoutType[] = [
  "general",
  "practice",
  "qualifying",
  "race",
  "endurance",
];

export type InPlaceEditOverlayProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  access?: AccessContext;
  licenseLoading?: boolean;
  raceSchedule?: RaceScheduleStore;
};

export function InPlaceEditOverlay(props: InPlaceEditOverlayProps): React.ReactElement {
  const { document, revision, layoutOrigin, telemetry, access, licenseLoading, raceSchedule } = props;
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
      <StudioConfirmProvider>
        <InPlaceEditOverlayContent
          document={document}
          layoutOrigin={layoutOrigin}
          telemetry={telemetry}
          access={access}
          licenseLoading={licenseLoading ?? false}
          raceSchedule={raceSchedule}
        />
      </StudioConfirmProvider>
    </StudioProvider>
  );
}

function InPlaceEditOverlayContent(props: Omit<InPlaceEditOverlayProps, "revision">): React.ReactElement {
  const { document, layoutOrigin, telemetry, access, licenseLoading, raceSchedule } = props;
  const { t } = useI18n();
  const storeDocument = useStudioSelector((s) => s.history?.present ?? null);
  const savedDocument = useStudioSelector((s) => s.history?.saved ?? null);
  const saveState = useStudioSelector((s) => s.saveState);
  const {
    dispatch,
    selectWidget,
    save,
    undo,
    redo,
  } = useStudioActions();
  const [selectedWidgetIdLocal, setSelectedWidgetIdLocal] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<WidgetContextMenuState | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [outputViewport, setOutputViewport] = useState<ViewportSize | null>(null);
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const raceScheduleSnapshot = useSyncExternalStore(
    raceSchedule?.subscribe ?? (() => () => undefined),
    raceSchedule?.getSnapshot ?? (() => EMPTY_RACE_SCHEDULE_SNAPSHOT),
    () => EMPTY_RACE_SCHEDULE_SNAPSHOT,
  );
  const layout = resolveRuntimeLayout(storeDocument ?? document, runtimeContext);
  const layoutViewport = resolveLayoutViewport(storeDocument ?? document);
  const [sessionOverride, setSessionOverride] = useState<SessionLayoutType | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Sin override se edita la sesion que el runtime muestra ahora mismo; con
  // override se previsualiza `resolveSessionLayout` (clon de general cuando la
  // sesion aun no existe) y el primer comando la materializa, igual que Studio.
  const editingLayout = useMemo(
    () => (sessionOverride ? resolveSessionLayout(storeDocument ?? document, sessionOverride) : layout),
    [sessionOverride, storeDocument, document, layout],
  );
  const widgets = useMemo(
    () => [...editingLayout.widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex),
    [editingLayout.widgets],
  );

  const editingSession = sessionOverride ?? (layout.type as SessionLayoutType);

  const handleSelect = useCallback(
    (widgetId: string | null) => {
      setSelectedWidgetIdLocal(widgetId);
      selectWidget(widgetId);
    },
    [selectWidget],
  );

  const handleSessionChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as SessionLayoutType;
      setSessionOverride(next === layout.type ? null : next);
      setContextMenu(null);
      handleSelect(null);
    },
    [layout.type, handleSelect],
  );

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
    onSelect: handleSelect,
  });

  const autosave = useInplaceAutosave({
    dispatch,
    undo,
    redo,
    save,
    interactionActive: interaction.isInteractionActive,
  });

  const autosaveDispatch = autosave.dispatch;

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      const command = buildAddWidgetCommand({
        session: editingSession,
        type,
        widgets,
        definition: widgetTypeRegistry.get(type),
        layoutViewport,
      });
      autosaveDispatch(command);
      if (command.type === "widget/add") {
        handleSelect(command.widget.id);
      }
      setAddDialogOpen(false);
    },
    [editingSession, widgets, layoutViewport, autosaveDispatch, handleSelect],
  );

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

  // El panel salta a la izquierda cuando el widget seleccionado ocupa la mitad
  // derecha del overlay: asi nunca tapa lo que se esta editando.
  const panelSide: "left" | "right" =
    selectedWidget && transform && outputViewport
      ? transform.offsetX + (selectedWidget.layout.x + selectedWidget.layout.w / 2) * transform.scale >
        outputViewport.width / 2
        ? "left"
        : "right"
      : "right";

  const deleteConfirm = useDeleteWidgetConfirm();
  const confirmDelete = useCallback((message: string) => window.confirm(message), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const autosaveUndo = autosave.undo;
  const autosaveRedo = autosave.redo;

  const handleSceneContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!savedDocument || !transform) {
        return;
      }
      const rect = sceneRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      event.preventDefault();
      const logical = clientToLogical(
        { x: event.clientX, y: event.clientY },
        rect,
        transform.scale,
      );
      const hits = findWidgetsAtPoint(widgets, logical);
      if (hits.length === 0) {
        setContextMenu(null);
        return;
      }
      const target = hits[0];
      handleSelect(target.id);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        widgetId: target.id,
        layerWidgetIds: hits.map((widget) => widget.id),
      });
    },
    [handleSelect, savedDocument, transform, widgets],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (interaction.isInteractionActive || contextMenu) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (widgets.length === 0) {
          return;
        }
        event.preventDefault();
        const currentIndex = widgets.findIndex((widget) => widget.id === selectedWidgetIdLocal);
        const step = event.shiftKey ? -1 : 1;
        const nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + step + widgets.length) % widgets.length;
        handleSelect(widgets[nextIndex].id);
        return;
      }

      const hotkey = getStudioHotkey(event);
      if (!hotkey) {
        return;
      }
      if (hotkey === "save") {
        event.preventDefault();
        void save();
        return;
      }
      if (hotkey === "undo") {
        event.preventDefault();
        autosaveUndo();
        return;
      }
      if (hotkey === "redo") {
        event.preventDefault();
        autosaveRedo();
        return;
      }
      if (hotkey === "escape") {
        handleSelect(null);
        return;
      }
      if (!selectedWidgetIdLocal || !savedDocument) {
        return;
      }

      const mapped = mapHotkeyToWidgetAction(hotkey);
      if (mapped === "keyboard-move") {
        if (
          hotkey !== "move-up" &&
          hotkey !== "move-down" &&
          hotkey !== "move-left" &&
          hotkey !== "move-right"
        ) {
          return;
        }
        const command = buildWidgetMoveCommand({
          session: editingSession,
          widgetIds: [selectedWidgetIdLocal],
          hotkey,
          shiftKey: event.shiftKey,
          widgets,
        });
        if (command) {
          event.preventDefault();
          autosaveDispatch(command);
        }
        return;
      }
      if (!mapped) {
        return;
      }

      event.preventDefault();
      executeWidgetAction({
        actionId: mapped,
        session: editingSession,
        widgetIds: [selectedWidgetIdLocal],
        widgets,
        savedDocument,
        layoutViewport,
        dispatch: autosaveDispatch,
        selectWidget: handleSelect,
        confirmDelete,
        requestDeleteConfirm: deleteConfirm?.request,
        deleteMessage: t("studio.v3.widgetActions.deleteConfirm"),
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    autosaveDispatch,
    autosaveRedo,
    autosaveUndo,
    confirmDelete,
    contextMenu,
    deleteConfirm?.request,
    editingSession,
    handleSelect,
    interaction.isInteractionActive,
    layoutViewport,
    save,
    savedDocument,
    selectedWidgetIdLocal,
    t,
    widgets,
  ]);

  return (
    <div
      ref={surfaceRef}
      data-testid="inplace-edit-overlay"
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "transparent" }}
      onPointerDown={() => {
        if (!interaction.isInteractionActive) {
          handleSelect(null);
          setContextMenu(null);
        }
      }}
    >
      {transform && sceneStyle ? (
        <div
          ref={sceneRef}
          data-testid="inplace-edit-scene"
          data-layout-width={layoutViewport.width}
          data-layout-height={layoutViewport.height}
          data-scale={transform.scale}
          style={sceneStyle}
          onContextMenu={handleSceneContextMenu}
        >
          {widgets.map((widget) => (
            <InPlaceWidgetEditFrame
              key={widget.id}
              widget={widget}
              profileId={(storeDocument ?? document).id}
              layout={widget.layout}
              previewActive={interaction.isWidgetPreviewActive(widget.id)}
              selected={selectedWidgetIdLocal === widget.id}
              layoutOrigin={layoutOrigin}
              telemetry={telemetry}
              raceSchedule={raceScheduleSnapshot}
              onSelect={handleSelect}
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
        className="inplace-toolbar"
        data-testid="edit-mode-toolbar"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="inplace-toolbar__chip" data-testid="edit-mode-chip">
          <span className="inplace-toolbar__dot" />
          {t("overlay.editMode.chip")}
        </span>
        <span className="inplace-toolbar__divider" />
        <select
          aria-label={t("overlay.editMode.sessionAria")}
          data-testid="edit-mode-session"
          className="inplace-toolbar__select"
          value={editingSession}
          onChange={handleSessionChange}
        >
          {SESSION_LAYOUT_OPTIONS.map((session) => (
            <option key={session} value={session}>
              {t(`studio.v3.session.${session}`)}
            </option>
          ))}
        </select>
        <span className="inplace-toolbar__divider" />
        <button
          type="button"
          className="inplace-toolbar__btn"
          data-testid="edit-mode-add"
          title={t("overlay.editMode.add")}
          onClick={() => setAddDialogOpen(true)}
        >
          {t("overlay.editMode.add")}
        </button>
        <button
          type="button"
          className="inplace-toolbar__btn inplace-toolbar__btn--accent"
          data-testid="edit-mode-done"
          onClick={() => Events.Emit("overlay:toggle-edit-mode")}
        >
          {t("overlay.editMode.done")}
        </button>
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
        widgets={widgets}
        session={editingSession}
        telemetry={telemetry}
        layoutViewport={layoutViewport}
        selectWidget={handleSelect}
        side={panelSide}
        ghosted={interaction.isInteractionActive}
        access={access}
        licenseLoading={licenseLoading}
        autosave={autosave}
      />
      {savedDocument ? (
        <WidgetContextMenu
          menu={contextMenu}
          session={editingSession}
          widgets={widgets}
          savedDocument={savedDocument}
          layoutViewport={layoutViewport}
          dispatch={autosave.dispatch}
          selectWidget={handleSelect}
          confirmDelete={confirmDelete}
          onClose={closeContextMenu}
        />
      ) : null}
      <AddWidgetDialog
        access={access ?? FREE_ACCESS}
        onAdd={handleAddWidget}
        onClose={() => setAddDialogOpen(false)}
        open={addDialogOpen}
        unavailableTypes={widgets.some((widget) => widget.type === "delta") ? ["delta"] : []}
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
