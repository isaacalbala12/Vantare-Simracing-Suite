import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";

afterEach(() => cleanup());

describe("OverlayWorkshopDevRoute", () => {
  it("mounts the product visual host inside a root distinct from the authoring stage", () => {
    render(<OverlayWorkshopDevRoute search="?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default" />);

    expect(document.querySelector("[data-overlay-workshop-stage]")).toBeTruthy();
    expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeTruthy();
    expect(document.querySelector("[data-overlay-workshop-stage] [data-widget-renderer=delta]")).toBeTruthy();
    expect(screen.getByTestId("overlay-workshop-viewport")).toBeTruthy();
    expect(document.querySelector("[data-widget-host-diagnostic]")).toBeNull();
  });

  it("renders a visible error rather than mounting another design when selection is invalid", () => {
    render(<OverlayWorkshopDevRoute search="?widget=pedals&system=vantare-crystal&design=delta-crystal-simple" />);

    expect(screen.getByRole("alert").textContent).toContain("requires widget=delta");
    expect(document.querySelector("[data-overlay-workshop-widget-root]")).toBeNull();
  });
});
