import { useEffect, useState, useSyncExternalStore } from "react";
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
import { createBrowserOverlayWailsPullClient } from "../telemetry-transport/overlay-wails-pull";
import { createOverlayV2ShadowRuntime } from "./telemetry-shadow/overlay-v2-shadow-runtime";
import { readDiagnosticOverlayV2Features, type OverlayV2Feature } from "./telemetry-shadow/overlay-v2-features";

type ProfileV3LoadedPayload = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  windowMode?: string;
};

type CompositeGeneration = Readonly<{
  coordinator: ReturnType<typeof createTelemetryRateCoordinator>;
  overlayV2Store: ReturnType<typeof createOverlayFrameV2Store>;
  engineerPresentations: ReturnType<typeof createEngineerPresentationStore>;
}>;

export function CompositeApp() {
  const [document, setDocument] = useState<ProfileDocumentV3 | null>(null);
  const [revision, setRevision] = useState("");
  const [layoutOrigin, setLayoutOrigin] = useState({ x: 0, y: 0 });
  const [editMode, setEditMode] = useState(false);
  const [reminder, setReminder] = useState<CalendarReminderPayload | null>(null);

  const [generation, setGeneration] = useState<CompositeGeneration | null>(null);
  const [overlayV2Features, setOverlayV2Features] = useState<readonly OverlayV2Feature[]>(() =>
    readDiagnosticOverlayV2Features(),
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
    const coordinator = createTelemetryRateCoordinator();
    const overlayV2Store = createOverlayFrameV2Store();
    const overlayV2Shadow = createOverlayV2ShadowRuntime();
    const engineerPresentations = createEngineerPresentationStore();
    const overlayPull = createBrowserOverlayWailsPullClient({
      onError: (error) => console.error("overlay telemetry pull failed", error),
    });
    const engineerAdapter = createWailsEngineerPresentationAdapter({
      store: engineerPresentations,
      subscribe: (event, handler) => {
        const unsubscribe = Events.On(event, (payload: { data: unknown }) => handler(payload.data));
        return () => unsubscribe?.();
      },
      requestSnapshot: () => Events.Emit("engineer:stream:get"),
    });
    const adapter = createWailsProjectionTelemetryAdapter({
      coordinator,
      runtime: "desktop",
      subscribe: overlayPull.source.subscribe,
      onMappedSnapshot: overlayV2Shadow.acceptLegacy,
    });
    overlayV2Store.reset();
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
    // Este efecto es la fabrica y el owner de la generacion; el render que la
    // consume no puede montarse antes de que sus recursos externos existan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeneration({ coordinator, overlayV2Store, engineerPresentations });
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
  }, []);

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
  if (!document || !generation) {
    return null;
  }

  return (
    <CompositeGenerationView
      generation={generation}
      document={document}
      revision={revision}
      layoutOrigin={layoutOrigin}
      editMode={editMode}
      reminder={reminder}
      overlayV2Features={overlayV2Features}
      onCloseReminder={() => setReminder(null)}
    />
  );
}

type CompositeGenerationViewProps = Readonly<{
  generation: CompositeGeneration;
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin: { x: number; y: number };
  editMode: boolean;
  reminder: CalendarReminderPayload | null;
  overlayV2Features: readonly OverlayV2Feature[];
  onCloseReminder(): void;
}>;

function CompositeGenerationView(props: CompositeGenerationViewProps) {
  const {
    generation,
    document,
    revision,
    layoutOrigin,
    editMode,
    reminder,
    overlayV2Features,
    onCloseReminder,
  } = props;
  const overlayV2State = useSyncExternalStore(
    generation.overlayV2Store.subscribe,
    generation.overlayV2Store.getSnapshot,
    generation.overlayV2Store.getSnapshot,
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {editMode && document ? (
        <InPlaceEditModeBranch
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={generation.coordinator}
        />
      ) : (
        <DesktopOverlayRuntime
          key={revision}
          document={document}
          revision={revision}
          layoutOrigin={layoutOrigin}
          telemetry={generation.coordinator}
          engineerPresentations={generation.engineerPresentations}
          overlayV2Frame={overlayV2State.frame}
          overlayV2Source={overlayV2State.source}
          overlayV2Features={overlayV2Features}
        />
      )}
      {reminder && (
        <OverlayCalendarReminderBanner
          reminder={reminder}
          onClose={onCloseReminder}
          className="absolute top-4 right-4 z-50"
        />
      )}
    </div>
  );
}
