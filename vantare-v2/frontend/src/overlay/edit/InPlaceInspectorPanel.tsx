import { memo, useState } from "react";
import type { SessionLayoutType, WidgetInstanceV3 } from "../core/profile-document";
import type { LayoutViewport } from "../core/layout-viewport";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { useOverlayRuntimeContext } from "../runtime/use-rate-limited-telemetry";
import type { AccessContext } from "../../lib/access-policy";
import { WidgetPropertyInspectorView, type WidgetPropertySectionId } from "../../hub/overlay-studio/inspector/WidgetPropertyInspectorView";
import { LayoutSection } from "../../hub/overlay-studio/inspector/LayoutSection";
import { useStudioDocument } from "../../hub/overlay-studio/state/studio-store";
import { useI18n } from "../../i18n/I18nProvider";
import { useInplaceAutosave } from "./use-inplace-autosave";

const PANEL_SECTIONS: readonly WidgetPropertySectionId[] = ["appearance", "content", "behavior"];

export type InPlaceInspectorPanelProps = {
  widget: WidgetInstanceV3 | null;
  widgets: readonly WidgetInstanceV3[];
  session: SessionLayoutType;
  telemetry: TelemetryRateCoordinator;
  layoutViewport: LayoutViewport;
  selectWidget(widgetId: string | null): void;
  side?: "left" | "right";
  access?: AccessContext;
  licenseLoading?: boolean;
  autosave: ReturnType<typeof useInplaceAutosave>;
};

export function InPlaceInspectorPanel(props: InPlaceInspectorPanelProps): React.ReactElement {
  const {
    widget,
    widgets,
    session,
    telemetry,
    layoutViewport,
    selectWidget,
    side = "right",
    access,
    licenseLoading = false,
    autosave,
  } = props;
  const { t } = useI18n();
  const { canUndo, canRedo, dirty, saveState, savedDocument } = useStudioDocument();
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const disabled = licenseLoading || autosave.paused !== null;
  const [collapsed, setCollapsed] = useState(false);

  if (!widget) {
    return (
      <div
        data-testid="inplace-inspector-panel"
        data-testid-empty="true"
        className="inplace-inspector-panel"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div data-testid="inplace-inspector-empty">{t("overlay.editMode.panel.empty")}</div>
      </div>
    );
  }

  return (
    <div
      data-testid="inplace-inspector-panel"
      className={`inplace-inspector-panel${side === "left" ? " inplace-inspector-panel--left" : ""}${collapsed ? " inplace-inspector-panel--collapsed" : ""}`}
      data-widget-id={widget.id}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="inplace-inspector-panel__header">
        <button
          type="button"
          data-testid="inplace-panel-collapse"
          className="inplace-inspector-panel__eye"
          aria-expanded={!collapsed}
          title={collapsed ? t("overlay.editMode.panel.expand") : t("overlay.editMode.panel.collapse")}
          onClick={() => setCollapsed((current) => !current)}
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
            <path d={collapsed ? "M5 3l6 5-6 5" : "M3 5l5 6 5-6"} />
          </svg>
        </button>
        <span className="inplace-inspector-panel__title">
          {widget.name?.trim() || widget.type}
        </span>
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
      </div>
      {collapsed ? null : (
        <>
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
          <div className="inplace-inspector-panel__sections">
            {savedDocument ? (
              <section data-testid="inplace-inspector-section-layout">
                <h3 className="inplace-inspector-panel__section-title">
                  {t("studio.inspector.section.layout")}
                </h3>
                <fieldset disabled={disabled ? true : undefined}>
                  <LayoutSection
                    widget={widget}
                    session={session}
                    widgets={widgets}
                    savedDocument={savedDocument}
                    layoutViewport={layoutViewport}
                    dispatch={autosave.dispatch}
                    selectWidget={selectWidget}
                  />
                </fieldset>
              </section>
            ) : null}
            {PANEL_SECTIONS.map((sectionId) => (
              <section key={sectionId} data-testid={`inplace-inspector-section-${sectionId}`}>
                <h3 className="inplace-inspector-panel__section-title">
                  {t(`studio.inspector.section.${sectionId}`)}
                </h3>
                <WidgetPropertyInspectorView
                  sectionId={sectionId}
                  widget={widget}
                  session={session}
                  runtimeContext={runtimeContext}
                  access={access ?? DEFAULT_ACCESS}
                  disabled={disabled}
                  dispatch={autosave.dispatch}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const DEFAULT_ACCESS: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

export const MemoInPlaceInspectorPanel = memo(InPlaceInspectorPanel, (prev, next) => (
  prev.widget === next.widget
  && prev.widgets === next.widgets
  && prev.session === next.session
  && prev.telemetry === next.telemetry
  && prev.layoutViewport === next.layoutViewport
  && prev.selectWidget === next.selectWidget
  && prev.side === next.side
  && prev.autosave.paused === next.autosave.paused
  && prev.access === next.access
  && prev.licenseLoading === next.licenseLoading
));
