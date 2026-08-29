import { useEffect, useState, useSyncExternalStore } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { resolveLayoutViewport } from "./core/layout-viewport";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
import { bindOverlayV2Coordinator } from "./core/overlay-v2-coordinator-binding";
import { applyOverlayDocumentMode } from "./overlay-document";
import { readOverlayRouteParams } from "./overlay-route-params";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import { ObsOverlayStudioPreview } from "./ObsOverlayStudioPreview";
import { ObsOverlayRuntime } from "./runtime/ObsOverlayRuntime";
import { createSseProjectionTelemetryAdapter } from "./transports/projection-telemetry-adapter";
import { createEngineerPresentationStore } from "../engineer/engineer-presentation-store";
import { createSseEngineerPresentationAdapter } from "../engineer/engineer-presentation-adapters";
import {
  attachOverlayFrameV2Sse,
  createOverlayFrameV2Store,
} from "../telemetry-transport/overlay-frame-v2-store";
import { createOverlayV2ShadowRuntime } from "./telemetry-shadow/overlay-v2-shadow-runtime";
import { createOverlayV2FeaturesGeneration } from "./telemetry-shadow/overlay-v2-features";
import { createHttpRaceScheduleStore } from "./core/race-schedule-store";

type ProfileV3ApiResponse = {
  document: ProfileDocumentV3;
  revision: string;
};

const STREAMING_MODE_HINT = "obs-streaming";

type ObsGeneration = Readonly<{
  coordinator: ReturnType<typeof createTelemetryRateCoordinator>;
  overlayV2Store: ReturnType<typeof createOverlayFrameV2Store>;
  engineerPresentations: ReturnType<typeof createEngineerPresentationStore>;
  raceSchedule: ReturnType<typeof createHttpRaceScheduleStore>;
  overlayV2Features: ReturnType<typeof createOverlayV2FeaturesGeneration>;
}>;

export function ObsOverlayApp() {
  const [studioPreview] = useState(
    () => readOverlayRouteParams(typeof window !== "undefined" ? window.location.search : "").studioPreview,
  );
  const [document, setDocument] = useState<ProfileDocumentV3 | null>(null);
  const [revision, setRevision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const [generation, setGeneration] = useState<ObsGeneration | null>(null);
  useEffect(() => applyOverlayDocumentMode(), []);

  useEffect(() => {
    const coordinator = createTelemetryRateCoordinator();
    const overlayV2Store = createOverlayFrameV2Store();
    const overlayV2Shadow = createOverlayV2ShadowRuntime();
    const engineerPresentations = createEngineerPresentationStore();
    const raceSchedule = createHttpRaceScheduleStore();
    const overlayV2Features = createOverlayV2FeaturesGeneration();
    const engineerAdapter = createSseEngineerPresentationAdapter({ store: engineerPresentations });
    const adapter = createSseProjectionTelemetryAdapter({
      coordinator,
      runtime: "obs",
      onMappedSnapshot: overlayV2Shadow.acceptLegacy,
    });
    overlayV2Store.reset();
    const unsubscribeOverlayV2Store = bindOverlayV2Coordinator(
      overlayV2Store,
      coordinator,
      overlayV2Shadow.acceptOverlayV2,
    );
    const detachOverlayV2 = attachOverlayFrameV2Sse(overlayV2Store, {
      onError: (cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        coordinator.setOverlayFailure({ code: "invalid-frame", message });
        console.error("overlay-v2 ingest failed", cause);
      },
    });
    const diagnosticWindow = window as Window & {
      __vantareOverlayV2Diagnostics?: () => unknown;
    };
    diagnosticWindow.__vantareOverlayV2Diagnostics = () => Object.freeze({
      ...overlayV2Store.getDiagnostics(),
      shadow: overlayV2Shadow.sessionSummary(),
    });
    adapter.start();
    engineerAdapter.start();
    raceSchedule.start();
    // Este efecto es la fabrica y el owner de la generacion; el render que la
    // consume no puede montarse antes de que sus recursos externos existan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeneration({ coordinator, overlayV2Store, engineerPresentations, raceSchedule, overlayV2Features });
    return () => {
      delete diagnosticWindow.__vantareOverlayV2Diagnostics;
      detachOverlayV2();
      unsubscribeOverlayV2Store();
      adapter.stop();
      engineerAdapter.stop();
      overlayV2Store.dispose();
      engineerPresentations.dispose();
      raceSchedule.dispose();
      overlayV2Features.dispose();
      coordinator.dispose();
    };
  }, []);

  useEffect(() => {
    const unsub = Events.On("calendar:reminder", (event: { data: CalendarReminderPayload }) => {
      setReminder(event.data);
    });

    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const { profileName } = readOverlayRouteParams(window.location.search);
    let disposed = false;

    fetch(`/api/profile-v3?profile=${encodeURIComponent(profileName)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<ProfileV3ApiResponse>;
      })
      .then((data) => {
        if (disposed) {
          return;
        }
        setDocument(parseProfileDocumentV3(data.document));
        setRevision(data.revision ?? "");
        setError(null);
      })
      .catch((err: Error) => {
        if (disposed) {
          return;
        }
        setError(`Failed to load profile: ${err.message}`);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const statusShellClass = studioPreview
    ? "obs-studio-preview flex items-center justify-center w-full h-full text-sm font-mono text-white/80"
    : "flex items-center justify-center w-full h-full text-sm font-mono";

  if (error) {
    return <div className={`${statusShellClass} text-red-400`}>{error}</div>;
  }

  if (!document || !generation) {
    return (
      <div className={`${statusShellClass} ${studioPreview ? "text-white/60" : "text-white/40"}`}>
        Loading overlay...
      </div>
    );
  }

  return (
    <ObsGenerationView
      generation={generation}
      document={document}
      revision={revision}
      reminder={reminder}
      studioPreview={studioPreview}
      onCloseReminder={() => setReminder(null)}
    />
  );
}

type ObsGenerationViewProps = Readonly<{
  generation: ObsGeneration;
  document: ProfileDocumentV3;
  revision: string;
  reminder: CalendarReminderPayload | null;
  studioPreview: boolean;
  onCloseReminder(): void;
}>;

function ObsGenerationView(props: ObsGenerationViewProps) {
  const { generation, document, revision, reminder, studioPreview, onCloseReminder } = props;
  const overlayV2Features = useSyncExternalStore(
    generation.overlayV2Features.subscribe,
    generation.overlayV2Features.getSnapshot,
    generation.overlayV2Features.getSnapshot,
  );
  const runtime = (
    <ObsOverlayRuntime
      key={revision}
      document={document}
      revision={revision}
      telemetry={generation.coordinator}
      engineerPresentations={generation.engineerPresentations}
      overlayV2Features={overlayV2Features}
      raceSchedule={generation.raceSchedule}
    />
  );

  const reminderBanner = reminder ? (
    <OverlayCalendarReminderBanner
      reminder={reminder}
      onClose={onCloseReminder}
      className="absolute top-4 right-4 z-50"
    />
  ) : null;

  if (studioPreview) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        <ObsOverlayStudioPreview layoutViewport={resolveLayoutViewport(document)}>
          <div className="relative w-full h-full overflow-hidden" data-vantare-mode={STREAMING_MODE_HINT}>
            {runtime}
          </div>
        </ObsOverlayStudioPreview>
        {reminderBanner}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent" data-vantare-mode={STREAMING_MODE_HINT}>
      {runtime}
      {reminderBanner}
    </div>
  );
}
