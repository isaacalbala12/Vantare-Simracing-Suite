import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { resetTelemetryRef, clearRuntimeTelemetry, getTelemetryRef } from "./telemetry-ref";
import { useDemoMode } from "./useDemoMode";
import * as mockTelemetryModule from "../overlay/widgets/mock-telemetry";

vi.mock("../overlay/widgets/mock-telemetry", () => ({
  generateAnimatedTelemetry: vi.fn(() => ({
    seq: 1,
    snapshot: {
      connected: true,
      sessionState: "session" as const,
      sessionType: 3,
      playerHasVehicle: true,
      player: { speed: 100, gear: 4, engineRPM: 8000, deltaBest: 0.5, throttle: 50, brake: 10, clutch: 0 },
      vehicles: [{ id: 1, driverName: "Test", timeGapToPlayer: 0, inPits: false }],
    },
  })),
}));

const mockGenerate = vi.mocked(mockTelemetryModule.generateAnimatedTelemetry);

describe("useDemoMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTelemetryRef();
    mockGenerate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pumps telemetry at the requested frequency", () => {
    // 10 Hz = 100ms interval
    const { unmount } = renderHook(() => useDemoMode(true, 10, false));

    expect(mockGenerate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(mockGenerate).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("respects inPit parameter", () => {
    const { unmount } = renderHook(() => useDemoMode(true, 10, true));

    vi.advanceTimersByTime(100);
    expect(mockGenerate).toHaveBeenCalledWith(expect.any(Number), true);

    unmount();
  });

  it("does not fire intervals when disabled", () => {
    const { unmount } = renderHook(() => useDemoMode(false, 10, false));

    vi.advanceTimersByTime(1000);
    expect(mockGenerate).not.toHaveBeenCalled();

    unmount();
  });

  it("stops interval after unmount", () => {
    const { unmount } = renderHook(() => useDemoMode(true, 10, false));

    vi.advanceTimersByTime(100);
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(1000);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("exports clearRuntimeTelemetry which resets state", () => {
    clearRuntimeTelemetry();
    expect(getTelemetryRef().connected).toBe(false);
    expect(getTelemetryRef().speed).toBe(0);
  });
});
