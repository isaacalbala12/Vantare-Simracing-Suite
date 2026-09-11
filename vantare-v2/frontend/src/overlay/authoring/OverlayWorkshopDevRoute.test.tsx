import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import { ALL_WIDGET_TYPES } from "../core/profile-document";

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

  it("flags the rejected part and keeps every control alive when the URL selection is invalid", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals&system=vantare-crystal&design=delta-crystal-simple" />);

    expect(screen.getByRole("alert").textContent).toContain("requires widget=delta");
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    expect(screen.getByLabelText("Widget")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Widget"), { target: { value: "pedals" } });
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")).toBeTruthy());
  });

  it("keeps stage controls accessible and renders the comparison through the same host", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default&compare=obs" />);
    await waitFor(() => expect(document.querySelectorAll("[data-overlay-workshop-widget-root]")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Claro" }));
    expect(document.querySelector(".overlay-workshop-stage--transparent")).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-surface=obs] [data-overlay-workshop-widget-root]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-surface=obs] .overlay-workshop-surface-label")).toBeNull();
  });

  it("applies declared dimensions from the URL and resets controls to the reproducible selection", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default&width=1280&height=720" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("1280px");
    fireEvent.change(screen.getByLabelText("Estado de la fuente"), { target: { value: "error" } });
    fireEvent.click(screen.getByRole("button", { name: "Restablecer selección" }));
    expect((screen.getByLabelText("Estado de la fuente") as HTMLSelectElement).value).toBe("ready");
    expect((screen.getByLabelText("Sistema de diseño") as HTMLSelectElement).value).toBe("vantare-original");
  });

  it("renders declared dimensions from the URL on the widget root", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&width=640&height=240" />);
    await waitFor(() => expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px"));
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.height).toBe("240px");
  });

  it("rejects invalid declared dimensions in the URL and falls back to defaults with a visible notice", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&width=12&height=240" />);
    expect(screen.getByRole("alert").textContent).toContain("invalid declared dimensions");
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());
  });

  it("represents valid non-preset scale deep-links honestly and preserves their round trip", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&scale=0.3" />);
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());

    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.transform).toContain("scale(0.3)");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("scale=0.3");
  });

  it("applies the Efficiency v2 study skin from the URL and switches it from the controls", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&study=v2-focus&state=ready&surface=obs" />);

    await waitFor(() => expect(document.querySelector("[data-standings-row]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-page]")?.getAttribute("data-study-style")).toBe("v2-focus");
    expect(document.querySelector("[data-widget-system=vantare-functional]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "V1" }));
    expect(document.querySelector("[data-overlay-workshop-page]")?.getAttribute("data-study-style")).toBeNull();
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
  // Regresión ISA-1128: el swap de columnas por sesión solo aplica a
  // Standings — Delta/Pedals no llevan content.columns y antes explotaban.
  it("renders every functional widget in every session without fixture errors", async () => {
    for (const widget of ["standings", "relative", "delta", "pedals"] as const) {
      for (const session of ["practice", "qualifying", "race"] as const) {
        cleanup();
        render(
          <OverlayWorkshopDevRoute search={`?widget=${widget}&system=vantare-functional&variant=default&session=${session}&state=ready&surface=obs`} />,
        );
        await waitFor(() =>
          expect(document.querySelector(`.vf-${widget}`)).toBeTruthy(),
        );
        expect(document.querySelector("[data-overlay-workshop-fixture-error]")).toBeNull();
      }
    }
  });

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

    // La escena V2 declara explícitamente un dueño anterior y otro nuevo para
    // probar el traspaso; no depende de la fixture ni del adapter V1.
    expect(document.querySelector(".ven-red-fastest")).toBeTruthy();
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
