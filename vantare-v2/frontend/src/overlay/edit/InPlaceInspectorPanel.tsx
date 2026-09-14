import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SessionLayoutType, WidgetInstanceV3 } from "../core/profile-document";
import type { InspectorSectionId } from "../core/widget-definition";
import type { LayoutViewport } from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { useOverlayRuntimeContext } from "../runtime/use-rate-limited-telemetry";
import type { StudioPolicy } from "../../hub/overlay-studio/access/studio-access";
import { WidgetPropertyInspectorView, type WidgetPropertySectionId } from "../../hub/overlay-studio/inspector/WidgetPropertyInspectorView";
import { LayoutSection } from "../../hub/overlay-studio/inspector/LayoutSection";
import { DesignSection } from "../../hub/overlay-studio/inspector/DesignSection";
import { ActionsSection } from "../../hub/overlay-studio/inspector/ActionsSection";
import { resolveInspectorSections } from "../../hub/overlay-studio/inspector/inspector-sections";
import { createWailsWidgetDesignClient } from "../../hub/overlay-studio/designs/widget-design-client";
import { useStudioActions, useStudioDirty, useStudioSelector } from "../../hub/overlay-studio/state/studio-store";
import { useI18n } from "../../i18n/I18nProvider";
import { useInplaceAutosave } from "./use-inplace-autosave";

export type InPlaceInspectorPanelProps = {
  widget: WidgetInstanceV3 | null;
  widgets: readonly WidgetInstanceV3[];
  session: SessionLayoutType;
  telemetry: TelemetryRateCoordinator;
  layoutViewport: LayoutViewport;
  selectWidget(widgetId: string | null): void;
  side?: "left" | "right";
  /** True mientras se arrastra o redimensiona un widget: el panel se vuelve fantasma. */
  ghosted?: boolean;
  policy: StudioPolicy;
  licenseLoading?: boolean;
  autosave: ReturnType<typeof useInplaceAutosave>;
};

type PanelMode = "docked" | "floating";

type PanelPrefs = {
  mode: PanelMode;
  floatingX: number;
  floatingY: number;
};

const PANEL_PREFS_KEY = "vantare.inplace.panel.v1";

