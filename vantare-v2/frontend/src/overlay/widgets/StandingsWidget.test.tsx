import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
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

describe("StandingsWidget with custom design system Header", () => {
  beforeEach(async () => {
    // Register built-in systems so vantare-v3 is available
    const { registerBuiltinDesignSystems, _resetBuiltinRegistration } = await import("../../hub/registry/builtin-systems");
    const { clearDesignSystemRegistry } = await import("../../hub/registry/design-system-registry");
    clearDesignSystemRegistry();
    _resetBuiltinRegistration();
    registerBuiltinDesignSystems();
  });

  it("renders the VantareV3StandingsHeader when style is vantare-v3", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "vantare-v3" }}
        />
      );
    });
    // The custom header renders with a data-testid
    expect(screen.getByTestId("vantare-v3-standings-header")).toBeDefined();
  });

  it("renders the built-in Header when style is not registered", async () => {
    await act(async () => {
      render(
        <StandingsWidget
          editMode={true}
          telemetryMode="mock"
          props={{ style: "unknown-style" }}
        />
      );
    });
    // The built-in header contains "VANTARE" text; the custom one would have "vantare-v3-standings-header"
    expect(screen.queryByTestId("vantare-v3-standings-header")).toBeNull();
    expect(screen.getByTestId("standings-panel").textContent).toContain("VANTARE");
  });
});
