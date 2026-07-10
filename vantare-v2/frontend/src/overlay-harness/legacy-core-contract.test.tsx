import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CANONICAL_PLAYER_NAME, createWidgetPreviewTelemetry } from "../overlay/widgets/widget-preview-fixtures";
import { DeltaWidget } from "../overlay/widgets/DeltaWidget";
import { StandingsWidget } from "../overlay/widgets/StandingsWidget";
import { RelativeWidget } from "../overlay/widgets/RelativeWidget";
import { PedalsWidget } from "../overlay/widgets/PedalsWidget";

const raceFixture = () => createWidgetPreviewTelemetry("race");

vi.mock("../overlay/widgets/mock-telemetry", () => ({
  getMockTelemetry: () => raceFixture(),
  getMockTelemetryForSession: () => raceFixture(),
}));

vi.mock("../lib/telemetry-ref", () => ({
  getTelemetryRef: () => raceFixture(),
  resolveSessionMode: () => "race",
}));

afterEach(() => cleanup());

describe("legacy core widget render contract", () => {
  it("DeltaWidget renders meaningful race fixture output in mock mode", async () => {
    await act(async () => {
      render(<DeltaWidget editMode telemetryMode="mock" updateHz={30} props={{}} />);
    });
    expect(screen.getAllByText(/Target/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Lap 34/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/-0\.150s/).length).toBeGreaterThanOrEqual(1);
  });

  it("StandingsWidget renders the canonical standings panel", async () => {
    await act(async () => {
      render(<StandingsWidget editMode telemetryMode="mock" updateHz={8} props={{}} />);
    });
    const panel = screen.getByTestId("standings-panel");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain(CANONICAL_PLAYER_NAME);
  });

  it("RelativeWidget renders the canonical relative panel", async () => {
    await act(async () => {
      render(<RelativeWidget editMode telemetryMode="mock" updateHz={12} props={{}} />);
    });
    const panel = screen.getByTestId("relative-panel");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain(CANONICAL_PLAYER_NAME);
  });

  it("PedalsWidget renders pedal bars from the race fixture", async () => {
    await act(async () => {
      render(<PedalsWidget editMode telemetryMode="mock" updateHz={20} props={{}} />);
    });
    expect(screen.getByTestId("pedals-widget")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-thr")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-brk")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-clt")).toBeTruthy();
  });
});