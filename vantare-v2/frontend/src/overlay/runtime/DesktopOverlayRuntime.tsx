import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import { InGameOverlayEditor } from "./InGameOverlayEditor";

export type DesktopOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
};

export function DesktopOverlayRuntime(props: DesktopOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations } = props;
  if (document.displayMode === "edit") {
    return (
      <InGameOverlayEditor
        document={document}
        revision={props.revision}
        layoutOrigin={layoutOrigin}
        telemetry={telemetry}
        engineerPresentations={engineerPresentations}
      />
    );
  }
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="desktop"
      layoutOrigin={layoutOrigin}
      engineerPresentations={engineerPresentations}
    />
  );
}
