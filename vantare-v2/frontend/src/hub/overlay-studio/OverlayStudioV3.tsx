import "./overlay-studio-v3.css";
import { StudioHeader, type StudioHeaderProps } from "./components/StudioHeader";
import { WidgetListPanel } from "./components/WidgetListPanel";
import { InspectorSlot } from "./components/InspectorSlot";
import { useStudioDocument } from "./state/studio-store";

export type OverlayStudioV3Props = StudioHeaderProps;

export function OverlayStudioV3(props: OverlayStudioV3Props): React.ReactElement {
  const { selectedWidgetId } = useStudioDocument();

  return (
    <div data-testid="overlay-studio-v3" className="osv3-workbench">
      <StudioHeader {...props} />
      <main className="osv3-grid">
        <WidgetListPanel />
        <section
          data-testid="studio-canvas-slot"
          className="osv3-canvas-column"
          data-selected-widget-id={selectedWidgetId ?? ""}
        />
        <InspectorSlot />
      </main>
    </div>
  );
}