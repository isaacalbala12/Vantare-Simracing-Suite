import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";

export type DesktopOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
};

export function DesktopOverlayRuntime(props: DesktopOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations } = props;
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
