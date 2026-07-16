import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
import { applyOverlayDocumentMode } from "./overlay-document";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import { DesktopOverlayRuntime } from "./runtime/DesktopOverlayRuntime";
import { createWailsTelemetryAdapter } from "./transports/wails-telemetry-adapter";

type ProfileV3LoadedPayload = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  windowMode?: string;
};

export function CompositeApp() {
  const [document, setDocument] = useState<ProfileDocumentV3 | null>(null);
  const [revision, setRevision] = useState("");
  const [layoutOrigin, setLayoutOrigin] = useState({ x: 0, y: 0 });
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const coordinator = useMemo(() => createTelemetryRateCoordinator(), []);
  const adapter = useMemo(
    () =>
      createWailsTelemetryAdapter({
        coordinator,
        subscribe: (event, handler) => {
          const unsub = Events.On(event, (evt: { data: unknown }) => handler(evt.data));
          return () => unsub?.();
        },
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
    const unsub = Events.On("overlay:profile-v3-loaded", (event: { data: unknown }) => {
      try {
        const data = event.data as ProfileV3LoadedPayload;
        setDocument(parseProfileDocumentV3(data.document));
        setRevision(data.revision ?? "");
        setLayoutOrigin(data.layoutOrigin ?? { x: 0, y: 0 });
      } catch (err) {
        console.error("overlay:profile-v3-loaded parse failed", err);
      }
    });

    return () => {
      unsub?.();
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

  if (!document) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-sm font-mono">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      <DesktopOverlayRuntime
        key={revision}
        document={document}
        revision={revision}
        layoutOrigin={layoutOrigin}
        telemetry={coordinator}
      />
      {reminder && (
        <OverlayCalendarReminderBanner
          reminder={reminder}
          onClose={() => setReminder(null)}
          className="absolute top-4 right-4 z-50"
        />
      )}
    </div>
  );
}