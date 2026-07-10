import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import { useStudioDocument } from "../state/studio-store";
import { InspectorRail } from "./InspectorRail";
import { InspectorSectionFrame } from "./InspectorSectionFrame";
import { InspectorSectionPlaceholder } from "./InspectorSectionPlaceholder";
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
  } = useStudioDocument();
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
            <InspectorSectionPlaceholder sectionId={activeSection.id} widgetId={selectedWidget.id} />
          </InspectorSectionFrame>
        ) : null}
      </div>
    </div>
  );
}