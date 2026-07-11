import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
import { applyOverlayDocumentMode } from "./overlay-document";
import { readOverlayRouteParams } from "./overlay-route-params";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import { ObsOverlayStudioPreview } from "./ObsOverlayStudioPreview";
import { ObsOverlayRuntime } from "./runtime/ObsOverlayRuntime";
import { createSseTelemetryAdapter } from "./transports/sse-telemetry-adapter";

type ProfileV3ApiResponse = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
};

const STREAMING_MODE_HINT = "obs-streaming";

export function ObsOverlayApp() {
  const [studioPreview] = useState(
    () => readOverlayRouteParams(typeof window !== "undefined" ? window.location.search : "").studioPreview,
  );
  const [document, setDocument] = useState<ProfileDocumentV3 | null>(null);
  const [revision, setRevision] = useState("");
  const [layoutOrigin, setLayoutOrigin] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const coordinator = useMemo(() => createTelemetryRateCoordinator(), []);
  const adapter = useMemo(
    () =>
      createSseTelemetryAdapter({
        coordinator,
        url: "/telemetry/stream",
      }),
    [coordinator],
  );

  useEffect(() => applyOverlayDocumentMode(), []);

  useEffect(() => {
    adapter.start();
    return () => {
      adapter.stop();
      coordinator.dispose();
    };
  }, [adapter, coordinator]);

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
        setLayoutOrigin(data.layoutOrigin ?? { x: 0, y: 0 });
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
      layoutOrigin={layoutOrigin}
      telemetry={coordinator}
    />
  );

  const widgetLayer = (
    <>
      {runtime}
      {reminder && (
        <OverlayCalendarReminderBanner
          reminder={reminder}
          onClose={() => setReminder(null)}
          className="absolute top-4 right-4 z-50"
        />
      )}
    </>
  );

  if (studioPreview) {
    return (
      <ObsOverlayStudioPreview>
        <div className="relative w-full h-full overflow-hidden" data-vantare-mode={STREAMING_MODE_HINT}>
          {widgetLayer}
        </div>
      </ObsOverlayStudioPreview>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent" data-vantare-mode={STREAMING_MODE_HINT}>
      {widgetLayer}
    </div>
  );
}