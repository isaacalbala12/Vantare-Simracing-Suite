import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { PedalsWidget } from "./PedalsWidget";

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

describe("PedalsWidget", () => {
  it("renders with base theme without errors", async () => {
    await act(async () => {
      render(
        <PedalsWidget
          editMode={true}
          telemetryMode="mock"
          props={{}}
        />
      );
    });
    expect(screen.getByTestId("pedals-widget")).toBeTruthy();
  });

  it("renders with vantare-crystal theme without errors", async () => {
    await act(async () => {
      render(
        <PedalsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    expect(screen.getByTestId("pedals-widget")).toBeTruthy();
  });

  it("renders key elements with crystal theme (pedal bars for clutch, brake, throttle)", async () => {
    await act(async () => {
      render(
        <PedalsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    const widgets = screen.getAllByTestId("pedals-widget");
    expect(widgets.length).toBe(1);
    expect(screen.getByTestId("pedal-bar-clt")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-brk")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-thr")).toBeTruthy();
  });

  it("renders with glassmorphism-pro theme without errors", async () => {
    await act(async () => {
      render(
        <PedalsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "glassmorphism-pro" }}
        />
      );
    });
    expect(screen.getByTestId("pedals-widget")).toBeTruthy();
  });
});
