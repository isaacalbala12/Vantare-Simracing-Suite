import { StudioInspector } from "../inspector/StudioInspector";

export function InspectorSlot(): React.ReactElement {
  return (
    <aside className="osv3-inspector-slot" data-testid="studio-inspector-slot">
      <StudioInspector />
    </aside>
  );
}