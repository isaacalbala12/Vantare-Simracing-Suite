import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { StudioProvider, useStudioDocument, useStudioPreview } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { CanvasToolbar } from "./CanvasToolbar";

function buildDocument(): ProfileDocumentV3 {
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

const client: StudioProfileClient = {
  load: async () => ({ document: buildDocument(), revision: "rev-1" }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function ToolbarHarness(): React.ReactElement {
  const { dirty } = useStudioDocument();
  const { preview, setPreview } = useStudioPreview();
  return (
    <>
      <div data-testid="dirty-flag">{dirty ? "dirty" : "clean"}</div>
      <CanvasToolbar preview={preview} onPreviewChange={setPreview} />
    </>
  );
}

describe("CanvasToolbar", () => {
  afterEach(() => cleanup());

  it("updates zoom, background and safe area without dirtying the document", () => {
    render(
      <StudioProvider client={client} initialFile="profiles/a.json">
        <ToolbarHarness />
      </StudioProvider>,
    );

    fireEvent.click(screen.getByTestId("studio-zoom-fit"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("Fit");

    fireEvent.click(screen.getByTestId("studio-zoom-plus"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("50%");
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");

    fireEvent.click(screen.getByTestId("studio-zoom-minus"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("Fit");

    fireEvent.click(screen.getByTestId("studio-zoom-plus"));
    fireEvent.click(screen.getByTestId("studio-zoom-plus"));
    fireEvent.click(screen.getByTestId("studio-zoom-plus"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("100%");

    fireEvent.change(screen.getByTestId("studio-background-select"), {
      target: { value: "solid-black" },
    });
    fireEvent.click(screen.getByTestId("studio-safe-area-toggle"));
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });
});