function readPanelPrefs(): PanelPrefs {
  const fallback: PanelPrefs = { mode: "docked", floatingX: 120, floatingY: 80 };
  try {
    const raw = window.localStorage.getItem(PANEL_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    const x = Number.isFinite(parsed.floatingX) ? Number(parsed.floatingX) : fallback.floatingX;
    const y = Number.isFinite(parsed.floatingY) ? Number(parsed.floatingY) : fallback.floatingY;
    return {
      mode: parsed.mode === "floating" ? "floating" : "docked",
      floatingX: Math.max(0, Math.min(window.innerWidth - 120, x)),
      floatingY: Math.max(0, Math.min(window.innerHeight - 48, y)),
    };
  } catch {
    return fallback;
  }
}

function writePanelPrefs(prefs: PanelPrefs): void {
  try {
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage no disponible: modo volatil */
  }
}

export function InPlaceInspectorPanel(props: InPlaceInspectorPanelProps): React.ReactElement {
  const {
    widget,
    widgets,
    session,
    telemetry,
    layoutViewport,
    selectWidget,
    side = "right",
    ghosted = false,
    policy,
    licenseLoading = false,
    autosave,
  } = props;
  const { t } = useI18n();
  const canUndo = useStudioSelector((s) => (s.history?.past.length ?? 0) > 0);
  const canRedo = useStudioSelector((s) => (s.history?.future.length ?? 0) > 0);
  const dirty = useStudioDirty();
  const saveState = useStudioSelector((s) => s.saveState);
  const savedDocument = useStudioSelector((s) => s.history?.saved ?? null);
  const { discardAll } = useStudioActions();
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const disabled = licenseLoading || autosave.paused !== null;
  const [hidden, setHidden] = useState(false);
  const [prefs, setPrefs] = useState<PanelPrefs>(() => readPanelPrefs());
  const [tabState, setTabState] = useState<{ widgetId: string | null; tab: InspectorSectionId | null }>({
    widgetId: null,
    tab: null,
  });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const designClient = useMemo(() => createWailsWidgetDesignClient(), []);
  const sections = useMemo(
    () => (widget ? resolveInspectorSections(widget) : []),
    [widget],
  );

  // La pestaña por defecto es layout (lo mas usado en overlay) o la primera
  // seccion disponible; la eleccion manual muere con el widget.
  const defaultTab = useMemo<InspectorSectionId | null>(() => {
    if (sections.some((entry) => entry.id === "layout")) return "layout";
    return sections[0]?.id ?? null;
  }, [sections]);
  const widgetId = widget?.id ?? null;
  const currentTab =
    tabState.widgetId === widgetId &&
    tabState.tab !== null &&
    sections.some((entry) => entry.id === tabState.tab)
      ? tabState.tab
      : defaultTab;
  const currentSection = sections.find((entry) => entry.id === currentTab) ?? null;
  const handleTabClick = useCallback(
    (id: InspectorSectionId) => setTabState({ widgetId, tab: id }),
    [widgetId],
  );

  const setMode = useCallback(
    (mode: PanelMode) => {
      setPrefs((current) => {
        const next = { ...current, mode };
        writePanelPrefs(next);
        return next;
      });
    },
    [],
  );

  const handleHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (prefs.mode !== "floating") return;
      if ((event.target as HTMLElement).closest("button, select, input, a")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: prefs.floatingX,
        baseY: prefs.floatingY,
      };
    },
    [prefs.mode, prefs.floatingX, prefs.floatingY],
  );

  const handleHeaderPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextX = Math.max(0, Math.min(window.innerWidth - 120, drag.baseX + event.clientX - drag.startX));
      const nextY = Math.max(0, Math.min(window.innerHeight - 48, drag.baseY + event.clientY - drag.startY));
      setPrefs((current) => {
        if (current.floatingX === nextX && current.floatingY === nextY) return current;
        return { ...current, floatingX: nextX, floatingY: nextY };
      });
    },
    [],
  );

  const handleHeaderPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setPrefs((current) => {
        writePanelPrefs(current);
        return current;
      });
    },
    [],
  );

  const renderSectionBody = (sectionId: InspectorSectionId): React.ReactElement | null => {
    if (!widget) return null;
    if (sectionId === "design") {
      return (
        <DesignSection
          widget={widget}
          session={session}
          widgets={widgets}
          policy={policy}
          dispatch={autosave.dispatch}
          designClient={designClient}
        />
      );
    }
    if (sectionId === "layout") {
      return savedDocument ? (
        <LayoutSection
          widget={widget}
          session={session}
          widgets={widgets}
          savedDocument={savedDocument}
          layoutViewport={layoutViewport}
          dispatch={autosave.dispatch}
          selectWidget={selectWidget}
        />
      ) : null;
    }
    if (sectionId === "actions") {
      return savedDocument ? (
        <ActionsSection
          widget={widget}
          session={session}
          widgets={widgets}
          savedDocument={savedDocument}
          dispatch={autosave.dispatch}
          selectWidget={selectWidget}
          discardAll={discardAll}
        />
      ) : null;
    }
    return (
      <WidgetPropertyInspectorView
        sectionId={sectionId as WidgetPropertySectionId}
        widget={widget}
        session={session}
        runtimeContext={runtimeContext}
        policy={policy}
        disabled={disabled}
        dispatch={autosave.dispatch}
      />
    );
  };

  if (hidden) {
    return (
      <button
        type="button"
        data-testid="inplace-panel-edge-tab"
        className={`inplace-panel-edge-tab${side === "left" ? " inplace-panel-edge-tab--left" : ""}`}
        title={t("overlay.editMode.panel.show")}
        onClick={() => setHidden(false)}
        onPointerEnter={() => setHidden(false)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <svg
          aria-hidden="true"
          fill="none"
          focusable="false"
          height={12}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.6}
          viewBox="0 0 16 16"
          width={12}
        >
          <path d={side === "left" ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} />
        </svg>
      </button>
    );
  }

  const panelStyle: CSSProperties | undefined = prefs.mode === "floating"
    ? { left: prefs.floatingX, top: prefs.floatingY, right: "auto" }
    : undefined;

  return (
    <div
      data-testid="inplace-inspector-panel"
      data-testid-empty={widget ? undefined : "true"}
      data-widget-id={widget?.id}
      data-mode={prefs.mode}
      className={`inplace-inspector-panel${side === "left" && prefs.mode === "docked" ? " inplace-inspector-panel--left" : ""}${prefs.mode === "floating" ? " inplace-inspector-panel--floating" : ""}${ghosted ? " inplace-inspector-panel--ghost" : ""}`}
      style={panelStyle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="inplace-inspector-panel__header"
        data-draggable={prefs.mode === "floating" ? "true" : undefined}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerEnd}
        onPointerCancel={handleHeaderPointerEnd}
      >
        <span className="inplace-inspector-panel__title">
          {widget ? (widget.name?.trim() || widget.type) : t("overlay.editMode.panel.title")}
        </span>
        {widget ? (
          <>
            <span className="inplace-inspector-panel__session">{t(`studio.v3.session.${session}`)}</span>
            <button
              type="button"
              data-testid="inplace-widget-visibility"
              className="inplace-inspector-panel__eye"
              title={widget.behavior.enabled ? t("studio.inspector.hide") : t("studio.inspector.show")}
              aria-pressed={!widget.behavior.enabled}
              onClick={() =>
                autosave.dispatch({
                  type: "widget/behavior",
                  session,
                  widgetIds: [widget.id],
                  patch: { enabled: !widget.behavior.enabled },
                })
              }
            >
              <svg
                aria-hidden="true"
                fill="none"
                focusable="false"
                height={14}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.4}
                viewBox="0 0 16 16"
                width={14}
              >
                <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4Z" />
                <circle cx="8" cy="8" r="1.8" />
                {widget.behavior.enabled ? null : <path d="M3 13 13 3" />}
              </svg>
            </button>
          </>
        ) : null}
        <button
          type="button"
          data-testid="inplace-panel-mode"
          className="inplace-inspector-panel__eye"
          title={prefs.mode === "floating" ? t("overlay.editMode.panel.dock") : t("overlay.editMode.panel.float")}
          aria-pressed={prefs.mode === "floating"}
          onClick={() => setMode(prefs.mode === "floating" ? "docked" : "floating")}
        >
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height={12}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            viewBox="0 0 16 16"
            width={12}
          >
            {prefs.mode === "floating" ? (
              <path d="M3 8h10M8 3v10" />
            ) : (
              <path d="M8 3v5l2-2M8 8L6 6M4 13h8" />
            )}
          </svg>
        </button>
        <button
          type="button"
          data-testid="inplace-panel-hide"
          className="inplace-inspector-panel__eye"
          title={t("overlay.editMode.panel.hide")}
          onClick={() => setHidden(true)}
        >
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height={12}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            viewBox="0 0 16 16"
            width={12}
          >
            <path d={side === "left" ? "M6 3L3 8l3 5M11 3L8 8l3 5" : "M10 3l3 5-3 5M5 3l3 5-3 5"} />
          </svg>
        </button>
      </div>
      {widget ? (
        <div className="inplace-inspector-panel__tabs" role="tablist" aria-label={t("overlay.editMode.panel.tabsAria")}>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={section.id === currentTab}
              data-testid={`inplace-tab-${section.id}`}
              className={`inplace-inspector-panel__tab${section.id === currentTab ? " inplace-inspector-panel__tab--active" : ""}`}
              onClick={() => handleTabClick(section.id)}
            >
              {t(`studio.inspector.section.${section.id}`)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="inplace-inspector-panel__history">
        <button
          type="button"
          data-testid="inplace-undo"
          disabled={!canUndo || disabled}
          onClick={() => autosave.undo()}
        >
          {t("overlay.editMode.panel.undo")}
        </button>
        <button
          type="button"
          data-testid="inplace-redo"
          disabled={!canRedo || disabled}
          onClick={() => autosave.redo()}
        >
          {t("overlay.editMode.panel.redo")}
        </button>
        {dirty ? <span data-testid="inplace-inspector-dirty" className="inplace-inspector-panel__dirty">•</span> : null}
        {autosave.paused === "error" ? (
          <button type="button" data-testid="inplace-retry" onClick={() => autosave.retry()}>
            {t("overlay.editMode.panel.retry")}
          </button>
        ) : null}
        {autosave.paused === "conflict" ? (
          <span data-testid="inplace-conflict" className="inplace-inspector-panel__conflict">
            {t("overlay.editMode.panel.conflict")}
          </span>
        ) : null}
        {saveState === "saving" ? <span data-testid="inplace-saving">{t("overlay.editMode.panel.saving")}</span> : null}
      </div>
      {widget ? (
        <div className="inplace-inspector-panel__sections">
          {currentSection ? (
            <div data-testid={`inplace-inspector-section-${currentSection.id}`}>
              {currentSection.labelKey === "overlay.studio.inspector.sections.unsupported" ? (
                <p className="orbit-studio-ins__hint">{t("studio.inspector.unsupported")}</p>
              ) : (
                <fieldset disabled={disabled ? true : undefined}>
                  {renderSectionBody(currentSection.id)}
                </fieldset>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div data-testid="inplace-inspector-empty">{t("overlay.editMode.panel.empty")}</div>
      )}
    </div>
  );
}

export const MemoInPlaceInspectorPanel = memo(InPlaceInspectorPanel, (prev, next) => (
  prev.widget === next.widget
  && prev.widgets === next.widgets
  && prev.session === next.session
  && prev.telemetry === next.telemetry
  && prev.layoutViewport === next.layoutViewport
  && prev.selectWidget === next.selectWidget
  && prev.side === next.side
  && prev.ghosted === next.ghosted
  && prev.autosave.paused === next.autosave.paused
  && prev.policy === next.policy
  && prev.licenseLoading === next.licenseLoading
));
