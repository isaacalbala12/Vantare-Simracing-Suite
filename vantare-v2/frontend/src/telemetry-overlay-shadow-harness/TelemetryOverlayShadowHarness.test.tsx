import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryOverlayShadowHarness } from "./TelemetryOverlayShadowHarness";

afterEach(() => cleanup());

describe("TelemetryOverlayShadowHarness", () => {
  it("identifies itself as a local non-live diagnostic", () => {
    render(<TelemetryOverlayShadowHarness />);

    expect(screen.getByText("DIAGNÓSTICO SHADOW — NO LIVE")).toBeTruthy();
    expect(screen.getByText(/fixture local, sin conexión live/i)).toBeTruthy();
    expect(screen.queryByText(/LMU conectado/i)).toBeNull();
    expect(screen.getByTestId("shadow-harness-root").getAttribute("data-productive"))
      .toBe("false");
  });

  it("offers every fixed scenario and keeps the report summary stable", () => {
    render(<TelemetryOverlayShadowHarness />);

    const selector = screen.getByLabelText("Escenario diagnóstico");
    const values = within(selector).getAllByRole("option").map((option) =>
      (option as HTMLOptionElement).value
    );
    expect(values).toEqual(["equal", "partial", "stale", "disconnected", "unsupported"]);
    expect(screen.getByTestId("shadow-contract-version").textContent).toBe("v1");
    expect(screen.getByTestId("shadow-widget-count").textContent).toBe("1");
    expect(screen.getByTestId("shadow-result-list").children).toHaveLength(1);
  });

  it("shows the legitimate Pedals zero instead of treating it as absent", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="equal" />);

    const pedals = screen.getByTestId("shadow-widget-pedals");
    expect(within(pedals).getByText("Pedals")).toBeTruthy();
    expect(within(pedals).getAllByText("0")).toHaveLength(6);
    expect(within(pedals).queryByText(/missing-projection/i)).toBeNull();
  });

  it("makes Delta and Relative unsupported coverage explicit", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="unsupported" />);

    expect(screen.getByTestId("shadow-widget-delta").textContent)
      .toMatch(/no comparable|unsupported-by-projection/i);
    expect(screen.getByTestId("shadow-widget-relative").textContent)
      .toMatch(/no comparable|unsupported-by-projection/i);
  });

  it("distinguishes partial, stale and disconnected without implying live data", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="partial" />);
    expect(screen.getByTestId("shadow-scenario-state").textContent).toMatch(/parcial/i);
    expect(screen.getByTestId("shadow-widget-standings").textContent)
      .toMatch(/unsupported-by-projection/i);

    fireEvent.change(screen.getByLabelText("Escenario diagnóstico"), {
      target: { value: "stale" },
    });
    expect(screen.getByTestId("shadow-scenario-state").textContent).toMatch(/stale/i);
    expect(screen.getByTestId("shadow-widget-pedals").textContent)
      .toMatch(/stale-projection/i);

    fireEvent.change(screen.getByLabelText("Escenario diagnóstico"), {
      target: { value: "disconnected" },
    });
    expect(screen.getByTestId("shadow-scenario-state").textContent)
      .toMatch(/desconectado/i);
    expect(screen.getByTestId("shadow-widget-pedals").textContent).toMatch(/blocked/i);
    expect(document.body.textContent).not.toMatch(/LMU conectado/i);
  });

  it("renders only the sanitized report and no raw data or identifying canaries", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="partial" />);

    const dom = document.body.innerHTML;
    for (const forbidden of [
      "PRIVATE_DRIVER_SHADOW_105",
      "PRIVATE_TEAM_SHADOW_105",
      "PRIVATE_VEHICLE_ID_SHADOW_105",
      "C:/Users/isaac/private/session.ld",
      "playerVehicleId",
      "canonicalVersion",
      "rawPayload",
    ]) {
      expect(dom).not.toContain(forbidden);
    }
    expect(document.querySelector("[data-raw-payload]")).toBeNull();
    expect(document.querySelector("[data-profile-dirty]")).toBeNull();
    expect(document.querySelector("[data-studio], [data-desktop], [data-obs]"))
      .toBeNull();
  });

  it("marks the essential result regions for every responsive layout", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="partial" />);

    expect(screen.getByTestId("shadow-summary").getAttribute("data-essential"))
      .toBe("true");
    expect(screen.getByTestId("shadow-result-list").getAttribute("data-essential"))
      .toBe("true");
    expect(screen.getByTestId("shadow-report-status").textContent).not.toBe("");
  });
});
