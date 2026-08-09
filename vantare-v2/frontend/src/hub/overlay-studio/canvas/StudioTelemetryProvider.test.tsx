import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import type { TelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { TelemetryAdapter } from "../../../overlay/transports/wails-telemetry-adapter";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";
import { useStudioPreview } from "../state/studio-store";

vi.mock("../state/studio-store", () => ({
  useStudioPreview: vi.fn(),
}));

describe("StudioTelemetryProvider - single merged effect", () => {
  let mockCoordinator: TelemetryRateCoordinator;
  let mockAdapter: TelemetryAdapter;
  let publishHistory: TelemetrySnapshot[] = [];
  let adapterStarted = false;

  beforeEach(() => {
    publishHistory = [];
    adapterStarted = false;
    vi.clearAllMocks();

    mockCoordinator = {
      publish: vi.fn((snapshot) => {
        publishHistory.push(snapshot);
      }),
      getLatestSnapshot: vi.fn(() => publishHistory[publishHistory.length - 1] || null),
      getSnapshot: vi.fn(() => publishHistory[publishHistory.length - 1] || null),
      subscribe: vi.fn(() => () => {}),
    } as any;

    mockAdapter = {
      coordinator: mockCoordinator,
      start: vi.fn(() => {
        adapterStarted = true;
      }),
      stop: vi.fn(() => {
        adapterStarted = false;
        mockCoordinator.publish({
          status: "disconnected",
          timestamp: Date.now(),
        } as any);
      }),
    };
  });

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
    const mockSetPreview = vi.fn();
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
    const mockSetPreview = vi.fn();
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

  it("should not publish after unmount", async () => {
    const mockSetPreview = vi.fn();
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

    const { unmount, rerender } = render(
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
    const mockSetPreview = vi.fn();
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
