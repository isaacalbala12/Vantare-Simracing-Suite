import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { resolveLayoutViewport } from "./core/layout-viewport";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
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

type ProfileV3ApiResponse = {
  document: ProfileDocumentV3;
  revision: string;
};

const STREAMING_MODE_HINT = "obs-streaming";

export function ObsOverlayApp() {
  const [studioPreview] = useState(
    () => readOverlayRouteParams(typeof window !== "undefined" ? window.location.search : "").studioPreview,
  );
  const [document, setDocument] = useState<ProfileDocumentV3 | null>(null);
  const [revision, setRevision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const coordinator = useMemo(() => createTelemetryRateCoordinator(), []);
  const overlayV2Store = useMemo(() => createOverlayFrameV2Store(), []);
  const overlayV2Shadow = useMemo(() => createOverlayV2ShadowRuntime(), []);
  const engineerPresentations = useMemo(() => createEngineerPresentationStore(), []);
  const engineerAdapter = useMemo(
    () => createSseEngineerPresentationAdapter({ store: engineerPresentations }),
    [engineerPresentations],
  );
  const adapter = useMemo(
    () =>
      createSseProjectionTelemetryAdapter({
        coordinator,
        runtime: "obs",
        onMappedSnapshot: overlayV2Shadow.acceptLegacy,
      }),
    [coordinator, overlayV2Shadow],
  );

  useEffect(() => applyOverlayDocumentMode(), []);

  useEffect(() => {
    const unsubscribeOverlayV2Store = overlayV2Store.subscribe(() => {
      const state = overlayV2Store.getSnapshot();
      if (state.frame && state.source) {
        overlayV2Shadow.acceptOverlayV2(state.frame, state.source);
      }
    });
    const detachOverlayV2 = attachOverlayFrameV2Sse(overlayV2Store, {
      onError: (cause) => console.error("overlay-v2 shadow ingest failed", cause),
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
    return () => {
      delete diagnosticWindow.__vantareOverlayV2Diagnostics;
      detachOverlayV2();
      unsubscribeOverlayV2Store();
      adapter.stop();
      engineerAdapter.stop();
      overlayV2Store.dispose();
      engineerPresentations.dispose();
      coordinator.dispose();
    };
  }, [adapter, coordinator, engineerAdapter, engineerPresentations, overlayV2Shadow, overlayV2Store]);

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

  if (!document) {
    return (
      <div className={`${statusShellClass} ${studioPreview ? "text-white/60" : "text-white/40"}`}>
        Loading overlay...
      </div>
    );
  }

  const runtime = (
    <ObsOverlayRuntime
      key={revision}
      document={document}
      revision={revision}
      telemetry={coordinator}
      engineerPresentations={engineerPresentations}
    />
  );

  const reminderBanner = reminder ? (
    <OverlayCalendarReminderBanner
      reminder={reminder}
      onClose={() => setReminder(null)}
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
