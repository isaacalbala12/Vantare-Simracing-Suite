import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { DirtyChangesDialog } from "./components/DirtyChangesDialog";
import { ResponsivePanelControls } from "./components/ResponsivePanelControls";

describe("Overlay Studio V3 accessibility contract", () => {
  it("names zoom controls and exposes the dirty dialog semantics", () => {
    render(
      <>
        <CanvasToolbar
          preview={{ zoom: 100, backgroundId: "solid", safeArea: false, grid: false, mockSession: "practice", mockLocation: "track", source: "mock" }}
          onPreviewChange={vi.fn()}
        />
        <DirtyChangesDialog open onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />
      </>,
    );

    expect(screen.getByRole("button", { name: "Reducir zoom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aumentar zoom" })).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("studio-dirty-dialog-title");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("opens compact drawers, moves focus inside and restores it on Escape", () => {
    render(
      <ResponsivePanelControls
        viewportWidth={640}
        selectedWidgetId={null}
        listPanel={<button type="button">List item</button>}
        canvasPanel={<div>Canvas</div>}
        inspectorPanel={<button type="button">Inspector item</button>}
      />,
    );

    const toggle = screen.getByTestId("studio-list-drawer-toggle");
    toggle.focus();
    fireEvent.click(toggle);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "List item" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(toggle);
  });

  it("keeps interactive canvas controls keyboard-addressable", () => {
    const source = readFileSync(join(__dirname, "canvas", "StudioWidgetFrame.tsx"), "utf8");
    expect(source).toContain('role="button"');
    expect(source).toContain("tabIndex={0}");
    expect(source).toContain("aria-label");
  });
});
import { readFileSync } from "node:fs";
import { join } from "node:path";
