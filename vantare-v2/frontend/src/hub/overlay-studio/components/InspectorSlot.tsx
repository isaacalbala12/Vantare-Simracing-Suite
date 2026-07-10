import { useStudioDocument } from "../state/studio-store";

export function InspectorSlot(): React.ReactElement {
  const { selectedWidgetId } = useStudioDocument();

  return (
    <aside
      className="osv3-inspector-slot"
      data-testid="studio-inspector-slot"
      data-selected-widget-id={selectedWidgetId ?? ""}
    >
      {selectedWidgetId ? (
        <div data-testid="studio-inspector-selection">Widget: {selectedWidgetId}</div>
      ) : (
        <p className="osv3-inspector-slot__empty">Selecciona un widget para editar sus propiedades.</p>
      )}
    </aside>
  );
}