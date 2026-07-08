import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { DeltaWidget, formatDelta, formatLapTime } from "./DeltaWidget";

vi.mock("../../lib/telemetry-ref", () => ({
  getTelemetryRef: () => ({
    seq: 1,
    connected: true,
    playerHasVehicle: true,
    sessionType: 10,
    sessionName: "PRACTICE1",
    sessionEpoch: 1,
    sessionKey: "mock|Circuit de Barcelona|race",
    sessionState: "session",
    timeRemaining: 5328,
    speed: 245,
    gear: 4,
    rpm: 8750,
    fuel: 68,
    deltaBest: -0.150,
    trackName: "Circuit de Barcelona",
    throttle: 78,
    brake: 12,
    clutch: 0,
    vehicles: [
      { id: 0, driverName: "ALPINE", driverNumber: "36", place: 1, isPlayer: true, inPits: false, timeBehindLeader: 0, totalLaps: 34, vehicleClass: "HYPERCAR", teamBrandColor: "#0055A4", tireCompound: "M", fastestLap: false, bestLapTime: 89.823, lastLapTime: 90.412, timeGapToPlayer: 0 },
    ],
  }),
}));

afterEach(() => cleanup());

describe("DeltaWidget", () => {
  it("renders with base theme without errors", async () => {
    await act(async () => {
      render(
        <DeltaWidget
          editMode={true}
          telemetryMode="mock"
          props={{}}
        />
      );
    });
    const targets = screen.getAllByText(/Target/);
    expect(targets.length).toBeGreaterThanOrEqual(1);
    const laps = screen.getAllByText(/Lap/);
    expect(laps.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with vantare-crystal theme without errors", async () => {
    await act(async () => {
      render(
        <DeltaWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    const targets = screen.getAllByText(/Target/);
    expect(targets.length).toBe(1);
    const laps = screen.getAllByText(/Lap/);
    expect(laps.length).toBe(1);
  });

  it("renders key elements with crystal theme (target, lap, delta display)", async () => {
    await act(async () => {
      render(
        <DeltaWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    expect(screen.getAllByText(/Target/).length).toBe(1);
    expect(screen.getAllByText(/Lap/).length).toBe(1);
    expect(screen.getAllByText(/-0\.150s/).length).toBe(1);
  });

  it("renders with vantare-crystal theme without errors", async () => {
    await act(async () => {
      render(
        <DeltaWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    expect(screen.getAllByText(/Target/).length).toBeGreaterThanOrEqual(1);
  });

  describe("formatDelta", () => {
    it("formats negative delta correctly", () => {
      expect(formatDelta(-0.150)).toBe("-0.150s");
    });

    it("formats positive delta correctly", () => {
      expect(formatDelta(0.250)).toBe("+0.250s");
    });

    it("returns dash for zero delta", () => {
      expect(formatDelta(0)).toBe("—");
    });

    it("returns dash for NaN", () => {
      expect(formatDelta(NaN)).toBe("—");
    });
  });

  describe("formatLapTime", () => {
    it("formats lap time correctly", () => {
      expect(formatLapTime(89.823)).toBe("1:29.823");
    });

    it("returns dash for undefined", () => {
      expect(formatLapTime(undefined)).toBe("—");
    });
  });
});
