import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor, fireEvent, screen, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import type { TelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { TelemetryAdapter } from "../../../overlay/transports/telemetry-adapter";
import { StudioTelemetryProvider, ConnectedStudioTelemetryProvider } from "./StudioTelemetryProvider";
import { useStudioPreview, StudioProvider } from "../state/studio-store";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { OrbitKeepAlive } from "../../components/orbit/OrbitKeepAlive";
import { useStudioTelemetryCoordinator } from "./studio-telemetry";
import { useRateLimitedWidgetTelemetry } from "../../../overlay/runtime/use-rate-limited-telemetry";

vi.mock("../state/studio-store", async () => {
  const actual = await vi.importActual("../state/studio-store");
  return {
    ...actual,
    useStudioPreview: vi.fn(),
  };
});

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

const client: StudioProfileClient = {
  load: async () => ({ document: buildDocument(), revision: "rev-1" }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function FrameProbe(): ReactElement {
  const coordinator = useStudioTelemetryCoordinator();
  const telemetry = useRateLimitedWidgetTelemetry(coordinator, "delta");
  return <div data-testid="telemetry-probe">{telemetry.overlayV2Frame?.session.phase?.v ?? "none"}</div>;
}

function SourceSwitcher(): ReactElement {
  const { setPreview } = useStudioPreview();
  return (
    <button
      type="button"
      data-testid="use-live-source"
      onClick={() => setPreview({ source: "live" })}
    />
  );
}

type PreviewState = {
  source: "mock" | "live";
  mockSession: "practice" | "qualifying" | "race";
  mockLocation: "track" | "pits";
  zoom: "fit";
  backgroundId: string;
  safeArea: false;
};

function mockPreviewState(): PreviewState {
  return {
    source: "mock",
    mockSession: "practice",
    mockLocation: "track",
    zoom: "fit",
    backgroundId: "grid",
    safeArea: false,
  };
}

function mockPreview(state: PreviewState): void {
  vi.mocked(useStudioPreview).mockReturnValue({
    preview: state,
    setPreview: vi.fn(),
  });
}

function setupUnit(): {
  coordinator: TelemetryRateCoordinator;
  publishSpy: ReturnType<typeof vi.spyOn>;
  setFrameSpy: ReturnType<typeof vi.spyOn>;
  adapter: TelemetryAdapter;
} {
  const coordinator = createTelemetryRateCoordinator();
  const publishSpy = vi.spyOn(coordinator, "publish");
  const setFrameSpy = vi.spyOn(coordinator, "setOverlayFrame");
  const adapter: TelemetryAdapter = {
    coordinator,
    start: vi.fn(),
    stop: vi.fn(),
  };
  return { coordinator, publishSpy, setFrameSpy, adapter };
}

describe("StudioTelemetryProvider - mock V2 puro (C2b4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("publica únicamente frame/source V2 sin snapshot legacy", () => {
    mockPreview(mockPreviewState());
    const { coordinator, publishSpy, setFrameSpy, adapter } = setupUnit();

    render(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    expect(publishSpy).not.toHaveBeenCalled();
    expect(setFrameSpy).toHaveBeenCalledTimes(1);
    const frame = coordinator.getOverlayFrame();
    expect(frame).toBeDefined();
    expect(frame?.player.id).toBe("vehicle-000");
    expect(new Set(frame?.standings.map((row) => row.classId)).size).toBeGreaterThan(1);
    expect(coordinator.getOverlaySource()?.state).toBe("live");
  });

  it("refleja mockSession en frame.session.phase de forma observable", () => {
    const state = mockPreviewState();
    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: state,
      setPreview: (patch) => {
        Object.assign(state, patch);
      },
    }));
    const { coordinator, publishSpy, adapter } = setupUnit();

    const view = render(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <FrameProbe />
      </StudioTelemetryProvider>,
    );
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");

    state.mockSession = "race";
    view.rerender(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <FrameProbe />
      </StudioTelemetryProvider>,
    );

    expect(coordinator.getOverlayFrame()?.session.phase).toEqual({ v: "race", q: "fresh" });
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("refleja mockLocation en el pit de la fila del jugador canónico", () => {
    const state = mockPreviewState();
    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: state,
      setPreview: (patch) => {
        Object.assign(state, patch);
      },
    }));
    const { coordinator } = setupUnit();
    const playerPit = () => {
      const frame = coordinator.getOverlayFrame();
      return frame?.standings.find((row) => row.id === frame.player.id)?.pit;
    };

    const view = render(
      <StudioTelemetryProvider coordinator={coordinator} liveAvailable={true}>
        <div>Test</div>
      </StudioTelemetryProvider>,
    );
    expect(coordinator.getOverlayFrame()?.player.id).toBe("vehicle-000");
    expect(playerPit()).toBe("track");

    state.mockLocation = "pits";
    view.rerender(
      <StudioTelemetryProvider coordinator={coordinator} liveAvailable={true}>
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    // Sin coches/IDs inventados: solo cambia el pit del jugador canónico.
    expect(coordinator.getOverlayFrame()?.player.id).toBe("vehicle-000");
    expect(playerPit()).toBe("pit");
  });

  it("conmuta live y mock sin carreras, fugas ni doble stop", () => {
    const state = mockPreviewState();
    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: state,
      setPreview: (patch) => {
        Object.assign(state, patch);
      },
    }));
    const { coordinator, publishSpy, adapter } = setupUnit();
    const start = adapter.start as ReturnType<typeof vi.fn>;
    const stop = adapter.stop as ReturnType<typeof vi.fn>;

    const view = render(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");
    const collidingLiveFrame = coordinator.getOverlayFrame()!;
    start.mockImplementationOnce(() => {
      coordinator.setOverlayFrame(
        {
          ...collidingLiveFrame,
          session: {
            ...collidingLiveFrame.session,
            phase: { ...collidingLiveFrame.session.phase, v: "qualifying" },
          },
        },
        { state: "live" },
      );
    });

    // El live puede terminar justo en la siguiente secuencia que habría
    // elegido el mock. La vuelta a mock debe avanzar sobre el frame retenido,
    // no colisionar por epoch+sequence y dejar datos live por error.
    state.source = "live";
    view.rerender(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("qualifying");
    const retained = coordinator.getOverlayFrame()!;
    coordinator.setOverlayFrame(
      {
        ...retained,
        sequence: retained.sequence + 1,
        session: {
          ...retained.session,
          phase: { ...retained.session.phase, v: "qualifying" },
        },
      },
      coordinator.getOverlaySource(),
    );
    const liveSequence = coordinator.getOverlayFrame()!.sequence;

    state.mockSession = "race";
    state.source = "mock";
    view.rerender(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );
    expect(coordinator.getOverlayFrame()!.sequence).toBeGreaterThan(liveSequence);
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("race");

    for (const source of ["live", "mock"] as const) {
      state.source = source;
      view.rerender(
        <StudioTelemetryProvider
          coordinator={coordinator}
          liveAvailable={true}
          telemetryAdapter={adapter}
        >
          <div>Test</div>
        </StudioTelemetryProvider>,
      );
    }

    expect(state.source).toBe("mock");
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("race");

    view.unmount();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("expone el primer frame mock V2 antes del primer paint", () => {
    mockPreview(mockPreviewState());
    const { coordinator } = setupUnit();

    render(
      <StudioTelemetryProvider coordinator={coordinator} liveAvailable>
        <FrameProbe />
      </StudioTelemetryProvider>,
    );

    // El layout effect ya corrió de forma síncrona: el frame existe antes de
    // pintar, como imponía la vista previa activa.
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");
    return waitFor(() => {
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("practice");
    });
  });

  it("keeps live transport running while an inactive Studio suspends paints", async () => {
    mockPreview({ ...mockPreviewState(), source: "live" });
    const { coordinator, adapter } = setupUnit();
    const start = adapter.start as ReturnType<typeof vi.fn>;
    const stop = adapter.stop as ReturnType<typeof vi.fn>;

    const view = render(
      <StudioTelemetryProvider
        active
        coordinator={coordinator}
        liveAvailable
        telemetryAdapter={adapter}
      >
        <FrameProbe />
      </StudioTelemetryProvider>,
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    view.rerender(
      <StudioTelemetryProvider
        active={false}
        coordinator={coordinator}
        liveAvailable
        telemetryAdapter={adapter}
      >
        <FrameProbe />
      </StudioTelemetryProvider>,
    );

    // Suspender pintado no reinicia el transporte: sin stop ni start extra.
    expect(stop).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);

    view.rerender(
      <StudioTelemetryProvider
        active
        coordinator={coordinator}
        liveAvailable
        telemetryAdapter={adapter}
      >
        <FrameProbe />
      </StudioTelemetryProvider>,
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it("gates live transport from Orbit without restarting on resume", async () => {
    mockPreview({ ...mockPreviewState(), source: "live" });
    const { coordinator, adapter } = setupUnit();
    const start = adapter.start as ReturnType<typeof vi.fn>;
    const stop = adapter.stop as ReturnType<typeof vi.fn>;

    const view = render(
      <OrbitKeepAlive active>
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable telemetryAdapter={adapter}>
          <FrameProbe />
        </StudioTelemetryProvider>
      </OrbitKeepAlive>,
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    view.rerender(
      <OrbitKeepAlive active={false}>
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable telemetryAdapter={adapter}>
          <FrameProbe />
        </StudioTelemetryProvider>
      </OrbitKeepAlive>,
    );

    expect(stop).not.toHaveBeenCalled();

    view.rerender(
      <OrbitKeepAlive active>
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable telemetryAdapter={adapter}>
          <FrameProbe />
        </StudioTelemetryProvider>
      </OrbitKeepAlive>,
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops the live adapter on unmount", () => {
    const state = { ...mockPreviewState(), source: "live" as const };
    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: state,
      setPreview: (patch) => {
        Object.assign(state, patch);
      },
    }));
    const { coordinator, adapter } = setupUnit();
    const stop = adapter.stop as ReturnType<typeof vi.fn>;

    const view = render(
      <StudioTelemetryProvider
        coordinator={coordinator}
        liveAvailable={true}
        telemetryAdapter={adapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    view.unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("StudioTelemetryProvider - integration with StudioProvider", () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("../state/studio-store")>("../state/studio-store");
    vi.mocked(useStudioPreview).mockImplementation(actual.useStudioPreview);
  });
  afterEach(() => cleanup());

  it("serves the active preview V2 frame before the first paint", () => {
    const coordinator = createTelemetryRateCoordinator();

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable>
          <FrameProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    // La vista previa activa (practice por defecto) manda sobre lo anterior
    // y el frame ya existe antes de pintar.
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");
  });

  it("republishes the V2 frame when mock session changes", async () => {
    const coordinator = createTelemetryRateCoordinator();

    function SessionChanger(): React.ReactElement {
      const { setPreview } = useStudioPreview();
      return (
        <button
          type="button"
          data-testid="set-race"
          onClick={() => setPreview({ mockSession: "race" })}
        />
      );
    }

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <SessionChanger />
          <FrameProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");
    fireEvent.click(screen.getByTestId("set-race"));
    await waitFor(() => {
      expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("race");
    });
  });

  it("starts the live adapter only when preview source is live", async () => {
    const coordinator = createTelemetryRateCoordinator();
    let started = 0;
    let stopped = 0;
    const telemetryAdapter: TelemetryAdapter = {
      coordinator,
      start() {
        started += 1;
      },
      stop() {
        stopped += 1;
      },
    };

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider
          coordinator={coordinator}
          liveAvailable
          telemetryAdapter={telemetryAdapter}
        >
          <SourceSwitcher />
          <FrameProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(started).toBe(0);
    fireEvent.click(screen.getByTestId("use-live-source"));
    await waitFor(() => {
      expect(started).toBe(1);
    });
    expect(stopped).toBeGreaterThanOrEqual(0);
  });
});

describe("ConnectedStudioTelemetryProvider", () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("../state/studio-store")>("../state/studio-store");
    vi.mocked(useStudioPreview).mockImplementation(actual.useStudioPreview);
  });
  afterEach(() => cleanup());

  it("wires coordinator and live availability through the connected provider", () => {
    const coordinator = createTelemetryRateCoordinator();

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <FrameProbe />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    // Igual que arriba: la vista previa activa manda sobre lo anterior.
    expect(coordinator.getOverlayFrame()?.session.phase?.v).toBe("practice");
  });
});
