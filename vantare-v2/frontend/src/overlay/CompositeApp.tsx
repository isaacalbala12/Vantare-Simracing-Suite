import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Events } from "@wailsio/runtime";
import type { CalendarReminderPayload } from "../calendar/calendar-types";
import { parseProfileDocumentV3, type ProfileDocumentV3 } from "./core/profile-document";
import { createTelemetryRateCoordinator } from "./core/telemetry-rate-coordinator";
import { conformAspectLockedLayouts } from "./core/profile-layout-conform";
import { applyOverlayDocumentMode } from "./overlay-document";
import { OverlayCalendarReminderBanner } from "./OverlayCalendarReminderBanner";
import { DesktopOverlayRuntime } from "./runtime/DesktopOverlayRuntime";
import { InPlaceEditModeBranch } from "./edit/InPlaceEditModeBranch";
import { createWailsProjectionTelemetryAdapter } from "./transports/projection-telemetry-adapter";
import { createEngineerPresentationStore } from "../engineer/engineer-presentation-store";
import { createWailsEngineerPresentationAdapter } from "../engineer/engineer-presentation-adapters";
import {
  attachOverlayFrameV2Transport,
  createOverlayFrameV2Store,
} from "../telemetry-transport/overlay-frame-v2-store";
import { createOverlayWailsPullClient } from "../telemetry-transport/overlay-wails-pull";
import { createOverlayV2ShadowRuntime } from "./telemetry-shadow/overlay-v2-shadow-runtime";
import { readDiagnosticOverlayV2Features, type OverlayV2Feature } from "./telemetry-shadow/overlay-v2-features";

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
  const overlayV2Store = useMemo(() => createOverlayFrameV2Store(), []);
  const overlayV2Shadow = useMemo(() => createOverlayV2ShadowRuntime(), []);
  const [overlayV2Features, setOverlayV2Features] = useState<readonly OverlayV2Feature[]>(() =>
    readDiagnosticOverlayV2Features(),
  );
  const overlayV2State = useSyncExternalStore(
    overlayV2Store.subscribe,
    overlayV2Store.getSnapshot,
    overlayV2Store.getSnapshot,
  );
  const engineerPresentations = useMemo(() => createEngineerPresentationStore(), []);
  const overlayPull = useMemo(() => createOverlayWailsPullClient({
    onResponse: (event, handler) => {
      const unsubscribe = Events.On(event, (payload: {data: unknown}) => handler(payload.data));
      return () => unsubscribe?.();
    },
    emit: (event, data) => Events.Emit(event, data),
    onError: (error) => console.error("overlay telemetry pull failed", error),
  }), []);
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
      return createWailsProjectionTelemetryAdapter({
        coordinator,
        runtime: "desktop",
        subscribe: overlayPull.source.subscribe,
        onMappedSnapshot: overlayV2Shadow.acceptLegacy,
      });
    },
    [coordinator, overlayPull, overlayV2Shadow],
  );

  useEffect(() => applyOverlayDocumentMode(), []);

  useEffect(() => {
    const onChange = () => setOverlayV2Features(readDiagnosticOverlayV2Features());
    window.addEventListener("vantare:overlay-v2-features-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("vantare:overlay-v2-features-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    const unsubscribeOverlayV2Store = overlayV2Store.subscribe(() => {
      const state = overlayV2Store.getSnapshot();
      if (state.frame && state.source) {
        overlayV2Shadow.acceptOverlayV2(state.frame, state.source);
      }
    });
    const detachOverlayV2 = attachOverlayFrameV2Transport(
      overlayV2Store,
      overlayPull.source,
      (error) => console.error("overlay-v2 shadow ingest failed", error),
    );
    const diagnosticWindow = window as Window & {
      __vantareOverlayV2Diagnostics?: () => unknown;
    };
    diagnosticWindow.__vantareOverlayV2Diagnostics = () => Object.freeze({
      ...overlayV2Store.getDiagnostics(),
      shadow: overlayV2Shadow.sessionSummary(),
    });
    adapter.start();
    engineerAdapter.start();
    overlayPull.start();
    return () => {
      overlayPull.stop();
      delete diagnosticWindow.__vantareOverlayV2Diagnostics;
      detachOverlayV2();
      unsubscribeOverlayV2Store();
      adapter.stop();
      engineerAdapter.stop();
      overlayV2Store.dispose();
      engineerPresentations.dispose();
      coordinator.dispose();
    };
  }, [adapter, coordinator, engineerAdapter, engineerPresentations, overlayPull, overlayV2Shadow, overlayV2Store]);

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
      {editMode && document ? (
        <InPlaceEditModeBranch
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
          overlayV2Frame={overlayV2State.frame}
          overlayV2Source={overlayV2State.source}
          overlayV2Features={overlayV2Features}
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
