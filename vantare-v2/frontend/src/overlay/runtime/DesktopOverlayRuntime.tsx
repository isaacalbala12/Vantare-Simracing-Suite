import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";
import type { RaceScheduleStore } from "../core/race-schedule-store";

export type DesktopOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
  overlayV2Features?: readonly OverlayV2Feature[];
  raceSchedule?: RaceScheduleStore;
};

export function DesktopOverlayRuntime(props: DesktopOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations, overlayV2Features, raceSchedule } = props;
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="desktop"
      layoutOrigin={layoutOrigin}
      engineerPresentations={engineerPresentations}
      overlayV2Features={overlayV2Features}
      raceSchedule={raceSchedule}
    />
  );
}
