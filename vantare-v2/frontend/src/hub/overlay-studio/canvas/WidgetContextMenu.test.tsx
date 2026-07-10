import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { WidgetContextMenu } from "./WidgetContextMenu";

function buildSaved(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

describe("WidgetContextMenu", () => {
  afterEach(() => cleanup());

  it("closes on Escape and outside click", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <WidgetContextMenu
        menu={{
          x: 120,
          y: 80,
          widgetId: "delta-main",
          layerWidgetIds: ["delta-main"],
        }}
        session="general"
        widgets={[deltaDefinition.createDefault("delta-main")]}
        savedDocument={buildSaved()}
        dispatch={vi.fn()}
        selectWidget={vi.fn()}
        confirmDelete={() => true}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <WidgetContextMenu
        menu={{
          x: 120,
          y: 80,
          widgetId: "delta-main",
          layerWidgetIds: ["delta-main"],
        }}
        session="general"
        widgets={[deltaDefinition.createDefault("delta-main")]}
        savedDocument={buildSaved()}
        dispatch={vi.fn()}
        selectWidget={vi.fn()}
        confirmDelete={() => true}
        onClose={onClose}
      />,
    );
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers a select-layer submenu for overlapping widgets", () => {
    const back = deltaDefinition.createDefault("delta-back");
    back.layout = { x: 0, y: 0, w: 200, h: 100, zIndex: 0, aspectLocked: true };
    const front = deltaDefinition.createDefault("delta-front");
    front.layout = { x: 50, y: 50, w: 200, h: 100, zIndex: 2, aspectLocked: true };
    const selectWidget = vi.fn();

    render(
      <WidgetContextMenu
        menu={{
          x: 120,
          y: 80,
          widgetId: "delta-front",
          layerWidgetIds: ["delta-front", "delta-back"],
        }}
        session="general"
        widgets={[back, front]}
        savedDocument={buildSaved()}
        dispatch={vi.fn()}
        selectWidget={selectWidget}
        confirmDelete={() => true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-context-layer-submenu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("studio-context-layer-delta-back"));
    expect(selectWidget).toHaveBeenCalledWith("delta-back");
  });
});