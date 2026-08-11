import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLayoutViewport } from "../../../overlay/core/layout-viewport";
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

function ToolbarHarness(): React.ReactElement | null {
  const { document, dirty, accessNotice, dispatch, undo, redo } = useStudioDocument();
  const { preview, setPreview } = useStudioPreview();
  if (!document) {
    return null;
  }
  const layoutViewport = resolveLayoutViewport(document);
  return (
    <>
      <div data-testid="dirty-flag">{dirty ? "dirty" : "clean"}</div>
      <div data-testid="layout-viewport">{layoutViewport.width}x{layoutViewport.height}</div>
      <div data-testid="access-notice">{accessNotice ?? ""}</div>
      <button type="button" data-testid="undo-layout-viewport" onClick={undo} />
      <button type="button" data-testid="redo-layout-viewport" onClick={redo} />
      <CanvasToolbar
        preview={preview}
        layoutViewport={layoutViewport}
        onPreviewChange={setPreview}
        onLayoutViewportChange={(viewport) =>
          dispatch({ type: "document/layout-viewport", viewport })
        }
      />
    </>
  );
}

function renderToolbar(): void {
  render(
    <StudioProvider client={client} initialFile="profiles/a.json">
      <ToolbarHarness />
    </StudioProvider>,
  );
}

describe("CanvasToolbar", () => {
  afterEach(() => cleanup());

  it("updates visual-only controls without dirtying the document", async () => {
    renderToolbar();
    await waitFor(() => expect(screen.getByTestId("studio-canvas-toolbar")).toBeTruthy());

    fireEvent.click(screen.getByTestId("studio-zoom-fit"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("Fit");

    fireEvent.click(screen.getByTestId("studio-zoom-plus"));
    expect(screen.getByTestId("studio-zoom-label").textContent).toBe("50%");
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");

    fireEvent.change(screen.getByTestId("studio-background-select"), {
      target: { value: "solid-black" },
    });
    fireEvent.click(screen.getByTestId("studio-safe-area-toggle"));
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("applies a preset immediately as a document surface", async () => {
    renderToolbar();
    await waitFor(() => expect(screen.getByTestId("studio-resolution-select")).toBeTruthy());

    const select = screen.getByTestId("studio-resolution-select") as HTMLSelectElement;
    expect(select.querySelector("optgroup")).toBeNull();
    expect(select.querySelector('option[value="auto"]')).toBeNull();
    expect(select.querySelector('option[value="custom"]')).toBeTruthy();

    fireEvent.change(select, {
      target: { value: "5120x1440" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("layout-viewport").textContent).toBe("5120x1440"),
    );
    expect(screen.getByTestId("dirty-flag").textContent).toBe("dirty");
    expect(screen.getByTestId("studio-canvas-dimensions").textContent).toBe("5120×1440");
  });

  it("keeps partial custom dimensions local and applies 1000x1000 explicitly", async () => {
    renderToolbar();
    await waitFor(() => expect(screen.getByTestId("studio-layout-width-input")).toBeTruthy());

    const width = screen.getByTestId("studio-layout-width-input") as HTMLInputElement;
    const height = screen.getByTestId("studio-layout-height-input") as HTMLInputElement;
    const apply = screen.getByTestId("studio-layout-viewport-apply") as HTMLButtonElement;
    expect(width.min).toBe("32");
    expect(width.max).toBe("16384");
    expect(width.step).toBe("1");

    fireEvent.change(width, { target: { value: "" } });
    fireEvent.change(height, { target: { value: "1000" } });
    expect(width.getAttribute("aria-invalid")).toBe("true");
    expect(apply.disabled).toBe(true);
    expect(screen.getByTestId("layout-viewport").textContent).toBe("1920x1080");

    fireEvent.change(width, { target: { value: "1000" } });
    expect(width.getAttribute("aria-invalid")).toBe("false");
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);

    await waitFor(() =>
      expect(screen.getByTestId("layout-viewport").textContent).toBe("1000x1000"),
    );
    expect((screen.getByTestId("studio-resolution-select") as HTMLSelectElement).value).toBe("custom");
  });

  it("resynchronizes drafts after undo and redo", async () => {
    renderToolbar();
    await waitFor(() => expect(screen.getByTestId("studio-resolution-select")).toBeTruthy());
    fireEvent.change(screen.getByTestId("studio-resolution-select"), {
      target: { value: "3440x1440" },
    });
    await waitFor(() =>
      expect((screen.getByTestId("studio-layout-width-input") as HTMLInputElement).value).toBe("3440"),
    );

    fireEvent.click(screen.getByTestId("undo-layout-viewport"));
    await waitFor(() => {
      expect((screen.getByTestId("studio-layout-width-input") as HTMLInputElement).value).toBe("1920");
      expect((screen.getByTestId("studio-layout-height-input") as HTMLInputElement).value).toBe("1080");
    });

    fireEvent.click(screen.getByTestId("redo-layout-viewport"));
    await waitFor(() =>
      expect((screen.getByTestId("studio-layout-width-input") as HTMLInputElement).value).toBe("3440"),
    );
  });

  it("leaves the previous surface intact when recoverability rejects a valid custom size", async () => {
    renderToolbar();
    await waitFor(() => expect(screen.getByTestId("studio-layout-width-input")).toBeTruthy());

    fireEvent.change(screen.getByTestId("studio-layout-width-input"), {
      target: { value: "32" },
    });
    fireEvent.change(screen.getByTestId("studio-layout-height-input"), {
      target: { value: "32" },
    });
    fireEvent.click(screen.getByTestId("studio-layout-viewport-apply"));

    expect(screen.getByTestId("layout-viewport").textContent).toBe("1920x1080");
    expect(screen.getByTestId("access-notice").textContent).toContain("recoverable");
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });
});
