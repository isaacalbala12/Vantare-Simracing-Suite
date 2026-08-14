import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { DeleteWidgetConfirmProvider } from "../components/DeleteWidgetConfirmProvider";
import { CanvasActionBar } from "./CanvasActionBar";

function buildSaved(): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
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

describe("CanvasActionBar", () => {
  afterEach(() => cleanup());

  it("dispatches the shared duplicate command payload", () => {
    const dispatch = vi.fn();
    const selectWidget = vi.fn();
    const widget = deltaDefinition.createDefault("delta-main");

    render(
      <CanvasActionBar
        widgetId="delta-main"
        session="general"
        widgets={[widget]}
        savedDocument={buildSaved()}
        layoutViewport={{ width: 1000, height: 1000 }}
        dispatch={dispatch}
        selectWidget={selectWidget}
        confirmDelete={() => true}
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

  it("centers against the supplied document surface", () => {
    const dispatch = vi.fn();
    const widget = deltaDefinition.createDefault("delta-main");

    render(
      <CanvasActionBar
        widgetId="delta-main"
        session="general"
        widgets={[widget]}
        savedDocument={buildSaved()}
        layoutViewport={{ width: 1000, height: 1000 }}
        dispatch={dispatch}
        selectWidget={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-action-center"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-main"],
      patch: {
        x: Math.round((1000 - widget.layout.w) / 2),
        y: Math.round((1000 - widget.layout.h) / 2),
      },
    });
  });

  it("routes delete through the studio dialog instead of the native confirm", () => {
    const dispatch = vi.fn();
    const nativeConfirm = vi.fn();
    vi.stubGlobal("confirm", nativeConfirm);
    const widget = deltaDefinition.createDefault("delta-main");

    render(
      <DeleteWidgetConfirmProvider storage={null}>
        <CanvasActionBar
          widgetId="delta-main"
          session="general"
          widgets={[widget]}
          savedDocument={buildSaved()}
          dispatch={dispatch}
          selectWidget={vi.fn()}
        />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("studio-action-delete"));
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("studio-delete-widget-confirm"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/delete",
      session: "general",
      widgetIds: ["delta-main"],
    });
    vi.unstubAllGlobals();
  });
});
