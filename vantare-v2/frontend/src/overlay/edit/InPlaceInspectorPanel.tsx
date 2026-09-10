import { memo } from "react";
import type { SessionLayoutType, WidgetInstanceV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { useOverlayRuntimeContext } from "../runtime/use-rate-limited-telemetry";
import type { AccessContext } from "../../lib/access-policy";
import { WidgetPropertyInspectorView, type WidgetPropertySectionId } from "../../hub/overlay-studio/inspector/WidgetPropertyInspectorView";
import { useStudioDocument } from "../../hub/overlay-studio/state/studio-store";
import { useI18n } from "../../i18n/I18nProvider";
import { useInplaceAutosave } from "./use-inplace-autosave";

const PANEL_SECTIONS: readonly WidgetPropertySectionId[] = ["appearance", "content", "behavior"];

export type InPlaceInspectorPanelProps = {
  widget: WidgetInstanceV3 | null;
  session: SessionLayoutType;
  telemetry: TelemetryRateCoordinator;
  access?: AccessContext;
  licenseLoading?: boolean;
  autosave: ReturnType<typeof useInplaceAutosave>;
};

export function InPlaceInspectorPanel(props: InPlaceInspectorPanelProps): React.ReactElement {
  const { widget, session, telemetry, access, licenseLoading = false, autosave } = props;
  const { t } = useI18n();
  const { canUndo, canRedo, dirty, saveState } = useStudioDocument();
  const runtimeContext = useOverlayRuntimeContext(telemetry);
  const disabled = licenseLoading || autosave.paused !== null;

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
      className="inplace-inspector-panel"
      data-widget-id={widget.id}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="inplace-inspector-panel__header">
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
        {PANEL_SECTIONS.map((sectionId) => (
          <section key={sectionId} data-testid={`inplace-inspector-section-${sectionId}`}>
            <h3 className="inplace-inspector-panel__section-title">
              {t(`overlay.studio.inspector.sections.${sectionId}`)}
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
  && prev.session === next.session
  && prev.telemetry === next.telemetry
  && prev.access === next.access
  && prev.licenseLoading === next.licenseLoading
));
