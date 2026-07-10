import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveStudioLayoutMode,
  ResponsivePanelControls,
  type StudioDrawerId,
} from "./ResponsivePanelControls";

describe("resolveStudioLayoutMode", () => {
  it("maps viewport widths to wide, medium and compact modes", () => {
    expect(resolveStudioLayoutMode(1600)).toBe("wide");
    expect(resolveStudioLayoutMode(1440)).toBe("wide");
    expect(resolveStudioLayoutMode(1439)).toBe("medium");
    expect(resolveStudioLayoutMode(960)).toBe("medium");
    expect(resolveStudioLayoutMode(959)).toBe("compact");
  });
});

describe("ResponsivePanelControls", () => {
  afterEach(() => cleanup());

  function renderControls(
    viewportWidth: number,
    selectedWidgetId: string | null = null,
    onDrawerChange = vi.fn(),
  ) {
    return render(
      <ResponsivePanelControls
        viewportWidth={viewportWidth}
        selectedWidgetId={selectedWidgetId}
        onDrawerChange={onDrawerChange}
        listPanel={<div data-testid="list-panel">List</div>}
        canvasPanel={<div data-testid="canvas-panel">Canvas</div>}
        inspectorPanel={<div data-testid="inspector-panel">Inspector</div>}
      />,
    );
  }

  it("keeps three persistent columns in wide mode", () => {
    renderControls(1600);
    const grid = screen.getByTestId("studio-responsive-grid");
    expect(grid.getAttribute("data-layout-mode")).toBe("wide");
    expect(screen.getByTestId("list-panel")).toBeTruthy();
    expect(screen.getByTestId("canvas-panel")).toBeTruthy();
    expect(screen.getByTestId("inspector-panel")).toBeTruthy();
    expect(screen.queryByTestId("studio-panel-drawer-toggle")).toBeNull();
  });

  it("uses a collapsible inspector overlay in medium mode", () => {
    renderControls(1200);
    const grid = screen.getByTestId("studio-responsive-grid");
    expect(grid.getAttribute("data-layout-mode")).toBe("medium");
    expect(grid.getAttribute("data-inspector-open")).toBe("false");

    fireEvent.click(screen.getByTestId("studio-inspector-toggle"));
    expect(grid.getAttribute("data-inspector-open")).toBe("true");
  });

  it("opens mutually exclusive drawers in compact mode", () => {
    const onDrawerChange = vi.fn();
    renderControls(800, null, onDrawerChange);
    const grid = screen.getByTestId("studio-responsive-grid");
    expect(grid.getAttribute("data-layout-mode")).toBe("compact");
    expect(grid.getAttribute("data-open-drawer")).toBe("none");

    fireEvent.click(screen.getByTestId("studio-list-drawer-toggle"));
    expect(grid.getAttribute("data-open-drawer")).toBe("list");
    expect(onDrawerChange).toHaveBeenLastCalledWith("list" satisfies StudioDrawerId);

    fireEvent.click(screen.getByTestId("studio-inspector-drawer-toggle"));
    expect(grid.getAttribute("data-open-drawer")).toBe("inspector");
    expect(onDrawerChange).toHaveBeenLastCalledWith("inspector");
  });

  it("opens the inspector drawer when a widget is selected on compact screens", () => {
    const { rerender } = render(
      <ResponsivePanelControls
        viewportWidth={800}
        selectedWidgetId={null}
        listPanel={<div>List</div>}
        canvasPanel={<div>Canvas</div>}
        inspectorPanel={<div>Inspector</div>}
      />,
    );

    expect(screen.getByTestId("studio-responsive-grid").getAttribute("data-open-drawer")).toBe("none");

    rerender(
      <ResponsivePanelControls
        viewportWidth={800}
        selectedWidgetId="delta-main"
        listPanel={<div>List</div>}
        canvasPanel={<div>Canvas</div>}
        inspectorPanel={<div>Inspector</div>}
      />,
    );

    expect(screen.getByTestId("studio-responsive-grid").getAttribute("data-open-drawer")).toBe(
      "inspector",
    );
  });

  it("closes compact drawers with Escape and restores focus", () => {
    renderControls(800);
    const toggle = screen.getByTestId("studio-list-drawer-toggle");
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByTestId("studio-responsive-grid").getAttribute("data-open-drawer")).toBe(
      "list",
    );

    const drawer = screen.getByTestId("studio-list-drawer");
    expect(document.activeElement === drawer || drawer.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("studio-responsive-grid").getAttribute("data-open-drawer")).toBe(
      "none",
    );
    expect(document.activeElement).toBe(toggle);
  });
});