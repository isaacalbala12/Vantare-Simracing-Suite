import type { InspectorSectionId } from "../../../overlay/core/widget-definition";

export type InspectorSectionPlaceholderProps = {
  sectionId: InspectorSectionId;
  widgetId: string;
};

export function InspectorSectionPlaceholder(props: InspectorSectionPlaceholderProps): React.ReactElement {
  return (
    <div
      data-testid={`studio-inspector-section-${props.sectionId}`}
      data-widget-id={props.widgetId}
      className="osv3-inspector-section-placeholder"
    >
      <p className="osv3-inspector-section-placeholder__text">
        Controles de {props.sectionId} en la siguiente tarea.
      </p>
    </div>
  );
}