import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryOverlayShadowHarness } from "./TelemetryOverlayShadowHarness";
import {
  SHADOW_HARNESS_SCENARIOS,
  buildShadowHarnessCoverage,
  buildShadowHarnessReport,
} from "./evidence";

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
    expect(values).toEqual(SHADOW_HARNESS_SCENARIOS);
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

  it("shows the D7 Delta and Relative coverage without claiming missing fields", () => {
    render(<TelemetryOverlayShadowHarness initialScenario="unsupported" />);

    expect(screen.getByTestId("shadow-widget-delta").textContent)
      .toMatch(/cobertura exacta/i);
    expect(screen.getByTestId("shadow-widget-delta").textContent)
      .toMatch(/missing-projection/i);
    expect(screen.getByTestId("shadow-widget-relative").textContent)
      .toMatch(/cobertura parcial/i);
    expect(screen.getByTestId("shadow-widget-relative").textContent)
      .toMatch(/missing-projection|unsupported-by-projection/i);
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

  it("derives reproducible evidence from the real registry, policies and comparator", () => {
    const coverage = buildShadowHarnessCoverage();
    const report = buildShadowHarnessReport("partial");

    expect(coverage).toMatchObject({
      contractVersion: 1,
      registeredDefinitions: 19,
      policyDefinitions: 19,
      coveredDefinitions: 19,
      complete: true,
    });
    expect(coverage.widgets).toHaveLength(19);
    expect(report.summary).toEqual({
      widgets: 2,
      fields: 31,
      equal: 19,
      withinTolerance: 0,
      mismatches: 12,
      external: 0,
    });
    expect(report.widgets.map((widget) => widget.widgetType)).toEqual(["pedals", "standings"]);
    expect(report.widgets.find((widget) => widget.widgetType === "standings")?.entries)
      .toContainEqual(expect.objectContaining({
        path: "rows[].id",
        classification: "equal",
        sourcePaths: ["vehicles[].id"],
      }));
    expect(JSON.stringify({ coverage, report })).not.toMatch(
      /PRIVATE_(?:DRIVER|TEAM|VEHICLE_ID|TRACK)_SHADOW_105|C:\\Users\\|C:\/Users\//,
    );
  });
});
