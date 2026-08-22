import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";

export type ObsOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
  overlayV2Frame?: OverlayFrameV2;
  overlayV2Source?: OverlaySourceStatusV2;
  overlayV2Features?: readonly OverlayV2Feature[];
};

export function ObsOverlayRuntime(props: ObsOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations, overlayV2Frame, overlayV2Source, overlayV2Features } = props;
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="obs"
      layoutOrigin={layoutOrigin}
      engineerPresentations={engineerPresentations}
      overlayV2Frame={overlayV2Frame}
      overlayV2Source={overlayV2Source}
      overlayV2Features={overlayV2Features}
    />
  );
}
