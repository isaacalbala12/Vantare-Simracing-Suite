import { useMemo, useState } from "react";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import { useStudioTelemetrySnapshot } from "../canvas/StudioTelemetryProvider";
import { useStudioDocument } from "../state/studio-store";
import { createWailsWidgetDesignClient } from "../designs/widget-design-client";
import { ActionsSection } from "./ActionsSection";
import { AppearanceSection } from "./AppearanceSection";
import { BehaviorSection } from "./BehaviorSection";
import { ContentSection } from "./ContentSection";
import { DesignSection } from "./DesignSection";
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
    access,
    activeLayout,
    activeSession,
    selectedWidgetId,
    savedDocument,
    dirty,
    dispatch,
    selectWidget,
    discardAll,
  } = useStudioDocument();
  const designClient = useMemo(() => createWailsWidgetDesignClient(), []);
  const snapshot = useStudioTelemetrySnapshot();
  const [activeSection, setActiveSection] = useState<{
    widgetId: string | null;
    sectionId: InspectorSectionId | null;
  }>({ widgetId: null, sectionId: null });

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

  const preferredSectionId =
    activeSection.widgetId === selectedWidgetId ? activeSection.sectionId : null;
  const activeSectionId = resolveInitialSection(sections, preferredSectionId);
  if (activeSection.widgetId !== selectedWidgetId || activeSection.sectionId !== activeSectionId) {
    setActiveSection({ widgetId: selectedWidgetId, sectionId: activeSectionId });
  }

  if (!selectedWidget) {
    return (
      <p className="osv3-inspector-slot__empty" data-testid="studio-inspector-empty">
        Selecciona un widget para editar sus propiedades.
      </p>
    );
  }

  const resolvedActiveSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;

  const sectionBody = (() => {
    if (!resolvedActiveSection || !selectedWidget || !activeLayout) {
      return null;
    }
    if (resolvedActiveSection.labelKey === "overlay.studio.inspector.sections.unsupported") {
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
    switch (resolvedActiveSection.id) {
      case "appearance":
        return (
          <AppearanceSection widget={selectedWidget} session={activeSession} dispatch={dispatch} />
        );
      case "content":
        return <ContentSection widget={selectedWidget} session={activeSession} dispatch={dispatch} />;
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
      case "design":
        return (
          <DesignSection
            widget={selectedWidget}
            session={activeSession}
            widgets={activeLayout.widgets}
            access={access}
            dispatch={dispatch}
            designClient={designClient}
          />
        );
      default:
        return (
          <InspectorSectionPlaceholder
            sectionId={resolvedActiveSection.id}
            widgetId={selectedWidget.id}
          />
        );
    }
  })();

  return (
    <div className="osv3-inspector-layout" data-testid="studio-inspector">
      <InspectorRail
        widget={selectedWidget}
        sections={sections}
        activeSectionId={resolvedActiveSection?.id ?? "design"}
        dirty={dirty}
        onSelectSection={(sectionId) =>
          setActiveSection({ widgetId: selectedWidgetId, sectionId })
        }
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
        {resolvedActiveSection ? (
          <InspectorSectionFrame
            section={resolvedActiveSection}
            onResetSection={
              savedDocument
                ? () =>
                    dispatch({
                      type: "widget/reset-section",
                      session: activeSession,
                      widgetIds: [selectedWidget.id],
                      section: resolvedActiveSection.id as "design" | "appearance" | "content" | "behavior" | "layout",
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
