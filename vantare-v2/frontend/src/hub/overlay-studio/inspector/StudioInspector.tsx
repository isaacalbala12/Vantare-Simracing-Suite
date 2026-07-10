import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import { useStudioTelemetrySnapshot } from "../canvas/StudioTelemetryProvider";
import { useStudioDocument } from "../state/studio-store";
import { ActionsSection } from "./ActionsSection";
import { AppearanceSection } from "./AppearanceSection";
import { BehaviorSection } from "./BehaviorSection";
import { InspectorRail } from "./InspectorRail";
import { InspectorSectionFrame } from "./InspectorSectionFrame";
import { InspectorSectionPlaceholder } from "./InspectorSectionPlaceholder";
import { LayoutSection } from "./LayoutSection";
import { resolveInspectorSections } from "./inspector-sections";

function resolveInitialSection(
  sections: readonly { id: InspectorSectionId }[],
  preferred: InspectorSectionId | null,
): InspectorSectionId | null {
  if (sections.length === 0) {
    return null;
  }
  if (preferred && sections.some((section) => section.id === preferred)) {
    return preferred;
  }
  return sections[0]?.id ?? null;
}

export function StudioInspector(): React.ReactElement {
  const {
    activeLayout,
    activeSession,
    selectedWidgetId,
    savedDocument,
    dirty,
    dispatch,
    selectWidget,
    discardAll,
  } = useStudioDocument();
  const snapshot = useStudioTelemetrySnapshot();
  const [activeSectionId, setActiveSectionId] = useState<InspectorSectionId | null>(null);
  const previousWidgetIdRef = useRef<string | null>(null);

  const selectedWidget = useMemo(() => {
    if (!selectedWidgetId || !activeLayout) {
      return null;
    }
    return activeLayout.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  }, [activeLayout, selectedWidgetId]);

  const sections = useMemo(
    () => (selectedWidget ? resolveInspectorSections(selectedWidget) : []),
    [selectedWidget],
  );

  useEffect(() => {
    if (selectedWidgetId !== previousWidgetIdRef.current) {
      previousWidgetIdRef.current = selectedWidgetId;
      setActiveSectionId(sections[0]?.id ?? null);
      return;
    }
    setActiveSectionId((current) => resolveInitialSection(sections, current));
  }, [selectedWidgetId, sections]);

  if (!selectedWidget) {
    return (
      <p className="osv3-inspector-slot__empty" data-testid="studio-inspector-empty">
        Selecciona un widget para editar sus propiedades.
      </p>
    );
  }

  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;

  const sectionBody = (() => {
    if (!activeSection || !selectedWidget || !activeLayout) {
      return null;
    }
    if (activeSection.labelKey === "overlay.studio.inspector.sections.unsupported") {
      return (
        <div
          data-testid="studio-inspector-section-design"
          data-widget-id={selectedWidget.id}
          className="osv3-inspector-unsupported"
          role="alert"
        >
          Este widget no tiene un renderer compatible con el sistema visual seleccionado.
        </div>
      );
    }
    switch (activeSection.id) {
      case "appearance":
        return (
          <AppearanceSection widget={selectedWidget} session={activeSession} dispatch={dispatch} />
        );
      case "behavior":
        return (
          <BehaviorSection
            widget={selectedWidget}
            session={activeSession}
            snapshot={snapshot}
            dispatch={dispatch}
          />
        );
      case "layout":
        return savedDocument ? (
          <LayoutSection
            widget={selectedWidget}
            session={activeSession}
            widgets={activeLayout.widgets}
            savedDocument={savedDocument}
            dispatch={dispatch}
            selectWidget={selectWidget}
          />
        ) : null;
      case "actions":
        return savedDocument ? (
          <ActionsSection
            widget={selectedWidget}
            session={activeSession}
            widgets={activeLayout.widgets}
            savedDocument={savedDocument}
            dispatch={dispatch}
            selectWidget={selectWidget}
            discardAll={discardAll}
          />
        ) : null;
      default:
        return (
          <InspectorSectionPlaceholder sectionId={activeSection.id} widgetId={selectedWidget.id} />
        );
    }
  })();

  return (
    <div className="osv3-inspector-layout" data-testid="studio-inspector">
      <InspectorRail
        widget={selectedWidget}
        sections={sections}
        activeSectionId={activeSection?.id ?? "design"}
        dirty={dirty}
        onSelectSection={setActiveSectionId}
        onToggleVisibility={() =>
          dispatch({
            type: "widget/behavior",
            session: activeSession,
            widgetIds: [selectedWidget.id],
            patch: { enabled: !selectedWidget.behavior.enabled },
          })
        }
      />
      <div className="osv3-inspector-content" data-testid="studio-inspector-content">
        {activeSection ? (
          <InspectorSectionFrame
            section={activeSection}
            onResetSection={
              savedDocument
                ? () =>
                    dispatch({
                      type: "widget/reset-section",
                      session: activeSession,
                      widgetIds: [selectedWidget.id],
                      section: activeSection.id as "design" | "appearance" | "content" | "behavior" | "layout",
                      saved: savedDocument,
                    })
                : undefined
            }
          >
            {sectionBody}
          </InspectorSectionFrame>
        ) : null}
      </div>
    </div>
  );
}