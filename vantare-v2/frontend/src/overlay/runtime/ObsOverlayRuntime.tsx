import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";

export type ObsOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
};

export function ObsOverlayRuntime(props: ObsOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry } = props;
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="obs"
      layoutOrigin={layoutOrigin}
    />
  );
}