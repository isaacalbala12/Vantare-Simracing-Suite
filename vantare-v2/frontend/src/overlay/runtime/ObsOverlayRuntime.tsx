import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { WidgetPolicyWire } from "../core/widget-policy";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import type { RaceScheduleStore } from "../core/race-schedule-store";

export type ObsOverlayRuntimeProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
  raceSchedule?: RaceScheduleStore;
  widgetPolicy?: WidgetPolicyWire | null;
};

export function ObsOverlayRuntime(props: ObsOverlayRuntimeProps): React.ReactElement {
  const { document, layoutOrigin, telemetry, engineerPresentations, raceSchedule, widgetPolicy } = props;
  return (
    <RuntimeOverlaySurface
      document={document}
      telemetry={telemetry}
      renderMode="obs"
      layoutOrigin={layoutOrigin}
      engineerPresentations={engineerPresentations}
      raceSchedule={raceSchedule}
      widgetPolicy={widgetPolicy}
    />
  );
}
