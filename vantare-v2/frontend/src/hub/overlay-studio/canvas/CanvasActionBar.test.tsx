import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
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
});