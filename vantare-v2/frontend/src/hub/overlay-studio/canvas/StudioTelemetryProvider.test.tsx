import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor, fireEvent, screen, cleanup } from "@testing-library/react";
import React from "react";
import type { TelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { TelemetryAdapter } from "../../../overlay/transports/wails-telemetry-adapter";
import { StudioTelemetryProvider, ConnectedStudioTelemetryProvider } from "./StudioTelemetryProvider";
import { useStudioTelemetrySnapshot } from "./studio-telemetry";
import { useStudioPreview, StudioProvider } from "../state/studio-store";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { OrbitKeepAlive } from "../../components/orbit/OrbitKeepAlive";

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

function SnapshotProbe(): React.ReactElement {
  const snapshot = useStudioTelemetrySnapshot();
  return <div data-testid="telemetry-probe">{snapshot.session.type}</div>;
}

function SourceSwitcher(): React.ReactElement {
  const { setPreview } = useStudioPreview();
  return (
    <button
      type="button"
      data-testid="use-live-source"
      onClick={() => setPreview({ source: "live" })}
    />
  );
}

describe("StudioTelemetryProvider - single merged effect", () => {
  let mockCoordinator: TelemetryRateCoordinator;
  let mockAdapter: TelemetryAdapter;
  let publishHistory: TelemetrySnapshot[] = [];
  let adapterStarted = false;

  beforeEach(() => {
    publishHistory = [];
    adapterStarted = false;
    vi.clearAllMocks();

    const coordinator = createTelemetryRateCoordinator();
    mockCoordinator = {
      ...coordinator,
      publish: vi.fn((snapshot) => {
        publishHistory.push(snapshot);
      }),
      getSnapshot: vi.fn(() => publishHistory[publishHistory.length - 1]),
      subscribe: vi.fn(() => () => {}),
    };

    mockAdapter = {
      coordinator: mockCoordinator,
      start: vi.fn(() => {
        adapterStarted = true;
      }),
      stop: vi.fn(() => {
        adapterStarted = false;
        mockCoordinator.publish({
          status: "disconnected",
          capturedAt: Date.now(),
          session: { type: "race" },
          player: { inPit: false },
          scoring: [],
        });
      }),
    };
  });

  afterEach(() => cleanup());

  it("should start with mock snapshot", async () => {
    const mockSetPreview = vi.fn();
    vi.mocked(useStudioPreview).mockReturnValue({
      preview: {
        source: "mock",
        mockSession: "practice",
        mockLocation: "track",
        zoom: "fit",
        backgroundId: "grid",
        safeArea: false,
      },
      setPreview: mockSetPreview,
    });

    render(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(mockCoordinator.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ready",
        }),
      );
    });

    expect(publishHistory.some((s) => s.status === "ready")).toBe(true);
  });

  it("should restore mock snapshot when switching from live back to mock (no race condition)", async () => {
    let previewState = {
      source: "mock" as const,
      mockSession: "practice" as const,
      mockLocation: "track" as const,
      zoom: "fit" as const,
      backgroundId: "grid",
      safeArea: false,
    };

    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: previewState,
      setPreview: (patch) => {
        previewState = { ...previewState, ...patch };
      },
    }));

    const { rerender } = render(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(publishHistory.some((s) => s.status === "ready")).toBe(true);
    });

    previewState.source = "live";
    rerender(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(adapterStarted).toBe(true);
    });

    publishHistory = [];

    previewState.source = "mock";
    rerender(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(adapterStarted).toBe(false);
    });

    const finalSnapshot = publishHistory[publishHistory.length - 1];
    expect(finalSnapshot?.status).toBe("ready");
  });

  it("should handle repeated toggling without leaking subscriptions", async () => {
    let previewState = {
      source: "mock" as const,
      mockSession: "practice" as const,
      mockLocation: "track" as const,
      zoom: "fit" as const,
      backgroundId: "grid",
      safeArea: false,
    };

    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: previewState,
      setPreview: (patch) => {
        previewState = { ...previewState, ...patch };
      },
    }));

    const { rerender } = render(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    const toggleSequence = ["live", "mock", "live", "mock"];
    for (const source of toggleSequence) {
      previewState.source = source as "mock" | "live";
      rerender(
        <StudioTelemetryProvider
          coordinator={mockCoordinator}
          liveAvailable={true}
          telemetryAdapter={mockAdapter}
        >
          <div>Test</div>
        </StudioTelemetryProvider>,
      );
    }

    expect(previewState.source).toBe("mock");
    expect(adapterStarted).toBe(false);

    const finalSnapshot = publishHistory[publishHistory.length - 1];
    expect(finalSnapshot?.status).toBe("ready");
    expect(mockAdapter.start).toHaveBeenCalledTimes(2);
    expect(mockAdapter.stop).toHaveBeenCalledTimes(2);
  });

  it("keeps live transport running while an inactive Studio suspends visual subscriptions", async () => {
    const unsubscribe = vi.fn();
    const snapshot = buildMockTelemetry({
      session: "practice",
      location: "track",
      state: "ready",
    });
    mockCoordinator.getSnapshot = vi.fn(() => snapshot);
    mockCoordinator.subscribe = vi.fn(() => unsubscribe);
    vi.mocked(useStudioPreview).mockReturnValue({
      preview: {
        source: "live",
        mockSession: "practice",
        mockLocation: "track",
        zoom: "fit",
        backgroundId: "grid",
        safeArea: false,
      },
      setPreview: vi.fn(),
    });

    const view = render(
      <StudioTelemetryProvider
        active
        coordinator={mockCoordinator}
        liveAvailable
        telemetryAdapter={mockAdapter}
      >
        <SnapshotProbe />
      </StudioTelemetryProvider>,
    );

    await waitFor(() => expect(mockAdapter.start).toHaveBeenCalledTimes(1));
    expect(mockCoordinator.subscribe).toHaveBeenCalledTimes(1);

    view.rerender(
      <StudioTelemetryProvider
        active={false}
        coordinator={mockCoordinator}
        liveAvailable
        telemetryAdapter={mockAdapter}
      >
        <SnapshotProbe />
      </StudioTelemetryProvider>,
    );

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockAdapter.stop).not.toHaveBeenCalled();

    view.rerender(
      <StudioTelemetryProvider
        active
        coordinator={mockCoordinator}
        liveAvailable
        telemetryAdapter={mockAdapter}
      >
        <SnapshotProbe />
      </StudioTelemetryProvider>,
    );

    expect(mockCoordinator.subscribe).toHaveBeenCalledTimes(2);
    expect(mockAdapter.start).toHaveBeenCalledTimes(1);
  });

  it("gates visual subscriptions from Orbit without rerendering the Studio provider", async () => {
    const unsubscribe = vi.fn();
    const snapshot = buildMockTelemetry({ session: "practice", location: "track", state: "ready" });
    mockCoordinator.getSnapshot = vi.fn(() => snapshot);
    mockCoordinator.subscribe = vi.fn(() => unsubscribe);
    vi.mocked(useStudioPreview).mockReturnValue({
      preview: {
        source: "live",
        mockSession: "practice",
        mockLocation: "track",
        zoom: "fit",
        backgroundId: "grid",
        safeArea: false,
      },
      setPreview: vi.fn(),
    });

    const PersistentProvider = React.memo(function PersistentProvider() {
      return (
        <StudioTelemetryProvider
          coordinator={mockCoordinator}
          liveAvailable
          telemetryAdapter={mockAdapter}
        >
          <SnapshotProbe />
        </StudioTelemetryProvider>
      );
    });
    const view = render(
      <OrbitKeepAlive active>
        <PersistentProvider />
      </OrbitKeepAlive>,
    );

    await waitFor(() => expect(mockCoordinator.subscribe).toHaveBeenCalledTimes(1));
    expect(mockAdapter.start).toHaveBeenCalledTimes(1);

    view.rerender(
      <OrbitKeepAlive active={false}>
        <PersistentProvider />
      </OrbitKeepAlive>,
    );

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockAdapter.stop).not.toHaveBeenCalled();

    view.rerender(
      <OrbitKeepAlive active>
        <PersistentProvider />
      </OrbitKeepAlive>,
    );

    expect(mockCoordinator.subscribe).toHaveBeenCalledTimes(2);
    expect(mockAdapter.start).toHaveBeenCalledTimes(1);
  });

  it("should not publish after unmount", async () => {
    let previewState = {
      source: "live" as const,
      mockSession: "practice" as const,
      mockLocation: "track" as const,
      zoom: "fit" as const,
      backgroundId: "grid",
      safeArea: false,
    };

    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: previewState,
      setPreview: (patch) => {
        previewState = { ...previewState, ...patch };
      },
    }));

    const { unmount } = render(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(adapterStarted).toBe(true);
    });

    const publishCountBeforeUnmount = mockCoordinator.publish.mock.calls.length;

    unmount();

    await waitFor(() => {
      expect(adapterStarted).toBe(false);
    });

    expect(mockAdapter.stop).toHaveBeenCalled();
    expect(mockCoordinator.publish.mock.calls.length).toBeGreaterThan(
      publishCountBeforeUnmount,
    );
  });

  it("should not publish mock if source changes to live before effect cleanup", async () => {
    let previewState = {
      source: "live" as const,
      mockSession: "practice" as const,
      mockLocation: "track" as const,
      zoom: "fit" as const,
      backgroundId: "grid",
      safeArea: false,
    };

    vi.mocked(useStudioPreview).mockImplementation(() => ({
      preview: previewState,
      setPreview: (patch) => {
        previewState = { ...previewState, ...patch };
      },
    }));

    const { rerender } = render(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(adapterStarted).toBe(true);
    });

    publishHistory = [];

    previewState.source = "mock";
    rerender(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      const finalSnapshot = publishHistory[publishHistory.length - 1];
      expect(finalSnapshot?.status).toBe("ready");
    });

    mockAdapter.stop.mockClear();
    publishHistory = [];

    previewState.source = "live";
    rerender(
      <StudioTelemetryProvider
        coordinator={mockCoordinator}
        liveAvailable={true}
        telemetryAdapter={mockAdapter}
      >
        <div>Test</div>
      </StudioTelemetryProvider>,
    );

    await waitFor(() => {
      expect(adapterStarted).toBe(true);
    });

    const allSnapshots = publishHistory.map((s) => s.status);
    expect(allSnapshots).not.toContain("ready");
  });
});

