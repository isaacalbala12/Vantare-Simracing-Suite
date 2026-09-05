import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import { ALL_WIDGET_TYPES } from "../core/profile-document";
import { parseOverlayWorkshopQuery } from "./overlay-workshop-query";

afterEach(() => {
  cleanup();
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
    expect(screen.getByLabelText("Fondo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Fondo"), { target: { value: "transparent" } });
    expect(document.querySelector(".overlay-workshop-stage--transparent")).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-surface=obs] [data-overlay-workshop-widget-root]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-surface=obs] .overlay-workshop-surface-label")).toBeNull();
  });

  it("applies declared preset dimensions and resets controls to the reproducible URL selection", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default&preset=720p" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Aplicar tamaño declarado" }));
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("1280px"));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "error" } });
    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe("ready");
    expect((screen.getByLabelText("Sistema") as HTMLSelectElement).value).toBe("vantare-original");
  });

  it("edits width and height together through accessible fields", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "640" } });
    fireEvent.change(screen.getByLabelText("Alto"), { target: { value: "240" } });
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px"));
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.height).toBe("240px");
  });

  it("keeps invalid declared dimensions as local drafts without changing the rendered root or URL", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&width=640&height=240" />);
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px"));
    const initialSearch = window.location.search;

    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "12" } });

    expect((screen.getByLabelText("Ancho") as HTMLInputElement).value).toBe("12");
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px");
    expect(window.location.search).toBe(initialSearch);
    expect("error" in parseOverlayWorkshopQuery(window.location.search)).toBe(false);
  });

  it("represents valid non-preset scale deep-links honestly and preserves their round trip", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&scale=0.3" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());

    expect((screen.getByLabelText("Escala") as HTMLInputElement).value).toBe("0.3");
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.transform).toContain("scale(0.3)");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("scale=0.3");
  });

  it("renders Input history from the canonical V2 frame without seeding", async () => {
    render(
      <StrictMode>
        <OverlayWorkshopDevRoute search="?widget=input-telemetry&system=vantare-crystal&design=input-crystal-blade&state=ready&surface=studio&variant=default" />
      </StrictMode>,
    );

    await waitFor(() => expect(document.querySelector("[data-widget-renderer=input-telemetry]")).toBeTruthy());
    expect(document.querySelector(".vc-input-graph path")?.getAttribute("d")).toContain("L");
  });

  it("renders each default widget marker", async () => {
    expect(ALL_WIDGET_TYPES).toHaveLength(20);
    for (const widget of ALL_WIDGET_TYPES) {
      cleanup();
      const system = widget === "engineer-radio" ? "vantare-crystal" : widget === "track-map" ? "vantare-endurance" : "vantare-original";
      render(<OverlayWorkshopDevRoute search={`?widget=${widget}&system=${system}&state=ready&surface=obs`} />);
      await waitFor(() =>
        expect(document.querySelector(`[data-widget-renderer="${widget}"]`)).toBeTruthy(),
      );
    }
  });

  // A scene shapes the widget as well as the snapshot. The Workshop used to
  // pass the scene only to the telemetry, so the standings kept the player's
  // class alone and the best-lap column off: the fastest-lap scene handed the
  // crown between two cars that were not on screen, and no glyph could ever
  // appear.
  it("builds the widget from the scene, not just the telemetry", async () => {
    render(
      <OverlayWorkshopDevRoute search="?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs&scene=standings-fastest-lap" />,
    );

    await waitFor(() =>
      expect(document.querySelector("[data-overlay-workshop-widget-root] [data-standings-row]")).toBeTruthy(),
    );

    const classes = new Set(
      [...document.querySelectorAll("[data-standings-row]")].map((row) =>
        row.getAttribute("data-class"),
      ),
    );
    expect(classes.size).toBeGreaterThan(1);

    // Overlay V2 no declara bestLap por coche: se conserva la columna sin
    // inventar una corona desde la fixture V1.
    expect(document.querySelector(".ven-red-fastest")).toBeNull();
  });

  it("exposes reproducible minimal and all-column Redline fixtures", async () => {
    const { unmount } = render(
      <OverlayWorkshopDevRoute search="?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs&variant=standings-minimal&width=420&height=620" />,
    );
    await waitFor(() => expect(document.querySelector("[data-standings-row]")).toBeTruthy());
    expect(document.querySelector("[data-metric=position]")).toBeTruthy();
    expect(document.querySelector("[data-metric=driverName]")).toBeTruthy();
    expect(document.querySelector("[data-metric=gap]")).toBeNull();

    unmount();
    render(
      <OverlayWorkshopDevRoute search="?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs&variant=standings-all-columns&width=1200&height=620" />,
    );
    await waitFor(() => expect(document.querySelector("[data-metric=tireCompound]")).toBeTruthy());
    const metrics = new Set(
      [...document.querySelectorAll("[data-standings-row]:not(.ven-red-ghost) [data-metric]")].map(
        (cell) => cell.getAttribute("data-metric"),
      ),
    );
    expect(metrics).toEqual(
      new Set([
        "position",
        "driverName",
        "driverNumber",
        "vehicleClass",
        "gap",
        "interval",
        "currentLap",
        "lastLap",
        "bestLap",
        "pit",
        "tireCompound",
      ]),
    );
  });
});
