import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import {
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureWidget,
} from "./fixtures/authoring-fixtures";
import {
  readInputTelemetryHistory,
  recordInputTelemetrySample,
  resetInputTelemetryHistory,
} from "../widget-types/input-telemetry/input-telemetry-accumulator";

afterEach(() => {
  cleanup();
  resetInputTelemetryHistory();
});

describe("OverlayWorkshopDevRoute", () => {
  it("mounts the product visual host inside a root distinct from the authoring stage", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default" />);

    expect(document.querySelector("[data-overlay-workshop-stage]")).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-stage] [data-widget-renderer=delta]")).toBeTruthy();
    expect(screen.getByTestId("overlay-workshop-viewport")).toBeTruthy();
    expect(document.querySelector("[data-widget-host-diagnostic]")).toBeNull();
  });

  it("renders a visible error rather than mounting another design when selection is invalid", () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals&system=vantare-crystal&design=delta-crystal-simple" />);

    expect(screen.getByRole("alert").textContent).toContain("requires widget=delta");
    expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeNull();
  });

  it("keeps stage controls accessible and renders the comparison through the same host", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default&compare=obs" />);
    await waitFor(() => expect(document.querySelectorAll("[data-overlay-workshop-widget-root]")).toHaveLength(2));
    expect(screen.getByLabelText("Stage background")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Stage background"), { target: { value: "transparent" } });
    expect(document.querySelector(".overlay-workshop-stage--transparent")).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-surface=obs] [data-overlay-workshop-widget-root]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-surface=obs] .overlay-workshop-surface-label")).toBeNull();
  });

  it("applies declared preset dimensions and resets controls to the reproducible URL selection", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default&preset=720p" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Apply declared dimensions" }));
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("1280px"));
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "error" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset controls" }));
    expect((screen.getByLabelText("State") as HTMLSelectElement).value).toBe("ready");
    expect((screen.getByLabelText("System") as HTMLSelectElement).value).toBe("vantare-original");
  });

  it("edits width and height together through accessible fields", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "640" } });
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "240" } });
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px"));
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.height).toBe("240px");
  });

  it("seeds Input Telemetry after render without clearing unrelated histories in StrictMode", async () => {
    const scenario = {
      session: "race" as const,
      location: "track" as const,
      state: "ready" as const,
      widget: "input-telemetry" as const,
      system: "vantare-crystal" as const,
      surface: "studio" as const,
      variant: "default" as const,
      designId: "input-crystal-blade",
    };
    const snapshot = buildAuthoringFixtureTelemetry(scenario);
    recordInputTelemetrySample("unrelated-workshop-widget", snapshot);

    render(
      <StrictMode>
        <OverlayWorkshopDevRoute search="?widget=input-telemetry&system=vantare-crystal&design=input-crystal-blade&state=ready&surface=studio&variant=default" />
      </StrictMode>,
    );

    await waitFor(() => expect(document.querySelector("[data-widget-renderer=input-telemetry]")).toBeTruthy());
    const widget = buildAuthoringFixtureWidget(scenario);
    const seeded = readInputTelemetryHistory(widget.id, snapshot, 8);

    expect(seeded).toHaveLength(snapshot.derived?.inputHistory.length ?? 0);
    expect(readInputTelemetryHistory("unrelated-workshop-widget", snapshot, 8)).toHaveLength(1);
  });
});
