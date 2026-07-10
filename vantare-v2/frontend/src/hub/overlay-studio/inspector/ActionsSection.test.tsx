import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import type { StudioCommand } from "../state/studio-command";
import { ActionsSection, buildRestoreDefaultsWidget } from "./ActionsSection";

function buildDocument(): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.layout.x = 220;
  widget.behavior.updateHz = 10;
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
      },
    },
  };
}

describe("buildRestoreDefaultsWidget", () => {
  it("preserves id and layout while resetting content, visual and behavior", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.layout.x = 333;
    widget.behavior.updateHz = 5;
    widget.visual.appearanceOverrides = { showHeader: false };

    const restored = buildRestoreDefaultsWidget(widget);
    expect(restored.id).toBe("delta-main");
    expect(restored.layout).toEqual(widget.layout);
    expect(restored.behavior.updateHz).toBe(30);
    expect(restored.visual.appearanceOverrides).toEqual({});
  });
});

describe("ActionsSection", () => {
  afterEach(() => cleanup());

  it("routes duplicate through the shared widget action command", () => {
    const savedDocument = buildDocument();
    const widget = savedDocument.layouts.general.widgets[0]!;
    const dispatch = vi.fn<(command: StudioCommand) => void>();
    const selectWidget = vi.fn();

    render(
      <ActionsSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={dispatch}
        selectWidget={selectWidget}
        discardAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-action-duplicate"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/duplicate",
      session: "general",
      widgetIds: ["delta-main"],
      newIds: ["delta-main-copy"],
    });
    expect(selectWidget).toHaveBeenCalledWith("delta-main-copy");
  });

  it("requires confirmation before delete", () => {
    const savedDocument = buildDocument();
    const widget = savedDocument.layouts.general.widgets[0]!;
    const dispatch = vi.fn<(command: StudioCommand) => void>();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);

    render(
      <ActionsSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={dispatch}
        selectWidget={vi.fn()}
        discardAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-action-delete"));
    expect(confirm).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("dispatches restore defaults and discard-all actions", () => {
    const savedDocument = buildDocument();
    const widget = savedDocument.layouts.general.widgets[0]!;
    const dispatch = vi.fn<(command: StudioCommand) => void>();
    const discardAll = vi.fn();

    render(
      <ActionsSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={dispatch}
        selectWidget={vi.fn()}
        discardAll={discardAll}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-action-restore-defaults"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/restore-defaults",
      session: "general",
      widgetIds: ["delta-main"],
      defaults: [buildRestoreDefaultsWidget(widget)],
    });

    fireEvent.click(screen.getByTestId("studio-action-discard-all"));
    expect(discardAll).toHaveBeenCalledTimes(1);
  });
});