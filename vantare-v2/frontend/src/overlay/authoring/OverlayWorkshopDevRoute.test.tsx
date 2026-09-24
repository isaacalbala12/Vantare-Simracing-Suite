import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import { ALL_WIDGET_TYPES } from "../core/profile-document";

afterEach(() => {
  cleanup();
});

describe("OverlayWorkshopDevRoute", () => {
  it("previews a wheel through the productive settings and preserves it in the URL", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals-telemetry&system=vantare-functional&steeringWheel=oreca-07" />);
    await waitFor(() => expect(document.querySelector('[data-steering-wheel="oreca-07"]')).toBeTruthy());
    expect((screen.getByLabelText("Volante") as HTMLSelectElement).value).toBe("oreca-07");
    const widgets = screen.getByLabelText("Widget") as HTMLSelectElement;
    expect(widgets.selectedOptions[0]?.textContent).toBe("Pedales avanzados");
    expect(document.querySelector("[data-overlay-workshop-stage]")?.getAttribute("data-stage-label")).toBe("PEDALES AVANZADOS / ESTUDIO 01");
    expect([...widgets.options].some((option) => option.value === "pedals-telemetry-compact")).toBe(false);
    const content = document.querySelector(".vf-pedals-adv-gear")!.textContent;
    fireEvent.change(screen.getByLabelText("Volante"), { target: { value: "ligier-js-p325" } });
    await waitFor(() => expect(document.querySelector('[data-steering-wheel="ligier-js-p325"]')).toBeTruthy());
    expect(window.location.search).toContain("steeringWheel=ligier-js-p325");
    expect(document.querySelector(".vf-pedals-adv-gear")!.textContent).toBe(content);
    fireEvent.change(screen.getByLabelText("Widget"), { target: { value: "delta" } });
    await waitFor(() => expect(screen.queryByLabelText("Volante")).toBeNull());
    expect(window.location.search).not.toContain("steeringWheel");
  });

  it("keeps old compact Workshop links as compatibility views, outside the selectable catalogue", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals-telemetry-compact&system=vantare-iracing" />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="pedals-telemetry-compact"]')).toBeTruthy());
    const widgets = screen.getByLabelText("Widget") as HTMLSelectElement;
    expect(widgets.selectedOptions[0]?.textContent).toBe("Pedales antiguos");
    expect(widgets.selectedOptions[0]?.disabled).toBe(true);
    expect(screen.getByText(/Vista de compatibilidad de un widget retirado/)).toBeTruthy();
    fireEvent.change(widgets, { target: { value: "pedals-telemetry" } });
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="pedals-telemetry"]')).toBeTruthy());
    expect([...widgets.options].some((option) => option.value === "pedals-telemetry-compact")).toBe(false);
  });

  it.each(["studio", "desktop"])("can replay a fastest-lap event in %s after seeking back", async surface => {
    render(<OverlayWorkshopDevRoute search={`?widget=fastest-lap&surface=${surface}&scene=fastest-lap-alert`} />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="fastest-lap"]')).toBeTruthy());
    if (surface === "desktop") expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fotograma siguiente" }));
    expect(screen.getByRole("status").textContent).toContain("1:31.202");
    fireEvent.click(screen.getByRole("button", { name: "Fotograma anterior" }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fotograma siguiente" }));
    expect(screen.getByRole("status").textContent).toContain("1:31.202");
    expect(screen.getByRole("status").dataset.noticeKind).toBe("personal");
    fireEvent.click(screen.getByRole("button", { name: "Fotograma siguiente" }));
    expect(screen.getByRole("status").textContent).toContain("1:29.902");
    expect(screen.getByRole("status").dataset.noticeKind).toBe("class");
    fireEvent.click(screen.getByRole("button", { name: "Fotograma siguiente" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("1:29.402");
    expect(screen.getByRole("status").dataset.noticeKind).toBe("class");
    fireEvent.click(screen.getByRole("button", { name: "Ver diseño" }));
    expect(screen.getByRole("status").dataset.preview).toBe("true");
    expect((screen.getByLabelText("Superficie") as HTMLSelectElement).value).toBe("studio");
  });

  it("edits the real fastest-lap size without stretching the preview and preserves it in the URL", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=fastest-lap&scene=fastest-lap-alert&surface=studio" />);
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "360" } });
    fireEvent.change(screen.getByLabelText("Alto"), { target: { value: "80" } });
    const viewport = screen.getByTestId("overlay-workshop-viewport");
    expect(viewport.style.width).toBe("360px");
    expect(viewport.style.height).toBe("80px");
    expect(viewport.style.transform).toBe("scale(1)");
    expect((document.querySelector("[data-overlay-workshop-widget-preview]") as HTMLElement).style.transform).toBe("scale(1, 1)");
    expect(window.location.search).toContain("width=360&height=80");
    expect(screen.queryByRole("button", { name: "Aplicar tamaño declarado" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "64" } });
    expect(viewport.style.width).toBe("360px");
  });

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

  it("keeps the real widget layout inside a resizable harness preview", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals&system=vantare-original&state=ready&surface=harness&variant=default&width=640&height=240" />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="pedals"]')).toBeTruthy());

    const root = document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement;
    const preview = document.querySelector("[data-overlay-workshop-widget-preview]") as HTMLElement;
    const viewport = screen.getByTestId("overlay-workshop-viewport");
    expect(root.style.width).toBe("640px");
    expect(root.style.height).toBe("240px");
    expect(preview.dataset.overlayWorkshopIntrinsicWidth).toBe("120");
    expect(preview.dataset.overlayWorkshopIntrinsicHeight).toBe("160");
    expect(viewport.style.width).toBe("120px");
    expect(viewport.style.height).toBe("160px");
    expect(viewport.style.transform).toBe("scale(1)");
  });

  it("exposes the Functional Racing Flags probe, text color, and live dimensions in Harness", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=racing-flags&system=vantare-functional&state=ready&surface=harness&variant=default&flag=yellow&textColor=%23ffcc00&width=360&height=96" />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="racing-flags"]')).toBeTruthy());

    const root = document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement;
    expect(root.style.width).toBe("360px");
    expect(root.style.height).toBe("96px");
    expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-flag")).toBe("yellow");
    expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-text-color")).toBe("#ffcc00");
    expect((screen.getByLabelText("Bandera") as HTMLSelectElement).value).toBe("yellow");
    expect((screen.getByLabelText("Color de la letra") as HTMLInputElement).value).toBe("#ffcc00");

    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "420" } });
    fireEvent.change(screen.getByLabelText("Alto"), { target: { value: "120" } });
    await waitFor(() => {
      expect(root.style.width).toBe("420px");
      expect(root.style.height).toBe("120px");
    });

    fireEvent.change(screen.getByLabelText("Color de la letra"), { target: { value: "#ff00aa" } });
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-text-color")).toBe("#ff00aa"));
    expect(window.location.search).toContain("textColor=%23ff00aa");

    fireEvent.change(screen.getByLabelText("Bandera"), { target: { value: "green" } });
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-flag")).toBe("green"));
    expect(window.location.search).toContain("flag=green");
  });

  it("uses black text for the white flag while keeping the color picker configurable", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=racing-flags&system=vantare-functional&state=ready&surface=harness&variant=default&flag=white&width=360&height=96" />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="racing-flags"]')).toBeTruthy());

    expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-text-color")).toBe("#141517");
    expect((screen.getByLabelText("Color de la letra") as HTMLInputElement).value).toBe("#141517");

    fireEvent.change(screen.getByLabelText("Color de la letra"), { target: { value: "#ffffff" } });
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="racing-flags"]')?.getAttribute("data-text-color")).toBe("#ffffff"));
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

  // ISA-1221: la study view es el único harness — cualquier combinación
  // widget/sistema renderiza el panel de estudio y nunca la sidebar genérica
  // que el merge 6110370c resucitó por error.
  it("renders the study view as the only harness for every widget/system selection", async () => {
    for (const search of [
      "?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default",
      "?widget=pedals&system=vantare-original&state=ready&surface=obs&variant=pedals-full",
      "?widget=standings&system=vantare-functional&variant=standings-functional-study&state=ready&surface=obs",
    ]) {
      cleanup();
      render(<OverlayWorkshopDevRoute search={search} />);
      await waitFor(() => expect(document.querySelector(".functional-study-controls")).toBeTruthy());
      expect(document.querySelector(".overlay-workshop-sidebar")).toBeNull();
      expect(screen.queryByLabelText("Laboratorio visual")).toBeNull();
      expect(document.querySelector("[data-overlay-workshop-stage]")).toBeTruthy();
    }
  });

  // ISA-1221: cada selección es una entrada del historial — atrás/adelante
  // navega dentro del Workshop y nunca abandona la página hacia un estado
  // muerto. El aparcado de fotogramas usa replaceState para no inundarlo.
  it("navigates back/forward inside the workshop instead of leaving the page", async () => {
    render(
      <OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default" />,
    );
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=delta]")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Widget"), { target: { value: "pedals" } });
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")).toBeTruthy());
    expect(window.location.search).toContain("widget=pedals");

    fireEvent.change(screen.getByLabelText("Widget"), { target: { value: "standings" } });
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=standings]")).toBeTruthy());
    expect(window.location.search).toContain("widget=standings");

    window.history.back();
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")).toBeTruthy());
    expect(window.location.search).toContain("widget=pedals");

    window.history.forward();
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=standings]")).toBeTruthy());
  });

  it("clears a previous preview override when changing widgets", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=harness&variant=default&width=640&height=240" />);
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="delta"]')).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Widget"), { target: { value: "pedals" } });
    await waitFor(() => expect(document.querySelector('[data-widget-renderer="pedals"]')).toBeTruthy());

    const root = document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement;
    expect(root.style.width).toBe("120px");
    expect(root.style.height).toBe("160px");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).not.toContain("width=");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).not.toContain("height=");
    expect((screen.getByLabelText("Ancho") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("Alto") as HTMLInputElement).value).toBe("160");
  });

  it("keeps the scene transport inside the stage under the study view", async () => {
    render(
      <OverlayWorkshopDevRoute search="?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs&scene=standings-fastest-lap" />,
    );
    await waitFor(() =>
      expect(
        document.querySelector("[data-overlay-workshop-stage] [data-overlay-workshop-transport]"),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId("workshop-scene-scrub")).toBeTruthy();
  });

  it("reviews the Functional Relative combined sequence by scrubbing or playing it", async () => {
    render(
      <OverlayWorkshopDevRoute search="?widget=relative&system=vantare-functional&variant=default&state=ready&surface=obs&scene=relative-functional-sequence&sceneFrame=0" />,
    );

    await waitFor(() => expect(document.querySelector("[data-widget-system=vantare-functional]")).toBeTruthy());
    expect(screen.getByTestId("workshop-scene-watch").textContent).toMatch(/cruce en ambos sentidos.*entrada y salida/i);

    const scrub = screen.getByTestId("workshop-scene-scrub") as HTMLInputElement;
    fireEvent.change(scrub, { target: { value: "2" } });
    expect(screen.getByTestId("workshop-scene-caption").textContent).toContain("Primer cruce");
    expect(scrub.value).toBe("2");

    fireEvent.click(screen.getByTestId("workshop-scene-run"));
    await waitFor(() => expect(screen.getByTestId("workshop-scene-play").getAttribute("aria-pressed")).toBe("true"));
  });

  it("shows Functional Horizontal Standings scenes and parks fast inversions on the exact keyframe", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=broadcast-tower&system=vantare-functional&state=ready&surface=obs&scene=broadcast-tower-fast-inversion&frame=1" />);

    await waitFor(() => expect(document.querySelector("[data-widget-renderer=broadcast-tower]")).toBeTruthy());
    const sceneSelect = screen.getByLabelText("Escena") as HTMLSelectElement;
    expect([...sceneSelect.options].map((option) => option.value)).toContain("broadcast-tower-fast-inversion");
    const p2 = [...document.querySelectorAll(".vf-bt-card")].find((card) => card.querySelector(".vf-bt-place")?.textContent === "2");
    expect(p2?.querySelector(".vf-bt-name")?.textContent).toBe("F. Albuquerque");
    expect(screen.getByTestId("workshop-scene-scrub")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sistema de diseño"), { target: { value: "vantare-original" } });
    await waitFor(() => expect((screen.getByLabelText("Sistema de diseño") as HTMLSelectElement).value).toBe("vantare-original"));
    expect(screen.queryByLabelText("Escena")).toBeNull();
    expect(window.location.search).not.toContain("scene=");
  });

  it("declares the canvas size through the study view preset and free dimensions", async () => {
    render(
      <OverlayWorkshopDevRoute search="?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default" />,
    );
    await waitFor(() => expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy());

    // El preset solo declara la intención; el botón fija ancho y alto.
    fireEvent.change(screen.getByLabelText("Resolución"), { target: { value: "720p" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar tamaño declarado" }));
    const root = document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement;
    expect(root.style.width).toBe("1280px");
    expect(root.style.height).toBe("720px");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("preset=720p");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("width=1280");

    // Fail-closed: un ancho fuera de rango no reescribe la URL; al completar
    // un par válido el lienzo adopta las dimensiones libres.
    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "12" } });
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("width=1280");
    fireEvent.change(screen.getByLabelText("Ancho"), { target: { value: "640" } });
    fireEvent.change(screen.getByLabelText("Alto"), { target: { value: "240" } });
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.width).toBe("640px");
    expect((document.querySelector("[data-overlay-workshop-widget-root]") as HTMLElement).style.height).toBe("240px");
    expect(document.querySelector("[data-overlay-workshop-query]")?.textContent).toContain("height=240");
  });

  it("applies the Efficiency v2 study skin from the URL and switches it from the controls", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&study=v2-focus&state=ready&surface=obs" />);

    await waitFor(() => expect(document.querySelector("[data-standings-row]")).toBeTruthy());
    expect(document.querySelector("[data-overlay-workshop-page]")?.getAttribute("data-study-style")).toBe("v2-focus");
    expect(document.querySelector("[data-widget-system=vantare-functional]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "V1" }));
    expect(document.querySelector("[data-overlay-workshop-page]")?.getAttribute("data-study-style")).toBe("v1");
  });

  it("selects Efficiency Standings default and exposes the player-neighbour window", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=standings&system=vantare-functional&variant=default&rows=12&state=ready&surface=obs" />);

    await waitFor(() => expect(document.querySelectorAll("[data-standings-row]").length).toBeGreaterThan(0));
    expect(document.querySelector("[data-overlay-workshop-page]")?.getAttribute("data-study-style")).toBe("default");
    expect((screen.getByLabelText("Pilotos alrededor") as HTMLSelectElement).value).toBe("4");
    expect(document.querySelectorAll("[data-standings-row]")).toHaveLength(7);
    expect([...document.querySelectorAll("[data-standings-row] [data-metric=position]")].map((cell) => cell.textContent)).toEqual([
      "1", "2", "3", "4", "5", "6", "7",
    ]);

    fireEvent.change(screen.getByLabelText("Pilotos alrededor"), { target: { value: "0" } });
    await waitFor(() => expect(document.querySelectorAll("[data-standings-row]")).toHaveLength(3));
    expect(window.location.search).toContain("around=0");
  });

  it("keeps the player window in Default without changing the visible-count semantics of V1 and Foco", async () => {
    for (const study of ["v1", "default", "v2-focus"] as const) {
      cleanup();
      render(<OverlayWorkshopDevRoute search={`?widget=standings&system=vantare-functional&variant=default&study=${study}&rows=12&playerPosition=9&around=4&state=ready&surface=obs`} />);

      const expectedPositions = study === "default"
        ? ["1", "2", "3", "7", "8", "9", "10", "11"]
        : Array.from({ length: 12 }, (_, index) => String(index + 1));
      await waitFor(() => expect(document.querySelectorAll("[data-standings-row]")).toHaveLength(expectedPositions.length));
      const root = document.querySelector('[data-widget-renderer="standings"]');
      expect(root?.getAttribute("data-classification-mode")).toBe("normal");
      expect(root?.getAttribute("data-multiclass")).toBeNull();
      expect(document.querySelectorAll(".vf-class-band")).toHaveLength(0);
      expect([...document.querySelectorAll("[data-standings-row] [data-metric=position]")].map((cell) => cell.textContent)).toEqual(expectedPositions);
      expect(document.querySelector('[data-standings-row][data-player] [data-metric=position]')?.textContent).toBe("9");

      if (study === "default") {
        expect(screen.getByLabelText("Pilotos totales")).toBeTruthy();
        expect((screen.getByLabelText("Pilotos alrededor") as HTMLSelectElement).value).toBe("4");
      } else {
        expect(screen.getByLabelText("Pilotos")).toBeTruthy();
        expect(screen.queryByLabelText("Pilotos alrededor")).toBeNull();
      }
    }
  });

  it("keeps multiclass as an explicit classification while sharing the same window policy", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=standings&system=vantare-functional&variant=standings-multiclass&study=v2-focus&rows=12&playerPosition=9&around=4&state=ready&surface=obs" />);

    await waitFor(() => expect(document.querySelectorAll("[data-standings-row]").length).toBeGreaterThan(0));
    const root = document.querySelector('[data-widget-renderer="standings"]');
    expect(root?.getAttribute("data-classification-mode")).toBe("multiclass");
    expect(root?.getAttribute("data-multiclass")).toBe("true");
    expect(document.querySelectorAll(".vf-class-band").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-standings-row][data-player] [data-metric=position]')?.textContent).toBe("3");
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
    expect(ALL_WIDGET_TYPES).toHaveLength(21);
    for (const widget of ALL_WIDGET_TYPES) {
      cleanup();
      const system = widget === "fastest-lap" ? "vantare-functional" : widget === "engineer-radio" ? "vantare-crystal" : widget === "track-map" ? "vantare-endurance" : "vantare-original";
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

  it("exposes only the default Workshop variant for every widget", async () => {
    for (const widget of ["standings", "relative", "delta", "pedals"] as const) {
      cleanup();
      render(<OverlayWorkshopDevRoute search={`?widget=${widget}&system=vantare-functional&variant=default&state=ready&surface=obs`} />);
      await waitFor(() => expect(document.querySelector(`[data-widget-renderer=${widget}]`)).toBeTruthy());
      expect(screen.queryByLabelText("Variante")).toBeNull();
      expect(screen.getByText("Fixture: default")).toBeTruthy();
    }
  });

  it("exposes isolated Functional Pedals background and overlay presentations", async () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals&system=vantare-functional&variant=default&state=ready&surface=obs" />);
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")).toBeTruthy());

    expect(screen.getByRole("button", { name: "Con fondo" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sin fondo · Solo barras" }).getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-widget-renderer=pedals]")?.getAttribute("data-transparent")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Sin fondo · Solo barras" }));
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")?.getAttribute("data-transparent")).toBe("true"));
    expect(window.location.search).toContain("design=pedals-functional-overlay");
    expect(document.querySelectorAll("[data-widget-renderer=pedals] .vf-pedal")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Con fondo" }));
    await waitFor(() => expect(document.querySelector("[data-widget-renderer=pedals]")?.getAttribute("data-transparent")).toBe("false"));
    expect(window.location.search).toContain("design=pedals-functional-signature");
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
