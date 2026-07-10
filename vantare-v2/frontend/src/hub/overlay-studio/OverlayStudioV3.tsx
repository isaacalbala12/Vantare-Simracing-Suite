import "./overlay-studio-v3.css";
import { ConnectedStudioTelemetryProvider } from "./canvas/StudioTelemetryProvider";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { StudioHeader, type StudioHeaderProps } from "./components/StudioHeader";
import { WidgetListPanel } from "./components/WidgetListPanel";
import { InspectorSlot } from "./components/InspectorSlot";
export type OverlayStudioV3Props = StudioHeaderProps;

export function OverlayStudioV3(props: OverlayStudioV3Props): React.ReactElement {
  return (
    <div data-testid="overlay-studio-v3" className="osv3-workbench">
      <StudioHeader {...props} />
      <main className="osv3-grid">
        <WidgetListPanel />
        <section data-testid="studio-canvas-slot" className="osv3-canvas-column">
          <ConnectedStudioTelemetryProvider>
            <StudioCanvas />
          </ConnectedStudioTelemetryProvider>
        </section>
        <InspectorSlot />
      </main>
    </div>
  );
}