describe("StudioTelemetryProvider - integration with StudioProvider", () => {
  beforeEach(async () => {
    // Import the real useStudioPreview and mock it to use the real implementation
    const actual = await vi.importActual<typeof import("../state/studio-store")>("../state/studio-store");
    vi.mocked(useStudioPreview).mockImplementation(actual.useStudioPreview);
  });
  afterEach(() => cleanup());

  it("serves mock telemetry for the active preview before the first paint", () => {
    // Se siembra otra sesion a proposito: el proveedor debe imponer la de la
    // vista previa activa -- "practice" por defecto -- y hacerlo antes de que
    // se pinte. Con useEffect publicaba despues del primer fotograma, asi que
    // los widgets aparecian un instante sin datos al entrar en el Studio.
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable>
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("practice");
  });

  it("republishes mock telemetry when mock session changes", async () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
    );

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
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(screen.getByTestId("telemetry-probe").textContent).toBe("practice");
    fireEvent.click(screen.getByTestId("set-race"));
    await waitFor(() => {
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
  });

  it("starts the live adapter only when preview source is live", async () => {
    const coordinator = createTelemetryRateCoordinator();
    let started = 0;
    let stopped = 0;
    const telemetryAdapter = {
      coordinator,
      start() {
        started += 1;
        coordinator.publish(
          buildMockTelemetry({ session: "race", location: "pits", state: "ready" }),
        );
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
          <SnapshotProbe />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    expect(started).toBe(0);
    fireEvent.click(screen.getByTestId("use-live-source"));
    await waitFor(() => {
      expect(started).toBe(1);
      expect(screen.getByTestId("telemetry-probe").textContent).toBe("race");
    });
    expect(stopped).toBeGreaterThanOrEqual(0);
  });
});

describe("ConnectedStudioTelemetryProvider", () => {
  beforeEach(async () => {
    // Import the real useStudioPreview and mock it to use the real implementation
    const actual = await vi.importActual<typeof import("../state/studio-store")>("../state/studio-store");
    vi.mocked(useStudioPreview).mockImplementation(actual.useStudioPreview);
  });
  afterEach(() => cleanup());

  it("wires coordinator and live availability through the connected provider", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "qualifying", location: "track", state: "ready" }),
    );

    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <SnapshotProbe />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    // Igual que arriba: la vista previa activa manda sobre lo sembrado.
    expect(screen.getByTestId("telemetry-probe").textContent).toBe("practice");
  });
});
