import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";

export type ObsOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
};

export function ObsOverlayRuntime(props: ObsOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations } = props;
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="obs"
      layoutOrigin={layoutOrigin}
      engineerPresentations={engineerPresentations}
    />
  );
}
