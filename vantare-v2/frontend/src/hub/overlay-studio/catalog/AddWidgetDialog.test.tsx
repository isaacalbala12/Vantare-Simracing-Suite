import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioPolicy } from "../access/studio-access";
import { deriveStudioCatalog } from "./studio-catalog";
import { AddWidgetDialog } from "./AddWidgetDialog";

const freePolicy: StudioPolicy = {
  revision: 1,
  overlaysBasic: true,
  overlaysAdvanced: false,
  engineerAI: false,
  brandCrystal: "required",
  brandEfficiency: "required",
  brandOriginal: "none",
};

const paidPolicy: StudioPolicy = {
  revision: 2,
  overlaysBasic: true,
  overlaysAdvanced: true,
  engineerAI: false,
  brandCrystal: "optional",
  brandEfficiency: "optional",
  brandOriginal: "none",
};

describe("AddWidgetDialog", () => {
  afterEach(() => cleanup());

  it("locks delta for free and dispatches add once paid", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    const catalog = deriveStudioCatalog();

    const free = render(
      <AddWidgetDialog open policy={freePolicy} catalog={catalog} onAdd={onAdd} onClose={onClose} />,
    );

    // Delta is premium: visible with its lock, never a bare hidden button.
    expect(screen.getByTestId("studio-catalog-entry-delta")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-lock-delta")).toBeTruthy();
    expect(screen.queryByTestId("studio-catalog-add-delta")).toBeNull();
    free.unmount();

    render(
      <AddWidgetDialog open policy={paidPolicy} catalog={catalog} onAdd={onAdd} onClose={onClose} />,
    );
    expect(screen.getByTestId("studio-catalog-entry-delta")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-add-delta")).toBeTruthy();
    expect(screen.queryByTestId("studio-catalog-lock-delta")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-catalog-add-delta"));
    expect(onAdd).toHaveBeenCalledWith("delta");
  });

  it("shows lock explanation for premium entries while keeping them visible", () => {
    const catalog = deriveStudioCatalog();

    render(
      <AddWidgetDialog
        open
        policy={freePolicy}
        catalog={catalog}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-catalog-entry-relative")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-lock-relative")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-lock-relative").textContent).toContain("Overlays avanzados");
    expect(screen.queryByTestId("studio-catalog-add-relative")).toBeNull();
  });

  it("does not offer another delta when the active layout already has one", () => {
    render(
      <AddWidgetDialog
        open
        policy={freePolicy}
        unavailableTypes={["delta"]}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("studio-catalog-add-delta")).toBeNull();
    expect(screen.getByTestId("studio-catalog-unavailable-delta").textContent).toContain("añadido");
  });

  it("returns null when closed", () => {
    const { container } = render(
      <AddWidgetDialog open={false} policy={freePolicy} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
