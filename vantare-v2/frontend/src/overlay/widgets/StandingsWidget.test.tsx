import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { StandingsWidget } from "./StandingsWidget";
import { getMockTelemetry } from "./mock-telemetry";

vi.mock("../../lib/telemetry-ref", () => ({
  getTelemetryRef: () => getMockTelemetry(),
  resolveSessionMode: () => "practice",
}));

afterEach(() => cleanup());

describe("StandingsWidget", () => {
  it("renders with base theme without errors", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{}}
        />
      );
    });
    expect(screen.getByTestId("standings-panel")).toBeTruthy();
  });

  it("renders with vantare-crystal theme without errors", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    expect(screen.getByTestId("standings-panel")).toBeTruthy();
  });

  it("renders key elements with crystal theme (header, class, rows)", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    const panels = screen.getAllByTestId("standings-panel");
    expect(panels.length).toBe(1);
    expect(panels[0].textContent).toContain("VANTARE");
    expect(panels[0].textContent).toContain("LE MANS ULTIMATE");
  });

  it("renders with vantare-crystal theme without errors", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-crystal" }}
        />
      );
    });
    expect(screen.getByTestId("standings-panel")).toBeTruthy();
  });
});
