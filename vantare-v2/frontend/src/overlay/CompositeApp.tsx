import { useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
import { conformAspectLockedLayouts } from "./core/profile-layout-conform";
import { statusRequestEventName } from "../telemetry-transport/contracts";
import { applyOverlayDocumentMode } from "./overlay-document";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import { DesktopOverlayRuntime } from "./runtime/DesktopOverlayRuntime";
import { InPlaceEditOverlay } from "./edit/InPlaceEditOverlay";
import { createWailsProjectionTelemetryAdapter } from "./transports/projection-telemetry-adapter";
import { createEngineerPresentationStore } from "../engineer/engineer-presentation-store";
import { createWailsEngineerPresentationAdapter } from "../engineer/engineer-presentation-adapters";

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
  const [editMode, setEditMode] = useState(false);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const coordinator = useMemo(() => createTelemetryRateCoordinator(), []);
  const engineerPresentations = useMemo(() => createEngineerPresentationStore(), []);
  const engineerAdapter = useMemo(() => createWailsEngineerPresentationAdapter({
    store: engineerPresentations,
    subscribe: (event, handler) => {
      const unsubscribe = Events.On(event, (payload: { data: unknown }) => handler(payload.data));
      return () => unsubscribe?.();
    },
    requestSnapshot: () => Events.Emit("engineer:stream:get"),
  }), [engineerPresentations]);
  const adapter = useMemo(
    () => {
      const subscribe = (event: string, handler: (data: unknown) => void) => {
        const unsub = Events.On(event, (evt: { data: unknown }) => handler(evt.data));
        return () => unsub?.();
      };
      return createWailsProjectionTelemetryAdapter({
        coordinator,
        runtime: "desktop",
        subscribe,
        // Una ventana de overlay abierta a mitad de sesion no recibe estado,
        // porque solo se publica al cambiar y el puente Wails no repite lo ya
        // emitido. Sin estado el observador no pinta nada.
        requestStatus: () => Events.Emit(statusRequestEventName("overlay")),
      });
    },
    [coordinator],
  );

  useEffect(() => applyOverlayDocumentMode(), []);

  useEffect(() => {
    adapter.start();
    engineerAdapter.start();
    return () => {
      adapter.stop();
      engineerAdapter.stop();
      engineerPresentations.dispose();
      coordinator.dispose();
    };
  }, [adapter, coordinator, engineerAdapter, engineerPresentations]);

  useEffect(() => {
    const unsub = Events.On("overlay:profile-v3-loaded", (event: { data: unknown }) => {
      try {
        const data = event.data as ProfileV3LoadedPayload;
        // Misma conformacion que aplica el Studio: la ventana de overlay debe
        // pintar la geometria que el editor muestra, no la del perfil heredado.
        setDocument(conformAspectLockedLayouts(parseProfileDocumentV3(data.document)));
        setRevision(data.revision ?? "");
        setLayoutOrigin(data.layoutOrigin ?? { x: 0, y: 0 });
        setEditMode(data.windowMode === "edit");
      } catch (err) {
        console.error("overlay:profile-v3-loaded parse failed", err);
      }
    });

    // A newly-created Wails window can mount after the initial profile event
    // was broadcast. Subscribe first, then request the current snapshot so the
    // desktop runtime cannot remain stuck in its loading state.
    Events.Emit("overlay:profile-v3:get");

    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const unsub = Events.On("overlay:edit-mode-changed", (event: { data: { mode?: string } }) => {
      setEditMode(event.data?.mode === "edit");
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

  // Sin perfil no se pinta nada. Esta ventana es una capa transparente sobre el
  // juego: un marcador de carga aqui no informa a nadie, aparece centrado en
  // mitad de la pantalla -- y en emision -- durante los ~390 ms que tarda la
  // WebView en arrancar y pedir el perfil, y desaparece de golpe cuando llega.
  // Ese era el "salto" al abrir un overlay. El vacio es invisible: los widgets
  // simplemente aparecen cuando hay algo que mostrar.
  if (!document) {
    return null;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {editMode ? (
        <InPlaceEditOverlay
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={coordinator}
        />
      ) : (
        <DesktopOverlayRuntime
          key={revision}
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={coordinator}
          engineerPresentations={engineerPresentations}
        />
      )}
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
