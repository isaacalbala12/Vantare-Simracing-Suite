import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { deriveStudioCatalog } from "./studio-catalog";
import { AddWidgetDialog } from "./AddWidgetDialog";

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

describe("AddWidgetDialog", () => {
  afterEach(() => cleanup());

  it("lists catalog entries and dispatches add only for unlocked widgets", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    const catalog = deriveStudioCatalog();

    render(
      <AddWidgetDialog open access={freeAccess} catalog={catalog} onAdd={onAdd} onClose={onClose} />,
    );

    expect(screen.getByTestId("studio-catalog-entry-delta")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-add-delta")).toBeTruthy();
    expect(screen.queryByTestId("studio-catalog-lock-delta")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-catalog-add-delta"));
    expect(onAdd).toHaveBeenCalledWith("delta");
  });

  it("shows lock explanation for premium entries while keeping them visible", () => {
    const widgetRegistryCatalog = [
      ...deriveStudioCatalog(),
      {
        type: "relative" as const,
        labelKey: "overlay.widgets.relative",
        defaultSize: { width: 430, height: 300 },
        inspectorSections: ["design", "behavior", "layout", "actions"] as const,
        compatibleSystems: [{ systemId: "vantare-original" as const, systemVersion: 1, label: "Vantare Original" }],
        requiredFeature: "overlays.advanced" as const,
      },
    ];

    render(
      <AddWidgetDialog
        open
        access={freeAccess}
        catalog={widgetRegistryCatalog}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-catalog-entry-relative")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-lock-relative")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-lock-relative").textContent).toContain("Overlays avanzados");
    expect(screen.queryByTestId("studio-catalog-add-relative")).toBeNull();
  });

  it("returns null when closed", () => {
    const { container } = render(
      <AddWidgetDialog open={false} access={freeAccess} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});